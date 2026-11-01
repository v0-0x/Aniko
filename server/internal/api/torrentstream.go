package api

import (
	"context"
	"net/http"
	"time"

	"github.com/v0-0x/Aniko/server/internal/library"
	"github.com/v0-0x/Aniko/server/internal/player"
	"github.com/v0-0x/Aniko/server/internal/stream"
	"github.com/v0-0x/Aniko/server/internal/torrentstream"
)

// Torrent streaming (package torrentstream): a torrent of the Torrents tab
// played as it downloads, here, instead of going to the torrent client.
// The in-app player plays it like a library file (its path is
// torrent:<id>, see stream.TorrentPrefix): as it is, or converted, its
// subtitles and audio tracks included.

func (s *Server) torrentStreamRoutes() {
	m := s.mux
	m.HandleFunc("POST /api/torrents/stream", h(s.streamTorrent))
	m.HandleFunc("GET /api/torrentstream/{id}", h(func(r *http.Request) (any, error) {
		st, ok := s.app.TorrentStream.Status(r.PathValue("id"))
		if !ok {
			return nil, notFound(stream.ErrTorrentGone.Error())
		}
		return st, nil
	}))
	m.HandleFunc("DELETE /api/torrentstream/{id}", h(func(r *http.Request) (any, error) {
		s.app.TorrentStream.Stop(r.PathValue("id"))
		return nil, nil
	}))
}

type streamTorrentBody struct {
	MediaID  int      `json:"mediaId"`
	Episode  int      `json:"episode"`
	Magnet   string   `json:"magnet"`
	InfoHash string   `json:"infoHash"`
	Name     string   `json:"name"`
	Player   string   `json:"player"` // mpv | builtin ("" = settings)
	Start    *float64 `json:"start"`
}

// streamTorrent is POST /api/torrents/stream: it starts the torrent (its
// details come from its peers) and plays the episode's file of it in mpv,
// or gives the in-app player its path ({path: "torrent:<id>"}, played as a
// library file is).
func (s *Server) streamTorrent(r *http.Request) (any, error) {
	var body streamTorrentBody
	if err := decode(r, &body); err != nil {
		return nil, err
	}
	// What a device with parental controls may watch is known by its
	// library's files: a torrent isn't one.
	if s.app.Share.Parental().Active() {
		return nil, forbidden("parental controls are on: torrents can't be played on this device")
	}
	magnet, err := torrentstream.Magnet(body.Magnet, body.InfoHash, body.Name)
	if err != nil {
		return nil, badRequest(err.Error())
	}
	ctx, cancel := context.WithTimeout(r.Context(), 100*time.Second)
	defer cancel()
	ts, err := s.app.TorrentStream.Open(ctx, magnet, pickEpisodeFile(body.Episode))
	if err != nil {
		return nil, &apiError{http.StatusBadGateway, err.Error()}
	}
	path := stream.TorrentPrefix + ts.ID
	playerName := body.Player
	if playerName == "" {
		playerName = s.app.Settings.Get().Playback.DefaultPlayer
	}
	if !isTrusted(r) {
		playerName = "builtin"
	}
	if playerName == "mpv" {
		target, err := s.app.TorrentStream.URL(ts.ID)
		if err != nil {
			return nil, err
		}
		title := s.episodeTitle(r.Context(), body.MediaID, body.Episode, ts.Name)
		sess, err := s.app.Player.PlayMpv(player.PlayRequest{
			MediaID: body.MediaID, Episode: body.Episode, Title: title, Source: "torrent", Target: target, Start: body.Start,
		})
		if err != nil {
			return nil, err
		}
		return map[string]any{"player": "mpv", "session": sess, "path": path, "torrent": ts}, nil
	}
	return map[string]any{"player": "builtin", "path": path, "torrent": ts}, nil
}

// playTorrent is POST /api/playback/local for a torrent's path: what the
// in-app player needs to open it, or mpv playing it.
func (s *Server) playTorrent(r *http.Request, body playLocalBody) (any, error) {
	id := body.Path[len(stream.TorrentPrefix):]
	if _, ok := s.app.TorrentStream.Status(id); !ok {
		return nil, notFound(stream.ErrTorrentGone.Error())
	}
	st, _ := s.app.TorrentStream.Status(id)
	title := s.episodeTitle(r.Context(), body.MediaID, body.Episode, st.Name)
	playerName := body.Player
	if playerName == "" {
		playerName = s.app.Settings.Get().Playback.DefaultPlayer
	}
	if !isTrusted(r) {
		playerName = "builtin"
	}
	if playerName == "mpv" {
		target, err := s.app.TorrentStream.URL(id)
		if err != nil {
			return nil, err
		}
		sess, err := s.app.Player.PlayMpv(player.PlayRequest{
			MediaID: body.MediaID, Episode: body.Episode, Title: title, Source: "torrent", Target: target, Start: body.Start,
		})
		if err != nil {
			return nil, err
		}
		return map[string]any{"player": "mpv", "session": sess}, nil
	}
	probe, err := s.app.Local.Probe(r.Context(), body.Path)
	if err != nil {
		return nil, err
	}
	return s.builtinPlay(body, probe, title), nil
}

// pickEpisodeFile picks the episode's file of a batch torrent (by the
// number in its name), else the largest video.
func pickEpisodeFile(episode int) torrentstream.Pick {
	return func(paths []string) int {
		if episode <= 0 {
			return -1
		}
		for i, p := range paths {
			if !library.IsVideo(p) {
				continue
			}
			pr := library.Parse(p, nil)
			if pr.Kind == "main" && (pr.Episode == episode || pr.Episode <= episode && episode <= pr.EpisodeEnd) {
				return i
			}
		}
		return -1
	}
}
