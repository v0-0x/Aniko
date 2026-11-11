package metadata

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"reflect"
	"sync/atomic"
	"testing"
	"time"

	"github.com/v0-0x/Aniko/server/internal/util"
)

// fakeJikan serves an anime's episodes in pages of two: 1..5, with 2 and 4
// filler and 3 a recap.
func fakeJikan(t *testing.T, fail bool) (*int32, func()) {
	t.Helper()
	var hits int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&hits, 1)
		if fail {
			http.Error(w, "too many requests", http.StatusTooManyRequests)
			return
		}
		if r.URL.Path != "/anime/21/episodes" {
			http.NotFound(w, r)
			return
		}
		page := r.URL.Query().Get("page")
		switch page {
		case "1":
			fmt.Fprint(w, `{"data":[{"mal_id":1,"filler":false,"recap":false},{"mal_id":2,"filler":true,"recap":false}],"pagination":{"has_next_page":true}}`)
		case "2":
			fmt.Fprint(w, `{"data":[{"mal_id":3,"filler":false,"recap":true},{"mal_id":4,"filler":true,"recap":false}],"pagination":{"has_next_page":true}}`)
		case "3":
			fmt.Fprint(w, `{"data":[{"mal_id":5,"filler":false,"recap":false}],"pagination":{"has_next_page":false}}`)
		default:
			t.Errorf("asked for page %q", page)
			http.NotFound(w, r)
		}
	}))
	oldAPI, oldPause, oldHTTP := jikanAPI, jikanPause, util.HTTP
	jikanAPI, jikanPause, util.HTTP = srv.URL, time.Millisecond, srv.Client() // util.HTTP refuses local addresses
	return &hits, func() {
		srv.Close()
		jikanAPI, jikanPause, util.HTTP = oldAPI, oldPause, oldHTTP
	}
}

// Every page is read, one at a time; the second ask is kept.
func TestFillerPagesAndCache(t *testing.T) {
	hits, done := fakeJikan(t, false)
	defer done()
	s := testService(t)
	f, err := s.Filler(context.Background(), 21, false)
	if err != nil {
		t.Fatal(err)
	}
	want := Filler{Filler: []int{2, 4}, Recap: []int{3}}
	if !reflect.DeepEqual(f, want) {
		t.Errorf("Filler = %+v, want %+v", f, want)
	}
	if n := atomic.LoadInt32(hits); n != 3 {
		t.Errorf("%d requests, want 3 (one a page)", n)
	}
	f, err = s.Filler(context.Background(), 21, false)
	if err != nil || !reflect.DeepEqual(f, want) {
		t.Errorf("Filler again = %+v, %v; want %+v", f, err, want)
	}
	if n := atomic.LoadInt32(hits); n != 3 {
		t.Errorf("%d requests after a second ask, want 3 (kept)", n)
	}
}

// Jikan failing (or not reachable): empty lists, the error, and not asked
// again right away.
func TestFillerFailure(t *testing.T) {
	hits, done := fakeJikan(t, true)
	defer done()
	s := testService(t)
	f, err := s.Filler(context.Background(), 21, true)
	if err == nil {
		t.Error("no error from a failing Jikan")
	}
	if f.Filler == nil || f.Recap == nil || len(f.Filler)+len(f.Recap) != 0 {
		t.Errorf("Filler = %+v, want empty (non-nil) lists", f)
	}
	if _, err := s.Filler(context.Background(), 21, true); err != nil {
		t.Errorf("second ask after a failure: %v (want none, not asked)", err)
	}
	if n := atomic.LoadInt32(hits); n != jikanTries {
		t.Errorf("%d requests, want %d (tried again, then the failure remembered)", n, jikanTries)
	}
	// No MAL id: nothing asked.
	if f, err := s.Filler(context.Background(), 0, false); err != nil || len(f.Filler) != 0 || f.Filler == nil {
		t.Errorf("Filler(0) = %+v, %v", f, err)
	}
}

// The pause holds between two requests.
func TestJikanPause(t *testing.T) {
	_, done := fakeJikan(t, false)
	defer done()
	jikanPause = 30 * time.Millisecond
	start := time.Now()
	if _, err := fetchFiller(context.Background(), 21); err != nil {
		t.Fatal(err)
	}
	// Three pages: at least two pauses.
	if d := time.Since(start); d < 60*time.Millisecond {
		t.Errorf("three pages in %v, want at least two pauses", d)
	}
}
