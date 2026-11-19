package app

import (
	"context"
	"errors"
	"log"
	"time"

	"github.com/v0-0x/Aniko/server/internal/anikohub"
	"github.com/v0-0x/Aniko/server/internal/anilist"
	"github.com/v0-0x/Aniko/server/internal/library"
	"github.com/v0-0x/Aniko/server/internal/stream"
)

// An Aniko Hub (aniko --hub) plays nothing: it shares its library with the Aniko
// apps on the network and keeps them in step (share/hub.go, anikohub). What
// it doesn't need doesn't run: the player, Discord, extensions, the Discover
// prefetching, the episode alerts. Its library's anime are fetched in full,
// artwork and episode details included (prefetch.go), for its dashboard.

// hubSettings: a hub shares with the network, and its dashboard is a web
// page (password protected, see api).
func (a *App) hubSettings() error {
	// A Pi converts two videos at most at once (with its encoder: one
	// 1080p each).
	a.Local.MaxTranscodes = 2
	cfg := a.Settings.Get()
	changed := false
	if !cfg.Sharing.Enabled || !cfg.Server.AllowLAN || !cfg.Server.WebUI {
		cfg.Sharing.Enabled, cfg.Server.AllowLAN, cfg.Server.WebUI = true, true, true
		changed = true
	}
	// A Raspberry Pi's video encoder, when there is one and nothing else
	// was chosen: converting by CPU is slow there.
	if cfg.Transcode.HwAccel == "" && stream.HasV4L2Encoder(cfg.Transcode.FfmpegPath) {
		cfg.Transcode.HwAccel = "v4l2m2m"
		changed = true
		log.Printf("hub: converting video with the Raspberry Pi's encoder (h264_v4l2m2m)")
	}
	if !changed {
		return nil
	}
	_, err := a.Settings.Save(cfg)
	return err
}

func (a *App) wireHub() {
	a.Share.Hub = a.HubStore
	a.Downloads.Ended = a.auditDownload
	// Whose a login given to the hub is: AniList says.
	a.Share.CheckAccount = func(ctx context.Context, token string) (int, string, string, error) {
		c := anilist.NewClient()
		c.SetToken(token)
		v, err := c.Viewer(ctx)
		if err != nil {
			return 0, "", "", err
		}
		if v == nil || v.ID == 0 {
			return 0, "", "", errors.New("no AniList account")
		}
		return v.ID, v.Name, v.Avatar.Large, nil
	}
	// The hub follows no one's login (it keeps those it's given).
	a.Share.UseAccount, a.Share.DropAccount = nil, nil
	// No library is shared with a hub.
	a.Share.OnFiles = nil
	a.Sampler = anikohub.NewSampler()
}

// startHub runs a hub's few background jobs.
func (a *App) startHub() {
	a.Share.Start()
	a.Downloads.Start()
	a.Update.Start()
	a.Scanner.StartWatcher()
	a.background(func() { a.Torrents.RunCounter(a.ctx) })
	a.background(func() { a.runPrefetch(a.ctx) })
	a.HubStore.Log(anikohub.Event{Kind: "start", By: "hub", Text: "started (mediaserver " + a.Update.Version + ")"})
	a.emptyHubTrash()
	a.background(a.pruneAudit)
	a.background(func() {
		ctx, cancel := context.WithTimeout(a.ctx, time.Minute)
		defer cancel()
		a.Platform.RefreshViewer(ctx)
		if a.Settings.Get().Library.RefreshOnStartup && a.Scanner.HasLibrary() {
			if _, err := a.Scanner.Scan(a.ctx, library.ScanOptions{}); err != nil && !errors.Is(err, library.ErrScanRunning) {
				log.Printf("startup scan: %v", err)
			}
		}
		// What earlier runs didn't get to (a scan prefetches on its own).
		a.prefetchLibrary()
	})
	log.Printf("anime: %d AniList account(s) given to it", len(a.HubStore.Accounts()))
}
