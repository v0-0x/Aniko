package api

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/v0-0x/Aniko/server/internal/anilist"
	"github.com/v0-0x/Aniko/server/internal/events"
	"github.com/v0-0x/Aniko/server/internal/parental"
)

// Notifications (the bell on Home): two lists.
//
// Shows is about the anime and manga on the list, put together when asked:
// the episodes that aired this week of what's being watched or planned, new
// chapters of the manga being read, and AniList's own "a related anime was
// added" notifications (for what was watched already).
//
// System is what Aniko did or needs: a download finished or failed, a scan
// found files, the auto downloader took a release, an update is out, list
// changes wait for AniList. They're noted here as the app's events go by
// (the ones GET /api/events sends to the pages), the last maxSystem of them.
//
// What was seen is a time per list, kept here so every device agrees: a
// notification newer than it is new.

// notifItem is one notification, of either list.
type notifItem struct {
	ID    string `json:"id"`
	Kind  string `json:"kind"`
	Title string `json:"title"`
	Text  string `json:"text"`
	At    int64  `json:"at"` // unix seconds
	// Cover: the anime's or manga's, where it's about one.
	Cover string `json:"cover,omitempty"`
	// To: the page it leads to (the app's own path).
	To      string `json:"to,omitempty"`
	MediaID int    `json:"mediaId,omitempty"`
}

const (
	kvNotifSystem   = "notifications:system"
	kvNotifSeen     = "notifications:seen"
	kvNotifChapters = "notifications:chapters"

	maxSystem = 50
	maxShows  = 40
	// An aired episode is news for a week; new chapters and related anime
	// for a month.
	airedFor = 7 * 24 * time.Hour
	olderFor = 30 * 24 * time.Hour
	// The same thing again this soon after is the same notification.
	sameWithin = 10 * time.Minute
)

// systemLog is the System list as kept.
type systemLog struct {
	Items []notifItem `json:"items"` // newest first
	// Update: the version last told about (once each, also after Clear).
	Update string `json:"update,omitempty"`
	// Waiting: list changes were waiting for AniList at its last word.
	Waiting bool `json:"waiting,omitempty"`
}

// noticed is the last chapter known of a manga, and when it was first seen
// here: chapter lists carry no dates.
type noticed struct {
	Latest float64 `json:"latest"`
	// When it was noticed: 0 for what was there already the first time the
	// manga was looked at, which isn't news.
	At int64 `json:"at"`
	// The last chapter known before it: the new ones are those after it.
	Since float64 `json:"since,omitempty"`
}

// notifMu: one change at a time to what's kept (the events come on their
// own goroutine, the requests on theirs).
var notifMu sync.Mutex

func (s *Server) notificationRoutes() {
	m := s.mux
	m.HandleFunc("GET /api/notifications", h(s.notifications))
	m.HandleFunc("POST /api/notifications/seen", h(s.notificationsSeen))
	m.HandleFunc("DELETE /api/notifications/system", h(func(r *http.Request) (any, error) {
		notifMu.Lock()
		defer notifMu.Unlock()
		var l systemLog
		_, _ = s.app.DB.GetKV(kvNotifSystem, &l)
		l.Items = nil
		return nil, s.app.DB.SetKV(kvNotifSystem, l)
	}))
	// The app's events, as the pages get them, for as long as it runs.
	ch, unsub := s.app.Hub.Subscribe()
	go func() {
		defer unsub()
		done := s.app.Context().Done()
		for {
			select {
			case <-done:
				return
			case raw, ok := <-ch:
				if !ok {
					return
				}
				s.systemEvent(raw, time.Now())
			}
		}
	}()
}

func (s *Server) notifications(r *http.Request) (any, error) {
	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()
	shows := s.showNotifications(ctx, time.Now())
	notifMu.Lock()
	var l systemLog
	_, _ = s.app.DB.GetKV(kvNotifSystem, &l)
	seen := s.notifSeen()
	notifMu.Unlock()
	return map[string]any{
		"shows":  s.notifAllowed(ctx, shows),
		"system": s.notifAllowed(ctx, l.Items),
		"seen":   seen,
	}, nil
}

// notifSeen is when each list was last looked at (0: never).
func (s *Server) notifSeen() map[string]int64 {
	seen := map[string]int64{}
	_, _ = s.app.DB.GetKV(kvNotifSeen, &seen)
	return map[string]int64{"shows": seen["shows"], "system": seen["system"]}
}

// A list was looked at: it's seen up to at, the time of the newest one
// shown (one that came in since stays new), or up to now without it. Never
// back in time; nothing is removed.
func (s *Server) notificationsSeen(r *http.Request) (any, error) {
	var body struct {
		Category string `json:"category"`
		At       int64  `json:"at"`
	}
	if err := decode(r, &body); err != nil {
		return nil, err
	}
	if body.Category != "shows" && body.Category != "system" {
		return nil, badRequest("category is shows or system")
	}
	at := time.Now().Unix()
	if body.At > 0 && body.At < at {
		at = body.At
	}
	notifMu.Lock()
	defer notifMu.Unlock()
	seen := s.notifSeen()
	if at <= seen[body.Category] {
		return map[string]any{"seen": seen}, nil
	}
	seen[body.Category] = at
	if err := s.app.DB.SetKV(kvNotifSeen, seen); err != nil {
		return nil, err
	}
	return map[string]any{"seen": seen}, nil
}

// notifAllowed is items without those about an anime parental controls
// block on this device.
func (s *Server) notifAllowed(ctx context.Context, items []notifItem) []notifItem {
	out := make([]notifItem, 0, len(items))
	rules := s.app.Share.Parental()
	if !rules.Active() {
		return append(out, items...)
	}
	var ids []int
	for _, it := range items {
		if it.MediaID > 0 {
			ids = append(ids, it.MediaID)
		}
	}
	known := map[int]parental.Media{}
	if len(ids) > 0 && (rules.NoAdult || len(rules.Genres) > 0) && !rules.OnlyAllowed {
		known = s.parentalLookup(ctx, ids, rules.NoAdult)
	}
	for _, it := range items {
		if it.MediaID > 0 {
			m, ok := known[it.MediaID]
			if !ok {
				m = parental.Media{ID: it.MediaID}
			}
			if rules.Reason(m) != "" {
				continue
			}
		}
		out = append(out, it)
	}
	return out
}

// ---------------------------------------------------------------------------
// Shows

// showNotifications puts the Shows list together, newest first. Each part
// is left out when what it needs can't be had (AniList not answering,
// logged out): the others still show.
func (s *Server) showNotifications(ctx context.Context, now time.Time) []notifItem {
	cfg := s.app.Settings.Get()
	showAdult := cfg.UI.ShowAdult
	var out []notifItem

	// Episodes aired, of the anime on the list.
	if coll, err := s.app.Platform.Collection(ctx, "ANIME", false); err == nil && coll != nil {
		entries := coll.Entries()
		if wantsAired(entries) {
			// Whole days, so that the schedule kept (an hour) is found again.
			day := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
			eps, _ := s.app.Platform.Schedule(ctx, day.AddDate(0, 0, -7).Unix(), day.AddDate(0, 0, 1).Unix())
			out = append(out, airedItems(eps, entries, now.Add(-airedFor).Unix(), now.Unix(), showAdult)...)
		}
	}

	// New chapters, of the manga being read.
	if cfg.Manga.Enabled {
		if coll, err := s.app.Platform.Collection(ctx, "MANGA", false); err == nil && coll != nil {
			var reading []*anilist.ListEntry
			var ids []int
			var medias []*anilist.Media
			for _, e := range coll.Entries() {
				if (e.Status != "CURRENT" && e.Status != "REPEATING") || e.Media == nil || (e.Media.IsAdult && !showAdult) {
					continue
				}
				reading = append(reading, e)
				ids = append(ids, e.MediaID)
				medias = append(medias, e.Media)
			}
			if len(ids) > 0 {
				// The chapter lists gone stale are looked up again behind
				// this, as for Home's row (GET /api/manga/latest).
				go s.app.Manga.Recheck(medias)
				latest := s.app.Manga.Latest(ids)
				notifMu.Lock()
				seen := map[int]noticed{}
				_, _ = s.app.DB.GetKV(kvNotifChapters, &seen)
				items, changed := chapterItems(reading, latest, seen, now.Unix())
				if changed {
					_ = s.app.DB.SetKV(kvNotifChapters, seen)
				}
				notifMu.Unlock()
				out = append(out, items...)
			}
		}
	}

	// AniList's own: an anime related to one on the list was added.
	if notes, err := s.app.Platform.RelatedAdded(ctx); err == nil {
		out = append(out, relatedItems(notes, now.Add(-olderFor).Unix(), showAdult, cfg.Manga.Enabled)...)
	}

	sort.SliceStable(out, func(i, j int) bool {
		if out[i].At != out[j].At {
			return out[i].At > out[j].At
		}
		return out[i].ID < out[j].ID
	})
	if len(out) > maxShows {
		out = out[:maxShows]
	}
	return out
}

// airedStatuses: the lists whose anime's new episodes are news.
var airedStatuses = map[string]bool{"CURRENT": true, "REPEATING": true, "PLANNING": true, "PAUSED": true}

// wantsAired: the list has an anime whose episodes would be told about
// (without one the schedule isn't asked for).
func wantsAired(entries []*anilist.ListEntry) bool {
	for _, e := range entries {
		if airedStatuses[e.Status] {
			return true
		}
	}
	return false
}

// airedItems is the episodes aired between since and now of the anime
// being watched, planned or paused. One watched already isn't news.
func airedItems(eps []*anilist.AiringEpisode, entries []*anilist.ListEntry, since, now int64, showAdult bool) []notifItem {
	list := map[int]*anilist.ListEntry{}
	for _, e := range entries {
		if airedStatuses[e.Status] {
			list[e.MediaID] = e
		}
	}
	var out []notifItem
	told := map[string]bool{}
	for _, ep := range eps {
		if ep == nil || ep.Media == nil || int64(ep.AiringAt) <= since || int64(ep.AiringAt) > now {
			continue
		}
		e := list[ep.Media.ID]
		if e == nil || e.Progress >= ep.Episode || (ep.Media.IsAdult && !showAdult) {
			continue
		}
		id := fmt.Sprintf("aired:%d:%d", ep.Media.ID, ep.Episode)
		if told[id] {
			continue
		}
		told[id] = true
		out = append(out, notifItem{
			ID: id, Kind: "aired", Title: ep.Media.PreferredTitle(), Text: fmt.Sprintf("Episode %d aired", ep.Episode),
			At: int64(ep.AiringAt), Cover: coverOf(ep.Media), To: "/entry?id=" + strconv.Itoa(ep.Media.ID), MediaID: ep.Media.ID,
		})
	}
	return out
}

// chapterItems is the manga being read (reading) that got chapters since
// they were last looked at, from the last chapter known of each (latest):
// how many came, of those not read yet. seen keeps each manga's last chapter
// and when a newer one was noticed, which is the notification's time; it's
// changed in place (changed says so), and loses the manga no longer read.
// What a manga has the first time it's looked at isn't news (a backlog of
// hundreds, all at once): only what comes after.
func chapterItems(reading []*anilist.ListEntry, latest map[int]float64, seen map[int]noticed, now int64) (items []notifItem, changed bool) {
	still := map[int]bool{}
	for _, e := range reading {
		still[e.MediaID] = true
		last := latest[e.MediaID]
		if last <= 0 || e.Media == nil {
			continue
		}
		rec, ok := seen[e.MediaID]
		switch {
		case !ok:
			seen[e.MediaID], changed = noticed{Latest: last}, true
			continue
		case rec.Latest != last:
			rec = noticed{Latest: last, At: now, Since: rec.Latest}
			if last < rec.Since { // another provider's shorter list: nothing came
				rec.At = 0
			}
			seen[e.MediaID], changed = rec, true
		}
		n := int(math.Floor(last)) - e.Progress
		if n <= 0 || rec.At == 0 || rec.At < now-int64(olderFor/time.Second) {
			continue
		}
		if came := int(math.Floor(last)) - int(math.Floor(rec.Since)); came > 0 && came < n {
			n = came
		}
		text := "1 new chapter"
		if n > 1 {
			text = fmt.Sprintf("%d new chapters", n)
		}
		items = append(items, notifItem{
			ID: fmt.Sprintf("chapters:%d:%s", e.MediaID, strconv.FormatFloat(last, 'f', -1, 64)), Kind: "chapters",
			Title: e.Media.PreferredTitle(), Text: text, At: rec.At, Cover: coverOf(e.Media),
			To: "/manga/entry?id=" + strconv.Itoa(e.MediaID), MediaID: e.MediaID,
		})
	}
	for id := range seen {
		if !still[id] {
			delete(seen, id)
			changed = true
		}
	}
	return items, changed
}

// relatedItems is AniList's "related anime added" notifications since
// since, as ours.
func relatedItems(notes []*anilist.MediaNotice, since int64, showAdult, manga bool) []notifItem {
	var out []notifItem
	for _, n := range notes {
		if n == nil || n.Media == nil || n.CreatedAt <= since || (n.Media.IsAdult && !showAdult) {
			continue
		}
		it := notifItem{
			ID: "related:" + strconv.Itoa(n.ID), Kind: "related", Title: n.Media.PreferredTitle(), Text: "Related anime added to AniList",
			At: n.CreatedAt, Cover: coverOf(n.Media), To: "/entry?id=" + strconv.Itoa(n.Media.ID), MediaID: n.Media.ID,
		}
		if n.Media.Type == "MANGA" {
			if !manga {
				continue
			}
			it.Text, it.To = "Related manga added to AniList", "/manga/entry?id="+strconv.Itoa(n.Media.ID)
		}
		out = append(out, it)
	}
	return out
}

// coverOf is a cover for a small picture.
func coverOf(m *anilist.Media) string {
	c := m.CoverImage
	for _, u := range []string{c.Large, c.Medium, c.ExtraLarge} {
		if u != "" {
			return u
		}
	}
	return ""
}

// ---------------------------------------------------------------------------
// System

// systemEvent looks at one of the app's events (as sent to the pages) and
// notes the ones worth a notification. Not the ones that come all the time
// (progress, the pages' refreshes).
func (s *Server) systemEvent(raw []byte, now time.Time) {
	var ev struct {
		Type    string          `json:"type"`
		Payload json.RawMessage `json:"payload"`
	}
	if json.Unmarshal(raw, &ev) != nil || len(ev.Payload) == 0 {
		return
	}
	switch ev.Type {
	case events.DownloadProgress:
		// A download, each time it changes: only its end is noted.
		var d struct {
			ID         string `json:"id"`
			MediaID    int    `json:"mediaId"`
			Episode    int    `json:"episode"`
			AnimeTitle string `json:"animeTitle"`
			Image      string `json:"image"`
			Status     string `json:"status"`
			Error      string `json:"error"`
		}
		if json.Unmarshal(ev.Payload, &d) != nil || d.ID == "" {
			return
		}
		it := notifItem{Title: d.AnimeTitle, Cover: d.Image, MediaID: d.MediaID}
		if it.Title == "" {
			it.Title = "Download"
		}
		episode := "Episode " + strconv.Itoa(d.Episode)
		switch d.Status {
		case "completed":
			it.Kind, it.Text, it.To = "downloaded", episode+" downloaded", "/downloads"
			if d.MediaID > 0 {
				it.To = "/entry?id=" + strconv.Itoa(d.MediaID)
			}
		case "failed":
			it.Kind, it.Text, it.To = "download-failed", episode+" failed to download", "/downloads"
			if d.Error != "" {
				it.Text += " · " + d.Error
			}
		default:
			return
		}
		s.noteSystem("download:"+d.ID+":"+d.Status, it, now)

	case events.ScanDone:
		var p struct {
			Added     int    `json:"added"`
			Unmatched int    `json:"unmatched"`
			Error     string `json:"error"`
		}
		if json.Unmarshal(ev.Payload, &p) != nil {
			return
		}
		if p.Error != "" {
			s.noteSystem("scan-failed:"+p.Error, notifItem{Kind: "scan-failed", Title: "Library scan failed", Text: p.Error, To: "/library"}, now)
			return
		}
		// A scan that found nothing new says nothing (they run by
		// themselves as files change).
		if p.Added <= 0 {
			return
		}
		it := notifItem{Kind: "scan", Title: "Library scan", Text: plural(p.Added, "new file"), To: "/local"}
		if p.Unmatched > 0 {
			it.Text += fmt.Sprintf(" · %d unmatched in the library", p.Unmatched)
			it.To = "/library?tab=unmatched"
		}
		s.noteSystem(fmt.Sprintf("scan:%d:%d", p.Added, p.Unmatched), it, now)

	case events.Toast:
		var t events.ToastPayload
		if json.Unmarshal(ev.Payload, &t) != nil || t.Message == "" {
			return
		}
		switch name, auto := strings.CutPrefix(t.Message, "Auto downloader: added "); {
		case auto:
			s.noteSystem("auto:"+name, notifItem{Kind: "auto-download", Title: "Auto downloader", Text: "Added " + name, To: "/auto-downloader"}, now)
		case strings.HasPrefix(t.Message, "Download failed ("):
			// Noted from the download itself, above.
		case t.Level == "error":
			s.noteSystem("error:"+t.Message, notifItem{Kind: "error", Title: "Error", Text: t.Message}, now)
		case t.Level == "warning":
			s.noteSystem("warning:"+t.Message, notifItem{Kind: "warning", Title: "Warning", Text: t.Message}, now)
		}

	case events.UpdateStatus:
		// Sent at every step of a check or an install: a version is told
		// about once.
		var u struct {
			Available bool `json:"available"`
			Latest    *struct {
				Version string `json:"version"`
				Beta    bool   `json:"beta"`
			} `json:"latest"`
		}
		if json.Unmarshal(ev.Payload, &u) != nil || !u.Available || u.Latest == nil || u.Latest.Version == "" {
			return
		}
		notifMu.Lock()
		defer notifMu.Unlock()
		var l systemLog
		_, _ = s.app.DB.GetKV(kvNotifSystem, &l)
		if l.Update == u.Latest.Version {
			return
		}
		l.Update = u.Latest.Version
		it := notifItem{Kind: "update", Title: "Update available", Text: "Aniko " + u.Latest.Version, To: "/settings?tab=updates"}
		if u.Latest.Beta {
			it.Text += " (beta)"
		}
		l.add("update:"+u.Latest.Version, it, now)
		_ = s.app.DB.SetKV(kvNotifSystem, l)

	case events.AniListPending:
		// How many list changes wait for AniList, each time it changes:
		// noted when the first one waits, taken back once they're sent.
		var p struct {
			Count int `json:"count"`
		}
		if json.Unmarshal(ev.Payload, &p) != nil {
			return
		}
		notifMu.Lock()
		defer notifMu.Unlock()
		var l systemLog
		_, _ = s.app.DB.GetKV(kvNotifSystem, &l)
		waiting := p.Count > 0
		if waiting == l.Waiting {
			return
		}
		l.Waiting = waiting
		kept := l.Items[:0]
		for _, it := range l.Items {
			if it.Kind != "anilist-waiting" {
				kept = append(kept, it)
			}
		}
		l.Items = kept
		if waiting {
			l.add("anilist-waiting", notifItem{Kind: "anilist-waiting", Title: "AniList", Text: "List changes waiting to be sent"}, now)
		}
		_ = s.app.DB.SetKV(kvNotifSystem, l)
	}
}

// noteSystem adds a notification to the System list. key names what it's
// about: the same again within sameWithin isn't noted twice.
func (s *Server) noteSystem(key string, it notifItem, now time.Time) {
	notifMu.Lock()
	defer notifMu.Unlock()
	var l systemLog
	_, _ = s.app.DB.GetKV(kvNotifSystem, &l)
	if l.add(key, it, now) {
		_ = s.app.DB.SetKV(kvNotifSystem, l)
	}
}

// add puts it first in the list (its ID is its key and its time), unless
// the same key is there from a moment ago; the oldest past maxSystem go.
func (l *systemLog) add(key string, it notifItem, now time.Time) bool {
	it.At = now.Unix()
	for _, old := range l.Items {
		if i := strings.LastIndexByte(old.ID, '@'); i >= 0 && old.ID[:i] == key && it.At-old.At < int64(sameWithin/time.Second) {
			return false
		}
	}
	it.ID = key + "@" + strconv.FormatInt(it.At, 10)
	l.Items = append([]notifItem{it}, l.Items...)
	if len(l.Items) > maxSystem {
		l.Items = l.Items[:maxSystem]
	}
	return true
}

func plural(n int, what string) string {
	if n == 1 {
		return "1 " + what
	}
	return fmt.Sprintf("%d %ss", n, what)
}

// newChapterCount is how many chapters of a manga being read came out since
// it was last looked at (rec, from chapterItems) and aren't read yet. None
// for what it had the first time it was looked at.
func newChapterCount(e *anilist.ListEntry, last float64, rec noticed) int {
	if rec.At == 0 || rec.Latest != last {
		return 0
	}
	n := int(math.Floor(last)) - e.Progress
	if came := int(math.Floor(last)) - int(math.Floor(rec.Since)); came < n {
		n = came
	}
	return max(n, 0)
}

// newChapters is newChapterCount for each manga being read, by its id, with
// the record the notifications keep (and brought up to date here).
func (s *Server) newChapters(reading []*anilist.ListEntry, latest map[int]float64) map[int]int {
	notifMu.Lock()
	defer notifMu.Unlock()
	seen := map[int]noticed{}
	_, _ = s.app.DB.GetKV(kvNotifChapters, &seen)
	if _, changed := chapterItems(reading, latest, seen, time.Now().Unix()); changed {
		_ = s.app.DB.SetKV(kvNotifChapters, seen)
	}
	out := map[int]int{}
	for _, e := range reading {
		if n := newChapterCount(e, latest[e.MediaID], seen[e.MediaID]); n > 0 {
			out[e.MediaID] = n
		}
	}
	return out
}
