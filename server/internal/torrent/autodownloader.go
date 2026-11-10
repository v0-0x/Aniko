package torrent

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/5rahim/habari"

	"github.com/v0-0x/Aniko/server/internal/anilist"
	"github.com/v0-0x/Aniko/server/internal/db"
	"github.com/v0-0x/Aniko/server/internal/events"
	"github.com/v0-0x/Aniko/server/internal/library"
	"github.com/v0-0x/Aniko/server/internal/util"
)

// Rule tells the auto downloader which releases to grab for an anime.
type Rule struct {
	ID              int      `json:"id"`
	Enabled         bool     `json:"enabled"`
	MediaID         int      `json:"mediaId"`
	Title           string   `json:"title"`
	ReleaseGroups   []string `json:"releaseGroups"`
	Resolutions     []string `json:"resolutions"`
	AdditionalTerms []string `json:"additionalTerms"`
	EpisodeType     string   `json:"episodeType"` // recent | all
	MinSeeders      int      `json:"minSeeders"`
	Provider        string   `json:"provider"`
	// A release whose name has any of these is skipped.
	ExcludeTerms []string `json:"excludeTerms"`
	// Size limits in MB (0: none).
	MinSizeMB int `json:"minSizeMb"`
	MaxSizeMB int `json:"maxSizeMb"`
	// How long to wait after an episode's first release appears, so that a
	// preferred one (a group or resolution listed earlier) can show up.
	DelayMinutes int `json:"delayMinutes"`
}

// Candidate is a search result as a rule's test run sees it: grabbed, or
// skipped and why.
type Candidate struct {
	Episode    int    `json:"episode"`
	Name       string `json:"name"`
	Group      string `json:"group"`
	Resolution string `json:"resolution"`
	Seeders    int    `json:"seeders"`
	Size       int64  `json:"size"`
	Grab       bool   `json:"grab"`
	Reason     string `json:"reason,omitempty"`
}

type AutoItem struct {
	Key       string `json:"key"`
	RuleID    int    `json:"ruleId"`
	Title     string `json:"title"`
	CreatedAt int64  `json:"createdAt"`
}

type AutoDownloader struct {
	db       *db.DB
	torrents *Manager
	platform *anilist.Platform
	files    *library.Store
	hub      *events.Hub
	mu       sync.Mutex
	// firstSeen: when a run first saw a release that has no publish date
	// (for DelayMinutes), by infohash or name.
	seenMu    sync.Mutex
	firstSeen map[string]time.Time
	// Send, when set, sends a release where this Aniko's downloads go (the
	// computer a TV's go to), and reports whether it did; else it goes to
	// the torrent client here.
	Send func(ctx context.Context, mediaID int, uris []string) (bool, error)
}

func NewAutoDownloader(d *db.DB, t *Manager, p *anilist.Platform, f *library.Store, hub *events.Hub) *AutoDownloader {
	return &AutoDownloader{db: d, torrents: t, platform: p, files: f, hub: hub}
}

func (a *AutoDownloader) Rules() ([]*Rule, error) {
	rows, err := a.db.Query(`SELECT id, data FROM autodownload_rules ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []*Rule{}
	for rows.Next() {
		var id int
		var raw string
		if rows.Scan(&id, &raw) != nil {
			continue
		}
		var r Rule
		if json.Unmarshal([]byte(raw), &r) == nil {
			r.ID = id
			out = append(out, &r)
		}
	}
	return out, nil
}

func (a *AutoDownloader) SaveRule(r Rule) (*Rule, error) {
	if r.MediaID <= 0 {
		return nil, fmt.Errorf("a rule needs an anime")
	}
	if r.EpisodeType == "" {
		r.EpisodeType = "recent"
	}
	raw, _ := json.Marshal(r)
	if r.ID > 0 {
		_, err := a.db.Write(`UPDATE autodownload_rules SET data = ? WHERE id = ?`, string(raw), r.ID)
		return &r, err
	}
	res, err := a.db.Write(`INSERT INTO autodownload_rules(data) VALUES(?)`, string(raw))
	if err != nil {
		return nil, err
	}
	id, _ := res.LastInsertId()
	r.ID = int(id)
	return &r, nil
}

func (a *AutoDownloader) DeleteRule(id int) error {
	_, err := a.db.Write(`DELETE FROM autodownload_rules WHERE id = ?`, id)
	return err
}

func (a *AutoDownloader) Items() []AutoItem {
	rows, err := a.db.Query(`SELECT key, rule_id, title, created_at FROM autodownload_items ORDER BY created_at DESC LIMIT 200`)
	if err != nil {
		return nil
	}
	defer rows.Close()
	out := []AutoItem{}
	for rows.Next() {
		var it AutoItem
		if rows.Scan(&it.Key, &it.RuleID, &it.Title, &it.CreatedAt) == nil {
			out = append(out, it)
		}
	}
	return out
}

func episodeKey(mediaID, ep int) string { return fmt.Sprintf("%d:%d", mediaID, ep) }

func (a *AutoDownloader) seen(key string) bool {
	var n int
	if err := a.db.QueryRow(`SELECT COUNT(*) FROM autodownload_items WHERE key = ?`, key).Scan(&n); err != nil {
		log.Printf("auto downloader: %v", err)
		return true // unknown: don't risk grabbing it twice
	}
	return n > 0
}

// Run checks every enabled rule once. Returns how many torrents were added.
func (a *AutoDownloader) Run(ctx context.Context) (int, error) {
	if !a.mu.TryLock() {
		return 0, nil
	}
	defer a.mu.Unlock()
	rules, err := a.Rules()
	if err != nil {
		return 0, err
	}
	coll, err := a.platform.Collection(ctx, "ANIME", false)
	if err != nil {
		log.Printf("auto downloader: anime list: %v", err)
	}
	added := 0
	for _, r := range rules {
		if !r.Enabled {
			continue
		}
		n, err := a.runRule(ctx, r, coll)
		if err != nil {
			log.Printf("auto downloader rule %d: %v", r.ID, err)
			continue
		}
		added += n
	}
	return added, nil
}

// plan is what a rule's run works from.
type plan struct {
	media    *anilist.Media
	title    string
	progress int
	have     map[int]bool
	prov     Provider
	results  []*SearchResult
}

func (a *AutoDownloader) runRule(ctx context.Context, r *Rule, coll *anilist.Collection) (int, error) {
	p, err := a.prepare(ctx, r, coll)
	if err != nil {
		return 0, err
	}
	best, _ := a.choose(r, p, time.Now(), true)
	return a.grab(ctx, r, p.media, p.prov, best)
}

// prepare searches for a rule's releases.
func (a *AutoDownloader) prepare(ctx context.Context, r *Rule, coll *anilist.Collection) (*plan, error) {
	progress := 0
	if r.EpisodeType != "all" {
		if coll == nil {
			// Without the progress every missing episode would look new,
			// including the ones already watched.
			return nil, errors.New("the anime list couldn't be loaded to check progress")
		}
		if e := coll.Find(r.MediaID); e != nil {
			progress = e.Progress
		}
	}
	media, err := a.platform.MediaLite(ctx, r.MediaID)
	if err != nil {
		return nil, err
	}
	title := util.FirstNonEmpty(r.Title, media.Title.Romaji, media.Title.English)
	if util.NormalizeTitle(title) == "" {
		// Every release would match an empty title.
		return nil, errors.New("the rule has no title to look for")
	}
	files, err := a.files.ByMedia(r.MediaID)
	if err != nil {
		// Without the library, episodes already on disk would be grabbed again.
		return nil, err
	}
	have := map[int]bool{}
	for _, f := range files {
		if f.Kind == "main" {
			have[f.Episode] = true
		}
	}
	prov, err := a.torrents.Provider(util.FirstNonEmpty(r.Provider, "nyaa"))
	if err != nil {
		return nil, err
	}
	query := searchText(title)
	if len(r.ReleaseGroups) == 1 {
		query = r.ReleaseGroups[0] + " " + query
	}
	if len(r.Resolutions) == 1 {
		query += " " + r.Resolutions[0]
	}
	results, err := prov.Search(ctx, query)
	if err != nil {
		return nil, err
	}
	return &plan{media: media, title: title, progress: progress, have: have, prov: prov, results: results}, nil
}

// DryRun runs a rule's search and pick without grabbing or recording
// anything: what it would grab, and why it skips the rest.
func (a *AutoDownloader) DryRun(ctx context.Context, id int) ([]Candidate, error) {
	rules, err := a.Rules()
	if err != nil {
		return nil, err
	}
	var r *Rule
	for _, x := range rules {
		if x.ID == id {
			r = x
		}
	}
	if r == nil {
		return nil, ErrNoRule
	}
	var coll *anilist.Collection
	if r.EpisodeType != "all" {
		if coll, err = a.platform.Collection(ctx, "ANIME", false); err != nil {
			return nil, err
		}
	}
	p, err := a.prepare(ctx, r, coll)
	if err != nil {
		return nil, err
	}
	_, out := a.choose(r, p, time.Now(), false)
	return out, nil
}

// ErrNoRule: the rule asked for doesn't exist.
var ErrNoRule = errors.New("no such rule")

// pick chooses a release for each episode the rule wants.
func (a *AutoDownloader) pick(r *Rule, media *anilist.Media, title string, progress int, have map[int]bool, results []*SearchResult) map[int]*SearchResult {
	best, _ := a.choose(r, &plan{media: media, title: title, progress: progress, have: have, results: results}, time.Now(), true)
	return best
}

// choose picks a release for each episode the rule wants: among the ones
// that match, the one whose group and resolution come first in the rule,
// then the one with the most seeders. With a delay, an episode waits until
// its first release has been out that long. It also returns every result
// with what became of it; remember is false for a test run, which leaves
// no trace.
func (a *AutoDownloader) choose(r *Rule, p *plan, now time.Time, remember bool) (map[int]*SearchResult, []Candidate) {
	best := map[int]*SearchResult{}
	first := map[int]time.Time{}
	out := make([]Candidate, len(p.results))
	limit := episodeLimit(p.media, now)
	for i, res := range p.results {
		out[i] = Candidate{Episode: res.EpisodeNumber, Name: res.Name, Group: res.ReleaseGroup, Resolution: res.Resolution, Seeders: res.Seeders, Size: res.Size}
		if out[i].Reason = a.skip(r, p, limit, res); out[i].Reason != "" {
			continue
		}
		ep := res.EpisodeNumber
		if r.DelayMinutes > 0 {
			if at := a.appeared(res, now, remember); first[ep].IsZero() || at.Before(first[ep]) {
				first[ep] = at
			}
		}
		if cur, ok := best[ep]; !ok || better(r, res, cur) {
			best[ep] = res
		}
	}
	delay := time.Duration(r.DelayMinutes) * time.Minute
	waiting := map[int]string{}
	for ep := range best {
		if left := first[ep].Add(delay).Sub(now); delay > 0 && left > 0 {
			waiting[ep] = fmt.Sprintf("Waiting (%d min)", int(left.Minutes()+0.999))
			delete(best, ep)
		}
	}
	for i, res := range p.results {
		switch ep := res.EpisodeNumber; {
		case out[i].Reason != "":
		case waiting[ep] != "":
			out[i].Reason = waiting[ep]
		case best[ep] == res:
			out[i].Grab = true
		default:
			out[i].Reason = "Worse release"
		}
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Episode != out[j].Episode {
			return out[i].Episode < out[j].Episode
		}
		return out[i].Grab && !out[j].Grab
	})
	return best, out
}

// skip says why the rule skips a result, or "" when it matches.
func (a *AutoDownloader) skip(r *Rule, p *plan, limit int, res *SearchResult) string {
	name := strings.ToLower(res.Name)
	switch {
	case res.IsBatch:
		return "Batch"
	case res.EpisodeNumber <= 0:
		return "No episode number"
	case res.Seeders < r.MinSeeders:
		return "Too few seeders"
	}
	md := habari.Parse(res.Name)
	if util.Similarity(md.Title, p.title) < 0.75 && !strings.Contains(util.NormalizeTitle(res.Name), util.NormalizeTitle(p.title)) {
		return "Other title"
	}
	if len(r.ReleaseGroups) > 0 && !containsFold(r.ReleaseGroups, res.ReleaseGroup) {
		return "Other group"
	}
	if len(r.Resolutions) > 0 && resRank(r, res) == len(r.Resolutions) {
		return "Other resolution"
	}
	for _, term := range r.AdditionalTerms {
		if term != "" && !strings.Contains(name, strings.ToLower(term)) {
			return "Missing " + term
		}
	}
	for _, term := range r.ExcludeTerms {
		if term != "" && strings.Contains(name, strings.ToLower(term)) {
			return "Has " + term
		}
	}
	// An unknown size (0) passes.
	const mb = 1 << 20
	if r.MinSizeMB > 0 && res.Size > 0 && res.Size < int64(r.MinSizeMB)*mb {
		return "Too small"
	}
	if r.MaxSizeMB > 0 && res.Size > int64(r.MaxSizeMB)*mb {
		return "Too large"
	}
	ep := res.EpisodeNumber
	switch {
	case limit > 0 && ep > limit:
		return "Not out yet"
	case r.EpisodeType != "all" && ep <= p.progress:
		return "Watched"
	case p.have[ep]:
		return "In library"
	case a.seen(episodeKey(r.MediaID, ep)):
		return "Already grabbed"
	}
	return ""
}

// better reports whether res beats cur: a group, then a resolution, listed
// earlier in the rule, then more seeders.
func better(r *Rule, res, cur *SearchResult) bool {
	if a, b := groupRank(r, res), groupRank(r, cur); a != b {
		return a < b
	}
	if a, b := resRank(r, res), resRank(r, cur); a != b {
		return a < b
	}
	return res.Seeders > cur.Seeders
}

func groupRank(r *Rule, res *SearchResult) int {
	for i, g := range r.ReleaseGroups {
		if strings.EqualFold(g, res.ReleaseGroup) {
			return i
		}
	}
	return len(r.ReleaseGroups)
}

func resRank(r *Rule, res *SearchResult) int {
	for i, want := range r.Resolutions {
		if strings.TrimSuffix(normRes(want), "p") == strings.TrimSuffix(res.Resolution, "p") {
			return i
		}
	}
	return len(r.Resolutions)
}

// appeared is when a release came out: its publish date, or else when a
// run first saw it (now, the first time; a test run doesn't note it).
func (a *AutoDownloader) appeared(res *SearchResult, now time.Time, remember bool) time.Time {
	if t, err := time.Parse(time.RFC3339, res.Date); err == nil {
		return t
	}
	key := util.FirstNonEmpty(res.InfoHash, res.Name)
	a.seenMu.Lock()
	defer a.seenMu.Unlock()
	if t, ok := a.firstSeen[key]; ok {
		return t
	}
	if remember {
		if a.firstSeen == nil {
			a.firstSeen = map[string]time.Time{}
		}
		for k, t := range a.firstSeen {
			if now.Sub(t) > 7*24*time.Hour {
				delete(a.firstSeen, k)
			}
		}
		a.firstSeen[key] = now
	}
	return now
}

// episodeLimit returns the last episode number that can be out (0: unknown).
// When the episode count isn't known it is the last aired episode, and the
// media may come from a cache up to a day old: an episode whose airing time
// has passed since counts as aired.
func episodeLimit(m *anilist.Media, now time.Time) int {
	limit := m.TotalEpisodes()
	if next := m.NextAiringEpisode; (m.Episodes == nil || *m.Episodes <= 0) && next != nil &&
		next.Episode > 0 && next.AiringAt > 0 && int64(next.AiringAt) <= now.Unix() {
		limit = max(limit, next.Episode)
	}
	return limit
}

// grab sends the picked releases to the torrent client, lowest episode
// first, and records each one so that it isn't grabbed again. A release that
// fails is logged and skipped; the rule stops only when the client itself is
// unavailable, as the other episodes would fail the same way.
func (a *AutoDownloader) grab(ctx context.Context, r *Rule, media *anilist.Media, prov Provider, best map[int]*SearchResult) (int, error) {
	eps := make([]int, 0, len(best))
	for ep := range best {
		eps = append(eps, ep)
	}
	sort.Ints(eps)
	savePath := a.torrents.SavePathFor(media.FolderTitle())
	added := 0
	for _, ep := range eps {
		res := best[ep]
		magnet, err := prov.Magnet(ctx, res)
		if err == nil && magnet == "" {
			err = errors.New("no magnet link or torrent URL")
		}
		if err != nil {
			log.Printf("auto downloader rule %d: %s: %v", r.ID, res.Name, err)
			continue
		}
		// Where this Aniko's downloads go, when it isn't here.
		if a.Send != nil {
			sent, err := a.Send(ctx, media.ID, []string{magnet})
			if sent && err != nil {
				return added, err
			}
			if sent {
				a.record(r, ep, res.Name)
				added++
				continue
			}
		}
		// A torrent the client already has (the episode was grabbed by
		// hand) counts as added, so that it is recorded.
		if err := a.torrents.Add(ctx, []string{magnet}, savePath); err != nil {
			if !a.torrents.Status(ctx).Connected {
				return added, err
			}
			log.Printf("auto downloader rule %d: %s: %v", r.ID, res.Name, err)
			continue
		}
		a.record(r, ep, res.Name)
		added++
	}
	return added, nil
}

// record notes a release as grabbed, so that it isn't again.
func (a *AutoDownloader) record(r *Rule, ep int, name string) {
	if _, err := a.db.Write(`INSERT OR IGNORE INTO autodownload_items(key, rule_id, title, created_at) VALUES(?, ?, ?, ?)`,
		episodeKey(r.MediaID, ep), r.ID, name, time.Now().Unix()); err != nil {
		log.Printf("auto downloader rule %d: %v", r.ID, err)
	}
	a.hub.Success("Auto downloader: added " + name)
}

// Loop runs the auto downloader periodically while enabled.
func (a *AutoDownloader) Loop(ctx context.Context, enabled func() (bool, time.Duration)) {
	for {
		on, every := enabled()
		select {
		case <-ctx.Done():
			return
		case <-time.After(every):
		}
		if on {
			if n, err := a.Run(ctx); err != nil {
				log.Printf("auto downloader: %v", err)
			} else if n > 0 {
				log.Printf("auto downloader: added %d torrents", n)
			}
		}
	}
}
