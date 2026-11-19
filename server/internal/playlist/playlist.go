// Package playlist keeps your playlists: a name and episodes in the order
// you put them, each with how the in-app player plays it (the web UI's
// PlayerRequest, without where it starts). They're kept on this Aniko (the
// kv table, one key each) and kept in step with your other devices
// through a hub as a blob (anikohub.Blob, kind "playlists"): a playlist is
// an item, the newer wins, a removal is remembered for a while.
package playlist

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/v0-0x/Aniko/server/internal/anikohub"
)

// Kind is the blob kind playlists are kept in step as.
const Kind = "playlists"

// Limits.
const (
	MaxPlaylists = 200
	MaxItems     = 1000
	MaxName      = 100
)

var (
	ErrNotFound = errors.New("no such playlist")
	ErrInvalid  = errors.New("invalid playlist")
)

// Play is how an item plays: a file ("local", its path) or an online
// stream ("stream": provider, dub, server).
type Play struct {
	Kind     string `json:"kind"`
	Path     string `json:"path,omitempty"`
	Provider string `json:"provider,omitempty"`
	Dub      bool   `json:"dub,omitempty"`
	Server   string `json:"server,omitempty"`
}

// Item is one episode of a playlist.
type Item struct {
	MediaID int    `json:"mediaId"`
	Episode int    `json:"episode"`
	Title   string `json:"title"`
	Image   string `json:"image,omitempty"`
	Play    Play   `json:"play"`
}

// Playlist is a name and its items, in order. At is when it last changed
// (whole seconds, as ms: what a blob item carries).
type Playlist struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Items []Item `json:"items"`
	At    int64  `json:"at"`
}

// KV is the part of the database the store uses (db.DB).
type KV interface {
	GetKV(key string, out any) (bool, error)
	SetKV(key string, value any) error
	KVPrefix(prefix string) (map[string]json.RawMessage, error)
	DeleteKV(key string) error
}

const (
	prefix  = "playlist:"
	goneKey = "sync:playlists-gone" // id -> removed at (ms)
)

// Store keeps the playlists.
type Store struct {
	kv KV
	mu sync.Mutex
	// OnChange is called after a change made here (not one taken from a
	// hub): to send the blob on.
	OnChange func()
	// now is the time, for tests.
	now func() time.Time
}

func New(kv KV) *Store { return &Store{kv: kv, now: time.Now} }

func (s *Store) nowAt() int64 { return s.now().Unix() * 1000 }

func (s *Store) changed() {
	if s.OnChange != nil {
		s.OnChange()
	}
}

func (s *Store) gone() map[string]int64 {
	m := map[string]int64{}
	_, _ = s.kv.GetKV(goneKey, &m)
	return m
}

func (s *Store) all() (map[string]Playlist, error) {
	raw, err := s.kv.KVPrefix(prefix)
	if err != nil {
		return nil, err
	}
	out := make(map[string]Playlist, len(raw))
	for k, v := range raw {
		var p Playlist
		if json.Unmarshal(v, &p) != nil {
			continue
		}
		p.ID = strings.TrimPrefix(k, prefix)
		if p.Items == nil {
			p.Items = []Item{}
		}
		out[p.ID] = p
	}
	return out, nil
}

// List is every playlist, by name.
func (s *Store) List() ([]Playlist, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	m, err := s.all()
	if err != nil {
		return nil, err
	}
	out := make([]Playlist, 0, len(m))
	for _, p := range m {
		out = append(out, p)
	}
	sort.Slice(out, func(i, j int) bool {
		a, b := strings.ToLower(out[i].Name), strings.ToLower(out[j].Name)
		if a != b {
			return a < b
		}
		return out[i].ID < out[j].ID
	})
	return out, nil
}

// Get is one playlist.
func (s *Store) Get(id string) (Playlist, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.get(id)
}

func (s *Store) get(id string) (Playlist, error) {
	var p Playlist
	if id == "" {
		return p, ErrNotFound
	}
	ok, err := s.kv.GetKV(prefix+id, &p)
	if err != nil {
		return p, err
	}
	if !ok {
		return p, ErrNotFound
	}
	p.ID = id
	if p.Items == nil {
		p.Items = []Item{}
	}
	return p, nil
}

func cleanName(name string) (string, error) {
	name = strings.Join(strings.Fields(name), " ")
	if name == "" || utf8.RuneCountInString(name) > MaxName {
		return "", ErrInvalid
	}
	return name, nil
}

func validItems(items []Item) error {
	for _, it := range items {
		if it.MediaID <= 0 || it.Episode < 0 {
			return ErrInvalid
		}
		switch it.Play.Kind {
		case "local":
			if it.Play.Path == "" {
				return ErrInvalid
			}
		case "stream":
			if it.Play.Provider == "" {
				return ErrInvalid
			}
		default:
			return ErrInvalid
		}
	}
	return nil
}

func newID() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func (s *Store) put(p Playlist) error {
	g := s.gone()
	// Later than its last change here, so a change right after another
	// (or after a removal) still counts as newer on the other devices.
	p.At = max(s.nowAt(), p.At+1000, g[p.ID]+1000)
	if _, ok := g[p.ID]; ok {
		delete(g, p.ID)
		if err := s.kv.SetKV(goneKey, g); err != nil {
			return err
		}
	}
	return s.kv.SetKV(prefix+p.ID, p)
}

// Create makes a playlist, with items (or none).
func (s *Store) Create(name string, items []Item) (Playlist, error) {
	name, err := cleanName(name)
	if err != nil {
		return Playlist{}, err
	}
	if items == nil {
		items = []Item{}
	}
	if len(items) > MaxItems || validItems(items) != nil {
		return Playlist{}, ErrInvalid
	}
	s.mu.Lock()
	m, err := s.all()
	if err != nil {
		s.mu.Unlock()
		return Playlist{}, err
	}
	if len(m) >= MaxPlaylists {
		s.mu.Unlock()
		return Playlist{}, ErrInvalid
	}
	p := Playlist{ID: newID(), Name: name, Items: items}
	err = s.put(p)
	s.mu.Unlock()
	if err != nil {
		return Playlist{}, err
	}
	s.changed()
	return s.Get(p.ID)
}

// update changes a playlist with fn and keeps it.
func (s *Store) update(id string, fn func(p *Playlist) error) (Playlist, error) {
	s.mu.Lock()
	p, err := s.get(id)
	if err == nil {
		err = fn(&p)
	}
	if err == nil {
		err = s.put(p)
	}
	s.mu.Unlock()
	if err != nil {
		return Playlist{}, err
	}
	s.changed()
	return s.Get(id)
}

// Rename gives a playlist a new name.
func (s *Store) Rename(id, name string) (Playlist, error) {
	name, err := cleanName(name)
	if err != nil {
		return Playlist{}, err
	}
	return s.update(id, func(p *Playlist) error {
		p.Name = name
		return nil
	})
}

// Add puts items at the end of a playlist.
func (s *Store) Add(id string, items []Item) (Playlist, error) {
	if len(items) == 0 || validItems(items) != nil {
		return Playlist{}, ErrInvalid
	}
	return s.update(id, func(p *Playlist) error {
		if len(p.Items)+len(items) > MaxItems {
			return ErrInvalid
		}
		p.Items = append(p.Items, items...)
		return nil
	})
}

// Remove takes the item at index out of a playlist.
func (s *Store) Remove(id string, index int) (Playlist, error) {
	return s.update(id, func(p *Playlist) error {
		if index < 0 || index >= len(p.Items) {
			return ErrInvalid
		}
		p.Items = append(p.Items[:index:index], p.Items[index+1:]...)
		return nil
	})
}

// Move puts the item at index at to (the others shift).
func (s *Store) Move(id string, index, to int) (Playlist, error) {
	return s.update(id, func(p *Playlist) error {
		n := len(p.Items)
		if index < 0 || index >= n || to < 0 || to >= n {
			return ErrInvalid
		}
		it := p.Items[index]
		rest := append(p.Items[:index:index], p.Items[index+1:]...)
		p.Items = append(rest[:to:to], append([]Item{it}, rest[to:]...)...)
		return nil
	})
}

// Delete removes a playlist (remembered, for the other devices).
func (s *Store) Delete(id string) error {
	s.mu.Lock()
	p, err := s.get(id)
	if err == nil {
		g := s.gone()
		g[id] = max(s.nowAt(), p.At+1000)
		if err = s.kv.SetKV(goneKey, g); err == nil {
			err = s.kv.DeleteKV(prefix + id)
		}
	}
	s.mu.Unlock()
	if err != nil {
		return err
	}
	s.changed()
	return nil
}

// validID: what newID makes (from a hub: nothing else is kept).
func validID(id string) bool {
	if id == "" || len(id) > 64 {
		return false
	}
	for _, c := range id {
		if !(c >= '0' && c <= '9' || c >= 'a' && c <= 'z' || c == '-') {
			return false
		}
	}
	return true
}

// item is a playlist as a blob item.
type item struct {
	At      int64  `json:"at"`
	Deleted bool   `json:"deleted,omitempty"`
	Name    string `json:"name,omitempty"`
	Items   []Item `json:"items,omitempty"`
}

// Blob is the playlists as a blob: each with its time, and the removals.
func (s *Store) Blob() anikohub.Blob {
	s.mu.Lock()
	defer s.mu.Unlock()
	b := anikohub.Blob{Items: map[string]json.RawMessage{}}
	m, err := s.all()
	if err != nil {
		return b
	}
	for id, p := range m {
		b.Items[id], _ = json.Marshal(item{At: p.At, Name: p.Name, Items: p.Items})
	}
	for id, at := range s.gone() {
		if _, ok := b.Items[id]; !ok {
			b.Items[id], _ = json.Marshal(item{At: at, Deleted: true})
		}
	}
	b.Merge(anikohub.Blob{}) // sets UpdatedAt, drops old removals
	return b
}

// Apply takes a hub's blob: the playlists newer than here (a removal at
// the same time wins, as on the hub). It reports whether anything changed.
func (s *Store) Apply(b anikohub.Blob) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	m, err := s.all()
	if err != nil {
		return false
	}
	g := s.gone()
	changed, goneChanged := false, false
	for id, raw := range b.Items {
		var it item
		if !validID(id) || json.Unmarshal(raw, &it) != nil || it.At <= 0 {
			continue
		}
		localAt, localGone := g[id], true
		if p, ok := m[id]; ok {
			localAt, localGone = p.At, false
		}
		if it.At < localAt || it.At == localAt && (!it.Deleted || localGone) {
			continue
		}
		if it.Deleted {
			if _, ok := m[id]; ok {
				if s.kv.DeleteKV(prefix+id) != nil {
					continue
				}
				changed = true
			}
			g[id], goneChanged = it.At, true
			continue
		}
		name, err := cleanName(it.Name)
		if err != nil || len(it.Items) > MaxItems || validItems(it.Items) != nil {
			continue
		}
		items := it.Items
		if items == nil {
			items = []Item{}
		}
		if s.kv.SetKV(prefix+id, Playlist{ID: id, Name: name, Items: items, At: it.At}) != nil {
			continue
		}
		changed = true
		if _, ok := g[id]; ok {
			delete(g, id)
			goneChanged = true
		}
	}
	if goneChanged {
		_ = s.kv.SetKV(goneKey, g)
	}
	return changed
}
