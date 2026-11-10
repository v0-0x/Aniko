package anilist

import (
	"cmp"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/v0-0x/Aniko/server/internal/events"
)

// Changes to the AniList list made while AniList can't be reached (see
// Unreachable) wait here and are sent when it answers again: one per media
// in the kv table (kvPending + media id), a later change merged over the
// earlier one. Until they're sent, the collection shows them (withPending).

const kvPending = "anilist_pending:"

// errKeepForNow: a kept change wasn't sent, and stays for the next try.
var errKeepForNow = errors.New("not sent, kept for later")

type pendingChange struct {
	// UserID: whose list it's for; only sent while that account is logged in.
	UserID  int         `json:"userId"`
	MediaID int         `json:"mediaId"`
	Type    string      `json:"type"`
	Update  EntryUpdate `json:"update"`
	// Delete: the entry is to leave the list (Update is then empty).
	Delete bool `json:"delete,omitempty"`
	// Media (lite) shows an entry added while offline.
	Media *Media `json:"media,omitempty"`
	// At (unix ns) is when it last changed: they're sent in that order.
	At int64 `json:"at"`
}

func pendingKey(mediaID int) string { return kvPending + strconv.Itoa(mediaID) }

// merge is u with the fields newer carries replaced by newer's.
func (u EntryUpdate) merge(newer EntryUpdate) EntryUpdate {
	if newer.Status != nil {
		u.Status = newer.Status
	}
	if newer.Progress != nil {
		u.Progress = newer.Progress
	}
	if newer.Score != nil {
		u.Score = newer.Score
	}
	if newer.Repeat != nil {
		u.Repeat = newer.Repeat
	}
	if newer.StartedAt != nil {
		u.StartedAt = newer.StartedAt
	}
	if newer.CompletedAt != nil {
		u.CompletedAt = newer.CompletedAt
	}
	u.MediaID = newer.MediaID
	return u
}

func (u EntryUpdate) empty() bool {
	return u.Status == nil && u.Progress == nil && u.Score == nil && u.Repeat == nil && u.StartedAt == nil && u.CompletedAt == nil
}

// trimStale is u without what would take the entry back from cur (the entry
// on AniList; nil when it isn't on the list): progress is only sent when it's
// ahead of AniList's, and when it isn't, neither are the status, dates and
// rewatch count that came with it (finishing episode 5 offline mustn't undo
// finishing the show on another device). Starting a rewatch of a completed
// show is the exception: its progress starts again. ok is false when nothing
// is left to send.
func trimStale(u EntryUpdate, cur *ListEntryLite) (_ EntryUpdate, ok bool) {
	if cur == nil || u.Progress == nil || *u.Progress > cur.Progress {
		return u, !u.empty()
	}
	if u.Status != nil && *u.Status == "REPEATING" && cur.Status == "COMPLETED" {
		return u, true
	}
	u.Progress, u.Status, u.Repeat, u.StartedAt, u.CompletedAt = nil, nil, nil, nil, nil
	return u, !u.empty()
}

func liteOf(e *ListEntry) *ListEntryLite {
	if e == nil {
		return nil
	}
	return &ListEntryLite{ID: e.ID, Status: e.Status, Progress: e.Progress, Score: e.Score, Repeat: e.Repeat}
}

// pendingRow is a kept change with the value it's stored as (to remove it
// only if it hasn't changed since).
type pendingRow struct {
	pendingChange
	raw string
}

// pending lists the changes waiting for userID's list, oldest first.
func (p *Platform) pending(userID int) ([]pendingRow, error) {
	all, err := p.db.KVPrefix(kvPending)
	if err != nil {
		return nil, err
	}
	var out []pendingRow
	for _, raw := range all {
		var c pendingChange
		if json.Unmarshal(raw, &c) != nil || c.UserID != userID || c.MediaID <= 0 {
			continue
		}
		out = append(out, pendingRow{c, string(raw)})
	}
	slices.SortFunc(out, func(a, b pendingRow) int {
		return cmp.Or(cmp.Compare(a.At, b.At), cmp.Compare(a.MediaID, b.MediaID))
	})
	return out, nil
}

// pendingFor is the change waiting for a media of userID's list, or nil.
func (p *Platform) pendingFor(userID, mediaID int) *pendingRow {
	var raw string
	if p.db.QueryRow(`SELECT value FROM kv WHERE key = ?`, pendingKey(mediaID)).Scan(&raw) != nil {
		return nil
	}
	var c pendingChange
	if json.Unmarshal([]byte(raw), &c) != nil || c.UserID != userID {
		return nil
	}
	return &pendingRow{c, raw}
}

// keepPending stores a change to send later, merged over the one waiting
// for the same media (a delete replaces it; an update after a delete puts
// the entry back).
func (p *Platform) keepPending(userID int, media *Media, mt string, u EntryUpdate, del bool) error {
	p.pendingMu.Lock()
	defer p.pendingMu.Unlock()
	c := pendingChange{UserID: userID, MediaID: u.MediaID, Type: mt, Delete: del, Media: media.Lite(), At: time.Now().UnixNano()}
	if !del {
		c.Update = u
		var old pendingChange
		if ok, _ := p.db.GetKV(pendingKey(u.MediaID), &old); ok && old.UserID == userID && !old.Delete {
			c.Update = old.Update.merge(u)
		}
	}
	if err := p.db.SetKV(pendingKey(u.MediaID), c); err != nil {
		return err
	}
	p.publishPending(userID)
	return nil
}

// dropPending removes a kept change once sent (or refused for good),
// unless it changed since it was read.
func (p *Platform) dropPending(r *pendingRow) error {
	p.pendingMu.Lock()
	defer p.pendingMu.Unlock()
	_, err := p.db.Write(`DELETE FROM kv WHERE key = ? AND value = ?`, pendingKey(r.MediaID), r.raw)
	return err
}

// PendingCount is how many changes to the logged-in user's AniList list
// wait for AniList to answer.
func (p *Platform) PendingCount() int {
	_, v := p.state()
	if v == nil {
		return 0
	}
	rows, _ := p.pending(v.ID)
	return len(rows)
}

func (p *Platform) publishPending(userID int) {
	if p.hub == nil {
		return
	}
	if _, v := p.state(); v == nil || v.ID != userID {
		return
	}
	rows, _ := p.pending(userID)
	p.hub.Publish(events.AniListPending, map[string]any{"count": len(rows)})
}

// withPending is c (userID's list of type mt, as AniList sent it) with the
// changes waiting for AniList applied, as it will be once they're sent. c
// isn't modified.
func (p *Platform) withPending(userID int, mt string, c *Collection) *Collection {
	if c == nil {
		return nil
	}
	rows, err := p.pending(userID)
	if err != nil || len(rows) == 0 {
		return c
	}
	for _, r := range rows {
		if typeOr(r.Type) != mt {
			continue
		}
		old := c.Find(r.MediaID)
		if r.Delete {
			if old != nil {
				c = c.without(r.MediaID)
			}
			continue
		}
		u, ok := trimStale(r.Update, liteOf(old))
		if !ok {
			continue
		}
		e := ListEntry{MediaID: r.MediaID, Media: r.Media, Status: "PLANNING"}
		if old != nil {
			e = *old
		} else if e.Media == nil {
			continue
		}
		u.applyTo(&e)
		e.UpdatedAt = r.At / int64(time.Second)
		c = c.withEntry(&e)
	}
	return c
}

const qListEntry = `query ($userId: Int, $mediaId: Int) {
	MediaList(userId: $userId, mediaId: $mediaId) { id mediaId status progress score(format: POINT_100) repeat }
}`

// ListEntry is a user's entry of a media as AniList has it now, or nil when
// their list doesn't have it.
func (c *Client) ListEntry(ctx context.Context, userID, mediaID int) (*ListEntryLite, error) {
	var out struct {
		MediaList *ListEntryLite `json:"MediaList"`
	}
	err := c.Query(ctx, qListEntry, map[string]any{"userId": userID, "mediaId": mediaID}, &out)
	var se *StatusError
	if errors.As(err, &se) && (se.Status == http.StatusNotFound || strings.Contains(strings.ToLower(se.Msg), "not found")) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return out.MediaList, nil
}

// SyncPending sends the changes waiting for AniList, oldest first. A change
// is dropped once AniList took it, or (logged) when AniList refused it for
// good (a 4xx); while AniList is unreachable it's kept, and so are the ones
// after it. It reports how many are left.
func (p *Platform) SyncPending(ctx context.Context) (left int, _ error) {
	p.syncMu.Lock()
	defer p.syncMu.Unlock()
	p.mu.RLock()
	session, v, token := p.session, p.viewer, p.client.Token()
	p.mu.RUnlock()
	if v == nil || token == "" {
		return 0, nil
	}
	rows, err := p.pending(v.ID)
	if err != nil {
		return 0, err
	}
	// The account they were made on, even if another logs in meanwhile.
	client := p.client.withToken(token)
	changed := false
	defer func() {
		if changed && p.hub != nil {
			p.publishPending(v.ID)
			p.hub.Publish(events.CollectionUpdate, nil)
		}
	}()
	for i := range rows {
		r := &rows[i]
		if now, _ := p.state(); now != session {
			return len(rows) - i, errors.New("anilist: the login changed")
		}
		err := p.sendPending(ctx, client, session, v.ID, r)
		switch {
		case err == nil:
		case errors.Is(err, ErrUnauthorized):
			p.expire(session)
			return len(rows) - i, err
		case Unreachable(err):
			return len(rows) - i, err
		case errors.Is(err, errKeepForNow):
			log.Printf("anilist: a change to media %d is kept for later: %v", r.MediaID, err)
			continue
		default:
			log.Printf("anilist: dropped a change to media %d AniList refused: %v", r.MediaID, err)
		}
		if derr := p.dropPending(r); derr != nil {
			return len(rows) - i, derr
		}
		changed = true
	}
	return 0, nil
}

// sendPending sends one kept change. Its progress is only sent when it's
// ahead of AniList's (trimStale): the entry is fetched first.
func (p *Platform) sendPending(ctx context.Context, client *Client, session uint64, userID int, r *pendingRow) error {
	cur, err := client.ListEntry(ctx, userID, r.MediaID)
	if err != nil {
		if !Unreachable(err) && !errors.Is(err, ErrUnauthorized) {
			// Its entry couldn't be read: keep the change rather than
			// send it blind or lose it.
			return fmt.Errorf("%w: %v", errKeepForNow, err)
		}
		return err
	}
	mt := typeOr(r.Type)
	if r.Delete {
		if cur == nil {
			return nil
		}
		if err := client.DeleteEntry(ctx, cur.ID); err != nil {
			return err
		}
		p.mu.Lock()
		if p.session == session {
			p.invalidateLocked(mt)
			if c := p.collections[mt]; c != nil {
				p.collections[mt] = c.without(r.MediaID)
			}
		}
		p.mu.Unlock()
		return nil
	}
	u, ok := trimStale(r.Update, cur)
	if !ok {
		log.Printf("anilist: a change to media %d made offline is behind AniList's progress (%d), not sent", r.MediaID, cur.Progress)
		return nil
	}
	saved, err := client.SaveEntry(ctx, u)
	if err != nil {
		return err
	}
	media := r.Media
	if media == nil {
		media = p.CachedLite(r.MediaID)
	}
	if media != nil {
		p.patchCachedEntry(session, mt, media, u, saved)
	}
	return nil
}

// RunPendingSync sends the changes waiting for AniList every minute while
// there are any, until ctx ends.
func (p *Platform) RunPendingSync(ctx context.Context) {
	t := time.NewTicker(time.Minute)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
		if p.PendingCount() == 0 {
			continue
		}
		sctx, cancel := context.WithTimeout(ctx, 3*time.Minute)
		if left, err := p.SyncPending(sctx); err != nil && ctx.Err() == nil {
			log.Printf("anilist: %d changes still wait for AniList: %v", left, err)
		}
		cancel()
	}
}
