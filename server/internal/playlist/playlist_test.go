package playlist

import (
	"encoding/json"
	"errors"
	"path/filepath"
	"strconv"
	"testing"
	"time"

	"github.com/v0-0x/Aniko/server/internal/anikohub"
	"github.com/v0-0x/Aniko/server/internal/db"
)

func newStore(t *testing.T) (*Store, *time.Time) {
	t.Helper()
	d, err := db.Open(filepath.Join(t.TempDir(), "aniko.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { d.Close() })
	s := New(d)
	now := time.Unix(1_800_000_000, 0)
	s.now = func() time.Time { return now }
	return s, &now
}

func ep(n int) Item {
	return Item{MediaID: 21, Episode: n, Title: "One Piece", Play: Play{Kind: "local", Path: "/lib/One Piece - " + strconv.Itoa(n) + ".mkv"}}
}

func episodes(p Playlist) []int {
	out := make([]int, len(p.Items))
	for i, it := range p.Items {
		out[i] = it.Episode
	}
	return out
}

func same(a, b []int) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func TestCreateAddRenameDelete(t *testing.T) {
	s, _ := newStore(t)
	changes := 0
	s.OnChange = func() { changes++ }
	p, err := s.Create("  Binge  night ", []Item{ep(1)})
	if err != nil || p.ID == "" || p.Name != "Binge night" || len(p.Items) != 1 || p.At <= 0 {
		t.Fatalf("create: %+v %v", p, err)
	}
	if _, err := s.Create(" ", nil); !errors.Is(err, ErrInvalid) {
		t.Fatalf("empty name: %v", err)
	}
	if _, err := s.Create("x", []Item{{MediaID: 1, Episode: 1, Play: Play{Kind: "local"}}}); !errors.Is(err, ErrInvalid) {
		t.Fatalf("item without a path: %v", err)
	}
	if _, err := s.Create("x", []Item{{MediaID: 1, Episode: 1, Play: Play{Kind: "mpv", Path: "/a"}}}); !errors.Is(err, ErrInvalid) {
		t.Fatalf("unknown kind: %v", err)
	}
	stream := Item{MediaID: 5, Episode: 2, Title: "Bleach", Play: Play{Kind: "stream", Provider: "animepahe", Dub: true}}
	p, err = s.Add(p.ID, []Item{ep(2), stream})
	if err != nil || !same(episodes(p), []int{1, 2, 2}) || p.Items[2].Play.Provider != "animepahe" || !p.Items[2].Play.Dub {
		t.Fatalf("add: %+v %v", p, err)
	}
	if _, err := s.Add("nope", []Item{ep(3)}); !errors.Is(err, ErrNotFound) {
		t.Fatalf("add to none: %v", err)
	}
	p, err = s.Rename(p.ID, "Weekend")
	if err != nil || p.Name != "Weekend" {
		t.Fatalf("rename: %+v %v", p, err)
	}
	b, _ := s.Create("another", nil)
	list, err := s.List()
	if err != nil || len(list) != 2 || list[0].ID != b.ID || list[1].Name != "Weekend" {
		t.Fatalf("list (by name): %+v %v", list, err)
	}
	if b.Items == nil {
		t.Fatal("items null, not empty")
	}
	if err := s.Delete(p.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Get(p.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("deleted: %v", err)
	}
	if err := s.Delete(p.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("deleted twice: %v", err)
	}
	if changes != 5 {
		t.Fatalf("%d changes told, want 5", changes)
	}
}

func TestMoveAndRemove(t *testing.T) {
	s, now := newStore(t)
	p, _ := s.Create("p", []Item{ep(1), ep(2), ep(3), ep(4)})
	at := p.At
	steps := []struct {
		index, to int
		want      []int
	}{
		{0, 1, []int{2, 1, 3, 4}}, // down
		{3, 2, []int{2, 1, 4, 3}}, // up
		{0, 3, []int{1, 4, 3, 2}}, // to the end
		{3, 0, []int{2, 1, 4, 3}}, // to the start
		{2, 2, []int{2, 1, 4, 3}}, // nowhere
	}
	for _, st := range steps {
		got, err := s.Move(p.ID, st.index, st.to)
		if err != nil || !same(episodes(got), st.want) {
			t.Fatalf("move %d to %d: %v %v, want %v", st.index, st.to, episodes(got), err, st.want)
		}
		// Each change newer than the one before, also within a second.
		if got.At <= at {
			t.Fatalf("at %d after %d", got.At, at)
		}
		at = got.At
	}
	for _, bad := range [][2]int{{-1, 0}, {0, 4}, {4, 0}} {
		if _, err := s.Move(p.ID, bad[0], bad[1]); !errors.Is(err, ErrInvalid) {
			t.Fatalf("move %v: %v", bad, err)
		}
	}
	got, err := s.Remove(p.ID, 1)
	if err != nil || !same(episodes(got), []int{2, 4, 3}) {
		t.Fatalf("remove: %v %v", episodes(got), err)
	}
	got, err = s.Remove(p.ID, 2)
	if err != nil || !same(episodes(got), []int{2, 4}) {
		t.Fatalf("remove last: %v %v", episodes(got), err)
	}
	if _, err := s.Remove(p.ID, 2); !errors.Is(err, ErrInvalid) {
		t.Fatalf("remove past the end: %v", err)
	}
	*now = now.Add(time.Hour)
	got, _ = s.Remove(p.ID, 0)
	if got.At != now.Unix()*1000 {
		t.Fatalf("at %d, want now", got.At)
	}
}

func TestBlob(t *testing.T) {
	s, now := newStore(t)
	p, _ := s.Create("Here", []Item{ep(1)})
	gone, _ := s.Create("Gone", nil)
	_ = s.Delete(gone.ID)
	b := s.Blob()
	var it item
	if raw, ok := b.Items[p.ID]; !ok || json.Unmarshal(raw, &it) != nil || it.Name != "Here" || len(it.Items) != 1 || it.At != p.At {
		t.Fatalf("own blob: %s", b.Items[p.ID])
	}
	if raw := b.Items[gone.ID]; json.Unmarshal(raw, &it) != nil || !it.Deleted {
		t.Fatalf("removal: %s", raw)
	}
	if b.UpdatedAt < p.At {
		t.Fatalf("updatedAt %d", b.UpdatedAt)
	}

	// Another device's blob through the hub: a newer version of Here, a
	// new one, an older version of Gone (stays gone), a removal of one
	// never here, and junk.
	later := p.At + 5000
	at := func(n int64) string { return strconv.FormatInt(n, 10) }
	hub := anikohub.Blob{Items: map[string]json.RawMessage{
		p.ID:      json.RawMessage(`{"at":` + at(later) + `,"name":"Here (TV)","items":[{"mediaId":21,"episode":2,"title":"One Piece","play":{"kind":"local","path":"/b.mkv"}}]}`),
		"0a1b":    json.RawMessage(`{"at":` + at(later) + `,"name":"New","items":[]}`),
		gone.ID:   json.RawMessage(`{"at":` + at(gone.At-1000) + `,"name":"Gone","items":[]}`),
		"ffff":    json.RawMessage(`{"at":` + at(later) + `,"deleted":true}`),
		"bad:key": json.RawMessage(`{"at":` + at(later) + `,"name":"x"}`),
		"cafe":    json.RawMessage(`{"at":` + at(later) + `,"name":"bad item","items":[{"mediaId":0}]}`),
	}}
	if !s.Apply(hub) {
		t.Fatal("nothing changed")
	}
	if got, _ := s.Get(p.ID); got.Name != "Here (TV)" || !same(episodes(got), []int{2}) || got.At != later {
		t.Fatalf("Here after: %+v", got)
	}
	if got, err := s.Get("0a1b"); err != nil || got.Name != "New" {
		t.Fatalf("New after: %+v %v", got, err)
	}
	if _, err := s.Get(gone.ID); !errors.Is(err, ErrNotFound) {
		t.Fatal("an older version brought Gone back")
	}
	for _, id := range []string{"bad:key", "cafe"} {
		if _, err := s.Get(id); !errors.Is(err, ErrNotFound) {
			t.Fatalf("%s taken", id)
		}
	}
	if s.Apply(hub) {
		t.Fatal("the same blob again changed something")
	}
	// A change here after the hub's is newer than it.
	got, _ := s.Rename(p.ID, "Mine")
	if got.At <= later {
		t.Fatalf("at %d not after the hub's %d", got.At, later)
	}
	// Removed on another device, later: removed here.
	*now = now.Add(time.Minute)
	if !s.Apply(anikohub.Blob{Items: map[string]json.RawMessage{p.ID: json.RawMessage(`{"at":` + at(now.Unix()*1000) + `,"deleted":true}`)}}) {
		t.Fatal("removal changed nothing")
	}
	if _, err := s.Get(p.ID); !errors.Is(err, ErrNotFound) {
		t.Fatal("still here")
	}
	if raw := s.Blob().Items[p.ID]; json.Unmarshal(raw, &it) != nil || !it.Deleted {
		t.Fatalf("removal not remembered: %s", raw)
	}
}
