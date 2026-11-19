package api

import (
	"context"
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"github.com/v0-0x/Aniko/server/internal/anikohub"
	"github.com/v0-0x/Aniko/server/internal/config"
	"github.com/v0-0x/Aniko/server/internal/share"
)

// The app's Server page: how the server this Aniko uses (mediaserver's
// anime side, a hub) is doing. The hub answers a device it shares with how
// the computer is and how much it's doing, not who is on it or what they
// watch (that's its dashboard, behind its password).

// serverState is what a hub tells a device.
type serverState struct {
	Name string `json:"name"`
	// Version: mediaserver's.
	Version string          `json:"version"`
	System  anikohub.System `json:"system"`
	Encoder string          `json:"encoder"`
	// Streams it's sending now, Converting of them (video converted as
	// it's sent), and episodes being downloaded onto it.
	Streams    int `json:"streams"`
	Converting int `json:"converting"`
	Downloads  int `json:"downloads"`
	// Its library, without the folders' paths.
	Files    int   `json:"files"`
	Anime    int   `json:"anime"`
	Size     int64 `json:"size"`
	Scanning bool  `json:"scanning"`
}

// serverView is a server on the app's page: state is nil when it's off or
// didn't answer (an older mediaserver doesn't: needs says so).
type serverView struct {
	Host  share.PeerView `json:"host"`
	State *serverState   `json:"state"`
	Needs string         `json:"needs,omitempty"`
}

func (s *Server) serverPageRoutes() {
	m := s.mux
	// On a hub, for the devices it shares with.
	m.HandleFunc("GET /api/peer/hub/status", shared(h(func(r *http.Request) (any, error) {
		if !s.app.Share.IsHub() || s.app.Sampler == nil || s.app.Streams == nil {
			return nil, notFound("this Aniko isn't a server")
		}
		lib := s.hubLibrary()
		st := serverState{
			Name: s.app.Share.Name(), Version: s.app.Update.Version,
			System:  s.app.Sampler.Look(append(append([]string{}, lib.Folders...), s.app.DataDir)),
			Encoder: s.app.Local.Encoder(),
			Files:   lib.Files, Anime: lib.Anime, Size: lib.Size, Scanning: lib.Scanning,
		}
		if st.Version == "" {
			st.Version = config.AppVersion
		}
		for _, v := range s.app.Streams.Live() {
			st.Streams++
			if v.Kind == "transcode" || v.Kind == "hls" {
				st.Converting++
			}
		}
		for _, it := range s.app.Downloads.List() {
			if it.Status == "downloading" || it.Status == "queued" {
				st.Downloads++
			}
		}
		return st, nil
	})))
	// In the app: the servers it uses, each asked now (a few seconds).
	m.HandleFunc("GET /api/servers", h(func(r *http.Request) (any, error) {
		var hubs []share.PeerView
		for _, l := range s.app.Share.Libraries() {
			if l.Host.Role == share.RoleHub {
				hubs = append(hubs, l.Host)
			}
		}
		out := make([]serverView, len(hubs))
		var wg sync.WaitGroup
		for i, host := range hubs {
			out[i].Host = host
			if !host.Online {
				continue
			}
			wg.Add(1)
			go func() {
				defer wg.Done()
				ctx, cancel := context.WithTimeout(r.Context(), 6*time.Second)
				defer cancel()
				raw, _, err := s.app.Share.AskHost(ctx, host.ID, "/api/peer/hub/status", nil)
				var st serverState
				if err != nil || json.Unmarshal(raw, &st) != nil {
					out[i].Needs = "mediaserver 2.0.3 or newer tells the app how it's doing: update it from its dashboard"
					return
				}
				out[i].State = &st
			}()
		}
		wg.Wait()
		return out, nil
	}))
}
