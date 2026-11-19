// Package winsetup installs the programs Aniko uses on Windows (ffmpeg,
// yt-dlp, Git's bash, ani-cli, aria2, fzf, mpv). Aniko downloads their
// ready-made Windows builds itself, from their release pages into its own
// folder (util.ToolsDir), as macsetup does on a Mac: no package manager, no
// script, no window to follow and no administrator rights. The pages show
// how far it is (State).
package winsetup

import (
	"context"
	"errors"
	"runtime"
	"strings"
	"sync"

	"github.com/v0-0x/Aniko/server/internal/util"
)

// What the setup is doing with a program.
const (
	Waiting     = "waiting"
	Downloading = "downloading"
	Unpacking   = "unpacking"
	Done        = "done"
	Skipped     = "skipped" // it was there already
	Failed      = "failed"
)

// Item is one program of the setup.
type Item struct {
	Name  string `json:"name"`
	State string `json:"state"`
	// Done and Total are the bytes of its download: Total is 0 while its
	// size isn't known.
	Done  int64 `json:"done,omitempty"`
	Total int64 `json:"total,omitempty"`
	// Error says in plain words why it failed.
	Error string `json:"error,omitempty"`
	// Verified: the download matched the checksum its project publishes.
	Verified bool `json:"-"`
}

// Progress is the setup as the pages show it: the one running, or else the
// last one that ran.
type Progress struct {
	Running bool   `json:"running"`
	Items   []Item `json:"items"`
}

// Outcome is how the setup ended, in a line for the user.
func (p Progress) Outcome() (ok bool, text string) {
	var failed []string
	installed := false
	for _, it := range p.Items {
		switch it.State {
		case Failed:
			failed = append(failed, it.Name+" ("+it.Error+")")
		case Done:
			installed = true
		}
	}
	switch {
	case len(failed) > 0:
		return false, "Not installed: " + strings.Join(failed, ", ")
	case installed:
		return true, "Aniko's programs are installed"
	}
	return true, "Aniko's programs were there already"
}

var (
	mu      sync.Mutex
	running bool
	last    []Item
	// ended is closed when the setup that runs ends.
	ended chan struct{}
)

// ErrRunning means the setup is still downloading.
var ErrRunning = errors.New("the programs are already being installed")

// Running reports whether the setup is downloading.
func Running() bool {
	mu.Lock()
	defer mu.Unlock()
	return running
}

// State is how far the setup is.
func State() Progress {
	mu.Lock()
	defer mu.Unlock()
	return Progress{Running: running, Items: append([]Item{}, last...)}
}

// Wait returns once the setup that runs has ended, with how it went.
func Wait() Progress {
	mu.Lock()
	ch := ended
	mu.Unlock()
	if ch != nil {
		<-ch
	}
	return State()
}

// Start starts downloading the programs that are missing and returns at
// once: State follows it and Wait waits for it.
func Start() error {
	if runtime.GOOS != "windows" {
		return errors.New("Aniko installs its programs itself on Windows only: install them with your package manager")
	}
	dir := util.ToolsDir()
	if dir == "" {
		return errors.New("Aniko has no folder for its programs")
	}
	mu.Lock()
	defer mu.Unlock()
	if running {
		return ErrRunning
	}
	running, last, ended = true, nil, make(chan struct{})
	go func() {
		newSetup(dir).run(context.Background(), func(items []Item) {
			mu.Lock()
			last = items
			mu.Unlock()
		})
		mu.Lock()
		running = false
		close(ended)
		mu.Unlock()
	}()
	return nil
}
