package api

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/v0-0x/Nyakuro/server/internal/anilist"
)

// Saved and recent searches are kept on the server, cleaned as they come:
// a deleted one is gone, a query isn't kept twice, and no more than fit.
func TestSearchesKept(t *testing.T) {
	s := newTestServer(t)
	get := func() searches {
		w := do(s, "GET", "/api/searches", "127.0.0.1:1", "", nil)
		var v searches
		if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &v) != nil {
			t.Fatalf("get: %d %s", w.Code, w.Body)
		}
		return v
	}
	if v := get(); v.Saved == nil || v.Recent == nil || len(v.Saved)+len(v.Recent) != 0 {
		t.Fatalf("empty at first, as lists: %+v", v)
	}
	body := `{"saved":[{"id":"a","name":" Isekai, 80+ ","query":"?genre=Action&score=80"},{"id":"a","name":"twice","query":"q=x"},{"id":"b","name":"","query":"q=y"}],
		"recent":[{"query":"q=naruto","at":2},{"query":"q=naruto","at":1},{"query":"","at":3}]}`
	if w := do(s, "PUT", "/api/searches", "127.0.0.1:1", body, nil); w.Code != 200 {
		t.Fatalf("put: %d %s", w.Code, w.Body)
	}
	v := get()
	if len(v.Saved) != 1 || v.Saved[0].Name != "Isekai, 80+" || v.Saved[0].Query != "genre=Action&score=80" {
		t.Fatalf("saved: %+v", v.Saved)
	}
	if len(v.Recent) != 1 || v.Recent[0].At != 2 {
		t.Fatalf("recent: %+v", v.Recent)
	}
	// Deleted on a device: the whole is sent without it.
	if w := do(s, "PUT", "/api/searches", "127.0.0.1:1", `{"saved":[],"recent":[]}`, nil); w.Code != 200 {
		t.Fatalf("clear: %d", w.Code)
	}
	if v := get(); len(v.Saved)+len(v.Recent) != 0 {
		t.Fatalf("after deleting: %+v", v)
	}
	// No more than fit.
	var many []string
	for i := 0; i < 30; i++ {
		many = append(many, `{"query":"q=`+strings.Repeat("a", i+1)+`","at":1}`)
	}
	do(s, "PUT", "/api/searches", "127.0.0.1:1", `{"recent":[`+strings.Join(many, ",")+`]}`, nil)
	if v := get(); len(v.Recent) != maxRecentSearch {
		t.Fatalf("recent kept: %d", len(v.Recent))
	}
}

// What's recommended from an anime: not what's on the list, nor twice, nor
// adult ones unless they're shown; from the anime touched last.
func TestRecommendedFor(t *testing.T) {
	m := &anilist.Media{ID: 1}
	raw := `{"nodes":[{"mediaRecommendation":{"id":2}},{"mediaRecommendation":{"id":3}},{"mediaRecommendation":null},{"mediaRecommendation":{"id":3}},{"mediaRecommendation":{"id":4,"isAdult":true}},{"mediaRecommendation":{"id":5}}]}`
	if err := json.Unmarshal([]byte(raw), &m.Recommendations); err != nil {
		t.Fatal(err)
	}
	ids := func(ms []*anilist.Media) (out []int) {
		for _, x := range ms {
			out = append(out, x.ID)
		}
		return
	}
	if got := ids(recommendedFor(m, map[int]bool{2: true}, false)); len(got) != 2 || got[0] != 3 || got[1] != 5 {
		t.Fatalf("recommended: %v", got)
	}
	if got := ids(recommendedFor(m, nil, true)); len(got) != 4 {
		t.Fatalf("with adult ones shown: %v", got)
	}
	if got := recommendedFor(&anilist.Media{ID: 9}, nil, true); got == nil || len(got) != 0 {
		t.Fatalf("none: %v", got)
	}
	seeds := recommendSeeds([]*anilist.ListEntry{
		{MediaID: 1, Status: "PLANNING", UpdatedAt: 9, Media: &anilist.Media{ID: 1}},
		{MediaID: 2, Status: "COMPLETED", UpdatedAt: 5, Media: &anilist.Media{ID: 2}},
		{MediaID: 3, Status: "CURRENT", UpdatedAt: 7, Media: &anilist.Media{ID: 3}},
		{MediaID: 4, Status: "COMPLETED", UpdatedAt: 8},
	})
	if len(seeds) != 2 || seeds[0].MediaID != 3 || seeds[1].MediaID != 2 {
		t.Fatalf("seeds: %+v", seeds)
	}
}
