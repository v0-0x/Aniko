//go:build !windows && !darwin

package config

import (
	"os"
	"path/filepath"
	"syscall"
)

// videosFolder is the home folder for videos (the library's default is its
// Anime folder).
const videosFolder = "Videos"

func defaultDataDir() string {
	if d := os.Getenv("XDG_DATA_HOME"); d != "" {
		return filepath.Join(d, "aniko")
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".local", "share", "aniko")
}

func runtimeDir() string {
	base := os.Getenv("XDG_RUNTIME_DIR")
	if base == "" {
		base = os.TempDir()
	}
	dir := filepath.Join(base, "aniko")
	// In a folder everyone writes to (no XDG_RUNTIME_DIR: a service),
	// another account could have made it first, and own what Aniko keeps
	// and runs from it: then it's a folder of Aniko's own data instead.
	_ = os.MkdirAll(dir, 0o700)
	if !ownFolder(dir) {
		dir = filepath.Join(DataDir(), "run")
	}
	return dir
}

// ownFolder reports a real folder of this account's that nobody else can
// write to.
func ownFolder(dir string) bool {
	st, err := os.Lstat(dir)
	if err != nil || !st.IsDir() || st.Mode().Perm()&0o022 != 0 {
		return false
	}
	sys, ok := st.Sys().(*syscall.Stat_t)
	return ok && int(sys.Uid) == os.Getuid()
}

// findQbittorrent prefers a native qBittorrent and falls back to the
// Flatpak export (system-wide or per-user install).
func findQbittorrent(home string) string {
	for _, p := range []string{
		"/usr/bin/qbittorrent",
		"/var/lib/flatpak/exports/bin/org.qbittorrent.qBittorrent",
		filepath.Join(home, ".local/share/flatpak/exports/bin/org.qbittorrent.qBittorrent"),
	} {
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	return "/usr/bin/qbittorrent"
}

func defaultTransmission() string { return "/usr/bin/transmission-gtk" }
