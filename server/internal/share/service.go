package share

import (
	"bytes"
	"compress/gzip"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"runtime"
	"slices"
	"sort"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/v0-0x/Nyakuro/server/internal/config"
	"github.com/v0-0x/Nyakuro/server/internal/db"
	"github.com/v0-0x/Nyakuro/server/internal/events"
	"github.com/v0-0x/Nyakuro/server/internal/history"
	"github.com/v0-0x/Nyakuro/server/internal/library"
	"github.com/v0-0x/Nyakuro/server/internal/nyakurohub"
	"github.com/v0-0x/Nyakuro/server/internal/parental"
)

const (
	beaconEvery = 5 * time.Second
	// A Nyakuro not heard from for this long is offline.
	onlineFor = 16 * time.Second
	// How often a guest asks a host whether its library changed.
	askEvery = 30 * time.Second
	// A Nyakuro that proved who it is this lately keeps its address: beacons
	// don't move it (see heard).
	verifiedFor = time.Minute
	// How often Settings (open, or the library page) may have the hosts
	// asked again before their turn (Refresh): they answer from their
	// library's version, but each answer costs a server a little.
	refreshEvery = 15 * time.Second
	// How many Nyakuros only heard of (not paired, not added by hand) are kept.
	maxStrangers = 64
	// The largest request body read from a Nyakuro that isn't paired.
	maxUnpairedBody = 1 << 20
	// Failed requests in a row after which a host's library is gone.
	maxFails = 3
	// How long the library's version (sharedVersion) is trusted without the
	// library saying it changed: a safety net for a change that isn't said.
	versionFor = 5 * time.Minute
)

// Library is what a host shares: its library's files.
type Library interface {
	All() ([]*library.LocalFile, error)
	Get(path string) (*library.LocalFile, error)
}

// History is the watch history (where each episode was stopped), which
// Nyakuros on the same AniList account keep in step (see syncHistory).
type History interface {
	Since(t int64, limit int) []*history.Entry
	After(seq int64, limit int) []*history.Entry
	Latest(limit int) []*history.Entry
	MergeAll(entries []history.Entry) ([]history.Entry, error)
}

type Service struct {
	id       *Identity
	db       *db.DB
	settings *config.Store
	library  Library
	hub      *events.Hub
	api      *http.Client // short requests to the others
	media    *http.Client // forwarded video: no time limit
	slow     *http.Client // requests a host takes long to answer (ani-cli)

	// OnFiles runs when the files shared with this Nyakuro change (in the
	// background).
	OnFiles func()
	// User is the AniList account this Nyakuro is logged into (0: none), and
	// History its watch history: kept in step with the Nyakuros it shares
	// with on the same account. Both nil: not kept in step.
	User    func() int
	History History
	// OnWatchedElsewhere runs when another Nyakuro on the account says an
	// episode was finished there: AniList has the new progress.
	OnWatchedElsewhere func()
	// AniCliReady reports whether ani-cli runs here, for the Nyakuros this one
	// shares with (anicli.go).
	AniCliReady func() bool

	// The AniList login, for sharing it with a Nyakuro (as a host) and using a
	// host's (as a guest, see account.go): its token ("" logged out), and
	// logging in and out. Nil: not shared.
	AccountToken func() string
	UseAccount   func(ctx context.Context, token string) error
	DropAccount  func()

	// Hub: this Nyakuro is a Nyakuro Hub (hub.go), keeping every account's watch
	// history, logins and settings; and how it checks a login it's given.
	Hub          *nyakurohub.Store
	CheckAccount CheckAccount
	// OwnPrefs and ApplyPrefs: this device's shared settings, kept in step
	// with its account's on a hub (hub.go). Nil: not kept in step.
	OwnPrefs   PrefsSource
	ApplyPrefs PrefsSink
	// Blobs: what else this device keeps in step through a hub, by kind
	// (nyakurohub.BlobKinds): its list and watch-order edits (hub.go). Set
	// by the app; nil: not kept in step.
	Blobs map[string]BlobHooks
	// The blobs waiting to be sent (BlobChanged), by kind.
	blobMu      sync.Mutex
	blobTimers  map[string]*time.Timer
	listsSynced ListsSynced
	// What the devices are watching (a hub's dashboard).
	playingMu sync.Mutex
	playing   map[string]Playing

	accountMu sync.Mutex
	// When taking a host's AniList account last failed, by host (it isn't
	// tried again at every question for a while).
	accountFailed map[string]time.Time
	// The library's version for the others (sharedVersion).
	versionMu sync.Mutex
	version   string
	versionAt time.Time
	// The shared files as sent (SharedFilesJSON), encoded once per version.
	filesJSONVer       string
	filesJSON, filesGz []byte
	// When the hosts were last asked again on request (Refresh): at most
	// every refreshEvery, however often Settings asks.
	refreshMu   sync.Mutex
	refreshedAt time.Time
	// This computer's network cards (Hello), read at most every minute.
	macsMu    sync.Mutex
	macsAt    time.Time
	macsCache []string

	pushMu    sync.Mutex
	pending   map[[2]int]history.Entry
	pushTimer *time.Timer

	// Parental controls (parental.go): the rules hosts set for this Nyakuro,
	// what it watched waiting to be told them, and, on a host, where what
	// its devices watched is kept.
	received     map[string]receivedRules
	watchMu      sync.Mutex
	watchPending map[[2]int]Watched
	watchTimer   *time.Timer
	watchedOnce  sync.Once
	watchedErr   error

	mu      sync.Mutex
	peers   map[string]*peer
	running *run
	// applyMu: one start or stop at a time (settings saved in a row).
	applyMu sync.Mutex
}

// run is sharing while it's on.
type run struct {
	cancel context.CancelFunc
	disc   *discovery // nil when the network can't be listened on
	wake   chan struct{}
	done   chan struct{}
}

type peer struct {
	id, name, version string
	platform          string // what it runs on ("android": a TV), as it says
	role              string // RoleHub: a Nyakuro Hub, as it says
	pub               []byte
	addr              net.IP
	port              int
	seen              time.Time // last heard from (beacon, request or answer)
	lastSeen          time.Time // before this run: when it was last around
	manual            string    // the address it was added with by hand
	allowed           bool      // this Nyakuro shares its library with it
	// And with it (allowed), this Nyakuro's AniList login, and downloading
	// onto this Nyakuro.
	account, downloads bool

	// As a host: whether it shares its library with this Nyakuro, and its files.
	shares bool
	// offers: it says it shares with this Nyakuro; accepted: this Nyakuro's
	// owner took that (asked on Home, or by adding it by hand). What a
	// host says is believed only once accepted: any device on the network
	// can say it's one.
	offers, accepted bool
	files            []*library.LocalFile
	filesVer         string
	asked            time.Time
	asking           bool
	fails            int
	// filesStale: it answered, but its list of files didn't come (a busy
	// server, a long list): what this Nyakuro has of it stays, and it's asked
	// again soon.
	filesStale bool
	// beaconAt: when one of its beacons last came; answeredAt: when it first
	// answered an ask this run. A host that answers but is never heard
	// announcing itself is one whose beacons don't get through (a firewall).
	beaconAt, answeredAt time.Time
	// historySeq: the last of its history entries (in the order it stored
	// them) this Nyakuro has; pushedSeq: the last of this Nyakuro's it sent it.
	historySeq, pushedSeq int64
	// user: the AniList account it's logged into, as it told (it shares
	// with this Nyakuro).
	user int
	// hostAccount: it shares its AniList login with this Nyakuro (a tag of it,
	// "" when not); hostDownloads: this Nyakuro may download onto it.
	hostAccount   string
	hostDownloads bool
	// hostAniCli: it runs ani-cli for this Nyakuro.
	hostAniCli bool
	// verified: when it last proved who it is (a request or an answer
	// signed); offset: how far its clock is ahead of this one's.
	verified time.Time
	offset   time.Duration
	// callerUser: the AniList account it said it's on, asking this Nyakuro.
	callerUser int
	// wakeMACs: its network cards (it shares), what wakes it (wake.go);
	// wakeUntil: it's being woken up until then.
	wakeMACs  []string
	wakeUntil time.Time
	// autoSynced: when the watch history was last synced with it by itself.
	autoSynced time.Time
	// declined: asked whether to share this Nyakuro's library with it, the
	// answer was "not now" (Home doesn't ask again).
	declined bool
	// rules: its parental controls, set here (nil: none).
	rules *parental.Rules
}

// paired: this Nyakuro shares its library with it, or it with this one.
func (p *peer) paired() bool { return p.allowed || p.shares }

// displayName is its name, or what it is when it has none.
func (p *peer) displayName() string {
	if p.name != "" {
		return p.name
	}
	return "Another Nyakuro"
}

// online: heard from lately. A host that shares with this Nyakuro is asked
// every askEvery, and its answer counts until the next one is due: also when
// its beacons don't come through (the Wi-Fi of some TVs drops them, a
// firewall on a PC), it doesn't look gone half of the time. One ask that
// failed (a server busy with a scan, a disk waking up) doesn't make it
// offline either: the ask 10s later decides. The same the other way: a
// device this Nyakuro shares with asks it as often (a hub's devices, which it
// never asks).
func (p *peer) online(now time.Time) bool {
	d := now.Sub(p.seen)
	if d < onlineFor {
		return true
	}
	if !p.shares && !p.allowed {
		return false
	}
	switch p.fails {
	case 0:
		return d < askEvery+onlineFor
	case 1:
		return d < 2*askEvery+onlineFor
	}
	return false
}

func (p *peer) lastAround() time.Time {
	if p.seen.After(p.lastSeen) {
		return p.seen
	}
	return p.lastSeen
}

func (p *peer) baseURL() string {
	return "http://" + net.JoinHostPort(p.addr.String(), strconv.Itoa(p.port))
}

// New loads this Nyakuro's identity and the Nyakuros it knows.
func New(d *db.DB, settings *config.Store, lib Library, hub *events.Hub) (*Service, error) {
	id, err := LoadIdentity(d)
	if err != nil {
		return nil, err
	}
	dialer := &net.Dialer{Timeout: 4 * time.Second}
	// Never through a proxy: the others are on this network.
	transport := func() *http.Transport {
		return &http.Transport{Proxy: nil, DialContext: dialer.DialContext, ResponseHeaderTimeout: time.Minute, MaxIdleConnsPerHost: 4}
	}
	s := &Service{
		id: id, db: d, settings: settings, library: lib, hub: hub,
		api:   &http.Client{Timeout: 15 * time.Second, Transport: transport()},
		media: &http.Client{Transport: transport()},
		slow:  &http.Client{Timeout: 3 * time.Minute, Transport: &http.Transport{Proxy: nil, DialContext: dialer.DialContext, MaxIdleConnsPerHost: 2}},
		peers: map[string]*peer{},
	}
	s.load()
	s.loadParental()
	// The library's version for the others is read again when the library
	// says it changed (a scan, a download, a match), not on every hello.
	if hub != nil {
		ch, _ := hub.Subscribe()
		go func() {
			for raw := range ch {
				var e struct {
					Type string `json:"type"`
				}
				if json.Unmarshal(raw, &e) == nil && e.Type == events.LibraryUpdated {
					s.libraryChanged()
				}
			}
		}()
	}
	return s, nil
}

// ID is this Nyakuro's ID.
func (s *Service) ID() string { return s.id.ID }

// Name is what the others call this Nyakuro.
func (s *Service) Name() string {
	if n := cleanName(s.settings.Get().Sharing.Name); n != "" {
		return n
	}
	// As the others see it (cleanName keeps names short).
	return cleanName(Hostname())
}

// Hostname is the computer's name, without its domain (the device's, as
// the Android app gives it).
func Hostname() string {
	if n := cleanName(config.Getenv("DEVICE_NAME")); n != "" {
		return n
	}
	h, _ := os.Hostname()
	h, _, _ = strings.Cut(h, ".")
	if h == "" {
		return "Nyakuro"
	}
	return h
}

// ---------------------------------------------------------------------------
// Saved peers

const peersKey = "share:peers"

type savedPeer struct {
	Name    string `json:"name"`
	Key     string `json:"key"`
	Addr    string `json:"addr"`
	Port    int    `json:"port"`
	Manual  string `json:"manual,omitempty"`
	Allowed bool   `json:"allowed,omitempty"`
	Shares  bool   `json:"shares,omitempty"`
	// Accepted as a host by the owner. Nil: saved before that was asked,
	// when a host that shared (or was added by hand) was taken as one.
	Accepted *bool `json:"accepted,omitempty"`
	Seen     int64 `json:"seen"`
	// Granted to it (allowed): this Nyakuro's AniList login, downloading here.
	Account   bool `json:"account,omitempty"`
	Downloads bool `json:"downloads,omitempty"`
	// It takes this Nyakuro's downloads (it shares, see downloads.go).
	TakesDownloads bool `json:"takesDownloads,omitempty"`
	// Its AniList account, as it told; where the watch histories are at.
	User       int   `json:"user,omitempty"`
	CallerUser int   `json:"callerUser,omitempty"`
	HistorySeq int64 `json:"historySeq,omitempty"`
	PushedSeq  int64 `json:"pushedSeq,omitempty"`
	// Its network cards, to wake it (wake.go).
	Wake     []string `json:"wake,omitempty"`
	Platform string   `json:"platform,omitempty"`
	Declined bool     `json:"declined,omitempty"`
	Role     string   `json:"role,omitempty"`
	// Its parental controls, set here.
	Rules *parental.Rules `json:"rules,omitempty"`
}

func (s *Service) load() {
	var saved map[string]savedPeer
	if ok, _ := s.db.GetKV(peersKey, &saved); !ok {
		return
	}
	for id, sp := range saved {
		pub, err := parsePublicKey(id, sp.Key)
		if err != nil {
			continue
		}
		s.peers[id] = &peer{
			id: id, name: sp.Name, pub: pub, addr: net.ParseIP(sp.Addr), port: sp.Port,
			manual: sp.Manual, allowed: sp.Allowed, shares: sp.Shares, lastSeen: time.Unix(sp.Seen, 0),
			accepted: sp.Accepted != nil && *sp.Accepted || sp.Accepted == nil && (sp.Shares || sp.Manual != ""),
			account:  sp.Account, downloads: sp.Downloads, hostDownloads: sp.TakesDownloads,
			user: sp.User, callerUser: sp.CallerUser, historySeq: sp.HistorySeq, pushedSeq: sp.PushedSeq,
			wakeMACs: cleanMACs(sp.Wake), platform: cleanPlatform(sp.Platform), declined: sp.Declined, role: cleanRole(sp.Role),
			rules: sp.Rules,
		}
	}
}

// save keeps the Nyakuros worth knowing next time: those this one shares with,
// those that share with it, and those added by hand. Must be called with
// s.mu held.
func (s *Service) save() {
	out := map[string]savedPeer{}
	for id, p := range s.peers {
		if !p.allowed && !p.shares && p.manual == "" && !p.declined && !p.accepted {
			continue
		}
		accepted := p.accepted
		sp := savedPeer{
			Name: p.name, Key: base64.StdEncoding.EncodeToString(p.pub), Port: p.port, Manual: p.manual, Allowed: p.allowed, Shares: p.shares, Accepted: &accepted, Seen: p.lastAround().Unix(),
			Account: p.account, Downloads: p.downloads, TakesDownloads: p.hostDownloads,
			User: p.user, CallerUser: p.callerUser, HistorySeq: p.historySeq, PushedSeq: p.pushedSeq,
			Wake: p.wakeMACs, Platform: p.platform, Declined: p.declined, Role: p.role, Rules: p.rules,
		}
		if p.addr != nil {
			sp.Addr = p.addr.String()
		}
		out[id] = sp
	}
	if err := s.db.SetKV(peersKey, out); err != nil {
		log.Printf("sharing: %v", err)
	}
}

// ---------------------------------------------------------------------------
// On and off

// Start follows the settings: sharing runs while it's on.
func (s *Service) Start() {
	s.apply(s.settings.Get())
	s.settings.OnChange(func(old, cur config.Settings) {
		if old.Sharing.Enabled != cur.Sharing.Enabled || old.Sharing.Name != cur.Sharing.Name || old.Server.Port != cur.Server.Port {
			// The settings now, not these: listeners run apart, and two
			// saves close together may arrive in either order.
			s.apply(s.settings.Get())
		}
	})
}

// Stop ends sharing (Nyakuro is quitting).
func (s *Service) Stop() {
	s.flushPush()
	s.apply(config.Settings{})
}

func (s *Service) apply(cfg config.Settings) {
	s.applyMu.Lock()
	defer s.applyMu.Unlock()
	s.mu.Lock()
	old := s.running
	s.running = nil
	s.mu.Unlock()
	if old != nil {
		old.cancel()
		if old.disc != nil {
			old.disc.close()
		}
		<-old.done
	}
	if !cfg.Sharing.Enabled {
		if old != nil {
			s.forgetLibraries()
		}
		return
	}
	ctx, cancel := context.WithCancel(context.Background())
	r := &run{cancel: cancel, wake: make(chan struct{}, 1), done: make(chan struct{})}
	disc, err := listen()
	if err != nil {
		// Nyakuros added by address still work.
		log.Printf("sharing: can't listen for other Nyakuro apps on the network: %v", err)
	} else {
		r.disc = disc
		go disc.read(s.heard)
	}
	s.mu.Lock()
	s.running = r
	s.mu.Unlock()
	go s.loop(ctx, r)
}

// forgetLibraries drops what the hosts shared: sharing is off.
func (s *Service) forgetLibraries() {
	s.mu.Lock()
	changed := false
	for _, p := range s.peers {
		if p.files != nil {
			p.files, p.filesVer = nil, ""
			changed = true
		}
	}
	s.mu.Unlock()
	s.publish(changed)
}

func (s *Service) loop(ctx context.Context, r *run) {
	defer close(r.done)
	announce := time.NewTicker(beaconEvery)
	defer announce.Stop()
	check := time.NewTicker(2 * time.Second)
	defer check.Stop()
	s.announce(r)
	s.askHosts(ctx)
	for beacons := 1; ; {
		select {
		case <-ctx.Done():
			return
		case <-announce.C:
			if beacons++; r.disc != nil && beacons%6 == 0 {
				r.disc.join() // interfaces that came up (every 30s)
			}
			s.announce(r)
		case <-check.C:
		case <-r.wake:
		}
		s.askHosts(ctx)
	}
}

func (s *Service) beacon() beacon {
	cfg := s.settings.Get()
	return beacon{Nyakuro: protocol, ID: s.id.ID, Name: s.Name(), Port: cfg.Server.Port, Key: s.id.PublicKey(), Version: config.AppVersion, Platform: runtime.GOOS, Role: s.role()}
}

func (s *Service) announce(r *run) {
	if r.disc != nil {
		r.disc.announce(s.beacon())
	}
}

func (s *Service) wake() {
	s.mu.Lock()
	r := s.running
	s.mu.Unlock()
	if r != nil {
		select {
		case r.wake <- struct{}{}:
		default:
		}
	}
}

// heard handles a beacon from another Nyakuro.
func (s *Service) heard(b beacon, from net.IP) {
	if b.ID == s.id.ID || !isLocalNetwork(from) || b.Port <= 0 || b.Port > 65535 {
		return
	}
	pub, err := parsePublicKey(b.ID, b.Key)
	if err != nil {
		return
	}
	s.mu.Lock()
	r := s.running
	p, known := s.peers[b.ID]
	if !known {
		s.makeRoom()
		p = &peer{id: b.ID, pub: pub}
		s.peers[b.ID] = p
	}
	now := time.Now()
	wasOnline := p.online(now)
	p.name, p.version, p.seen, p.beaconAt = cleanName(b.Name), b.Version, now, now
	if pl := cleanPlatform(b.Platform); pl != "" {
		p.platform = pl
	}
	p.role = cleanRole(b.Role)
	// One added by hand keeps its address, and one that proved who it is
	// lately too: anyone can repeat its beacons from elsewhere. Unless it
	// doesn't answer there (its address changed, say): then where it says.
	moved := !p.addr.Equal(from) || p.port != b.Port
	failing := p.fails > 0
	if moved && (failing || p.manual == "" && now.Sub(p.verified) > verifiedFor) {
		p.addr, p.port = from, b.Port
		if p.allowed || p.shares {
			s.save()
		}
	}
	// Anyone can repeat a beacon: at most every 2 seconds. One that didn't
	// answer is asked again at once when it's heard from.
	ask := (b.Ask || failing && moved) && now.Sub(p.asked) > 2*time.Second
	if ask {
		p.asked = time.Time{}
	}
	s.mu.Unlock()
	if ask {
		s.wake()
	}
	if !wasOnline {
		// Just came: tell it about this one, and ask what it shares.
		if r != nil && r.disc != nil && !b.Reply {
			r.disc.reply(s.beacon(), from)
		}
		s.mu.Lock()
		p.asked = time.Time{}
		s.mu.Unlock()
		s.wake()
		s.hub.Publish("sharing-updated", nil)
	}
}

// ---------------------------------------------------------------------------
// The host's side: who asks

// Caller is another Nyakuro that made a request, checked.
type Caller struct {
	ID, Name string
	// Allowed: this Nyakuro shares its library with it.
	Allowed bool
	// SameUser: it's logged into the same AniList account as this one.
	SameUser bool
	// Account: this Nyakuro shares its AniList login with it; Downloads: it
	// may download onto this Nyakuro. Both only with Allowed.
	Account, Downloads bool
	// Paired: Allowed, or it shares its library with this Nyakuro.
	Paired bool
	// User: the AniList account it says it's on (0: none).
	User int
	// Rules: its parental controls, set here (nil: none; only with Allowed).
	Rules *parental.Rules
}

// Verify checks a request from another Nyakuro, and notes it as seen. The
// answer (w) gets what proves it comes from this Nyakuro.
func (s *Service) Verify(w http.ResponseWriter, r *http.Request) (Caller, error) {
	if !s.settings.Get().Sharing.Enabled {
		return Caller{}, errors.New("library sharing is off")
	}
	ip := remoteIP(r)
	if !isLocalNetwork(ip) {
		return Caller{}, errors.New("not from the local network")
	}
	// A large body is read (to check it) only from a Nyakuro paired with this
	// one: anyone else could have it read megabytes for nothing.
	if r.ContentLength > maxUnpairedBody || r.ContentLength < 0 && r.Body != nil && r.Body != http.NoBody {
		s.mu.Lock()
		p := s.peers[r.Header.Get(headerID)]
		paired := p != nil && p.paired()
		s.mu.Unlock()
		if !paired {
			return Caller{}, errors.New("too large")
		}
	}
	now := time.Now()
	c, sig, err := s.id.verify(r, now)
	if sig != nil {
		date := now.UTC().Format(http.TimeFormat)
		if reply, err := sig.reply(date); err == nil {
			w.Header().Set("Date", date)
			w.Header().Set(HeaderReply, reply)
		}
	}
	if err != nil {
		return Caller{}, err
	}
	s.mu.Lock()
	p, known := s.peers[c.id]
	if !known {
		s.makeRoom()
		p = &peer{id: c.id, pub: c.pub}
		s.peers[c.id] = p
	}
	wasOnline := p.online(time.Now())
	if c.name != "" {
		p.name = c.name
	}
	// Where it answers, unless it was added by hand, or the request is a
	// ticket (mpv's, repeated for hours, maybe from another address).
	if !c.ticket {
		if c.port > 0 && c.port <= 65535 && p.manual == "" {
			p.addr, p.port = ip, c.port
		}
		p.verified = now
	}
	p.seen = now
	if p.callerUser != c.user {
		p.callerUser = c.user
		if p.paired() {
			s.save()
		}
	}
	caller := Caller{ID: p.id, Name: p.name, Allowed: p.allowed, Account: p.allowed && p.account, Downloads: p.allowed && p.downloads, Paired: p.paired()}
	if p.allowed && p.rules.Active() {
		r := *p.rules
		caller.Rules = &r
	}
	s.mu.Unlock()
	if !wasOnline {
		s.hub.Publish("sharing-updated", nil)
		// Back (or just started): where each left off, in step.
		if caller.Paired && !c.ticket {
			s.autoSync(p)
		}
	}
	me := s.user()
	caller.User = c.user
	caller.SameUser = me > 0 && c.user == me
	// A hub keeps every account's history: any device on one is on "its".
	if s.Hub != nil {
		caller.SameUser = c.user > 0
	}
	return caller, nil
}

func (s *Service) user() int {
	if s.User == nil {
		return 0
	}
	return s.User()
}

// HistorySince is this Nyakuro's watch history after t, for another Nyakuro on
// the same account (checked by the caller).
func (s *Service) HistorySince(c Caller, t int64) []*history.Entry {
	h := s.historyFor(c)
	if h == nil {
		return []*history.Entry{}
	}
	out := h.Since(t, historyBatch)
	if out == nil {
		out = []*history.Entry{}
	}
	return out
}

// HistoryAfter is this Nyakuro's watch history stored after seq (see
// history.Store.After), for another Nyakuro on the same account.
func (s *Service) HistoryAfter(c Caller, seq int64) []*history.Entry {
	h := s.historyFor(c)
	if h == nil {
		return []*history.Entry{}
	}
	out := h.After(seq, historyBatch)
	if out == nil {
		out = []*history.Entry{}
	}
	return out
}

// HistoryLatest is the latest of this Nyakuro's watch history (Sync).
func (s *Service) HistoryLatest(c Caller) []*history.Entry {
	h := s.historyFor(c)
	if h == nil {
		return []*history.Entry{}
	}
	out := h.Latest(historyBatch)
	if out == nil {
		out = []*history.Entry{}
	}
	return out
}

const historyBatch = 5000

func remoteIP(r *http.Request) net.IP {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	return net.ParseIP(host)
}

// Hello is the host's answer to a guest asking what it shares.
type Hello struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Key     string `json:"key"`
	Version string `json:"version"` // Nyakuro's
	// Platform: what it runs on (runtime.GOOS: "android" on a TV).
	Platform string `json:"platform,omitempty"`
	Shares   bool   `json:"shares"`
	// Files changes when the shared files do.
	Files string `json:"files,omitempty"`
	// User: the AniList account it's logged into, told to those it shares
	// with (their watch histories are kept in step on the same account).
	User int `json:"user,omitempty"`
	// Account: it shares its AniList login with the guest. A tag of it, which
	// changes with it; the login itself is asked for, sealed (account.go).
	Account string `json:"account,omitempty"`
	// Downloads: the guest may download onto it (downloads.go).
	Downloads bool `json:"downloads,omitempty"`
	// AniCli: it runs ani-cli for the guest (anicli.go).
	AniCli bool `json:"aniCli,omitempty"`
	// Wake: its network cards, to wake it when it's asleep (wake.go).
	Wake []string `json:"wake,omitempty"`
	// Role: RoleHub on a Nyakuro Hub (hub.go); PrefsAt: when the guest's
	// account's settings last changed on it (ms).
	Role    string `json:"role,omitempty"`
	PrefsAt int64  `json:"prefsAt,omitempty"`
	// BlobsAt: when the guest's account's lists and watch-order edits last
	// changed on the hub, by kind (ms; hub.go).
	BlobsAt map[string]int64 `json:"blobsAt,omitempty"`
	// Parental: the guest's parental controls, set here (parental.go).
	Parental *parental.Rules `json:"parental,omitempty"`
}

// Hello answers a guest (verified, see Verify).
func (s *Service) Hello(c Caller) Hello {
	h := Hello{ID: s.id.ID, Name: s.Name(), Key: s.id.PublicKey(), Version: config.AppVersion, Platform: runtime.GOOS, Shares: c.Allowed, Role: s.role()}
	if c.Allowed {
		h.Files = s.sharedVersion()
		h.User = s.user()
		if c.Account {
			h.Account = accountTag(s.accountToken())
		}
		h.Downloads = c.Downloads
		h.AniCli = s.AniCliReady != nil && s.AniCliReady()
		h.Wake = s.cachedMACs()
		h.Parental = c.Rules
		// A hub is on each device's own account (hub.go).
		if s.Hub != nil {
			h.User = c.User
			h.Account = ""
			if c.Account {
				h.Account = s.hubAccountTag(c.ID)
			}
			if c.User > 0 {
				h.PrefsAt = s.Hub.PrefsAt(c.User)
			}
			h.BlobsAt = s.Hub.BlobsAt(c.User)
		}
	}
	return h
}

// Whoami is what anyone on the network may ask: who this Nyakuro is (what its
// beacons say).
func (s *Service) Whoami() Hello {
	return Hello{ID: s.id.ID, Name: s.Name(), Key: s.id.PublicKey(), Version: config.AppVersion, Platform: runtime.GOOS, Role: s.role()}
}

// SharedFiles are the library's files this Nyakuro shares: those matched to an
// anime.
func (s *Service) SharedFiles() ([]*library.LocalFile, error) {
	all, err := s.library.All()
	if err != nil {
		return nil, err
	}
	out := make([]*library.LocalFile, 0, len(all))
	for _, f := range all {
		if f.MediaID != 0 && !f.Ignored && !IsRemote(f.Path) {
			out = append(out, f)
		}
	}
	return out, nil
}

// sharedVersion is filesVersion of SharedFiles: each Nyakuro it shares with
// asks for it. Read again when the library says it changed (libraryChanged),
// or after versionFor; not on every hello, which costs a server with a
// large library a read of all of it.
func (s *Service) sharedVersion() string {
	s.versionMu.Lock()
	defer s.versionMu.Unlock()
	s.refreshSharedLocked()
	return s.version
}

// libraryChanged: the library says it changed; its version is read again
// at the next hello.
func (s *Service) libraryChanged() {
	s.versionMu.Lock()
	s.versionAt = time.Time{}
	s.versionMu.Unlock()
}

// refreshSharedLocked reads the shared files again when due: their version,
// and the list as sent to the others (encoded once, gzipped once). Must be
// called with versionMu held.
func (s *Service) refreshSharedLocked() {
	if s.version != "" && time.Since(s.versionAt) < versionFor {
		return
	}
	files, err := s.SharedFiles()
	if err != nil && s.version != "" {
		// Couldn't read it now (the database busy): the last known stands.
		return
	}
	ver := filesVersion(files)
	s.version, s.versionAt = ver, time.Now()
	if s.filesJSONVer == ver && s.filesJSON != nil {
		return
	}
	plain, err := json.Marshal(files)
	if err != nil {
		return
	}
	var buf bytes.Buffer
	zw, _ := gzip.NewWriterLevel(&buf, gzip.BestSpeed)
	_, _ = zw.Write(plain)
	_ = zw.Close()
	s.filesJSONVer, s.filesJSON, s.filesGz = ver, plain, buf.Bytes()
}

// SharedFilesJSON is SharedFiles as sent to the others: its version, the
// list as JSON, and the same gzipped. Encoded once per version, so a server
// asked by every device doesn't encode its library for each.
func (s *Service) SharedFilesJSON() (version string, plain, gz []byte, err error) {
	s.versionMu.Lock()
	defer s.versionMu.Unlock()
	s.refreshSharedLocked()
	if s.filesJSON == nil {
		files, err := s.SharedFiles()
		if err != nil {
			return "", nil, nil, err
		}
		if plain, err = json.Marshal(files); err != nil {
			return "", nil, nil, err
		}
		return filesVersion(files), plain, nil, nil
	}
	return s.version, s.filesJSON, s.filesGz, nil
}

// cachedMACs is macs(), read at most every minute (every hello wants it).
func (s *Service) cachedMACs() []string {
	s.macsMu.Lock()
	defer s.macsMu.Unlock()
	if time.Since(s.macsAt) > time.Minute {
		s.macsCache, s.macsAt = macs(), time.Now()
	}
	return s.macsCache
}

// Shares reports a file this Nyakuro shares (see SharedFiles).
func (s *Service) Shares(path string) bool {
	if path == "" || IsRemote(path) {
		return false
	}
	f, err := s.library.Get(path)
	return err == nil && f != nil && f.MediaID != 0 && !f.Ignored
}

func filesVersion(files []*library.LocalFile) string {
	h := sha256.New()
	for _, f := range files {
		fmt.Fprintf(h, "%s|%d|%d|%d|%s|%d\n", f.Path, f.MediaID, f.Episode, f.Size, f.Kind, f.ModTime)
	}
	return hex.EncodeToString(h.Sum(nil)[:12])
}

// ---------------------------------------------------------------------------
// The guest's side: asking the hosts

func (s *Service) askHosts(ctx context.Context) {
	now := time.Now()
	s.mu.Lock()
	var due []*peer
	for _, p := range s.peers {
		if p.asking || p.addr == nil || p.port == 0 {
			continue
		}
		// Hosts that are around, or that were: until they stop answering.
		if !p.online(now) && p.manual == "" && p.files == nil && !p.shares {
			continue
		}
		wait := askEvery
		switch {
		case p.waking(now):
			wait = 3 * time.Second
		case p.fails > 0 || p.filesStale:
			wait = 10 * time.Second
		}
		if now.Sub(p.asked) >= wait {
			p.asking, p.asked = true, now
			due = append(due, p)
		}
	}
	s.mu.Unlock()
	for _, p := range due {
		go s.ask(ctx, p)
	}
}

// ask asks a host whether it shares its library with this Nyakuro, and for its
// files when they changed.
func (s *Service) ask(ctx context.Context, p *peer) {
	h, err := s.hello(ctx, p)
	// What it says it shares counts once this Nyakuro's owner accepted it as
	// a host: till then it only offers (asked on Home), and nothing of its
	// answer is followed (its files, rules, account, where downloads go).
	offers := err == nil && h.Shares
	if err == nil {
		s.mu.Lock()
		accepted := p.accepted
		s.mu.Unlock()
		if !accepted {
			h.Shares, h.Parental = false, nil
		}
	}
	var files []*library.LocalFile
	var filesErr error
	if err == nil && h.Shares {
		s.mu.Lock()
		same := h.Files == p.filesVer && p.files != nil
		// It answered: around, however long its list of files then takes
		// (a long one, from a busy server). Said now, not after the list.
		p.seen = time.Now()
		s.mu.Unlock()
		if !same {
			files, filesErr = s.fetchFiles(ctx, p)
		}
	}
	s.mu.Lock()
	p.asking = false
	if ctx.Err() != nil {
		// Sharing stopped or started over meanwhile (its settings
		// changed): the next run asks again at once, not 30s later.
		p.asked = time.Time{}
		s.mu.Unlock()
		return
	}
	changed, visible := false, false
	if err != nil {
		p.fails++
		// Added by name: maybe at another address now (a new DHCP lease).
		if p.manual != "" && p.fails%2 == 0 {
			go s.resolveManual(p)
		}
		if p.fails == maxFails {
			visible = true
			if p.files != nil {
				p.files, p.filesVer, changed = nil, "", true
			}
		}
		first, name, base := p.fails == 1, p.name, p.baseURL()
		s.mu.Unlock()
		if first {
			log.Printf("sharing: %s (%s): %v", name, base, err)
		}
		s.publish(changed)
		if visible {
			s.hub.Publish("sharing-updated", nil)
		}
		return
	}
	// It answered again after it didn't (or for the first time this run).
	back := p.fails > 0 || !p.online(time.Now())
	visible = back || p.shares != h.Shares || p.offers != offers || (p.name != h.Name && h.Name != "") || p.waking(time.Now())
	p.offers = offers
	p.fails, p.seen, p.wakeUntil = 0, time.Now(), time.Time{}
	if p.answeredAt.IsZero() {
		p.answeredAt = time.Now()
	}
	// Its cards, to wake it later (an older Nyakuro doesn't say).
	if cards := cleanMACs(h.Wake); h.Shares && len(cards) > 0 && strings.Join(cards, ",") != strings.Join(p.wakeMACs, ",") {
		p.wakeMACs = cards
		s.save()
	}
	if h.Name != "" {
		p.name = cleanName(h.Name)
	}
	p.version = h.Version
	if pl := cleanPlatform(h.Platform); pl != "" {
		p.platform = pl
	}
	p.role = cleanRole(h.Role)
	if p.shares != h.Shares {
		p.shares = h.Shares
		s.save()
	}
	stale := p.filesStale
	p.filesStale = false
	switch {
	case !h.Shares && p.files != nil:
		p.files, p.filesVer, changed = nil, "", true
	case h.Shares && files != nil:
		p.files, p.filesVer, changed = remoteFiles(p, files), h.Files, true
	case h.Shares && filesErr != nil:
		// Its list didn't come (a server busy with a scan, a list too long
		// for the time): what this Nyakuro has of it stays, and it's asked
		// again in a moment (askHosts).
		p.filesStale = true
		if !stale {
			log.Printf("sharing: %s's files: %v (keeping what it had)", p.name, filesErr)
		}
	}
	s.mu.Unlock()
	s.publish(changed)
	if visible || changed {
		s.hub.Publish("sharing-updated", nil)
	}
	s.takeParental(p, h.Parental)
	s.mu.Lock()
	was := p.user
	p.user = 0
	tag, takes := "", false
	if h.Shares {
		p.user = h.User
		tag, takes = h.Account, h.Downloads
	}
	// Another account there now: its history is asked for from the start
	// (where this Nyakuro was is the other account's).
	if p.user != was && p.user > 0 && was > 0 {
		p.historySeq, p.pushedSeq = 0, 0
		s.save()
	}
	aniCliChanged := p.hostAniCli != (h.Shares && h.AniCli)
	p.hostAniCli = h.Shares && h.AniCli
	accountChanged := p.hostAccount != tag
	took := p.hostDownloads
	p.hostAccount, p.hostDownloads = tag, takes
	if took != takes {
		s.save()
	}
	s.mu.Unlock()
	s.followAccount(ctx, p, tag)
	if took != takes {
		s.downloadsGranted(p, takes)
	}
	if accountChanged || took != takes || aniCliChanged {
		s.hub.Publish("sharing-updated", nil)
	}
	if h.Shares && h.User > 0 && h.User == s.user() {
		s.syncHistory(ctx, p)
		s.pushMissed(ctx, p)
		if p.role == RoleHub {
			s.syncPrefs(ctx, p, h.PrefsAt)
		}
	}
	// The list and watch-order edits: on the account, or on none (user 0).
	if h.Shares && p.role == RoleHub && h.User == s.user() {
		s.syncBlobs(ctx, p, h.BlobsAt)
	}
	if back {
		s.autoSync(p)
	}
}

// HistoryChanged sends a position this Nyakuro saved to the Nyakuros that share
// with it on the same AniList account (the one whose files are played,
// most of all), as it happens: their Continue watching goes on from it.
// Gathered for 2 seconds; at once when the episode is over.
func (s *Service) HistoryChanged(e history.Entry) {
	s.mu.Lock()
	on := s.running != nil
	s.mu.Unlock()
	if on {
		s.parentalWatched(e)
	}
	if !on || s.user() == 0 {
		return
	}
	s.pushMu.Lock()
	defer s.pushMu.Unlock()
	if s.pending == nil {
		s.pending = map[[2]int]history.Entry{}
	}
	s.pending[[2]int{e.MediaID, e.Episode}] = e
	wait := 2 * time.Second
	if e.Percent() >= 0.85 {
		wait = 0
	}
	if s.pushTimer == nil {
		s.pushTimer = time.AfterFunc(wait, s.pushHistory)
	} else if wait == 0 {
		s.pushTimer.Reset(0)
	}
}

func (s *Service) pushHistory() {
	s.pushMu.Lock()
	entries := make([]history.Entry, 0, len(s.pending))
	for _, e := range s.pending {
		entries = append(entries, e)
	}
	s.pending, s.pushTimer = nil, nil
	s.pushMu.Unlock()
	me := s.user()
	if len(entries) == 0 || me == 0 {
		return
	}
	s.mu.Lock()
	var to []*peer
	for _, p := range s.peers {
		if p.shares && p.user == me && p.addr != nil && p.fails < maxFails {
			to = append(to, p)
		}
	}
	s.mu.Unlock()
	body, _ := json.Marshal(entries)
	var wg sync.WaitGroup
	for _, p := range to {
		wg.Add(1)
		go func() {
			defer wg.Done()
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			_ = s.sendHistory(ctx, p, body)
		}()
	}
	wg.Wait()
}

// flushPush sends the positions waiting to go (pushHistory) now: Nyakuro is
// closing, and the last one saved would be lost otherwise.
func (s *Service) flushPush() {
	s.pushMu.Lock()
	if s.pushTimer != nil {
		s.pushTimer.Stop()
	}
	waiting := len(s.pending) > 0
	s.pushMu.Unlock()
	if waiting {
		s.pushHistory()
	}
}

// pushMissed sends a host on the same account what this Nyakuro stored since
// the last it sent it: what didn't reach it as it was saved (it was away),
// or came from another Nyakuro.
func (s *Service) pushMissed(ctx context.Context, p *peer) {
	if s.History == nil {
		return
	}
	s.mu.Lock()
	after := p.pushedSeq
	s.mu.Unlock()
	entries := s.History.After(after, historyBatch)
	if len(entries) == 0 {
		return
	}
	body, err := json.Marshal(entries)
	if err != nil || s.sendHistory(ctx, p, body) != nil {
		return
	}
	s.mu.Lock()
	p.pushedSeq = max(p.pushedSeq, entries[len(entries)-1].Seq)
	s.save()
	s.mu.Unlock()
}

// sendHistory sends positions (JSON) to a Nyakuro on the same account.
func (s *Service) sendHistory(ctx context.Context, p *peer, body []byte) error {
	req, err := s.request(ctx, p, http.MethodPost, "/api/peer/history", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := s.do(s.api, req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return answerError(resp)
}

// answerError is what a Nyakuro's answer (not OK) says went wrong, in words.
func answerError(resp *http.Response) error {
	if resp.StatusCode == http.StatusOK {
		return nil
	}
	var e struct {
		Error string `json:"error"`
	}
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if json.Unmarshal(raw, &e) != nil || e.Error == "" {
		e.Error = resp.Status
	}
	return errors.New(e.Error)
}

// Paired names the Nyakuros this one is paired with (it shares its library
// with them, or they with it), with sharing on.
func (s *Service) Paired() []string {
	if !s.settings.Get().Sharing.Enabled {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	var out []string
	for _, p := range s.peers {
		if p.paired() {
			out = append(out, p.displayName())
		}
	}
	sort.Strings(out)
	return out
}

// SyncResult is what SyncNow did.
type SyncResult struct {
	// Devices: the Nyakuros synced with. Unreachable: those that couldn't be
	// (why, after the name). Skipped: paired Nyakuros not synced with (why).
	Devices     []string `json:"devices"`
	Unreachable []string `json:"unreachable"`
	Skipped     []string `json:"skipped"`
	// Updated: the positions that changed here.
	Updated int `json:"updated"`
}

// SyncNow brings this Nyakuro's watch history in step with the Nyakuros it's
// paired with on the same AniList account, both ways, now: each takes what
// the other has newer (the latest stored on each), and Continue watching
// goes on from where an episode was stopped on any of them. As it goes, a
// guest takes its hosts' positions every askEvery and sends them its own,
// which this does at once.
func (s *Service) SyncNow(ctx context.Context) (SyncResult, error) {
	res := SyncResult{Devices: []string{}, Unreachable: []string{}, Skipped: []string{}}
	me := s.user()
	if s.History == nil || !s.settings.Get().Sharing.Enabled {
		return res, nil
	}
	s.mu.Lock()
	var with []*peer
	for _, p := range s.peers {
		if !p.paired() || me == 0 {
			continue
		}
		switch skip, away := syncable(p, me); {
		case skip != "":
			res.Skipped = append(res.Skipped, p.displayName()+" ("+skip+")")
		case away != "":
			res.Unreachable = append(res.Unreachable, p.displayName()+" ("+away+")")
		default:
			with = append(with, p)
		}
	}
	s.mu.Unlock()
	if me == 0 {
		if len(s.Paired()) > 0 {
			return res, errors.New("log in to AniList: watch history is kept in step between devices on the same AniList account")
		}
		return res, nil
	}
	body, err := json.Marshal(s.History.Latest(historyBatch))
	if err != nil {
		return res, err
	}
	var mu sync.Mutex
	var wg sync.WaitGroup
	for _, p := range with {
		wg.Add(1)
		go func() {
			defer wg.Done()
			s.mu.Lock()
			name := p.displayName()
			s.mu.Unlock()
			merged, err := s.syncWith(ctx, p, body)
			if err != nil {
				log.Printf("sharing: sync with %s: %v", name, err)
				mu.Lock()
				res.Unreachable = append(res.Unreachable, name+" ("+plainError(err)+")")
				mu.Unlock()
				return
			}
			mu.Lock()
			res.Devices = append(res.Devices, name)
			res.Updated += merged
			mu.Unlock()
		}()
	}
	wg.Wait()
	sort.Strings(res.Devices)
	sort.Strings(res.Unreachable)
	sort.Strings(res.Skipped)
	if res.Updated > 0 {
		s.hub.Publish("history-updated", nil)
	}
	return res, nil
}

// syncable: whether this Nyakuro's watch history can be synced with a paired
// one (this one on AniList account me): why not (skip), or why it can't be
// reached. Must be called with mu held.
func syncable(p *peer, me int) (skip, away string) {
	user := p.user
	if user == 0 {
		user = p.callerUser
	}
	switch {
	case user == 0:
		return "it hasn't said its AniList account yet: open Nyakuro there", ""
	case user != me:
		return "another AniList account", ""
	case p.addr == nil || p.port <= 0:
		return "", "its address isn't known yet"
	}
	return "", ""
}

// syncWith takes a paired Nyakuro's latest positions and sends it this one's
// (body), and returns how many changed here.
func (s *Service) syncWith(ctx context.Context, p *peer, body []byte) (int, error) {
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	var theirs []*history.Entry
	if err := s.getJSON(ctx, p, "/api/peer/history?latest=1", &theirs); err != nil {
		return 0, err
	}
	if err := s.sendHistory(ctx, p, body); err != nil {
		return 0, err
	}
	return s.merge(theirs), nil
}

// How often at most a paired Nyakuro is synced with by itself (autoSync).
const autoSyncEvery = 2 * time.Minute

// autoSync syncs the watch history with a paired Nyakuro that came back (it
// answered again, or asked), as Sync would, unless that's turned off or it
// was done a moment ago: Continue watching goes on from where it was left on
// it, without pressing Sync.
func (s *Service) autoSync(p *peer) {
	me := s.user()
	if s.History == nil || me == 0 || !s.settings.Get().Sharing.AutoSync {
		return
	}
	s.mu.Lock()
	skip, away := syncable(p, me)
	due := p.paired() && skip == "" && away == "" && time.Since(p.autoSynced) >= autoSyncEvery && s.running != nil
	if due {
		p.autoSynced = time.Now()
	}
	name := p.displayName()
	s.mu.Unlock()
	if !due {
		return
	}
	go func() {
		body, err := json.Marshal(s.History.Latest(historyBatch))
		if err != nil {
			return
		}
		merged, err := s.syncWith(context.Background(), p, body)
		if err != nil {
			log.Printf("sharing: syncing with %s: %v", name, plainError(err))
			return
		}
		if merged > 0 {
			log.Printf("sharing: synced %d position(s) with %s", merged, name)
			s.hub.Publish("history-updated", nil)
			if s.OnWatchedElsewhere != nil {
				s.OnWatchedElsewhere()
			}
		}
	}()
}

// Gone marks another Nyakuro as not heard from for a while (tests: as if it
// had been away).
func (s *Service) Gone(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if p := s.peers[id]; p != nil {
		p.seen, p.lastSeen = time.Time{}, time.Time{}
	}
}

// AutoSyncAll syncs with every paired Nyakuro by itself (autoSync), as when
// the app is opened again.
func (s *Service) AutoSyncAll() {
	s.mu.Lock()
	var all []*peer
	for _, p := range s.peers {
		if p.paired() {
			all = append(all, p)
		}
	}
	s.mu.Unlock()
	for _, p := range all {
		s.autoSync(p)
	}
}

// plainError says what went wrong talking to another Nyakuro, in a few words.
func plainError(err error) string {
	var ne net.Error
	switch {
	case errors.Is(err, context.DeadlineExceeded) || (errors.As(err, &ne) && ne.Timeout()):
		return "it didn't answer in time"
	case errors.Is(err, syscall.ECONNREFUSED):
		return "Nyakuro isn't running there"
	case errors.Is(err, syscall.EHOSTUNREACH) || errors.Is(err, syscall.ENETUNREACH):
		return "it isn't on the network"
	}
	var oe *net.OpError
	if errors.As(err, &oe) {
		return "it isn't reachable"
	}
	// Not the request's address (a file's path on that computer, say).
	var ue *url.Error
	if errors.As(err, &ue) {
		if errors.Is(ue.Err, io.EOF) || errors.Is(ue.Err, io.ErrUnexpectedEOF) {
			return "the connection closed"
		}
		return ue.Err.Error()
	}
	return err.Error()
}

// TakeHistory merges positions another Nyakuro on the same account sent
// (checked by the caller), the newer ones. A hub keeps them in the caller's
// account's history, and sends them on to its other devices.
func (s *Service) TakeHistory(c Caller, entries []history.Entry) {
	if s.Hub != nil {
		s.hubTake(c, entries)
		return
	}
	if s.History == nil {
		return
	}
	merged, err := s.History.MergeAll(entries)
	if err != nil {
		log.Printf("sharing: history: %v", err)
	}
	finished := false
	for _, e := range merged {
		finished = finished || e.Percent() >= 0.85
	}
	if len(merged) > 0 {
		s.hub.Publish("history-updated", nil)
	}
	if finished && s.OnWatchedElsewhere != nil {
		go s.OnWatchedElsewhere()
	}
}

// merge takes positions from another Nyakuro, and says how many changed here.
func (s *Service) merge(entries []*history.Entry) int {
	in := make([]history.Entry, 0, len(entries))
	for _, e := range entries {
		if e != nil {
			in = append(in, *e)
		}
	}
	merged, err := s.History.MergeAll(in)
	if err != nil {
		log.Printf("sharing: history: %v", err)
	}
	return len(merged)
}

// syncHistory takes what's newer in a host's watch history, both being
// logged into the same AniList account: where each episode was stopped,
// and when it was watched. Continue watching then goes on from there,
// to the second; the list itself (progress) is AniList's. It asks for what
// the host stored after the last it took, whatever their times (one from
// another Nyakuro comes late with an older time).
func (s *Service) syncHistory(ctx context.Context, p *peer) {
	if s.History == nil {
		return
	}
	s.mu.Lock()
	after := p.historySeq
	s.mu.Unlock()
	var entries []*history.Entry
	if err := s.getJSON(ctx, p, "/api/peer/history?after="+strconv.FormatInt(after, 10), &entries); err != nil {
		return
	}
	merged := s.merge(entries)
	last := after
	for _, e := range entries {
		if e != nil {
			last = max(last, e.Seq)
		}
	}
	s.mu.Lock()
	if last > p.historySeq {
		p.historySeq = last
		s.save()
	}
	s.mu.Unlock()
	if merged > 0 {
		s.hub.Publish("history-updated", nil)
	}
}

// publish tells the app the shared files changed.
func (s *Service) publish(changed bool) {
	if changed {
		s.hub.Publish("library-updated", nil)
		if s.OnFiles != nil {
			go s.OnFiles()
		}
	}
}

// request makes a signed request to a host (sent with do).
func (s *Service) request(ctx context.Context, p *peer, method, path string, body io.Reader) (*http.Request, error) {
	s.mu.Lock()
	base := p.baseURL()
	s.mu.Unlock()
	req, err := http.NewRequestWithContext(ctx, method, base+path, body)
	if err != nil {
		return nil, err
	}
	return s.sign(req, p)
}

type signedKey struct{}

// signed is a request signed for a host: what checks its answer.
type signed struct {
	p      *peer
	sig    *signature
	offset time.Duration
}

// sign signs a request for a host, by its clock as far as this Nyakuro knows it.
func (s *Service) sign(req *http.Request, p *peer) (*http.Request, error) {
	s.mu.Lock()
	host, pub, off := p.id, p.pub, p.offset
	user := s.user()
	// A hub talks to each device as on its account (hub.go).
	if s.Hub != nil {
		user = p.callerUser
	}
	s.mu.Unlock()
	sig, err := s.id.sign(req, host, pub, s.Name(), s.settings.Get().Server.Port, user, time.Now().Add(off), false)
	if err != nil {
		return nil, err
	}
	return req.WithContext(context.WithValue(req.Context(), signedKey{}, &signed{p: p, sig: sig, offset: off})), nil
}

// do sends a request made by request, and checks its answer comes from the
// host: a computer that took its address can't answer for it. A host whose
// clock is far from this one's refuses the request, with its time (proven):
// it's sent once more, by that time.
func (s *Service) do(c *http.Client, req *http.Request) (*http.Response, error) {
	for try := 0; ; try++ {
		sr, _ := req.Context().Value(signedKey{}).(*signed)
		if sr == nil {
			return nil, errors.New("unsigned request")
		}
		sent := time.Now()
		resp, err := c.Do(req)
		if err != nil {
			return nil, err
		}
		date := resp.Header.Get("Date")
		want, err := sr.sig.reply(date)
		if err != nil || resp.Header.Get(HeaderReply) == "" || !hmac.Equal([]byte(want), []byte(resp.Header.Get(HeaderReply))) {
			resp.Body.Close()
			return nil, fmt.Errorf("the answer can't be checked as %s's (is the latest Nyakuro running there, with library sharing on?)", s.nameOf(sr.p))
		}
		// The host dates its answer as it gets the request (Verify), however
		// long the answer then takes (a file read from a sleeping disk):
		// against when it was sent, not when the answer came.
		off := sr.offset
		if t, err := http.ParseTime(date); err == nil {
			off = t.Sub(sent).Round(time.Second)
		}
		// A signed answer: it's around, whatever it was asked (a file, a
		// position pushed): online until its next ask comes due.
		s.mu.Lock()
		sr.p.verified, sr.p.offset, sr.p.seen = time.Now(), off, time.Now()
		s.mu.Unlock()
		moved := off-sr.offset > clockSkew/2 || sr.offset-off > clockSkew/2
		if resp.StatusCode != http.StatusUnauthorized || !moved || try > 0 {
			return resp, nil
		}
		resp.Body.Close()
		again := req.Clone(req.Context())
		if req.GetBody != nil {
			if again.Body, err = req.GetBody(); err != nil {
				return nil, err
			}
		}
		if req, err = s.sign(again, sr.p); err != nil {
			return nil, err
		}
	}
}

// Sign signs a request to the Nyakuro with that ID and public key (as its
// whoami tells them).
func (s *Service) Sign(req *http.Request, hostID, hostKey string) error {
	pub, err := parsePublicKey(hostID, hostKey)
	if err != nil {
		return err
	}
	_, err = s.id.sign(req, hostID, pub, s.Name(), s.settings.Get().Server.Port, s.user(), time.Now(), false)
	return err
}

func (s *Service) getJSON(ctx context.Context, p *peer, path string, out any) error {
	return s.getJSONWith(ctx, s.api, p, path, out)
}

func (s *Service) getJSONWith(ctx context.Context, c *http.Client, p *peer, path string, out any) error {
	req, err := s.request(ctx, p, http.MethodGet, path, nil)
	if err != nil {
		return err
	}
	resp, err := s.do(c, req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		msg, _ := io.ReadAll(io.LimitReader(resp.Body, 300))
		return fmt.Errorf("%s: %s", resp.Status, strings.TrimSpace(string(msg)))
	}
	return json.NewDecoder(io.LimitReader(resp.Body, 64<<20)).Decode(out)
}

func (s *Service) hello(ctx context.Context, p *peer) (*Hello, error) {
	var h Hello
	if err := s.getJSON(ctx, p, "/api/peer/hello", &h); err != nil {
		return nil, err
	}
	// Another Nyakuro at that address now (a new IP address from the router).
	if h.ID != p.id {
		return nil, fmt.Errorf("another Nyakuro (%s) answers there", h.Name)
	}
	return &h, nil
}

func (s *Service) fetchFiles(ctx context.Context, p *peer) ([]*library.LocalFile, error) {
	var files []*library.LocalFile
	// A long list from a busy server takes a while: more than a hello may.
	if err := s.getJSONWith(ctx, s.slow, p, "/api/peer/files", &files); err != nil {
		return nil, err
	}
	if files == nil {
		files = []*library.LocalFile{}
	}
	return files, nil
}

// remoteFiles names a host's files after it (kumo://<host>/<path>).
func remoteFiles(p *peer, files []*library.LocalFile) []*library.LocalFile {
	out := make([]*library.LocalFile, 0, len(files))
	for _, f := range files {
		if f == nil || f.Path == "" || f.MediaID == 0 {
			continue
		}
		c := *f
		c.Path = RemotePath(p.id, f.Path)
		c.Dir = ""
		c.Host, c.HostName = p.id, p.name
		out = append(out, &c)
	}
	return out
}

// ---------------------------------------------------------------------------
// Shared files' paths

const scheme = "kumo://"

// RemotePath is the path of a host's file.
func RemotePath(host, path string) string { return scheme + host + "/" + path }

// IsRemote reports a path of another Nyakuro's file.
func IsRemote(path string) bool { return strings.HasPrefix(path, scheme) }

// ParsePath splits a shared file's path into its host and its path there.
func ParsePath(path string) (host, onHost string, ok bool) {
	rest, ok := strings.CutPrefix(path, scheme)
	if !ok {
		return "", "", false
	}
	host, onHost, ok = strings.Cut(rest, "/")
	if !ok || host == "" || onHost == "" {
		return "", "", false
	}
	return host, onHost, true
}

// ---------------------------------------------------------------------------
// What the app shows

// PeerView is another Nyakuro on the network, for Settings.
type PeerView struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Address  string `json:"address"`
	Online   bool   `json:"online"`
	LastSeen int64  `json:"lastSeen"`
	Version  string `json:"version"`
	// Platform: what it runs on ("android": a TV; "" when it didn't say).
	Platform string `json:"platform,omitempty"`
	// Allowed: this Nyakuro shares its library with it.
	Allowed bool `json:"allowed"`
	// Shares: it shares its library with this Nyakuro (Files of them).
	Shares bool `json:"shares"`
	// Offers: it says it shares with this Nyakuro, which hasn't accepted it.
	Offers bool   `json:"offers,omitempty"`
	Files  int    `json:"files"`
	Manual bool   `json:"manual"`
	Error  string `json:"error,omitempty"`
	// Granted to it (with Allowed): this Nyakuro's AniList login, downloading
	// onto this Nyakuro.
	Account   bool `json:"account"`
	Downloads bool `json:"downloads"`
	// Granted by it (it shares): its AniList login, and whether this Nyakuro
	// is using it; downloading onto it.
	SharesAccount  bool `json:"sharesAccount"`
	UsingAccount   bool `json:"usingAccount"`
	TakesDownloads bool `json:"takesDownloads"`
	// It shares and can be woken up (wake.go); it's being woken.
	CanWake bool `json:"canWake"`
	Waking  bool `json:"waking"`
	// Declined: asked whether to share with it, the answer was "not now".
	Declined bool `json:"declined"`
	// Role: "hub" for a Nyakuro Hub (nyakuro --hub), "" for a Nyakuro app.
	Role string `json:"role,omitempty"`
	// Parental: parental controls are set for it here (parental.go).
	Parental bool `json:"parental,omitempty"`
	// NoBeacons: it answers when asked, but none of its beacons has come in
	// a minute of that: they don't get through (a firewall, a Wi-Fi that
	// drops them). It's found by its address alone, which can change.
	NoBeacons bool `json:"noBeacons,omitempty"`
}

func (s *Service) view(p *peer, now time.Time) PeerView {
	v := PeerView{
		ID: p.id, Name: p.name, Online: p.online(now), LastSeen: p.lastAround().Unix(), Version: p.version,
		Allowed: p.allowed, Shares: p.shares, Offers: p.offers && !p.accepted, Files: len(p.files), Manual: p.manual != "",
		Account: p.account, Downloads: p.downloads,
		SharesAccount: p.shares && p.hostAccount != "", TakesDownloads: p.shares && p.hostDownloads,
		CanWake: p.shares && len(p.wakeMACs) > 0, Waking: p.waking(now),
		Platform: p.platform, Declined: p.declined, Role: p.role, Parental: p.allowed && p.rules.Active(),
	}
	if p.addr != nil {
		v.Address = net.JoinHostPort(p.addr.String(), strconv.Itoa(p.port))
	}
	if v.Name == "" {
		v.Name = "Nyakuro " + p.id[:6]
	}
	// Two named alike (two Fire TVs): told apart. Must be called with mu held.
	for _, o := range s.peers {
		if o != p && o.name != "" && strings.EqualFold(o.name, p.name) {
			v.Name += " (" + p.id[:4] + ")"
			break
		}
	}
	if p.fails >= maxFails {
		v.Error = "Not answering"
	}
	v.NoBeacons = p.shares && p.beaconAt.IsZero() && !p.answeredAt.IsZero() && now.Sub(p.answeredAt) > time.Minute
	return v
}

// Status is sharing as Settings shows it.
type Status struct {
	Enabled bool       `json:"enabled"`
	ID      string     `json:"id"`
	Name    string     `json:"name"`
	Peers   []PeerView `json:"peers"`
	// Listening: other Nyakuros can find this one (the network port could be
	// opened).
	Listening bool `json:"listening"`
	// Addresses: where the others reach this Nyakuro (to add it by hand).
	Addresses []string `json:"addresses"`
	// ListsSynced: when the list and watch-order edits were last in step
	// with a hub, and which (hub.go); nil: not yet since Nyakuro started.
	ListsSynced *ListsSynced `json:"listsSynced,omitempty"`
}

// ListsSynced is when the lists were last in step with a hub (ms).
type ListsSynced struct {
	At   int64  `json:"at"`
	With string `json:"with"`
}

func (s *Service) Status() Status {
	now := time.Now()
	using := s.AccountHost()
	s.mu.Lock()
	defer s.mu.Unlock()
	st := Status{Enabled: s.running != nil, ID: s.id.ID, Name: s.Name(), Listening: s.running != nil && s.running.disc != nil, Peers: []PeerView{}, Addresses: addresses(s.settings.Get().Server.Port)}
	s.blobMu.Lock()
	if s.listsSynced.At > 0 {
		ls := s.listsSynced
		st.ListsSynced = &ls
	}
	s.blobMu.Unlock()
	for _, p := range s.peers {
		// Those never heard from again, nor useful, aren't listed.
		if !p.online(now) && !p.allowed && !p.shares && p.manual == "" {
			continue
		}
		v := s.view(p, now)
		v.UsingAccount = v.SharesAccount && p.id == using
		st.Peers = append(st.Peers, v)
	}
	sort.Slice(st.Peers, func(i, j int) bool {
		a, b := st.Peers[i], st.Peers[j]
		if a.Online != b.Online {
			return a.Online
		}
		return strings.ToLower(a.Name) < strings.ToLower(b.Name)
	})
	return st
}

// addresses are this computer's addresses on the home network.
func addresses(port int) []string {
	out := []string{}
	for _, ifi := range interfaces() {
		addrs, _ := ifi.Addrs()
		for _, a := range addrs {
			if ipn, ok := a.(*net.IPNet); ok && ipn.IP.To4() != nil && isLocalNetwork(ipn.IP) && !ipn.IP.IsLinkLocalUnicast() {
				out = append(out, net.JoinHostPort(ipn.IP.String(), strconv.Itoa(port)))
			}
		}
	}
	return out
}

// Grants is what this Nyakuro shares with another one: its library, and with
// it its AniList login and downloading onto this Nyakuro. Nil: unchanged.
type Grants struct {
	Allowed   *bool `json:"allowed"`
	Account   *bool `json:"account"`
	Downloads *bool `json:"downloads"`
	// Declined: "not now", asked whether to share with it (Home).
	Declined *bool `json:"declined"`
	// Accepted: its library is used here (it offers it): true only.
	Accepted *bool `json:"accepted"`
}

// SetAllowed shares this Nyakuro's library with another one, or stops.
func (s *Service) SetAllowed(id string, allowed bool) error {
	return s.SetGrants(id, Grants{Allowed: &allowed})
}

// SetGrants changes what this Nyakuro shares with another one.
func (s *Service) SetGrants(id string, g Grants) error {
	s.mu.Lock()
	p, ok := s.peers[id]
	if ok {
		if g.Allowed != nil {
			p.allowed = *g.Allowed
			// Not shared with any more: nor what came with it, which
			// sharing again mustn't give back unasked.
			if !p.allowed {
				p.account, p.downloads = false, false
			}
		}
		if g.Account != nil {
			p.account = *g.Account
		}
		if g.Downloads != nil {
			p.downloads = *g.Downloads
		}
		if g.Declined != nil {
			p.declined = *g.Declined
		}
		if g.Accepted != nil && *g.Accepted {
			p.accepted, p.declined = true, false
			p.asked = time.Time{}
		}
		// Shared with after all: the "not now" is over.
		if p.allowed {
			p.declined = false
		}
		s.save()
	}
	s.mu.Unlock()
	if !ok {
		return errors.New("no Nyakuro app with that ID")
	}
	s.hub.Publish("sharing-updated", nil)
	if g.Accepted != nil && *g.Accepted {
		s.wake()
	}
	// Tell it to ask again now (it does every 30s anyway).
	s.mu.Lock()
	r := s.running
	s.mu.Unlock()
	if r != nil && r.disc != nil && p.addr != nil {
		b := s.beacon()
		b.Ask = true
		r.disc.reply(b, p.addr)
	}
	return nil
}

// Refresh asks the hosts again what they share, soon (Settings or the
// library page is open): at most every refreshEvery, so a page asking every
// few seconds doesn't have every server answer every few seconds.
func (s *Service) Refresh() {
	s.refreshMu.Lock()
	soon := time.Since(s.refreshedAt) < refreshEvery
	if !soon {
		s.refreshedAt = time.Now()
	}
	s.refreshMu.Unlock()
	if !soon {
		s.RefreshNow()
	}
}

// RefreshNow asks the hosts again what they share, now (you asked).
func (s *Service) RefreshNow() {
	now := time.Now()
	s.mu.Lock()
	for _, p := range s.peers {
		if now.Sub(p.asked) > 3*time.Second {
			p.asked = time.Time{}
		}
	}
	s.mu.Unlock()
	s.wake()
}

// resolveManual finds a Nyakuro added by name (not an address) again.
func (s *Service) resolveManual(p *peer) {
	s.mu.Lock()
	manual := p.manual
	s.mu.Unlock()
	host, portStr, err := net.SplitHostPort(manual)
	if err != nil || net.ParseIP(host) != nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	ips, err := net.DefaultResolver.LookupIP(ctx, "ip4", host)
	if err != nil || len(ips) == 0 || !isLocalNetwork(ips[0]) {
		return
	}
	port, _ := strconv.Atoi(portStr)
	s.mu.Lock()
	if p.manual == manual && !p.addr.Equal(ips[0]) {
		p.addr, p.port, p.asked = ips[0], port, time.Time{}
		s.save()
		log.Printf("sharing: %s is at %s now", manual, ips[0])
	}
	s.mu.Unlock()
	s.wake()
}

// makeRoom keeps the Nyakuros this one only heard of to a few: anyone on the
// network can make up new ones. Must be called with mu held.
func (s *Service) makeRoom() {
	var strangers []*peer
	for _, p := range s.peers {
		if !p.paired() && p.manual == "" {
			strangers = append(strangers, p)
		}
	}
	if len(strangers) < maxStrangers {
		return
	}
	oldest := strangers[0]
	for _, p := range strangers[1:] {
		if p.lastAround().Before(oldest.lastAround()) {
			oldest = p
		}
	}
	delete(s.peers, oldest.id)
}

// Forget removes a Nyakuro from the list (one added by hand, or gone).
func (s *Service) Forget(id string) {
	s.mu.Lock()
	p, ok := s.peers[id]
	if ok {
		delete(s.peers, id)
		s.save()
	}
	s.mu.Unlock()
	if !ok {
		return
	}
	// Nothing of it stays: where downloads went, its AniList login.
	if cfg := s.settings.Get(); cfg.Sharing.DownloadTo == id {
		cfg.Sharing.DownloadTo = ""
		if _, err := s.settings.Save(cfg); err != nil {
			log.Printf("sharing: %v", err)
		}
	}
	s.accountMu.Lock()
	if st := s.loadAccount(); st.Host == id {
		if s.DropAccount != nil {
			s.DropAccount()
		}
		st.Host, st.Tag = "", ""
		s.saveAccount(st)
	}
	s.accountMu.Unlock()
	s.publish(p.files != nil)
	s.hub.Publish("sharing-updated", nil)
}

// Connect adds a Nyakuro by its address, for networks where they can't find
// each other by themselves (it needs sharing on too).
func (s *Service) Connect(ctx context.Context, address string) (PeerView, error) {
	address = strings.TrimSpace(address)
	address = strings.TrimPrefix(strings.TrimPrefix(address, "http://"), "https://")
	address = strings.TrimSuffix(address, "/")
	host, portStr, err := net.SplitHostPort(address)
	if err != nil {
		host, portStr = address, strconv.Itoa(config.DefaultPort)
	}
	port, err := strconv.Atoi(portStr)
	if err != nil || port <= 0 || port > 65535 {
		return PeerView{}, errors.New("that isn't an address like 192.168.1.20 or 192.168.1.20:43211")
	}
	ips, err := net.DefaultResolver.LookupIP(ctx, "ip4", host)
	if err != nil || len(ips) == 0 {
		return PeerView{}, fmt.Errorf("can't find %s on the network", host)
	}
	ip := ips[0]
	if !isLocalNetwork(ip) {
		return PeerView{}, errors.New("only computers on your home network can share")
	}
	probe := &peer{addr: ip, port: port}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, probe.baseURL()+"/api/peer/whoami", nil)
	if err != nil {
		return PeerView{}, err
	}
	resp, err := s.api.Do(req)
	if err != nil {
		return PeerView{}, fmt.Errorf("no answer from %s: is Nyakuro open there, with library sharing on?", address)
	}
	defer resp.Body.Close()
	var h Hello
	if resp.StatusCode != http.StatusOK || json.NewDecoder(io.LimitReader(resp.Body, 1<<16)).Decode(&h) != nil {
		return PeerView{}, fmt.Errorf("%s isn't a Nyakuro app with library sharing on", address)
	}
	if h.ID == s.id.ID {
		return PeerView{}, errors.New("that's this Nyakuro")
	}
	pub, err := parsePublicKey(h.ID, h.Key)
	if err != nil {
		return PeerView{}, err
	}
	s.mu.Lock()
	p, ok := s.peers[h.ID]
	if !ok {
		p = &peer{id: h.ID, pub: pub}
		s.peers[h.ID] = p
	}
	p.name, p.version, p.addr, p.port, p.seen = cleanName(h.Name), h.Version, ip, port, time.Now()
	if pl := cleanPlatform(h.Platform); pl != "" {
		p.platform = pl
	}
	p.manual = net.JoinHostPort(host, strconv.Itoa(port))
	// Added by hand: taken as a host.
	p.accepted = true
	p.asked, p.fails = time.Time{}, 0
	s.save()
	v := s.view(p, time.Now())
	s.mu.Unlock()
	s.wake()
	s.hub.Publish("sharing-updated", nil)
	return v, nil
}

// SharedLibrary is a host's shared library.
type SharedLibrary struct {
	Host  PeerView             `json:"host"`
	Files []*library.LocalFile `json:"files"`
}

// Libraries are the libraries shared with this Nyakuro.
func (s *Service) Libraries() []SharedLibrary {
	now := time.Now()
	using := s.AccountHost()
	s.mu.Lock()
	defer s.mu.Unlock()
	out := []SharedLibrary{}
	for _, p := range s.peers {
		if p.files != nil {
			v := s.view(p, now)
			v.UsingAccount = v.SharesAccount && p.id == using
			out = append(out, SharedLibrary{Host: v, Files: p.files})
		}
	}
	sort.Slice(out, func(i, j int) bool { return strings.ToLower(out[i].Host.Name) < strings.ToLower(out[j].Host.Name) })
	return out
}

// RemoteFiles are all the files shared with this Nyakuro.
func (s *Service) RemoteFiles() []*library.LocalFile {
	s.mu.Lock()
	defer s.mu.Unlock()
	var out []*library.LocalFile
	for _, p := range s.peers {
		out = append(out, p.files...)
	}
	return out
}

// File is a shared file, by its kumo:// path.
func (s *Service) File(path string) (*library.LocalFile, bool) {
	host, _, ok := ParsePath(path)
	if !ok {
		return nil, false
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	p := s.peers[host]
	if p == nil {
		return nil, false
	}
	i := slices.IndexFunc(p.files, func(f *library.LocalFile) bool { return f.Path == path })
	if i < 0 {
		return nil, false
	}
	return p.files[i], true
}

// nameOf is a peer's name.
func (s *Service) nameOf(p *peer) string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return p.name
}
