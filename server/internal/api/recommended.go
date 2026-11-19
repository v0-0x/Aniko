package api

import (
	"net/http"
	"sort"

	"github.com/v0-0x/Nyakuro/server/internal/anilist"
)

// "Because you watched X" on Discover: AniList's recommendations for an
// anime of the list, without what's on the list already.
type recommendedRow struct {
	Because *anilist.Media   `json:"because"`
	Items   []*anilist.Media `json:"items"`
	// Next is where to start the time after (?n=), so another anime of the
	// list is recommended from each time Discover opens.
	Next int `json:"next"`
}

// recommendSeeds are the anime to recommend from, the first to try first:
// what was finished or is being watched, the last touched first.
func recommendSeeds(entries []*anilist.ListEntry) []*anilist.ListEntry {
	var out []*anilist.ListEntry
	for _, e := range entries {
		if e.Media != nil && (e.Status == "COMPLETED" || e.Status == "CURRENT" || e.Status == "REPEATING") {
			out = append(out, e)
		}
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].UpdatedAt > out[j].UpdatedAt })
	return out
}

// recommendedFor is what an anime's recommendations leave once what's on
// the list (onList) is taken out, and adult ones unless they're shown.
func recommendedFor(m *anilist.Media, onList map[int]bool, adult bool) []*anilist.Media {
	out := []*anilist.Media{}
	if m == nil || m.Recommendations == nil {
		return out
	}
	seen := map[int]bool{}
	for _, n := range m.Recommendations.Nodes {
		r := n.MediaRecommendation
		if r == nil || onList[r.ID] || seen[r.ID] || (r.IsAdult && !adult) {
			continue
		}
		seen[r.ID] = true
		out = append(out, r)
	}
	return out
}

// One row: from the n-th of the anime watched (?n=, going round them; the
// last touched is the first), or the first after it that has enough to
// recommend; a few are tried (each is one lookup, kept like the anime's page).
func (s *Server) recommended(r *http.Request) (any, error) {
	rows := []recommendedRow{}
	c, err := s.app.Platform.Collection(r.Context(), "ANIME", false)
	if err != nil || c == nil {
		return rows, nil
	}
	entries := c.Entries()
	onList := map[int]bool{}
	for _, e := range entries {
		onList[e.MediaID] = true
	}
	adult := s.app.Settings.Get().UI.ShowAdult
	seeds := recommendSeeds(entries)
	if len(seeds) == 0 {
		return rows, nil
	}
	start := queryInt(r, "n")
	if start < 0 {
		start = 0
	}
	for try := 0; try < 4 && try < len(seeds); try++ {
		at := (start + try) % len(seeds)
		e := seeds[at]
		m, err := s.app.Platform.Media(r.Context(), e.MediaID, false)
		if err != nil {
			continue
		}
		if items := recommendedFor(m, onList, adult); len(items) >= 4 {
			rows = append(rows, recommendedRow{Because: e.Media, Items: items, Next: (at + 1) % len(seeds)})
			break
		}
	}
	return rows, nil
}
