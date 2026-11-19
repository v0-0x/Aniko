package api

import (
	"errors"
	"net/http"
	"runtime"

	"github.com/v0-0x/Aniko/server/internal/events"
	"github.com/v0-0x/Aniko/server/internal/macsetup"
	"github.com/v0-0x/Aniko/server/internal/winsetup"
)

// installPrograms starts the setup that installs the programs Aniko uses on
// this computer, by downloads into Aniko's folder: on Windows Aniko
// downloads them itself (ffmpeg, yt-dlp, Git's bash, ani-cli, mpv...) and
// the pages show how far it is (setupProgress), on macOS a Terminal window
// does.
func (s *Server) installPrograms(r *http.Request) (any, error) {
	if !isTrusted(r) {
		return nil, forbidden("programs can only be installed from this computer")
	}
	var err error
	switch runtime.GOOS {
	case "windows":
		if err = winsetup.Start(); err == nil {
			go s.setupEnded()
		}
	case "darwin":
		err = macsetup.Start()
	default:
		return nil, badRequest("Aniko installs its programs itself on Windows and macOS only: install them with your package manager")
	}
	if err != nil {
		if errors.Is(err, winsetup.ErrRunning) || errors.Is(err, macsetup.ErrRunning) {
			return nil, &apiError{http.StatusConflict, err.Error()}
		}
		return nil, err
	}
	return map[string]bool{"started": true}, nil
}

// setupEnded waits for the Windows setup to end and tells the pages how it
// went, whichever one is open: what couldn't be installed and why.
func (s *Server) setupEnded() {
	ok, text := winsetup.Wait().Outcome()
	// The pages read the status again: which programs are there now.
	s.app.Hub.Publish(events.SettingsUpdated, nil)
	if ok {
		s.app.Hub.Success(text)
	} else {
		s.app.Hub.Error(text)
	}
}

// setupProgress is how far the Windows setup is, program by program (the
// one running, or the last one): for this computer's pages.
func (s *Server) setupProgress(r *http.Request) (any, error) {
	if !isTrusted(r) {
		return nil, forbidden("programs can only be installed from this computer")
	}
	return winsetup.State(), nil
}

// setupRunning reports whether the setup is running (on macOS, whether its
// window is open).
func setupRunning() bool {
	switch runtime.GOOS {
	case "windows":
		return winsetup.Running()
	case "darwin":
		return macsetup.Running()
	}
	return false
}
