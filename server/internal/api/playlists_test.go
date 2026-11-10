package api

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/v0-0x/Aniko/server/internal/playlist"
)

// Playlists through the API: made, added to, an item moved and removed,
// renamed, deleted; and kept in step through a hub (the blob hook).
func TestPlaylistsAPI(t *testing.T) {
	s := newTestServer(t)
	local := "127.0.0.1:5000"
	var p playlist.Playlist
	call := func(method, path, body string, want int) {
		t.Helper()
		w := do(s, method, path, local, body, nil)
		if w.Code != want {
			t.Fatalf("%s %s: %d %s", method, path, w.Code, w.Body)
		}
		// An error or {"ok":true} leaves p as it was.
		_ = json.Unmarshal(w.Body.Bytes(), &p)
	}
	item := func(n string) string {
		return `{"mediaId":21,"episode":` + n + `,"title":"One Piece","play":{"kind":"local","path":"/lib/` + n + `.mkv"}}`
	}
	call("POST", "/api/playlists", `{"name":"Binge","items":[`+item("1")+`]}`, http.StatusOK)
	if p.ID == "" || p.Name != "Binge" || len(p.Items) != 1 {
		t.Fatalf("made: %+v", p)
	}
	call("POST", "/api/playlists/"+p.ID+"/items", `{"items":[`+item("2")+`,`+item("3")+`]}`, http.StatusOK)
	call("POST", "/api/playlists/"+p.ID+"/move", `{"from":2,"to":0}`, http.StatusOK)
	if len(p.Items) != 3 || p.Items[0].Episode != 3 || p.Items[1].Episode != 1 {
		t.Fatalf("moved: %+v", p.Items)
	}
	call("DELETE", "/api/playlists/"+p.ID+"/items/1", "", http.StatusOK)
	if len(p.Items) != 2 || p.Items[1].Episode != 2 {
		t.Fatalf("removed: %+v", p.Items)
	}
	call("PATCH", "/api/playlists/"+p.ID, `{"name":"Sunday"}`, http.StatusOK)
	if p.Name != "Sunday" {
		t.Fatalf("renamed: %+v", p)
	}
	call("POST", "/api/playlists/"+p.ID+"/move", `{"from":0,"to":5}`, http.StatusBadRequest)
	call("POST", "/api/playlists/nope/items", `{"items":[`+item("4")+`]}`, http.StatusNotFound)
	call("POST", "/api/playlists", `{"name":""}`, http.StatusBadRequest)

	hooks, ok := s.app.Share.Blobs[playlist.Kind]
	if !ok || hooks.Own == nil || hooks.Apply == nil || s.app.Share.Blobs["lists"].Own == nil {
		t.Fatal("no playlists blob hook (or the others lost)")
	}
	if _, ok := hooks.Own().Items[p.ID]; !ok {
		t.Fatal("not in the blob")
	}

	id := p.ID
	call("DELETE", "/api/playlists/"+id, "", http.StatusOK)
	var list []playlist.Playlist
	w := do(s, "GET", "/api/playlists", local, "", nil)
	if w.Code != http.StatusOK || json.Unmarshal(w.Body.Bytes(), &list) != nil || len(list) != 0 {
		t.Fatalf("list after delete: %d %s", w.Code, w.Body)
	}
}
