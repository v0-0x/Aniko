package api

import (
	"net/http"
	"sort"

	"github.com/simo1337s/animetest/server/internal/library"
	"github.com/simo1337s/animetest/server/internal/util"
)

// Library tools › Clean up: how full the library's drive is, the episodes
// watched (to put away), the episodes there twice, and Kumo's trash.

type cleanupFile struct {
	Path       string `json:"path"`
	Name       string `json:"name"`
	Size       int64  `json:"size"`
	MediaID    int    `json:"mediaId"`
	Episode    int    `json:"episode"`
	Title      string `json:"title"`
	Resolution string `json:"resolution,omitempty"`
	// WatchedAt: when it was watched to the end here, or (watched on the
	// AniList list only) when the list entry last changed; -1 when unknown.
	WatchedAt int64 `json:"watchedAt,omitempty"`
}

type cleanupView struct {
	// The drive the library folder is on (nil when it can't be told).
	Disk         *diskSpace          `json:"disk"`
	LibraryBytes int64               `json:"libraryBytes"`
	Watched      []cleanupFile       `json:"watched"`
	Duplicates   [][]cleanupFile     `json:"duplicates"`
	Trash        []library.TrashItem `json:"trash"`
	TrashBytes   int64               `json:"trashBytes"`
}

type diskSpace struct {
	Total uint64 `json:"total"`
	Free  uint64 `json:"free"`
}

func (s *Server) cleanup(r *http.Request) (any, error) {
	ctx := r.Context()
	cfg := s.app.Settings.Get()
	all, err := s.app.Files.All()
	if err != nil {
		return nil, err
	}
	view := &cleanupView{Watched: []cleanupFile{}, Duplicates: [][]cleanupFile{}, Trash: s.app.Trash.Items()}
	if cfg.Library.Dir != "" {
		if total, free, err := util.DiskSpace(cfg.Library.Dir); err == nil && total > 0 {
			view.Disk = &diskSpace{Total: total, Free: free}
		}
	}
	for _, it := range view.Trash {
		view.TrashBytes += it.Size
	}

	// Which episodes were watched: to the end here (the history), or as far
	// as the AniList list says (all of them once it's completed, or watched
	// again).
	type listed struct {
		progress int
		all      bool
		at       int64
	}
	lists := map[int]listed{}
	if coll, err := s.app.Platform.Collection(ctx, "ANIME", false); err == nil {
		for _, e := range coll.Entries() {
			lists[e.MediaID] = listed{progress: e.Progress, all: e.Status == "COMPLETED" || e.Status == "REPEATING" || e.Repeat > 0, at: e.UpdatedAt}
		}
	}
	var ids []int
	seen := map[int]bool{}
	var files []*library.LocalFile
	for _, f := range all {
		if f.Ignored {
			continue
		}
		view.LibraryBytes += f.Size
		if f.MediaID <= 0 || f.Kind != "main" || f.Episode <= 0 {
			continue
		}
		files = append(files, f)
		if !seen[f.MediaID] {
			seen[f.MediaID] = true
			ids = append(ids, f.MediaID)
		}
	}
	titles := map[int]string{}
	if medias, err := s.app.Platform.MediaBatch(ctx, ids); err == nil {
		for id, m := range medias {
			titles[id] = m.PreferredTitle()
		}
	}
	item := func(f *library.LocalFile) cleanupFile {
		return cleanupFile{Path: f.Path, Name: f.Name, Size: f.Size, MediaID: f.MediaID, Episode: f.Episode, Title: titles[f.MediaID], Resolution: f.Parsed.Resolution}
	}
	byEpisode := map[[2]int][]*library.LocalFile{}
	for _, f := range files {
		k := [2]int{f.MediaID, f.Episode}
		byEpisode[k] = append(byEpisode[k], f)
		c := item(f)
		if h := s.app.History.Get(f.MediaID, f.Episode); h != nil && h.Duration > 0 && h.Position/h.Duration >= cfg.Playback.CompletionThreshold {
			c.WatchedAt = h.UpdatedAt
		} else if l, ok := lists[f.MediaID]; ok && (l.all || l.progress >= f.Episode) {
			c.WatchedAt = l.at
			if c.WatchedAt == 0 {
				c.WatchedAt = -1 // watched, when unknown
			}
		} else {
			continue
		}
		view.Watched = append(view.Watched, c)
	}
	for _, fs := range byEpisode {
		if len(fs) < 2 {
			continue
		}
		var group []cleanupFile
		for _, f := range fs {
			group = append(group, item(f))
		}
		// The one to keep first: the biggest (then by name, so it's the same
		// one each time).
		sort.Slice(group, func(i, j int) bool {
			if group[i].Size != group[j].Size {
				return group[i].Size > group[j].Size
			}
			return group[i].Path < group[j].Path
		})
		view.Duplicates = append(view.Duplicates, group)
	}
	sort.Slice(view.Watched, func(i, j int) bool {
		a, b := view.Watched[i], view.Watched[j]
		if a.Title != b.Title {
			return a.Title < b.Title
		}
		return a.Episode < b.Episode
	})
	sort.Slice(view.Duplicates, func(i, j int) bool {
		a, b := view.Duplicates[i][0], view.Duplicates[j][0]
		if a.Title != b.Title {
			return a.Title < b.Title
		}
		return a.Episode < b.Episode
	})
	return view, nil
}

func (s *Server) cleanupRoutes() {
	m := s.mux
	m.HandleFunc("GET /api/library/cleanup", h(s.cleanup))
	m.HandleFunc("POST /api/library/trash", h(func(r *http.Request) (any, error) {
		if !isTrusted(r) {
			return nil, forbidden("only this computer can remove its files")
		}
		var body struct {
			Paths []string `json:"paths"`
		}
		if err := decode(r, &body); err != nil {
			return nil, err
		}
		if len(body.Paths) == 0 {
			return nil, badRequest("no files")
		}
		moved, failed := s.app.Trash.Put(body.Paths)
		if len(moved) > 0 {
			s.app.Hub.Publish("library-updated", nil)
		}
		return map[string]any{"moved": len(moved), "failed": failed}, nil
	}))
	m.HandleFunc("POST /api/library/trash/restore", h(func(r *http.Request) (any, error) {
		if !isTrusted(r) {
			return nil, forbidden("only this computer can put its files back")
		}
		var body struct {
			IDs []string `json:"ids"`
		}
		if err := decode(r, &body); err != nil {
			return nil, err
		}
		restored, failed := s.app.Trash.Restore(body.IDs)
		if len(restored) > 0 {
			s.app.Hub.Publish("library-updated", nil)
		}
		return map[string]any{"restored": len(restored), "failed": failed}, nil
	}))
	// Deleted for good: the ones given, or all of them.
	m.HandleFunc("POST /api/library/trash/empty", h(func(r *http.Request) (any, error) {
		if !isTrusted(r) {
			return nil, forbidden("only this computer can delete its files")
		}
		var body struct {
			IDs []string `json:"ids"`
		}
		if err := decode(r, &body); err != nil {
			return nil, err
		}
		freed, err := s.app.Trash.Empty(body.IDs)
		return map[string]any{"freed": freed}, err
	}))
}
