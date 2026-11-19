package anilist

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/v0-0x/Aniko/server/internal/util"
)

const defaultEndpoint = "https://graphql.anilist.co"

var ErrUnauthorized = errors.New("anilist: invalid or expired token")

var errRateLimited = errors.New("anilist: rate limited, try again in a minute")

// Client is a minimal AniList GraphQL client with rate-limit handling.
type Client struct {
	http     *http.Client
	endpoint string
	mu       sync.RWMutex
	token    string
}

func NewClient() *Client {
	return &Client{http: &http.Client{Timeout: 25 * time.Second}, endpoint: defaultEndpoint}
}

// withToken returns a client for the same server that sends token t.
func (c *Client) withToken(t string) *Client {
	n := &Client{http: c.http, endpoint: c.endpoint}
	n.SetToken(t)
	return n
}

func (c *Client) SetToken(t string) {
	c.mu.Lock()
	c.token = strings.TrimSpace(t)
	c.mu.Unlock()
}

func (c *Client) Token() string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.token
}

type gqlError struct {
	Message string `json:"message"`
	Status  int    `json:"status"`
}

type gqlResponse struct {
	Data   json.RawMessage `json:"data"`
	Errors []gqlError      `json:"errors"`
}

// Query runs a GraphQL query; out receives the "data" object.
func (c *Client) Query(ctx context.Context, query string, vars map[string]any, out any) error {
	return c.query(ctx, query, vars, out, true)
}

// QueryAnon runs a query without the user token (public data only).
func (c *Client) QueryAnon(ctx context.Context, query string, vars map[string]any, out any) error {
	return c.query(ctx, query, vars, out, false)
}

func (c *Client) query(ctx context.Context, query string, vars map[string]any, out any, auth bool) error {
	body, err := json.Marshal(map[string]any{"query": query, "variables": vars})
	if err != nil {
		return err
	}
	// Offline mode: not tried (the copies kept are used, changes wait).
	if util.Offline() {
		return fmt.Errorf("anilist: %w", util.ErrOffline)
	}
	const attempts = 4
	for attempt := 0; attempt < attempts; attempt++ {
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.endpoint, bytes.NewReader(body))
		if err != nil {
			return err
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Accept", "application/json")
		req.Header.Set("User-Agent", util.UserAgent)
		if tok := c.Token(); auth && tok != "" {
			req.Header.Set("Authorization", "Bearer "+tok)
		}
		resp, err := c.http.Do(req)
		if err != nil {
			if attempt < 2 && ctx.Err() == nil && sleepCtx(ctx, time.Second) == nil {
				continue
			}
			return fmt.Errorf("anilist: %w", err)
		}
		raw, _ := io.ReadAll(io.LimitReader(resp.Body, 32<<20))
		resp.Body.Close()

		if resp.StatusCode == http.StatusTooManyRequests {
			wait := retryAfter(resp.Header)
			// Waiting is pointless after the last attempt, or when the
			// caller's deadline comes first.
			if attempt == attempts-1 {
				return errRateLimited
			}
			if deadline, ok := ctx.Deadline(); ok && time.Until(deadline) < wait {
				return errRateLimited
			}
			if err := sleepCtx(ctx, wait); err != nil {
				return err
			}
			continue
		}

		var gr gqlResponse
		if err := json.Unmarshal(raw, &gr); err != nil {
			return &StatusError{Status: resp.StatusCode, Msg: "bad response (" + resp.Status + ")"}
		}
		noData := gr.Data == nil || string(gr.Data) == "null"
		if len(gr.Errors) > 0 {
			msg := gr.Errors[0].Message
			if gr.Errors[0].Status == 401 || resp.StatusCode == 401 || strings.Contains(strings.ToLower(msg), "invalid token") {
				return ErrUnauthorized
			}
			if noData {
				status := gr.Errors[0].Status
				if status == 0 {
					status = resp.StatusCode
				}
				return &StatusError{Status: status, Msg: msg}
			}
		}
		if resp.StatusCode == 401 {
			return ErrUnauthorized
		}
		if resp.StatusCode >= 500 && noData {
			return &StatusError{Status: resp.StatusCode, Msg: "bad response (" + resp.Status + ")"}
		}
		if out != nil {
			return json.Unmarshal(gr.Data, out)
		}
		return nil
	}
	return errRateLimited // not reached: the last attempt always returns
}

// StatusError is an error AniList answered with: Status is the one it gave
// the error, else the HTTP status of the answer.
type StatusError struct {
	Status int
	Msg    string
}

func (e *StatusError) Error() string { return "anilist: " + e.Msg }

// Unreachable reports an error of AniList not answering, or not able to
// just now: no network, a timeout, the request cut off, its servers failing
// (5xx) or its limit on requests. The same request may work later. Anything
// else it answered (a 4xx: a bad request, an entry it doesn't have) won't.
func Unreachable(err error) bool {
	if err == nil || errors.Is(err, ErrUnauthorized) {
		return false
	}
	var se *StatusError
	if errors.As(err, &se) {
		return se.Status >= 500 || se.Status == http.StatusRequestTimeout || se.Status == http.StatusTooManyRequests
	}
	// No answer: http.Client.Do fails with a *url.Error (DNS, refused,
	// reset, TLS, timeout), waiting with the context's error.
	var ue *url.Error
	return errors.Is(err, errRateLimited) || errors.Is(err, util.ErrOffline) || errors.As(err, &ue) ||
		errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled)
}

// retryAfter is how long AniList asks us to wait after a 429: Retry-After
// (in seconds), 5s when it's missing, at most 65s.
func retryAfter(h http.Header) time.Duration {
	wait := 5
	if ra, err := strconv.Atoi(strings.TrimSpace(h.Get("Retry-After"))); err == nil && ra > 0 {
		wait = min(ra, 65)
	}
	return time.Duration(wait) * time.Second
}

// sleepCtx waits for d, or until ctx is done (returning its error).
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

// ---------------------------------------------------------------------------
// Queries

const mediaFields = `
	id idMal type format status season seasonYear episodes chapters volumes duration isAdult
	title { romaji english native userPreferred }
	synonyms
	coverImage { extraLarge large medium color }
	bannerImage
	genres
	averageScore meanScore popularity
	countryOfOrigin
	startDate { year month day }
	endDate { year month day }
	nextAiringEpisode { airingAt timeUntilAiring episode }
`

const qViewer = `query { Viewer { id name avatar { large medium } bannerImage options { displayAdultContent } mediaListOptions { scoreFormat } } }`

const qCollection = `query ($userId: Int, $type: MediaType) {
	MediaListCollection(userId: $userId, type: $type, forceSingleCompletedList: true) {
		lists {
			name status isCustomList
			entries {
				id mediaId status progress score(format: POINT_100) repeat notes private updatedAt
				startedAt { year month day } completedAt { year month day }
				media { ` + mediaFields + ` }
			}
		}
	}
}`

const qMedia = `query ($id: Int) {
	Media(id: $id) {
		` + mediaFields + `
		description(asHtml: false)
		source(version: 3)
		siteUrl
		trailer { id site thumbnail }
		streamingEpisodes { title thumbnail url site }
		studios(isMain: true) { nodes { id name } }
		tags { name rank isMediaSpoiler }
		rankings { rank type allTime year season context }
		mediaListEntry { id status progress score(format: POINT_100) repeat }
		relations { edges { relationType(version: 2) node { ` + mediaFields + ` } } }
		recommendations(page: 1, perPage: 12, sort: RATING_DESC) { nodes { mediaRecommendation { ` + mediaFields + ` } } }
		characters(sort: [ROLE, RELEVANCE, ID], perPage: 16) {
			edges { role node { id name { full } image { large } } voiceActors(language: JAPANESE, sort: RELEVANCE) { id name { full } image { large } } }
		}
	}
}`

const qSearch = `query ($page: Int, $perPage: Int, $search: String, $type: MediaType, $genres: [String], $tags: [String], $season: MediaSeason, $seasonYear: Int, $formats: [MediaFormat], $status: MediaStatus, $sort: [MediaSort], $isAdult: Boolean, $ids: [Int],
	$genresNot: [String], $tagsNot: [String], $statuses: [MediaStatus], $country: CountryCode, $sources: [MediaSource], $startAfter: FuzzyDateInt, $startBefore: FuzzyDateInt, $scoreAbove: Int,
	$episodesAbove: Int, $episodesBelow: Int, $chaptersAbove: Int, $chaptersBelow: Int, $onList: Boolean) {
	Page(page: $page, perPage: $perPage) {
		pageInfo { total currentPage lastPage hasNextPage }
		media(search: $search, type: $type, genre_in: $genres, tag_in: $tags, season: $season, seasonYear: $seasonYear, format_in: $formats, status: $status, sort: $sort, isAdult: $isAdult, id_in: $ids,
			genre_not_in: $genresNot, tag_not_in: $tagsNot, status_in: $statuses, countryOfOrigin: $country, source_in: $sources, startDate_greater: $startAfter, startDate_lesser: $startBefore,
			averageScore_greater: $scoreAbove, episodes_greater: $episodesAbove, episodes_lesser: $episodesBelow, chapters_greater: $chaptersAbove, chapters_lesser: $chaptersBelow, onList: $onList) {
			` + mediaFields + `
			description(asHtml: false)
		}
	}
}`

const qSchedule = `query ($page: Int, $start: Int, $end: Int) {
	Page(page: $page, perPage: 50) {
		pageInfo { hasNextPage currentPage }
		airingSchedules(airingAt_greater: $start, airingAt_lesser: $end, sort: TIME) {
			id airingAt timeUntilAiring episode
			media { ` + mediaFields + ` }
		}
	}
}`

const mSaveEntry = `mutation ($mediaId: Int, $status: MediaListStatus, $progress: Int, $scoreRaw: Int, $repeat: Int, $startedAt: FuzzyDateInput, $completedAt: FuzzyDateInput) {
	SaveMediaListEntry(mediaId: $mediaId, status: $status, progress: $progress, scoreRaw: $scoreRaw, repeat: $repeat, startedAt: $startedAt, completedAt: $completedAt) {
		id mediaId status progress score(format: POINT_100) repeat
	}
}`

const mDeleteEntry = `mutation ($id: Int) { DeleteMediaListEntry(id: $id) { deleted } }`

func (c *Client) Viewer(ctx context.Context) (*Viewer, error) {
	var out struct {
		Viewer *Viewer `json:"Viewer"`
	}
	if err := c.Query(ctx, qViewer, nil, &out); err != nil {
		return nil, err
	}
	if out.Viewer == nil {
		return nil, ErrUnauthorized
	}
	return out.Viewer, nil
}

func (c *Client) Collection(ctx context.Context, userID int, mediaType string) (*Collection, error) {
	var out struct {
		MediaListCollection *Collection `json:"MediaListCollection"`
	}
	if err := c.Query(ctx, qCollection, map[string]any{"userId": userID, "type": mediaType}, &out); err != nil {
		return nil, err
	}
	if out.MediaListCollection == nil {
		return &Collection{}, nil
	}
	return out.MediaListCollection, nil
}

func (c *Client) Media(ctx context.Context, id int) (*Media, error) {
	var out struct {
		Media *Media `json:"Media"`
	}
	if err := c.Query(ctx, qMedia, map[string]any{"id": id}, &out); err != nil {
		return nil, err
	}
	if out.Media == nil {
		return nil, fmt.Errorf("anilist: media %d not found", id)
	}
	return out.Media, nil
}

func (c *Client) Search(ctx context.Context, p SearchParams) (*MediaPage, error) {
	vars := map[string]any{
		"page":    max(p.Page, 1),
		"perPage": clamp(p.PerPage, 1, 50, 30),
	}
	if p.Type == "" {
		p.Type = "ANIME"
	}
	vars["type"] = p.Type
	if p.Search != "" {
		vars["search"] = p.Search
	}
	if len(p.Genres) > 0 {
		vars["genres"] = p.Genres
	}
	if len(p.Tags) > 0 {
		vars["tags"] = p.Tags
	}
	if p.Season != "" {
		vars["season"] = p.Season
	}
	if p.Year > 0 {
		vars["seasonYear"] = p.Year
	}
	if len(p.Formats) > 0 {
		vars["formats"] = p.Formats
	}
	if p.Status != "" {
		vars["status"] = p.Status
	}
	if len(p.IDs) > 0 {
		vars["ids"] = p.IDs
	}
	if len(p.Sort) > 0 {
		vars["sort"] = p.Sort
	} else if p.Search != "" {
		vars["sort"] = []string{"SEARCH_MATCH"}
	} else {
		vars["sort"] = []string{"TRENDING_DESC", "POPULARITY_DESC"}
	}
	if p.IsAdult != nil {
		vars["isAdult"] = *p.IsAdult
	}
	searchFilters(p, vars)
	var out struct {
		Page *MediaPage `json:"Page"`
	}
	if err := c.Query(ctx, qSearch, vars, &out); err != nil {
		return nil, err
	}
	if out.Page == nil {
		return &MediaPage{}, nil
	}
	return out.Page, nil
}

// The values AniList takes for these filters: anything else is left out, as
// a single wrong one would fail the whole search.
var (
	searchStatuses  = []string{"FINISHED", "RELEASING", "NOT_YET_RELEASED", "CANCELLED", "HIATUS"}
	searchCountries = []string{"JP", "KR", "CN", "TW"}
	searchSources   = []string{"ORIGINAL", "MANGA", "LIGHT_NOVEL", "VISUAL_NOVEL", "VIDEO_GAME", "OTHER", "NOVEL", "DOUJINSHI", "ANIME", "WEB_NOVEL", "LIVE_ACTION", "GAME", "COMIC", "MULTIMEDIA_PROJECT", "PICTURE_BOOK"}
)

// searchFilters puts Search's detailed filters into the query's variables.
func searchFilters(p SearchParams, vars map[string]any) {
	only := func(vals, allowed []string) []string {
		var out []string
		for _, v := range vals {
			if slices.Contains(allowed, v) && !slices.Contains(out, v) {
				out = append(out, v)
			}
		}
		return out
	}
	if len(p.ExcludeGenres) > 0 {
		vars["genresNot"] = p.ExcludeGenres
	}
	if len(p.ExcludeTags) > 0 {
		vars["tagsNot"] = p.ExcludeTags
	}
	if st := only(p.Statuses, searchStatuses); len(st) > 0 {
		vars["statuses"] = st
		delete(vars, "status")
	}
	if slices.Contains(searchCountries, p.Country) {
		vars["country"] = p.Country
	}
	if src := only(p.Sources, searchSources); len(src) > 0 {
		vars["sources"] = src
	}
	// Dates as AniList keeps them, YYYYMMDD: a year alone is YYYY0000, so
	// "after" starts just before it. Both ends are strict.
	if p.YearFrom > 0 {
		vars["startAfter"] = p.YearFrom*10000 - 1
	}
	if p.YearTo > 0 {
		vars["startBefore"] = (p.YearTo + 1) * 10000
	}
	if p.MinScore > 0 {
		vars["scoreAbove"] = min(p.MinScore, 100) - 1
	}
	above, below := "episodesAbove", "episodesBelow"
	if p.Type == "MANGA" {
		above, below = "chaptersAbove", "chaptersBelow"
	}
	if p.MinCount > 0 {
		vars[above] = p.MinCount - 1
	}
	if p.MaxCount > 0 {
		vars[below] = p.MaxCount + 1
	}
	if p.OnList != nil {
		vars["onList"] = *p.OnList
	}
}

const qTags = `{ MediaTagCollection { name description category isAdult } }`

// Tags is every tag AniList has (some 430): public, the same for everyone.
func (c *Client) Tags(ctx context.Context) ([]MediaTag, error) {
	var out struct {
		MediaTagCollection []MediaTag `json:"MediaTagCollection"`
	}
	if err := c.QueryAnon(ctx, qTags, nil, &out); err != nil {
		return nil, err
	}
	return out.MediaTagCollection, nil
}

func (c *Client) Schedule(ctx context.Context, start, end int64) ([]*AiringEpisode, error) {
	var all []*AiringEpisode
	for page := 1; page <= 12; page++ {
		var out struct {
			Page *SchedulePage `json:"Page"`
		}
		if err := c.Query(ctx, qSchedule, map[string]any{"page": page, "start": start, "end": end}, &out); err != nil {
			return all, err
		}
		if out.Page == nil {
			break
		}
		all = append(all, out.Page.AiringSchedules...)
		if !out.Page.PageInfo.HasNextPage {
			break
		}
	}
	return all, nil
}

// MediaNotice is one of AniList's own notifications about an anime or a
// manga: one related to something on the user's list was added to AniList
// (a sequel announced).
type MediaNotice struct {
	ID        int    `json:"id"`
	Context   string `json:"context"`
	CreatedAt int64  `json:"createdAt"`
	Media     *Media `json:"media"`
}

// Asking doesn't mark them read on AniList (resetNotificationCount).
const qRelatedAdded = `query {
	Page(page: 1, perPage: 25) {
		notifications(type_in: [RELATED_MEDIA_ADDITION], resetNotificationCount: false) {
			... on RelatedMediaAdditionNotification { id context createdAt media { ` + mediaLiteFields + ` } }
		}
	}
}`

// RelatedAdded is the logged-in user's latest "related anime added"
// notifications, newest first.
func (c *Client) RelatedAdded(ctx context.Context) ([]*MediaNotice, error) {
	var out struct {
		Page *struct {
			Notifications []*MediaNotice `json:"notifications"`
		} `json:"Page"`
	}
	if err := c.Query(ctx, qRelatedAdded, nil, &out); err != nil {
		return nil, err
	}
	res := []*MediaNotice{}
	if out.Page == nil {
		return res, nil
	}
	for _, n := range out.Page.Notifications {
		// A notification of another kind comes as an empty object.
		if n != nil && n.ID != 0 && n.Media != nil {
			res = append(res, n)
		}
	}
	return res, nil
}

func (c *Client) SaveEntry(ctx context.Context, u EntryUpdate) (*ListEntryLite, error) {
	vars := map[string]any{"mediaId": u.MediaID}
	if u.Status != nil {
		vars["status"] = *u.Status
	}
	if u.Progress != nil {
		vars["progress"] = *u.Progress
	}
	if u.Score != nil {
		vars["scoreRaw"] = int(*u.Score)
	}
	if u.Repeat != nil {
		vars["repeat"] = *u.Repeat
	}
	if u.StartedAt != nil {
		vars["startedAt"] = u.StartedAt
	}
	if u.CompletedAt != nil {
		vars["completedAt"] = u.CompletedAt
	}
	var out struct {
		SaveMediaListEntry *ListEntryLite `json:"SaveMediaListEntry"`
	}
	if err := c.Query(ctx, mSaveEntry, vars, &out); err != nil {
		return nil, err
	}
	return out.SaveMediaListEntry, nil
}

func (c *Client) DeleteEntry(ctx context.Context, entryID int) error {
	return c.Query(ctx, mDeleteEntry, map[string]any{"id": entryID}, nil)
}

func clamp(v, lo, hi, def int) int {
	if v == 0 {
		return def
	}
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}
