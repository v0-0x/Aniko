package anilist

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"
)

// fakeList is AniList for the pending tests: one user's list, and whether
// AniList answers (down: 503 to everything) or refuses saves (a 400).
type fakeList struct {
	mu       sync.Mutex
	down     bool
	refuse   bool
	progress map[int]int
	status   map[int]string
	score    map[int]float64
	saves    []map[string]any
	deletes  int
}

func (f *fakeList) handle(w http.ResponseWriter, req gqlRequest) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.down {
		http.Error(w, "<html>503 Service Unavailable</html>", http.StatusServiceUnavailable)
		return
	}
	id := 0
	if v, ok := req.Variables["mediaId"].(float64); ok {
		id = int(v)
	}
	switch {
	case strings.Contains(req.Query, "MediaList("):
		if _, ok := f.status[id]; !ok {
			reply(w, http.StatusNotFound, map[string]any{"data": map[string]any{"MediaList": nil}, "errors": []any{map[string]any{"message": "Not Found.", "status": 404}}})
			return
		}
		reply(w, http.StatusOK, data(map[string]any{"MediaList": map[string]any{"id": 100 + id, "mediaId": id, "status": f.status[id], "progress": f.progress[id], "score": f.score[id]}}))
	case op(req.Query) == "save":
		if f.refuse {
			reply(w, http.StatusBadRequest, map[string]any{"data": nil, "errors": []any{map[string]any{"message": "validation", "status": 400}}})
			return
		}
		f.saves = append(f.saves, req.Variables)
		if s, ok := req.Variables["status"].(string); ok {
			f.status[id] = s
		} else if _, ok := f.status[id]; !ok {
			f.status[id] = "PLANNING"
		}
		if v, ok := req.Variables["progress"].(float64); ok {
			f.progress[id] = int(v)
		}
		if v, ok := req.Variables["scoreRaw"].(float64); ok {
			f.score[id] = v
		}
		reply(w, http.StatusOK, data(map[string]any{"SaveMediaListEntry": map[string]any{
			"id": 100 + id, "mediaId": id, "status": f.status[id], "progress": f.progress[id], "score": f.score[id]}}))
	case op(req.Query) == "delete":
		f.deletes++
		for k := range f.status {
			if 100+k == int(req.Variables["id"].(float64)) {
				delete(f.status, k)
			}
		}
		reply(w, http.StatusOK, data(map[string]any{"DeleteMediaListEntry": map[string]any{"deleted": true}}))
	case op(req.Query) == "collection":
		var entries []*ListEntry
		for id, s := range f.status {
			entries = append(entries, listEntry(100+id, id, s, f.progress[id]))
		}
		reply(w, http.StatusOK, data(map[string]any{"MediaListCollection": testCollection(entries...)}))
	default:
		http.Error(w, "unexpected "+op(req.Query), http.StatusBadRequest)
	}
}

func (f *fakeList) set(fn func()) {
	f.mu.Lock()
	defer f.mu.Unlock()
	fn()
}

func (f *fakeList) savesCopy() []map[string]any {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]map[string]any(nil), f.saves...)
}

// newPendingTest: user 7 logged in, show 1 (12 episodes) watching at
// episode 3 on AniList and in the cached list, AniList down.
func newPendingTest(t *testing.T) (*Platform, *fakeList) {
	t.Helper()
	f := &fakeList{down: true, progress: map[int]int{1: 3}, status: map[int]string{1: "CURRENT"}, score: map[int]float64{}}
	p := newTestPlatform(t, f.handle)
	setLoggedIn(p, 7)
	seed(p, "ANIME", testCollection(listEntry(101, 1, "CURRENT", 3)))
	return p, f
}

func TestUnreachable(t *testing.T) {
	// A real refused connection, as without network.
	c := NewClient()
	c.endpoint = "http://127.0.0.1:1"
	_, err := c.SaveEntry(context.Background(), EntryUpdate{MediaID: 1})
	if !Unreachable(err) {
		t.Errorf("refused connection: Unreachable(%v) = false", err)
	}
	for _, tc := range []struct {
		err  error
		want bool
	}{
		{&StatusError{Status: 503}, true},
		{&StatusError{Status: 500}, true},
		{&StatusError{Status: 429}, true},
		{errRateLimited, true},
		{context.DeadlineExceeded, true},
		{&StatusError{Status: 400}, false},
		{&StatusError{Status: 404}, false},
		{ErrUnauthorized, false},
		{errors.New("json: cannot unmarshal"), false},
	} {
		if got := Unreachable(tc.err); got != tc.want {
			t.Errorf("Unreachable(%v) = %v, want %v", tc.err, got, tc.want)
		}
	}
}

// Offline, a finished episode is kept (one row per show, the latest
// winning), shown in the list, and sent when AniList is back.
func TestPendingQueueCollapseAndFlush(t *testing.T) {
	p, f := newPendingTest(t)
	ctx := context.Background()

	for ep := 4; ep <= 6; ep++ {
		if ok, err := p.UpdateProgress(ctx, 1, ep); err != nil || !ok {
			t.Fatalf("UpdateProgress(%d) offline = %v, %v; want kept", ep, ok, err)
		}
	}
	score := 80.0
	if err := p.UpdateEntry(ctx, EntryUpdate{MediaID: 1, Score: &score}); err != nil {
		t.Fatalf("score offline: %v", err)
	}
	if n := p.PendingCount(); n != 1 {
		t.Fatalf("PendingCount = %d, want 1 (collapsed)", n)
	}
	if e := cached(p, "ANIME").Find(1); e == nil || e.Progress != 6 || e.Score != 80 {
		t.Fatalf("cached entry = %+v, want progress 6 score 80", e)
	}

	// Still down: kept.
	if left, err := p.SyncPending(ctx); left != 1 || !Unreachable(err) {
		t.Fatalf("SyncPending while down = %d, %v", left, err)
	}
	if p.PendingCount() != 1 {
		t.Fatal("change lost while AniList is down")
	}

	// Back: a fresh list from AniList still shows the change until sent.
	f.set(func() { f.down = false })
	c, err := p.Collection(ctx, "ANIME", true)
	if err != nil {
		t.Fatal(err)
	}
	if e := c.Find(1); e == nil || e.Progress != 6 {
		t.Fatalf("refetched entry = %+v, want the waiting progress 6", e)
	}

	if left, err := p.SyncPending(ctx); left != 0 || err != nil {
		t.Fatalf("SyncPending = %d, %v", left, err)
	}
	saves := f.savesCopy()
	if len(saves) != 1 || saves[0]["progress"] != 6.0 || saves[0]["scoreRaw"] != 80.0 {
		t.Fatalf("saves = %v, want one with progress 6 and score 80", saves)
	}
	if p.PendingCount() != 0 {
		t.Error("sent change still waiting")
	}
}

// A change AniList refuses for good (4xx) is dropped, not retried forever.
func TestPendingDroppedOnPermanentError(t *testing.T) {
	p, f := newPendingTest(t)
	ctx := context.Background()
	if _, err := p.UpdateProgress(ctx, 1, 4); err != nil {
		t.Fatal(err)
	}
	f.set(func() { f.down, f.refuse = false, true })
	if left, err := p.SyncPending(ctx); left != 0 || err != nil {
		t.Fatalf("SyncPending = %d, %v", left, err)
	}
	if p.PendingCount() != 0 {
		t.Error("refused change kept")
	}

	// Online, a 4xx is the caller's error, nothing kept.
	if err := p.UpdateEntry(ctx, EntryUpdate{MediaID: 1, Progress: new(int)}); err == nil {
		t.Error("UpdateEntry refused by AniList: no error")
	}
	if p.PendingCount() != 0 {
		t.Error("refused update kept")
	}
}

// Progress kept offline never lowers what AniList has meanwhile (watched
// further on another device); the rest of the change is still sent.
func TestPendingNeverLowersProgress(t *testing.T) {
	p, f := newPendingTest(t)
	ctx := context.Background()
	if _, err := p.UpdateProgress(ctx, 1, 4); err != nil {
		t.Fatal(err)
	}
	score := 70.0
	if err := p.UpdateEntry(ctx, EntryUpdate{MediaID: 1, Score: &score}); err != nil {
		t.Fatal(err)
	}
	f.set(func() { f.down, f.progress[1], f.status[1] = false, 12, "COMPLETED" })
	if left, err := p.SyncPending(ctx); left != 0 || err != nil {
		t.Fatalf("SyncPending = %d, %v", left, err)
	}
	saves := f.savesCopy()
	if len(saves) != 1 {
		t.Fatalf("saves = %v, want one", saves)
	}
	if _, ok := saves[0]["progress"]; ok {
		t.Errorf("sent progress over AniList's later one: %v", saves[0])
	}
	if _, ok := saves[0]["status"]; ok {
		t.Errorf("sent the status that came with the older progress: %v", saves[0])
	}
	if saves[0]["scoreRaw"] != 70.0 {
		t.Errorf("score not sent: %v", saves[0])
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.progress[1] != 12 || f.status[1] != "COMPLETED" {
		t.Errorf("AniList now %s at %d, want COMPLETED at 12", f.status[1], f.progress[1])
	}
}

// A show removed offline leaves the list, and AniList's when it's back.
func TestPendingDelete(t *testing.T) {
	p, f := newPendingTest(t)
	ctx := context.Background()
	p.mu.Lock()
	p.fetchedAt["ANIME"] = time.Now().Add(-time.Hour)
	p.mu.Unlock()
	if err := p.DeleteEntry(ctx, 1); err != nil {
		t.Fatalf("DeleteEntry offline: %v", err)
	}
	if cached(p, "ANIME").Find(1) != nil || p.PendingCount() != 1 {
		t.Fatal("deleted entry still shown, or not kept")
	}
	f.set(func() { f.down = false })
	if left, err := p.SyncPending(ctx); left != 0 || err != nil {
		t.Fatalf("SyncPending = %d, %v", left, err)
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.deletes != 1 || len(f.status) != 0 {
		t.Errorf("deletes %d, list %v", f.deletes, f.status)
	}
}
