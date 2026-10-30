package update

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"

	"github.com/simo1337s/animetest/server/internal/lifecycle"
)

// HubArchive names an Aniko Hub release's archive for a processor (Go's
// GOARCH: arm64 for a 64-bit Raspberry Pi OS, arm for a 32-bit one): a
// folder with the aniko-hub program, its service and its install script.
func HubArchive(version, arch string) string {
	return "aniko-hub-" + version + "-linux-" + arch + ".tar.gz"
}

// applyHub installs an Aniko Hub's new version: the archive's program takes
// the running one's place, and the hub starts again (its service, or
// itself in place).
func (c *Checker) applyHub(ctx context.Context, g *github, target Version, archive *asset) error {
	if archive == nil {
		return errors.New("the newest release has no archive for this computer")
	}
	exe, err := c.Executable()
	if err != nil {
		return err
	}
	dir := c.CacheDir
	if err := removeAll(dir); err != nil {
		return fmt.Errorf("couldn't remove the last update's files: %w", err)
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	path := filepath.Join(dir, filepath.Base(archive.Name))
	err = c.download(ctx, g, g.root()+"/releases/assets/"+strconv.FormatInt(archive.ID, 10), "application/octet-stream", path, archive.Size, func(done, total int64) {
		c.progress(StateDownloading, percent(done, total), "Downloading Aniko Hub "+display(target)+"…")
	})
	if err != nil {
		return fmt.Errorf("couldn't download the update: %w", err)
	}
	if err := verifyDigest(path, archive.Digest); err != nil {
		_ = os.Remove(path)
		return err
	}
	top, err := extract(path, filepath.Join(dir, "new"))
	if err != nil {
		return fmt.Errorf("couldn't unpack the update: %w", err)
	}
	next := filepath.Join(top, "aniko-hub")
	if st, err := os.Stat(next); err != nil || !st.Mode().IsRegular() {
		return errors.New("the update has no aniko-hub program")
	}
	// Next to the running one, then over it (a rename: the running program
	// goes on until it restarts).
	tmp := exe + ".new"
	if err := copyFile(next, tmp, 0o755); err != nil {
		return fmt.Errorf("couldn't put the new version in place: %w", err)
	}
	if err := os.Rename(tmp, exe); err != nil {
		_ = os.Remove(tmp)
		return fmt.Errorf("couldn't put the new version in place: %w", err)
	}
	c.mu.Lock()
	c.st.State, c.st.Progress = StateInstalling, -1
	c.st.Message = "Aniko Hub " + display(target) + " is installed: starting it…"
	c.publishLocked()
	c.mu.Unlock()
	if c.Exits == nil || !c.Exits.Request(lifecycle.Exit{Restart: true}) {
		// The service is named after the program (kumo-hub on a hub
		// installed before the rename).
		return errors.New("installed: restart the hub to use it (sudo systemctl restart " + filepath.Base(exe) + ")")
	}
	return nil
}

func copyFile(from, to string, mode os.FileMode) error {
	in, err := os.Open(from)
	if err != nil {
		return err
	}
	defer in.Close()
	st, err := in.Stat()
	if err != nil {
		return err
	}
	return writeFile(to, in, st.Size(), mode)
}
