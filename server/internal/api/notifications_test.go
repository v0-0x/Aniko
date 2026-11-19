package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/v0-0x/Nyakuro/server/internal/anilist"
	"github.com/v0-0x/Nyakuro/server/internal/events"
)

type notifAnswer struct {
	Shows  []notifItem      `json:"shows"`
	System []notifItem      `json:"system"`
	Seen   map[string]int64 `json:"seen"`
}

func getNotifications(t *testing.T, s *Server) notifAnswer {
	t.Helper()
	w := do(s, "GET", "/api/notifications", "127.0.0.1:5000", "", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("notifications: %d %s", w.Code, w.Body.String())
	}
	var a notifAnswer
	if err := json.Unmarshal(w.Body.Bytes(), &a); err != nil {
		t.Fatal(err)
	}
	if a.Shows == nil || a.System == nil {
		t.Fatalf("a list is null, not empty: %s", w.Body.String())
	}
	return a
}

func notifMedia(id int, name string) *anilist.Media {
	m := &anilist.Media{ID: id, Type: "ANIME", Title: anilist.Title{English: name}}
	m.CoverImage.Large = fmt.Sprintf("https://img.example/%d.jpg", id)
	return m
}

// An episode that aired this week of an anime being watched, planned or
// paused is told about: not one watched already, not of an anime finished
// or dropped or off the list, not one still to air or older than a week,
// not an 18+ one unless those are shown.
func TestNotifAired(t *testing.T) {
	now := int64(1_800_000_000)
	hour, day := int64(3600), int64(86400)
	entry := func(id int, status string, progress int) *anilist.ListEntry {
		return &anilist.ListEntry{MediaID: id, Status: status, Progress: progress, Media: notifMedia(id, fmt.Sprint("Show ", id))}
	}
	ep := func(id, n int, at int64) *anilist.AiringEpisode {
		return &anilist.AiringEpisode{ID: id*100 + n, AiringAt: int(at), Episode: n, Media: notifMedia(id, fmt.Sprint("Show ", id))}
	}
	adult := ep(7, 2, now-hour)
	adult.Media.IsAdult = true
	entries := []*anilist.ListEntry{
		entry(1, "CURRENT", 7), entry(2, "PLANNING", 0), entry(3, "PAUSED", 3), entry(4, "COMPLETED", 12),
		entry(5, "DROPPED", 1), entry(6, "CURRENT", 9), entry(7, "CURRENT", 0), entry(8, "REPEATING", 2),
	}
	eps := []*anilist.AiringEpisode{
		ep(1, 8, now-2*hour),                    // watching, not seen yet
		ep(1, 8, now-2*hour),                    // the same one twice in the schedule
		ep(2, 1, now-3*day),                     // planned
		ep(3, 5, now-5*day),                     // paused
		ep(4, 13, now-hour),                     // finished: not told
		ep(5, 2, now-hour),                      // dropped
		ep(6, 9, now-hour),                      // watched already
		adult,                                   // 18+
		ep(8, 3, now-6*day),                     // watching again
		ep(9, 1, now-hour),                      // not on the list
		ep(1, 9, now+hour),                      // not aired yet
		ep(2, 0, now-8*day),                     // older than a week
		{AiringAt: int(now - hour), Episode: 4}, // no anime
		nil,
	}
	got := airedItems(eps, entries, now-7*day, now, false)
	want := []string{"aired:1:8", "aired:2:1", "aired:3:5", "aired:8:3"}
	if len(got) != len(want) {
		t.Fatalf("aired = %+v, want %v", got, want)
	}
	for i, id := range want {
		if got[i].ID != id {
			t.Fatalf("aired[%d] = %s, want %s", i, got[i].ID, id)
		}
	}
	first := got[0]
	if first.Title != "Show 1" || first.Text != "Episode 8 aired" || first.At != now-2*hour || first.To != "/entry?id=1" || first.MediaID != 1 || first.Cover != "https://img.example/1.jpg" || first.Kind != "aired" {
		t.Fatalf("aired item = %+v", first)
	}
	if got := airedItems(eps, entries, now-7*day, now, true); len(got) != 5 {
		t.Fatalf("with 18+ shown: %d items, want 5", len(got))
	}
	if wantsAired(entries[3:5]) || !wantsAired(entries) {
		t.Fatal("wantsAired: only a list with an anime watched, planned or paused asks for the schedule")
	}
}

// New chapters of a manga being read: what's there the first time it's
// looked at isn't news; a chapter that comes after is, timed when it was
// noticed and counted from the last one known; forgotten with the manga.
func TestNotifChapters(t *testing.T) {
	manga := func(id, progress int) *anilist.ListEntry {
		m := notifMedia(id, fmt.Sprint("Manga ", id))
		m.Type = "MANGA"
		return &anilist.ListEntry{MediaID: id, Status: "CURRENT", Progress: progress, Media: m}
	}
	reading := []*anilist.ListEntry{manga(1, 10), manga(2, 5), manga(3, 40), manga(4, 2)}
	latest := map[int]float64{1: 13, 2: 6.5, 3: 40} // 4 was never opened
	seen := map[int]noticed{}
	t0 := int64(1_800_000_000)
	// The first look: 1 and 2 have unread chapters already, which isn't news.
	items, changed := chapterItems(reading, latest, seen, t0)
	if !changed || len(items) != 0 || len(seen) != 3 {
		t.Fatalf("first look: %+v (changed %v, seen %v)", items, changed, seen)
	}
	if items, changed = chapterItems(reading, latest, seen, t0+3600); changed || len(items) != 0 {
		t.Fatalf("second look: %+v (changed %v)", items, changed)
	}
	// A new chapter of 1 (four unread, one of them new) and of 3 (read up to the one before).
	latest[1], latest[3] = 14, 41
	items, changed = chapterItems(reading, latest, seen, t0+7200)
	if !changed || len(items) != 2 {
		t.Fatalf("after new chapters: %+v (changed %v)", items, changed)
	}
	if it := items[0]; it.ID != "chapters:1:14" || it.Text != "1 new chapter" || it.At != t0+7200 || it.To != "/manga/entry?id=1" || it.Title != "Manga 1" || it.MediaID != 1 {
		t.Fatalf("item = %+v", it)
	}
	if it := items[1]; it.ID != "chapters:3:41" || it.Text != "1 new chapter" || it.At != t0+7200 {
		t.Fatalf("item = %+v", it)
	}
	// Later, nothing newer: the same, at the time noticed.
	if items, changed = chapterItems(reading, latest, seen, t0+9000); changed || len(items) != 2 || items[0].At != t0+7200 {
		t.Fatalf("a look later: %+v (changed %v)", items, changed)
	}
	// Three more of 1, one read meanwhile: three came, all unread.
	latest[1] = 17
	reading[0].Progress = 11
	if items, _ = chapterItems(reading, latest, seen, t0+10000); len(items) != 2 || items[0].ID != "chapters:1:17" || items[0].Text != "3 new chapters" {
		t.Fatalf("three more: %+v", items)
	}
	// Read up to the last: nothing to say.
	reading[0].Progress = 17
	if items, _ = chapterItems(reading, latest, seen, t0+11000); len(items) != 1 || items[0].MediaID != 3 {
		t.Fatalf("after reading 1: %+v", items)
	}
	// Noticed over a month ago: no longer news.
	if items, _ = chapterItems(reading, latest, seen, t0+7200+31*86400); len(items) != 0 {
		t.Fatalf("a month later: %+v", items)
	}
	// 1 isn't read any more: forgotten.
	_, changed = chapterItems(reading[1:], latest, seen, t0+12000)
	if _, kept := seen[1]; kept || !changed {
		t.Fatalf("after dropping 1: seen %v (changed %v)", seen, changed)
	}
}

// AniList's "related anime added" notifications as ours.
func TestNotifRelated(t *testing.T) {
	now := int64(1_800_000_000)
	mangaMedia := notifMedia(30, "Side Story")
	mangaMedia.Type = "MANGA"
	adult := notifMedia(40, "Adult")
	adult.IsAdult = true
	notes := []*anilist.MediaNotice{
		{ID: 1, CreatedAt: now - 3600, Media: notifMedia(20, "Season 2")},
		{ID: 2, CreatedAt: now - 7200, Media: mangaMedia},
		{ID: 3, CreatedAt: now - 7200, Media: adult},
		{ID: 4, CreatedAt: now - 40*86400, Media: notifMedia(50, "Old")},
		{ID: 5, CreatedAt: now - 60},
		nil,
	}
	got := relatedItems(notes, now-30*86400, false, true)
	if len(got) != 2 || got[0].ID != "related:1" || got[0].To != "/entry?id=20" || got[0].Title != "Season 2" || got[0].Text != "Related anime added to AniList" || got[0].At != now-3600 ||
		got[1].To != "/manga/entry?id=30" || got[1].Text != "Related manga added to AniList" {
		t.Fatalf("related = %+v", got)
	}
	// Manga turned off; 18+ shown.
	if got := relatedItems(notes, now-30*86400, true, false); len(got) != 2 || got[1].ID != "related:3" {
		t.Fatalf("related, no manga, 18+ = %+v", got)
	}
}

// Shows over the API, from this Nyakuro's own list and the schedule it keeps
// (nothing is asked of AniList: logged out, the schedule is in the cache).
func TestNotifShowsRoute(t *testing.T) {
	s := newTestServer(t)
	if a := getNotifications(t, s); len(a.Shows) != 0 || len(a.System) != 0 || a.Seen["shows"] != 0 || a.Seen["system"] != 0 {
		t.Fatalf("at first: %+v", a)
	}
	s.app.DB.SetCache("media-lite:21", notifMedia(21, "One Piece"), time.Hour)
	st, progress := "CURRENT", 3
	if err := s.app.Platform.UpdateEntry(t.Context(), anilist.EntryUpdate{MediaID: 21, Status: &st, Progress: &progress}); err != nil {
		t.Fatal(err)
	}
	// The schedule as Platform.Schedule keeps it, for the days asked for.
	now := time.Now()
	day := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	start, end := day.AddDate(0, 0, -7).Unix(), day.AddDate(0, 0, 1).Unix()
	s.app.DB.SetCache(fmt.Sprintf("schedule:%d:%d", start/3600, end/3600), []*anilist.AiringEpisode{
		{ID: 1, AiringAt: int(now.Unix() - 26*3600), Episode: 4, Media: notifMedia(21, "One Piece")},
		{ID: 2, AiringAt: int(now.Unix() - 60), Episode: 5, Media: notifMedia(21, "One Piece")},
		{ID: 3, AiringAt: int(now.Unix() - 60), Episode: 1, Media: notifMedia(99, "Not on the list")},
		{ID: 4, AiringAt: int(now.Unix() + 3600), Episode: 6, Media: notifMedia(21, "One Piece")},
	}, time.Hour)
	a := getNotifications(t, s)
	if len(a.Shows) != 2 || a.Shows[0].ID != "aired:21:5" || a.Shows[1].ID != "aired:21:4" || a.Shows[0].Title != "One Piece" || a.Shows[0].To != "/entry?id=21" {
		t.Fatalf("shows (newest first) = %+v", a.Shows)
	}
}

func event(typ string, payload any) []byte {
	raw, _ := json.Marshal(events.Event{Type: typ, Payload: payload})
	return raw
}

// The System list: the events worth one are noted, newest first, the same
// one once; not progress, not what the pages refresh on.
func TestNotifSystem(t *testing.T) {
	s := newTestServer(t)
	local := "127.0.0.1:5000"
	now := time.Unix(1_800_000_000, 0)
	dl := func(id, status, errText string, progress float64) []byte {
		return event(events.DownloadProgress, map[string]any{"id": id, "mediaId": 21, "episode": 5, "animeTitle": "One Piece", "image": "https://img.example/21.jpg", "status": status, "error": errText, "progress": progress})
	}
	// A download as it goes: only its end is noted, once.
	for _, raw := range [][]byte{dl("a", "queued", "", 0), dl("a", "downloading", "", 0.2), dl("a", "downloading", "", 0.9), dl("a", "completed", "", 1), dl("a", "completed", "", 1)} {
		s.systemEvent(raw, now)
	}
	s.systemEvent(dl("b", "failed", "no source found", 0), now.Add(time.Second))
	s.systemEvent(event(events.Toast, events.ToastPayload{Level: "error", Message: "Download failed (One Piece ep 5): no source found"}), now.Add(time.Second))
	s.systemEvent(dl("c", "canceled", "", 0), now.Add(time.Second))
	s.systemEvent(event(events.DownloadProgress, map[string]any{"id": "a", "removed": true}), now.Add(time.Second))
	s.systemEvent(event(events.DownloadProgress, map[string]any{"cleared": true}), now.Add(time.Second))
	a := getNotifications(t, s)
	if len(a.System) != 2 {
		t.Fatalf("downloads: %+v", a.System)
	}
	if it := a.System[1]; it.Kind != "downloaded" || it.Title != "One Piece" || it.Text != "Episode 5 downloaded" || it.To != "/entry?id=21" || it.Cover == "" || it.At != now.Unix() || it.MediaID != 21 {
		t.Fatalf("downloaded = %+v", it)
	}
	if it := a.System[0]; it.Kind != "download-failed" || it.Text != "Episode 5 failed to download · no source found" || it.To != "/downloads" {
		t.Fatalf("failed = %+v", it)
	}
	if a.System[0].ID == a.System[1].ID || a.System[0].ID == "" {
		t.Fatalf("ids: %q %q", a.System[0].ID, a.System[1].ID)
	}
	// Failed again much later (tried again): noted again.
	s.systemEvent(dl("b", "failed", "no source found", 0), now.Add(time.Hour))
	if a = getNotifications(t, s); len(a.System) != 3 || a.System[0].ID == a.System[1].ID {
		t.Fatalf("failed again: %+v", a.System)
	}

	// Scans: one that found files, one that failed; not one with nothing
	// new, nor its progress.
	s.systemEvent(event(events.ScanProgress, map[string]any{"stage": "walking", "done": 1, "total": 9}), now)
	s.systemEvent(event(events.ScanDone, map[string]any{"total": 40, "added": 0, "unmatched": 3}), now)
	s.systemEvent(event(events.ScanDone, map[string]any{"total": 41, "added": 1, "unmatched": 0}), now.Add(2*time.Hour))
	s.systemEvent(event(events.ScanDone, map[string]any{"total": 53, "added": 12, "unmatched": 3}), now.Add(3*time.Hour))
	s.systemEvent(event(events.ScanDone, map[string]any{"error": "disk gone"}), now.Add(4*time.Hour))
	a = getNotifications(t, s)
	if len(a.System) != 6 || a.System[2].Text != "1 new file" || a.System[2].To != "/local" || a.System[1].Text != "12 new files · 3 unmatched in the library" || a.System[1].To != "/library?tab=unmatched" ||
		a.System[0].Title != "Library scan failed" || a.System[0].Text != "disk gone" {
		t.Fatalf("scans: %+v", a.System[:min(3, len(a.System))])
	}

	// Toasts: the auto downloader's, warnings and errors; not the rest.
	later := now.Add(5 * time.Hour)
	s.systemEvent(event(events.Toast, events.ToastPayload{Level: "success", Message: "Auto downloader: added [Subs] One Piece - 06"}), later)
	s.systemEvent(event(events.Toast, events.ToastPayload{Level: "info", Message: "Playing episode 6"}), later)
	s.systemEvent(event(events.Toast, events.ToastPayload{Level: "success", Message: "Progress updated — episode 6"}), later)
	s.systemEvent(event(events.Toast, events.ToastPayload{Level: "warning", Message: "Your AniList session expired, please log in again."}), later.Add(time.Second))
	s.systemEvent(event(events.Toast, events.ToastPayload{Level: "warning", Message: "Your AniList session expired, please log in again."}), later.Add(2*time.Second))
	s.systemEvent(event(events.Toast, events.ToastPayload{Level: "error", Message: "Could not update progress: offline"}), later.Add(3*time.Second))
	a = getNotifications(t, s)
	if len(a.System) != 9 || a.System[2].Title != "Auto downloader" || a.System[2].Text != "Added [Subs] One Piece - 06" || a.System[2].To != "/auto-downloader" ||
		a.System[1].Title != "Warning" || a.System[0].Title != "Error" || a.System[0].Text != "Could not update progress: offline" {
		t.Fatalf("toasts: %+v", a.System[:min(4, len(a.System))])
	}

	// An update: told once per version, whatever the steps of the check;
	// also after Clear.
	upd := func(version string, available bool) []byte {
		return event(events.UpdateStatus, map[string]any{"available": available, "checking": false, "latest": map[string]any{"version": version}, "current": map[string]any{"version": "3.0.1"}})
	}
	s.systemEvent(event(events.UpdateStatus, map[string]any{"available": false, "checking": true}), later)
	s.systemEvent(upd("3.0.1", false), later)
	s.systemEvent(upd("3.0.2", true), later.Add(time.Minute))
	s.systemEvent(upd("3.0.2", true), later.Add(time.Hour))
	a = getNotifications(t, s)
	if len(a.System) != 10 || a.System[0].Title != "Update available" || a.System[0].Text != "Nyakuro 3.0.2" || a.System[0].To != "/settings?tab=updates" {
		t.Fatalf("update: %+v", a.System[:min(2, len(a.System))])
	}
	if w := do(s, "DELETE", "/api/notifications/system", local, "", nil); w.Code != http.StatusOK {
		t.Fatalf("clear: %d %s", w.Code, w.Body.String())
	}
	s.systemEvent(upd("3.0.2", true), later.Add(2*time.Hour))
	if a = getNotifications(t, s); len(a.System) != 0 {
		t.Fatalf("after Clear: %+v", a.System)
	}
	s.systemEvent(upd("3.0.3", true), later.Add(3*time.Hour))
	if a = getNotifications(t, s); len(a.System) != 1 || a.System[0].Text != "Nyakuro 3.0.3" {
		t.Fatalf("the next version: %+v", a.System)
	}

	// List changes waiting for AniList: noted when the first one waits,
	// not for each more, taken back once they're sent.
	pending := func(n int) []byte { return event(events.AniListPending, map[string]any{"count": n}) }
	s.systemEvent(pending(0), later)
	s.systemEvent(pending(1), later.Add(4*time.Hour))
	s.systemEvent(pending(2), later.Add(5*time.Hour))
	if a = getNotifications(t, s); len(a.System) != 2 || a.System[0].Title != "AniList" || a.System[0].Text != "List changes waiting to be sent" || a.System[0].At != later.Add(4*time.Hour).Unix() {
		t.Fatalf("waiting: %+v", a.System)
	}
	s.systemEvent(pending(0), later.Add(6*time.Hour))
	if a = getNotifications(t, s); len(a.System) != 1 || a.System[0].Title != "Update available" {
		t.Fatalf("sent: %+v", a.System)
	}

	// What isn't an event, or carries nothing: ignored.
	s.systemEvent([]byte("not json"), later)
	s.systemEvent(event(events.LibraryUpdated, nil), later)
	s.systemEvent(event(events.CollectionUpdate, map[string]any{"mediaId": 21}), later)
	if a = getNotifications(t, s); len(a.System) != 1 {
		t.Fatalf("after noise: %+v", a.System)
	}
}

// The System list keeps the last maxSystem, newest first.
func TestNotifSystemCap(t *testing.T) {
	s := newTestServer(t)
	now := time.Unix(1_800_000_000, 0)
	for i := range maxSystem + 15 {
		s.systemEvent(event(events.Toast, events.ToastPayload{Level: "error", Message: fmt.Sprint("problem ", i)}), now.Add(time.Duration(i)*time.Second))
	}
	a := getNotifications(t, s)
	if len(a.System) != maxSystem || a.System[0].Text != fmt.Sprint("problem ", maxSystem+14) || a.System[maxSystem-1].Text != "problem 15" {
		t.Fatalf("%d kept, first %q, last %q", len(a.System), a.System[0].Text, a.System[len(a.System)-1].Text)
	}
	seen := map[string]bool{}
	for _, it := range a.System {
		if seen[it.ID] {
			t.Fatalf("id %q twice", it.ID)
		}
		seen[it.ID] = true
	}
}

// Seen: a time per list, kept here; looking at one doesn't touch the other,
// nor remove anything.
func TestNotifSeen(t *testing.T) {
	s := newTestServer(t)
	local := "127.0.0.1:5000"
	s.systemEvent(event(events.Toast, events.ToastPayload{Level: "error", Message: "a problem"}), time.Now().Add(-time.Minute))
	a := getNotifications(t, s)
	if len(a.System) != 1 || a.Seen["system"] != 0 || a.System[0].At <= a.Seen["system"] {
		t.Fatalf("before: %+v", a)
	}
	for _, body := range []string{`{}`, `{"category":"other"}`} {
		if w := do(s, "POST", "/api/notifications/seen", local, body, nil); w.Code != http.StatusBadRequest {
			t.Fatalf("seen %s: %d", body, w.Code)
		}
	}
	before := time.Now().Unix()
	w := do(s, "POST", "/api/notifications/seen", local, `{"category":"system"}`, nil)
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"seen"`) {
		t.Fatalf("seen: %d %s", w.Code, w.Body.String())
	}
	a = getNotifications(t, s)
	if len(a.System) != 1 || a.Seen["system"] < before || a.Seen["shows"] != 0 || a.System[0].At > a.Seen["system"] {
		t.Fatalf("after system seen: %+v", a)
	}
	if w := do(s, "POST", "/api/notifications/seen", local, `{"category":"shows"}`, nil); w.Code != http.StatusOK {
		t.Fatalf("seen shows: %d", w.Code)
	}
	if a = getNotifications(t, s); a.Seen["shows"] < before || a.Seen["system"] < before {
		t.Fatalf("after both: %+v", a.Seen)
	}
	// Seen up to the newest one shown: not past it, never back, never ahead
	// of now.
	shown := a.Seen["shows"]
	seenAfter := func(body string) int64 {
		t.Helper()
		if w := do(s, "POST", "/api/notifications/seen", local, body, nil); w.Code != http.StatusOK {
			t.Fatalf("seen %s: %d", body, w.Code)
		}
		return getNotifications(t, s).Seen["shows"]
	}
	if got := seenAfter(`{"category":"shows","at":1000}`); got != shown {
		t.Fatalf("seen went back: %d, was %d", got, shown)
	}
	if got := seenAfter(`{"category":"shows","at":99999999999}`); got < shown || got > time.Now().Unix() {
		t.Fatalf("seen ahead of now: %d", got)
	}
	// Something new after that is new again.
	s.systemEvent(event(events.Toast, events.ToastPayload{Level: "error", Message: "another problem"}), time.Now().Add(time.Minute))
	if a = getNotifications(t, s); len(a.System) != 2 || a.System[0].At <= a.Seen["system"] {
		t.Fatalf("a newer one: %+v", a)
	}
}

// Seen up to the newest one shown: one that came in since stays new.
func TestNotifSeenUpTo(t *testing.T) {
	s := newTestServer(t)
	now := time.Now()
	s.systemEvent(event(events.Toast, events.ToastPayload{Level: "error", Message: "shown"}), now.Add(-2*time.Minute))
	shown := getNotifications(t, s).System[0].At
	s.systemEvent(event(events.Toast, events.ToastPayload{Level: "error", Message: "came in since"}), now.Add(-time.Minute))
	if w := do(s, "POST", "/api/notifications/seen", "127.0.0.1:5000", fmt.Sprintf(`{"category":"system","at":%d}`, shown), nil); w.Code != http.StatusOK {
		t.Fatalf("seen: %d %s", w.Code, w.Body.String())
	}
	a := getNotifications(t, s)
	if a.Seen["system"] != shown || len(a.System) != 2 || a.System[0].At <= a.Seen["system"] || a.System[1].At > a.Seen["system"] {
		t.Fatalf("seen up to %d: %+v", shown, a)
	}
}

// The events come from the app's own hub: what's published there is noted
// without anything asking.
func TestNotifFromHub(t *testing.T) {
	s := newTestServer(t)
	s.app.Hub.Publish(events.Toast, events.ToastPayload{Level: "success", Message: "Auto downloader: added [Subs] Show - 01"})
	s.app.Hub.Error("Library folder /x looks empty")
	for range 100 {
		if a := getNotifications(t, s); len(a.System) == 2 {
			if a.System[1].Title != "Auto downloader" || a.System[0].Title != "Error" {
				t.Fatalf("from the hub: %+v", a.System)
			}
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("the hub's events weren't noted")
}

// A cover's "new": chapters out since the manga was first looked at and not
// read, never the backlog it had then (a series not started, a finished one).
func TestNewChapterCount(t *testing.T) {
	e := &anilist.ListEntry{MediaID: 1, Progress: 10}
	for _, c := range []struct {
		last float64
		rec  noticed
		want int
	}{
		{1198, noticed{Latest: 1198}, 0},               // first look: a backlog
		{14, noticed{Latest: 14, At: 5, Since: 13}, 1}, // one came, four unread
		{17, noticed{Latest: 17, At: 5, Since: 14}, 3}, // three came
		{12, noticed{Latest: 12, At: 5, Since: 5}, 2},  // seven came, two left to read
		{10, noticed{Latest: 10, At: 5, Since: 9}, 0},  // read up to it
		{15, noticed{Latest: 14, At: 5, Since: 13}, 0}, // not looked at since it changed
	} {
		if got := newChapterCount(e, c.last, c.rec); got != c.want {
			t.Errorf("last %v, %+v: %d, want %d", c.last, c.rec, got, c.want)
		}
	}
}
