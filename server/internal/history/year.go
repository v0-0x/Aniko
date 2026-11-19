package history

import (
	"sort"
	"time"
)

// YearReview is a calendar year of what was watched in Aniko (the Year in
// review page). It counts like Monthly: an episode is finished when watched
// past finished of its length, the minutes are what was seen of each, and
// an episode counts on the day it was last watched (the history keeps one
// position per episode).
type YearReview struct {
	Year int `json:"year"`
	// The years with any history, the oldest first: the page's year picker.
	Years    []int `json:"years"`
	Episodes int   `json:"episodes"`
	Minutes  int   `json:"minutes"`
	// How many days something was watched on.
	Days int `json:"days"`
	// January to December.
	Months []Month `json:"months"`
	// The day with the most watched (the longest binge); nil in a year
	// with nothing.
	Busiest *Day `json:"busiest"`
	// The first and the last episode of the year: of those finished, or
	// of those started when none was.
	First *Watched `json:"first"`
	Last  *Watched `json:"last"`
	// Every anime watched that year, the most watched first.
	Shows []Show `json:"shows"`
}

type Day struct {
	Date     string `json:"date"` // "2026-03-14"
	Episodes int    `json:"episodes"`
	Minutes  int    `json:"minutes"`
	// The anime watched most that day.
	MediaID int `json:"mediaId"`
}

type Watched struct {
	MediaID int   `json:"mediaId"`
	Episode int   `json:"episode"`
	At      int64 `json:"at"` // unix seconds
}

type Show struct {
	MediaID  int `json:"mediaId"`
	Episodes int `json:"episodes"`
	Minutes  int `json:"minutes"`
}

// What was watched of something: episodes finished, and minutes.
type tally struct {
	episodes int
	minutes  float64
}

func (t *tally) add(finished bool, minutes float64) {
	if finished {
		t.episodes++
	}
	t.minutes += minutes
}

// more reports whether t is more watched than o: by the time, then by the
// episodes finished.
func (t tally) more(o tally) bool {
	if t.minutes != o.minutes {
		return t.minutes > o.minutes
	}
	return t.episodes > o.episodes
}

func whole(minutes float64) int { return int(minutes + 0.5) }

// Year is the year's review, in loc's calendar.
func (s *Store) Year(year int, finished float64, loc *time.Location) (*YearReview, error) {
	start := time.Date(year, 1, 1, 0, 0, 0, 0, loc).Unix()
	end := time.Date(year+1, 1, 1, 0, 0, 0, 0, loc).Unix()
	out := &YearReview{Year: year, Years: []int{}, Months: make([]Month, 12), Shows: []Show{}}
	for i := range out.Months {
		out.Months[i].Month = time.Date(year, time.Month(i+1), 1, 0, 0, 0, 0, loc).Format("2006-01")
	}

	// The whole history in one pass (a row per episode ever watched: small),
	// in the order it was watched: the other years are only noted.
	rows, err := s.db.Query(`SELECT media_id, episode, position, duration, updated_at FROM watch_history WHERE updated_at > 0 ORDER BY updated_at, media_id, episode`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	type day struct {
		tally
		shows map[int]*tally
	}
	var total tally
	months := make([]tally, 12)
	days := map[string]*day{}
	shows := map[int]*tally{}
	years := map[int]bool{}
	// The first and the last finished, and the first and the last at all.
	var firstDone, lastDone, firstAny, lastAny *Watched
	for rows.Next() {
		var media, ep int
		var pos, dur float64
		var at int64
		if err := rows.Scan(&media, &ep, &pos, &dur, &at); err != nil {
			return nil, err
		}
		if at < start || at >= end {
			years[time.Unix(at, 0).In(loc).Year()] = true
			continue
		}
		years[year] = true
		t := time.Unix(at, 0).In(loc)
		done := dur > 0 && pos/dur >= finished
		minutes := pos / 60
		if done {
			minutes = dur / 60
		}

		total.add(done, minutes)
		months[int(t.Month())-1].add(done, minutes)
		key := t.Format("2006-01-02")
		d := days[key]
		if d == nil {
			d = &day{shows: map[int]*tally{}}
			days[key] = d
		}
		d.add(done, minutes)
		if d.shows[media] == nil {
			d.shows[media] = &tally{}
		}
		d.shows[media].add(done, minutes)
		if shows[media] == nil {
			shows[media] = &tally{}
		}
		shows[media].add(done, minutes)

		w := &Watched{MediaID: media, Episode: ep, At: at}
		if firstAny == nil {
			firstAny = w
		}
		lastAny = w
		if done {
			if firstDone == nil {
				firstDone = w
			}
			lastDone = w
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	for y := range years {
		out.Years = append(out.Years, y)
	}
	sort.Ints(out.Years)

	out.Episodes, out.Minutes, out.Days = total.episodes, whole(total.minutes), len(days)
	for i, m := range months {
		out.Months[i].Episodes, out.Months[i].Minutes = m.episodes, whole(m.minutes)
	}

	// The busiest day: the earliest of those as busy.
	busiest := ""
	for key, d := range days {
		if busiest == "" || d.more(days[busiest].tally) || (!days[busiest].more(d.tally) && key < busiest) {
			busiest = key
		}
	}
	if busiest != "" {
		d := days[busiest]
		out.Busiest = &Day{Date: busiest, Episodes: d.episodes, Minutes: whole(d.minutes)}
		for id, t := range d.shows {
			top := d.shows[out.Busiest.MediaID]
			if top == nil || t.more(*top) || (!top.more(*t) && id < out.Busiest.MediaID) {
				out.Busiest.MediaID = id
			}
		}
	}

	out.First, out.Last = firstDone, lastDone
	if firstDone == nil {
		out.First, out.Last = firstAny, lastAny
	}

	ids := make([]int, 0, len(shows))
	for id := range shows {
		ids = append(ids, id)
	}
	sort.Slice(ids, func(i, j int) bool {
		a, b := shows[ids[i]], shows[ids[j]]
		if a.more(*b) || b.more(*a) {
			return a.more(*b)
		}
		return ids[i] < ids[j]
	})
	for _, id := range ids {
		out.Shows = append(out.Shows, Show{MediaID: id, Episodes: shows[id].episodes, Minutes: whole(shows[id].minutes)})
	}
	return out, nil
}
