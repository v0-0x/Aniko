package metadata

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/v0-0x/Aniko/server/internal/util"
)

func TestFillerList(t *testing.T) {
	if got := fillerSlug("Naruto: Shippuden"); got != "naruto-shippuden" {
		t.Errorf("slug = %q", got)
	}
	page, err := os.ReadFile("testdata/fillerlist-one-piece.html") // the site's own "Filler Episodes" row
	if err != nil {
		t.Fatal(err)
	}
	f, ok := parseFillerList(string(page))
	if !ok || f.Filler[0] != 54 || !has(f.Filler, 60) || has(f.Filler, 61) || !has(f.Filler, 102) || !has(f.Filler, 143) || len(f.Filler) < 80 {
		t.Fatalf("One Piece = %v (%v), want 54-60, 102, 131-143 …, not 61 (mixed)", f.Filler[:10], ok)
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/shows/one-piece" {
			w.Write(page)
			return
		}
		http.NotFound(w, r)
	}))
	defer srv.Close()
	old, oldHTTP := fillerListSite, util.HTTP
	fillerListSite, util.HTTP = srv.URL, srv.Client() // util.HTTP refuses local addresses
	defer func() { fillerListSite, util.HTTP = old, oldHTTP }()

	// The romaji name 404s; the English one is there.
	got, err := fetchFillerList(context.Background(), []string{"Wan Pīsu", "One Piece"})
	if err != nil || !has(got.Filler, 54) {
		t.Fatalf("fetchFillerList = %v, %v", got.Filler, err)
	}
	if _, err := fetchFillerList(context.Background(), []string{"Frieren"}); err == nil {
		t.Error("a show the site doesn't have gave no error")
	}
	// Through the service: no Jikan request needed (fakeJikan swaps util.HTTP
	// for its own server: put the list's back).
	hits, done := fakeJikan(t, true)
	defer done()
	util.HTTP = srv.Client()
	s := testService(t)
	if f, err := s.Filler(context.Background(), 21, true, "One Piece"); err != nil || !has(f.Filler, 54) || *hits != 0 {
		t.Errorf("Filler = %v, %v; Jikan asked %d times", f.Filler[:3], err, *hits)
	}
}

func has(ns []int, n int) bool {
	for _, x := range ns {
		if x == n {
			return true
		}
	}
	return false
}
