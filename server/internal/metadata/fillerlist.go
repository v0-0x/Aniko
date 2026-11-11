package metadata

import (
	"context"
	"errors"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/v0-0x/Aniko/server/internal/util"
)

// Anime Filler List (animefillerlist.com): one page per long-running show,
// found by its name, with its filler episodes as ranges. Tried before
// Jikan, which takes a dozen slow pages for a show like One Piece and
// often doesn't answer at all.
var fillerListSite = "https://www.animefillerlist.com"

var errNoFillerList = errors.New("not on Anime Filler List")

var (
	fillerListRow = regexp.MustCompile(`<div class="filler"><span class="Label">[^<]*</span><span class="Episodes">(.*?)</span></div>`)
	fillerListEps = regexp.MustCompile(`>\s*([0-9]+)(?:\s*-\s*([0-9]+))?\s*</a>`)
	slugJunk      = regexp.MustCompile(`[^a-z0-9]+`)
)

// fillerSlug: "Naruto: Shippuden" → "naruto-shippuden", as the site names
// its pages.
func fillerSlug(title string) string {
	return strings.Trim(slugJunk.ReplaceAllString(strings.ToLower(title), "-"), "-")
}

// fetchFillerList looks the show up by each of its titles in turn.
func fetchFillerList(ctx context.Context, titles []string) (Filler, error) {
	seen := map[string]bool{}
	for _, t := range titles {
		if len(seen) == 4 { // English, romaji and a couple of other names: enough
			break
		}
		slug := fillerSlug(t)
		if slug == "" || seen[slug] {
			continue
		}
		seen[slug] = true
		rctx, cancel := context.WithTimeout(ctx, 20*time.Second)
		page, err := util.GetBytes(rctx, fillerListSite+"/shows/"+slug, nil)
		cancel()
		if err != nil {
			if ctx.Err() != nil {
				return Filler{}, ctx.Err()
			}
			continue // not there under this name (404), or the site failing
		}
		if f, ok := parseFillerList(string(page)); ok {
			return f, nil
		}
	}
	return Filler{}, errNoFillerList
}

// parseFillerList reads the "Filler Episodes" row; ok is false without one.
func parseFillerList(page string) (Filler, bool) {
	m := fillerListRow.FindStringSubmatch(page)
	if m == nil {
		return Filler{}, false
	}
	out := Filler{Filler: []int{}, Recap: []int{}}
	for _, r := range fillerListEps.FindAllStringSubmatch(m[1], -1) {
		from, _ := strconv.Atoi(r[1])
		to := from
		if r[2] != "" {
			to, _ = strconv.Atoi(r[2])
		}
		for n := from; n <= to && n-from < 5000; n++ {
			out.Filler = append(out.Filler, n)
		}
	}
	return out, len(out.Filler) > 0
}
