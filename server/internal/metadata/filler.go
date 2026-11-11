package metadata

import (
	"context"
	"fmt"
	"log"
	"sort"
	"strconv"
	"sync"
	"time"

	"github.com/v0-0x/Aniko/server/internal/util"
)

// Filler lists an anime's filler and recap episodes (by number), as
// MyAnimeList marks them, from Jikan. Empty lists when unknown.
type Filler struct {
	Filler []int `json:"filler"`
	Recap  []int `json:"recap"`
}

// Jikan (MyAnimeList's public API) and the pause between two requests to
// it: it allows about 3 a second and 60 a minute (tests change both).
var (
	jikanAPI   = "https://api.jikan.moe/v4"
	jikanPause = 1100 * time.Millisecond
)

// jikanGate makes every request to Jikan wait its turn, one at a time,
// a pause apart, whichever anime asks.
var jikanGate struct {
	sync.Mutex
	last time.Time
}

// jikanMaxPages caps a fetch (100 episodes a page: enough for any show).
const jikanMaxPages = 40

// jikanTries: how often one page is asked for before the fetch fails.
const jikanTries = 3

func fillerKey(malID int) string     { return "filler2:" + strconv.Itoa(malID) } // 2: Anime Filler List too (an empty answer kept before it is dropped)
func fillerMissKey(malID int) string { return "filler2-miss:" + strconv.Itoa(malID) }

// fillerMissFor: after Jikan fails for an anime, it isn't asked again for
// a while.
const fillerMissFor = 15 * time.Minute

// Filler returns the filler and recap episodes of an anime by its MAL id:
// what's kept, else from Jikan (pages one at a time, the fetch shared by
// whoever asks meanwhile). airing keeps it a day, a finished show a week.
// Failures give empty lists (or a stale copy) with the error.
func (s *Service) Filler(ctx context.Context, malID int, airing bool, titles ...string) (Filler, error) {
	empty := Filler{Filler: []int{}, Recap: []int{}}
	if malID <= 0 {
		return empty, nil
	}
	var f Filler
	if s.db.GetCache(fillerKey(malID), &f) {
		return f, nil
	}
	stale := func(err error) (Filler, error) {
		if s.db.GetStaleCache(fillerKey(malID), &f) {
			return f, err
		}
		return empty, err
	}
	var missed bool
	if s.db.GetCache(fillerMissKey(malID), &missed) {
		return stale(nil)
	}

	// One fetch per anime: the others wait for it.
	s.mu.Lock()
	if s.fillerWait == nil {
		s.fillerWait = map[int]chan struct{}{}
	}
	if ch, ok := s.fillerWait[malID]; ok {
		s.mu.Unlock()
		select {
		case <-ch:
		case <-ctx.Done():
			return stale(ctx.Err())
		}
		if s.db.GetCache(fillerKey(malID), &f) {
			return f, nil
		}
		return stale(nil)
	}
	ch := make(chan struct{})
	s.fillerWait[malID] = ch
	s.mu.Unlock()

	// The fetch carries on if the page asking goes away (the next one finds
	// it kept): on the app's context, not the request's.
	base := s.Ctx
	if base == nil {
		base = ctx
	}
	type result struct {
		f   Filler
		err error
	}
	done := make(chan result, 1)
	go func() {
		defer func() {
			s.mu.Lock()
			delete(s.fillerWait, malID)
			s.mu.Unlock()
			close(ch)
		}()
		fctx, cancel := context.WithTimeout(base, 2*time.Minute)
		defer cancel()
		got, err := fetchFillerList(fctx, titles)
		if err != nil {
			got, err = fetchFiller(fctx, malID)
		}
		if err != nil {
			s.db.SetCache(fillerMissKey(malID), true, fillerMissFor)
		} else {
			ttl := 7 * 24 * time.Hour
			if airing {
				ttl = 24 * time.Hour
			}
			s.db.SetCache(fillerKey(malID), got, ttl)
		}
		done <- result{got, err}
	}()
	select {
	case r := <-done:
		if r.err != nil {
			return stale(r.err)
		}
		return r.f, nil
	case <-ctx.Done():
		return stale(ctx.Err())
	}
}

type jikanEpisodes struct {
	Data []struct {
		MalID  int  `json:"mal_id"`
		Filler bool `json:"filler"`
		Recap  bool `json:"recap"`
	} `json:"data"`
	Pagination struct {
		HasNextPage bool `json:"has_next_page"`
	} `json:"pagination"`
}

// fetchFiller asks Jikan for every page of an anime's episodes.
func fetchFiller(ctx context.Context, malID int) (Filler, error) {
	out := Filler{Filler: []int{}, Recap: []int{}}
	for page := 1; page <= jikanMaxPages; page++ {
		var resp jikanEpisodes
		// Jikan often answers a busy 429 or 5xx: a long show's dozen pages
		// would rarely all get through on the first try.
		var err error
		for try := 0; try < jikanTries; try++ {
			if try > 0 {
				if err := sleepCtx(ctx, time.Duration(try)*2*jikanPause); err != nil {
					return Filler{Filler: []int{}, Recap: []int{}}, err
				}
			}
			if err = jikanGet(ctx, fmt.Sprintf("%s/anime/%d/episodes?page=%d", jikanAPI, malID, page), &resp); err == nil {
				break
			}
		}
		if err != nil {
			return Filler{Filler: []int{}, Recap: []int{}}, fmt.Errorf("page %d: %w", page, err)
		}
		for _, e := range resp.Data {
			if e.MalID <= 0 {
				continue
			}
			if e.Filler {
				out.Filler = append(out.Filler, e.MalID)
			}
			if e.Recap {
				out.Recap = append(out.Recap, e.MalID)
			}
		}
		if !resp.Pagination.HasNextPage {
			break
		}
	}
	sort.Ints(out.Filler)
	sort.Ints(out.Recap)
	log.Printf("filler: MAL %d: %d filler, %d recap", malID, len(out.Filler), len(out.Recap))
	return out, nil
}

func sleepCtx(ctx context.Context, d time.Duration) error {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-t.C:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

// jikanGet is one request to Jikan, in its turn.
func jikanGet(ctx context.Context, url string, out any) error {
	jikanGate.Lock()
	defer jikanGate.Unlock()
	if wait := time.Until(jikanGate.last.Add(jikanPause)); wait > 0 {
		t := time.NewTimer(wait)
		select {
		case <-t.C:
		case <-ctx.Done():
			t.Stop()
			return ctx.Err()
		}
	}
	defer func() { jikanGate.last = time.Now() }()
	rctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	return util.GetJSON(rctx, url, nil, out)
}
