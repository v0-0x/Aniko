package torrent

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/v0-0x/Aniko/server/internal/anilist"
	"github.com/v0-0x/Aniko/server/internal/config"
	"github.com/v0-0x/Aniko/server/internal/db"
	"github.com/v0-0x/Aniko/server/internal/events"
)

// newTestAutoDownloader returns an auto downloader with its own database,
// whose torrent client is the qBittorrent at srv. No executable is
// configured, so nothing is ever launched.
func newTestAutoDownloader(t *testing.T, srv *httptest.Server) *AutoDownloader {
	t.Helper()
	d, err := db.Open(filepath.Join(t.TempDir(), "aniko.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = d.Close() })
	settings, err := config.NewStore(d)
	if err != nil {
		t.Fatal(err)
	}
	s := settings.Get()
	s.Torrent.DefaultClient = "qbittorrent"
	s.Qbittorrent = cfgFor(t, srv)
	s.Library.Dir = t.TempDir()
	if _, err := settings.Save(s); err != nil {
		t.Fatal(err)
	}
	hub := events.NewHub()
	return &AutoDownloader{db: d, torrents: NewManager(settings, hub), hub: hub}
}

func (a *AutoDownloader) markSeen(t *testing.T, mediaID, ep int) {
	t.Helper()
	if _, err := a.db.Write(`INSERT INTO autodownload_items(key, rule_id, title, created_at) VALUES(?, 1, 'x', 0)`, episodeKey(mediaID, ep)); err != nil {
		t.Fatal(err)
	}
}

func TestAutoDownloaderPick(t *testing.T) {
	srv := httptest.NewServer(http.NotFoundHandler())
	defer srv.Close()
	a := newTestAutoDownloader(t, srv)
	a.markSeen(t, 42, 3)
	episodes := 12
	media := &anilist.Media{ID: 42, Episodes: &episodes, Title: anilist.Title{Romaji: "Kaiju No. 8"}}
	var results []*SearchResult
	for _, x := range []struct {
		name    string
		seeders int
	}{
		{"[SubsPlease] Kaiju No. 8 - 01 (1080p) [AAAA0001].mkv", 50},    // watched
		{"[SubsPlease] Kaiju No. 8 - 02 (1080p) [AAAA0002].mkv", 50},    // in the library
		{"[SubsPlease] Kaiju No. 8 - 03 (1080p) [AAAA0003].mkv", 50},    // grabbed before
		{"[SubsPlease] Kaiju No. 8 - 04 (1080p) [AAAA0004].mkv", 10},    // fewer seeders than v2
		{"[SubsPlease] Kaiju No. 8 - 04v2 (1080p) [AAAA0014].mkv", 30},  // picked
		{"[SubsPlease] Kaiju No. 8 - 05 (720p) [AAAA0005].mkv", 50},     // resolution
		{"[Erai-raws] Kaiju No. 8 - 05 [1080p][Multiple Subtitle]", 50}, // group
		{"[SubsPlease] Kaiju No. 8 - 05 (1080p) [AAAA0015].mkv", 0},     // no seeders
		{"[SubsPlease] Kaiju No. 8 - 06 (1080p) [AAAA0006].mkv", 5},     // picked (was taken for a batch)
		{"[SubsPlease] Kaiju No. 8 - 06.5 (1080p) [AAAA0016].mkv", 99},  // recap, not episode 6
		{"[SubsPlease] Kaiju No. 8 (01-12) (1080p) [Batch]", 99},
		{"[SubsPlease] Kaiju No. 8 - 13 (1080p) [AAAA0013].mkv", 99}, // beyond the episode count
		{"[SubsPlease] Ore dake Level Up na Ken - 07 (1080p) [AAAA0007].mkv", 99},
	} {
		r := &SearchResult{Name: x.name, Seeders: x.seeders}
		enrich(r)
		results = append(results, r)
	}
	rule := &Rule{ID: 1, MediaID: 42, ReleaseGroups: []string{"SubsPlease"}, Resolutions: []string{"1080"}, EpisodeType: "recent", MinSeeders: 1}
	best := a.pick(rule, media, "Kaiju No. 8", 1, map[int]bool{2: true}, results)
	if len(best) != 2 || best[4] == nil || !strings.Contains(best[4].Name, "04v2") || best[6] == nil || !strings.Contains(best[6].Name, "- 06 ") {
		for ep, r := range best {
			t.Logf("picked %d: %s", ep, r.Name)
		}
		t.Fatalf("picked %d releases, want episodes 4 (v2) and 6", len(best))
	}
	// "Every missing episode" ignores the progress.
	rule.EpisodeType = "all"
	if best := a.pick(rule, media, "Kaiju No. 8", 1, map[int]bool{2: true}, results); len(best) != 3 || best[1] == nil {
		t.Fatalf("all: picked %d releases", len(best))
	}
}

func TestEpisodeLimit(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	twelve := 12
	for _, tc := range []struct {
		media anilist.Media
		want  int
	}{
		{anilist.Media{Episodes: &twelve}, 12},
		{anilist.Media{}, 0},
		{anilist.Media{NextAiringEpisode: &anilist.AiringEpisode{Episode: 6, AiringAt: int(now.Unix()) + 3600}}, 5},
		// Cached before episode 6 aired: it is out now.
		{anilist.Media{NextAiringEpisode: &anilist.AiringEpisode{Episode: 6, AiringAt: int(now.Unix()) - 3600}}, 6},
		{anilist.Media{NextAiringEpisode: &anilist.AiringEpisode{Episode: 6}}, 5},
		{anilist.Media{Episodes: &twelve, NextAiringEpisode: &anilist.AiringEpisode{Episode: 13, AiringAt: int(now.Unix()) - 3600}}, 12},
	} {
		if got := episodeLimit(&tc.media, now); got != tc.want {
			t.Errorf("%+v: limit %d, want %d", tc.media, got, tc.want)
		}
	}
}

// A torrent already in qBittorrent (409) is recorded, and a failing one
// doesn't stop the episodes after it.
func TestAutoDownloaderGrab(t *testing.T) {
	var mu sync.Mutex
	var adds []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/v2/app/version":
			_, _ = io.WriteString(w, "v5.1.2")
		case "/api/v2/torrents/add":
			_ = r.ParseForm()
			u := r.Form.Get("urls")
			mu.Lock()
			adds = append(adds, u)
			mu.Unlock()
			switch {
			case strings.Contains(u, "dupe"):
				w.WriteHeader(http.StatusConflict)
				_, _ = io.WriteString(w, "Fails.")
			case strings.Contains(u, "bad"):
				w.WriteHeader(http.StatusUnsupportedMediaType)
				_, _ = io.WriteString(w, "Torrent file is not valid.")
			default:
				_, _ = io.WriteString(w, "Ok.")
			}
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer srv.Close()
	a := newTestAutoDownloader(t, srv)
	media := &anilist.Media{ID: 42, Title: anilist.Title{Romaji: "Kaiju No. 8"}}
	best := map[int]*SearchResult{
		6: {Name: "[SubsPlease] Kaiju No. 8 - 06 (1080p)", MagnetLink: "magnet:?xt=urn:btih:six"},
		3: {Name: "[SubsPlease] Kaiju No. 8 - 03 (1080p)", MagnetLink: "magnet:?xt=urn:btih:dupe3"},
		4: {Name: "[SubsPlease] Kaiju No. 8 - 04 (1080p)", MagnetLink: "magnet:?xt=urn:btih:bad4"},
		5: {Name: "[SubsPlease] Kaiju No. 8 - 05 (1080p)", MagnetLink: "magnet:?xt=urn:btih:five"},
		7: {Name: "[SubsPlease] Kaiju No. 8 - 07 (1080p)"}, // no magnet
	}
	n, err := a.grab(context.Background(), &Rule{ID: 1, MediaID: 42}, media, &Nyaa{}, best)
	if err != nil || n != 3 {
		t.Fatalf("grab: %d added, %v", n, err)
	}
	if strings.Join(adds, " ") != "magnet:?xt=urn:btih:dupe3 magnet:?xt=urn:btih:bad4 magnet:?xt=urn:btih:five magnet:?xt=urn:btih:six" {
		t.Fatalf("adds %v", adds)
	}
	for ep, want := range map[int]bool{3: true, 4: false, 5: true, 6: true, 7: false} {
		if got := a.seen(episodeKey(42, ep)); got != want {
			t.Errorf("episode %d recorded=%v, want %v", ep, got, want)
		}
	}
}

type countingProvider struct {
	Nyaa
	mu    sync.Mutex
	calls int
}

func (p *countingProvider) Magnet(_ context.Context, r *SearchResult) (string, error) {
	p.mu.Lock()
	p.calls++
	p.mu.Unlock()
	return r.MagnetLink, nil
}

// When the client is down the rule stops at the first episode instead of
// failing (and trying to start the client) once per episode.
func TestAutoDownloaderGrabClientDown(t *testing.T) {
	srv := httptest.NewServer(http.NotFoundHandler())
	a := newTestAutoDownloader(t, srv)
	srv.Close()
	best := map[int]*SearchResult{
		1: {Name: "a", MagnetLink: "magnet:?xt=urn:btih:1"},
		2: {Name: "b", MagnetLink: "magnet:?xt=urn:btih:2"},
		3: {Name: "c", MagnetLink: "magnet:?xt=urn:btih:3"},
	}
	p := &countingProvider{}
	n, err := a.grab(context.Background(), &Rule{ID: 1, MediaID: 42}, &anilist.Media{ID: 42}, p, best)
	if err == nil || n != 0 || p.calls != 1 {
		t.Fatalf("client down: %d added, %d tries, %v", n, p.calls, err)
	}
	if a.seen(episodeKey(42, 1)) {
		t.Fatal("recorded an episode that wasn't added")
	}
}

// Unknown progress would make every missing episode look new.
func TestAutoDownloaderNeedsProgress(t *testing.T) {
	a := &AutoDownloader{}
	if _, err := a.runRule(context.Background(), &Rule{ID: 1, MediaID: 42, EpisodeType: "recent"}, nil); err == nil {
		t.Fatal("ran a 'recent' rule without the anime list")
	}
}

// Where this Aniko's downloads go elsewhere (a TV's computer), the releases
// go there, not to a torrent client here (there's none), and are recorded;
// when that Aniko can't take them, the rule stops.
func TestAutoDownloaderSendsElsewhere(t *testing.T) {
	srv := httptest.NewServer(http.NotFoundHandler())
	a := newTestAutoDownloader(t, srv)
	srv.Close() // no torrent client here
	var sent []string
	var refuse error
	a.Send = func(_ context.Context, mediaID int, uris []string) (bool, error) {
		if mediaID != 42 {
			t.Errorf("sent for %d", mediaID)
		}
		if refuse != nil {
			return true, refuse
		}
		sent = append(sent, uris...)
		return true, nil
	}
	best := map[int]*SearchResult{
		2: {Name: "b", MagnetLink: "magnet:?xt=urn:btih:2"},
		1: {Name: "a", MagnetLink: "magnet:?xt=urn:btih:1"},
	}
	n, err := a.grab(context.Background(), &Rule{ID: 1, MediaID: 42}, &anilist.Media{ID: 42}, &Nyaa{}, best)
	if err != nil || n != 2 || strings.Join(sent, " ") != "magnet:?xt=urn:btih:1 magnet:?xt=urn:btih:2" {
		t.Fatalf("sent: %d %v %v", n, sent, err)
	}
	if !a.seen(episodeKey(42, 1)) || !a.seen(episodeKey(42, 2)) {
		t.Error("sent episodes weren't recorded")
	}
	refuse = io.ErrUnexpectedEOF
	n, err = a.grab(context.Background(), &Rule{ID: 1, MediaID: 42}, &anilist.Media{ID: 42}, &Nyaa{}, map[int]*SearchResult{3: {Name: "c", MagnetLink: "magnet:?xt=urn:btih:3"}})
	if err == nil || n != 0 || a.seen(episodeKey(42, 3)) {
		t.Fatalf("refused: %d %v", n, err)
	}
	// Downloads here again: the client here (down) is used.
	a.Send = func(context.Context, int, []string) (bool, error) { return false, nil }
	if n, err := a.grab(context.Background(), &Rule{ID: 1, MediaID: 42}, &anilist.Media{ID: 42}, &Nyaa{}, map[int]*SearchResult{3: {Name: "c", MagnetLink: "magnet:?xt=urn:btih:3"}}); err == nil || n != 0 {
		t.Fatalf("here: %d %v", n, err)
	}
}

func kaijuResults(t *testing.T, list ...SearchResult) []*SearchResult {
	t.Helper()
	var out []*SearchResult
	for _, x := range list {
		r := x
		enrich(&r)
		out = append(out, &r)
	}
	return out
}

func reasonOf(out []Candidate, name string) (string, bool) {
	for _, c := range out {
		if c.Name == name {
			return c.Reason, c.Grab
		}
	}
	return "missing", false
}

// Excluded words (any case) and size limits skip a release; an unknown size
// passes.
func TestAutoDownloaderExcludeAndSize(t *testing.T) {
	srv := httptest.NewServer(http.NotFoundHandler())
	defer srv.Close()
	a := newTestAutoDownloader(t, srv)
	const mb = 1 << 20
	results := kaijuResults(t,
		SearchResult{Name: "[SubsPlease] Kaiju No. 8 - 01 (1080p) [HEVC].mkv", Seeders: 90, Size: 800 * mb},
		SearchResult{Name: "[SubsPlease] Kaiju No. 8 - 01 (1080p) [AAAA0001].mkv", Seeders: 10, Size: 1200 * mb},
		SearchResult{Name: "[SubsPlease] Kaiju No. 8 - 02 (1080p) [AAAA0002].mkv", Seeders: 10, Size: 100 * mb},
		SearchResult{Name: "[SubsPlease] Kaiju No. 8 - 03 (1080p) [AAAA0003].mkv", Seeders: 10, Size: 5000 * mb},
		SearchResult{Name: "[SubsPlease] Kaiju No. 8 - 04 (1080p) [AAAA0004].mkv", Seeders: 10},
	)
	rule := &Rule{ID: 1, MediaID: 42, EpisodeType: "all", ExcludeTerms: []string{"hevc"}, MinSizeMB: 500, MaxSizeMB: 2000}
	p := &plan{media: &anilist.Media{ID: 42}, title: "Kaiju No. 8", have: map[int]bool{}, results: results}
	best, out := a.choose(rule, p, time.Now(), true)
	if len(best) != 2 || best[1] != results[1] || best[4] != results[4] {
		t.Fatalf("picked %v", best)
	}
	for name, want := range map[string]string{results[0].Name: "Has hevc", results[2].Name: "Too small", results[3].Name: "Too large"} {
		if got, _ := reasonOf(out, name); got != want {
			t.Errorf("%s: %q, want %q", name, got, want)
		}
	}
	// Zero values: no limits (old rules).
	if best := a.pick(&Rule{ID: 1, MediaID: 42, EpisodeType: "all"}, p.media, p.title, 0, nil, results); len(best) != 4 || best[1] != results[0] {
		t.Fatalf("no limits: picked %d", len(best))
	}
}

// With a delay an episode waits until its first release has been out that
// long, then the preferred one is taken; a release with no date waits from
// when a run first saw it.
func TestAutoDownloaderDelay(t *testing.T) {
	srv := httptest.NewServer(http.NotFoundHandler())
	defer srv.Close()
	a := newTestAutoDownloader(t, srv)
	now := time.Now()
	ago := func(m int) string { return now.Add(-time.Duration(m) * time.Minute).Format(time.RFC3339) }
	results := kaijuResults(t,
		SearchResult{Name: "[Erai-raws] Kaiju No. 8 - 01 [1080p]", Seeders: 90, Date: ago(70)},
		SearchResult{Name: "[SubsPlease] Kaiju No. 8 - 01 (1080p) [AAAA0001].mkv", Seeders: 5, Date: ago(10)},
		SearchResult{Name: "[Erai-raws] Kaiju No. 8 - 02 [1080p]", Seeders: 90, Date: ago(10)},
		SearchResult{Name: "[Erai-raws] Kaiju No. 8 - 03 [1080p]", Seeders: 90},
	)
	rule := &Rule{ID: 1, MediaID: 42, EpisodeType: "all", ReleaseGroups: []string{"SubsPlease", "Erai-raws"}, DelayMinutes: 60}
	p := &plan{media: &anilist.Media{ID: 42}, title: "Kaiju No. 8", have: map[int]bool{}, results: results}
	best, out := a.choose(rule, p, now, true)
	if len(best) != 1 || best[1] != results[1] {
		t.Fatalf("picked %v", best)
	}
	if got, _ := reasonOf(out, results[0].Name); got != "Worse release" {
		t.Errorf("episode 1 Erai-raws: %q", got)
	}
	if got, _ := reasonOf(out, results[2].Name); got != "Waiting (50 min)" {
		t.Errorf("episode 2: %q", got)
	}
	if got, _ := reasonOf(out, results[3].Name); got != "Waiting (60 min)" {
		t.Errorf("episode 3: %q", got)
	}
	// An hour later both are out long enough.
	if best, _ := a.choose(rule, p, now.Add(61*time.Minute), true); len(best) != 3 || best[3] != results[3] {
		t.Fatalf("an hour later: picked %d", len(best))
	}
	// No delay: at once.
	rule.DelayMinutes = 0
	if best, _ := a.choose(rule, p, now, true); len(best) != 3 {
		t.Fatalf("no delay: picked %d", len(best))
	}
}

// A test run says what would be grabbed, and why the rest isn't, without
// fetching a magnet, adding a torrent or noting anything.
func TestAutoDownloaderTestRun(t *testing.T) {
	var adds int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/v2/torrents/add" {
			adds++
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()
	a := newTestAutoDownloader(t, srv)
	if _, err := a.SaveRule(Rule{MediaID: 42}); err != nil {
		t.Fatal(err)
	}
	if _, err := a.DryRun(context.Background(), 99); err != ErrNoRule {
		t.Fatalf("unknown rule: %v", err)
	}
	results := kaijuResults(t,
		SearchResult{Name: "[SubsPlease] Kaiju No. 8 - 01 (1080p) [AAAA0001].mkv", Seeders: 10, Size: 1 << 30, MagnetLink: "magnet:?xt=urn:btih:1"},
		SearchResult{Name: "[SubsPlease] Kaiju No. 8 - 02 (1080p) [AAAA0002].mkv", Seeders: 10, MagnetLink: "magnet:?xt=urn:btih:2"},
		SearchResult{Name: "[SubsPlease] Kaiju No. 8 - 01 (720p) [AAAA0011].mkv", Seeders: 10},
	)
	prov := &countingProvider{}
	rule := &Rule{ID: 1, MediaID: 42, EpisodeType: "all", Resolutions: []string{"1080"}, DelayMinutes: 30}
	p := &plan{media: &anilist.Media{ID: 42}, title: "Kaiju No. 8", have: map[int]bool{}, prov: prov, results: results}
	results[0].Date = time.Now().Add(-time.Hour).Format(time.RFC3339)
	_, out := a.choose(rule, p, time.Now(), false)
	if len(out) != 3 || !out[0].Grab || out[0].Episode != 1 || out[0].Group != "SubsPlease" || out[0].Resolution != "1080p" || out[0].Size != 1<<30 ||
		out[1].Reason != "Other resolution" || out[2].Grab || out[2].Reason != "Waiting (30 min)" {
		t.Fatalf("test run: %+v", out)
	}
	if prov.calls != 0 || adds != 0 || a.seen(episodeKey(42, 1)) || len(a.firstSeen) != 0 {
		t.Fatalf("the test run left a trace: %d magnets, %d adds, first seen %v", prov.calls, adds, a.firstSeen)
	}
}
