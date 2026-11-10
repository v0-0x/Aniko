package api

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/v0-0x/Aniko/server/internal/playlist"
)

// Your playlists (internal/playlist): kept on this Aniko, and kept in step
// with your other devices through a hub, as the list and watch-order
// edits are (share.BlobHooks, kind "playlists").
func (s *Server) playlistRoutes() {
	m := s.mux
	st := s.app.Playlists
	fail := func(err error) error {
		switch {
		case errors.Is(err, playlist.ErrNotFound):
			return notFound(err.Error())
		case errors.Is(err, playlist.ErrInvalid):
			return badRequest(err.Error())
		}
		return err
	}
	index := func(r *http.Request) int {
		n, err := strconv.Atoi(r.PathValue("index"))
		if err != nil {
			return -1
		}
		return n
	}
	m.HandleFunc("GET /api/playlists", h(func(r *http.Request) (any, error) {
		ps, err := st.List()
		return ps, fail(err)
	}))
	m.HandleFunc("POST /api/playlists", h(func(r *http.Request) (any, error) {
		var body struct {
			Name  string          `json:"name"`
			Items []playlist.Item `json:"items"`
		}
		if err := decode(r, &body); err != nil {
			return nil, err
		}
		p, err := st.Create(body.Name, body.Items)
		return p, fail(err)
	}))
	m.HandleFunc("PATCH /api/playlists/{id}", h(func(r *http.Request) (any, error) {
		var body struct {
			Name string `json:"name"`
		}
		if err := decode(r, &body); err != nil {
			return nil, err
		}
		p, err := st.Rename(r.PathValue("id"), body.Name)
		return p, fail(err)
	}))
	m.HandleFunc("DELETE /api/playlists/{id}", h(func(r *http.Request) (any, error) {
		return nil, fail(st.Delete(r.PathValue("id")))
	}))
	m.HandleFunc("POST /api/playlists/{id}/items", h(func(r *http.Request) (any, error) {
		var body struct {
			Items []playlist.Item `json:"items"`
		}
		if err := decode(r, &body); err != nil {
			return nil, err
		}
		p, err := st.Add(r.PathValue("id"), body.Items)
		return p, fail(err)
	}))
	m.HandleFunc("DELETE /api/playlists/{id}/items/{index}", h(func(r *http.Request) (any, error) {
		p, err := st.Remove(r.PathValue("id"), index(r))
		return p, fail(err)
	}))
	// An item moved: {from, to} (indexes).
	m.HandleFunc("POST /api/playlists/{id}/move", h(func(r *http.Request) (any, error) {
		var body struct {
			From int `json:"from"`
			To   int `json:"to"`
		}
		if err := decode(r, &body); err != nil {
			return nil, err
		}
		p, err := st.Move(r.PathValue("id"), body.From, body.To)
		return p, fail(err)
	}))
}
