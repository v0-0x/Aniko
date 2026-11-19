package manga

import (
	"path/filepath"
	"testing"
	"time"

	"github.com/v0-0x/Nyakuro/server/internal/db"
	"github.com/v0-0x/Nyakuro/server/internal/extensions"
)

// The last chapter known of a manga: the highest of its kept chapter lists,
// any provider's, also once they've gone stale; none for one never opened.
func TestLatestChapters(t *testing.T) {
	d, err := db.Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	list := func(nums ...string) *ChaptersResult {
		r := &ChaptersResult{}
		for _, n := range nums {
			r.Chapters = append(r.Chapters, extensions.MangaChapter{ID: n, Chapter: n})
		}
		return r
	}
	d.SetCache(chaptersKey("a", 1), list("1", "2", "10.5"), time.Hour)
	d.SetCache(chaptersKey("b", 1), list("1", "12", "extra"), time.Hour)
	// Stale: kept all the same.
	d.SetCache(chaptersKey("a", 2), list("7"), time.Nanosecond)
	time.Sleep(1100 * time.Millisecond)
	got := latestChapters(d, []string{"a", "b"}, []int{1, 2, 3})
	if got[1] != 12 || got[2] != 7 {
		t.Fatalf("latest: %v", got)
	}
	if _, ok := got[3]; ok {
		t.Fatalf("a manga never opened has one: %v", got)
	}
}
