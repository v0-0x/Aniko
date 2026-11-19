package config

// Nyakuro was called Aniko until 3.0.58, and Kumo before 2.0.37. What it
// kept under those names moves to the new one the first time the new
// version starts, and what was set up with an old name (a service's
// environment, a script) still counts.

import (
	"encoding/json"
	"errors"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"strings"
)

// oldNames are Nyakuro's names before this one, the latest first, as the
// data folder spells them on macOS and Windows (lower case on Linux).
var oldNames = []string{"Aniko", "Kumo"}

// Getenv reads NYAKURO_<name>, or ANIKO_<name> or KUMO_<name> as it was set
// before the renames.
func Getenv(name string) string {
	for _, prefix := range []string{"NYAKURO_", "ANIKO_", "KUMO_"} {
		if v := os.Getenv(prefix + name); v != "" {
			return v
		}
	}
	return ""
}

// oldDataDirs are the data folders Nyakuro had under its old names, the
// latest first: ~/.local/share/aniko and kumo, or the Aniko and Kumo
// folders next to Nyakuro's.
func oldDataDirs() []string {
	dir := defaultDataDir()
	lower := filepath.Base(dir) == "nyakuro"
	dirs := make([]string, 0, len(oldNames))
	for _, name := range oldNames {
		if lower {
			name = strings.ToLower(name)
		}
		dirs = append(dirs, filepath.Join(filepath.Dir(dir), name))
	}
	return dirs
}

// MoveOldData moves the data folder Nyakuro had under an old name (Aniko's,
// or else Kumo's) to dir, when dir doesn't exist yet (see MoveOld). It
// returns where the data is now.
func MoveOldData(dir string) string {
	for _, old := range oldDataDirs() {
		if _, err := os.Lstat(old); err == nil {
			return MoveOld(old, dir)
		}
	}
	return dir
}

// MoveOld moves the folder or file old to dir when only old exists. It
// returns where the files are now: dir, or old when it couldn't be moved
// (it's tried again on the next start).
func MoveOld(old, dir string) string {
	if old == "" || old == dir {
		return dir
	}
	if _, err := os.Lstat(dir); !errors.Is(err, fs.ErrNotExist) {
		return dir
	}
	if _, err := os.Lstat(old); err != nil {
		return dir
	}
	if err := os.Rename(old, dir); err != nil {
		log.Printf("couldn't move %s to %s (Nyakuro's old name to its new one): %v", old, dir, err)
		return old
	}
	log.Printf("moved %s to %s (Nyakuro's old name to its new one)", old, dir)
	return dir
}

// MoveOldFiles renames the files Nyakuro kept in its data folder under its
// old names: the database (aniko.db, or else kumo.db; with its journal,
// which goes first: a database without it would lose the last changes) and
// the server's logs (just removed).
func MoveOldFiles(dataDir string) {
	db := filepath.Join(dataDir, "nyakuro.db")
	for _, name := range []string{"aniko.db", "kumo.db"} {
		old := filepath.Join(dataDir, name)
		if _, err := os.Stat(old); err != nil {
			continue
		}
		if _, err := os.Lstat(db); errors.Is(err, fs.ErrNotExist) {
			for _, suffix := range []string{"-wal", "-shm", ""} {
				MoveOld(old+suffix, db+suffix)
			}
		}
		break
	}
	// Aniko's logs were in logs/ (aniko.log, aniko.log.1, …), Kumo's in the
	// folder itself.
	logs, _ := filepath.Glob(filepath.Join(dataDir, "logs", "aniko.log*"))
	for _, name := range []string{"kumo.log", "kumo.log.1", "kumo.log.2", "kumo.log.3"} {
		logs = append(logs, filepath.Join(dataDir, name))
	}
	for _, p := range logs {
		_ = os.Remove(p)
	}
}

// HubDataDir is a hub's data folder when none is given: nyakuro-hub next to
// Nyakuro's, or the aniko-hub or kumo-hub one a hub installed as Aniko Hub
// or Kumo Hub has (its service names that one, so it stays where it is).
func HubDataDir() string {
	base := filepath.Dir(defaultDataDir())
	dir := filepath.Join(base, "nyakuro-hub")
	if _, err := os.Lstat(dir); errors.Is(err, fs.ErrNotExist) {
		for _, name := range []string{"aniko-hub", "kumo-hub"} {
			if old := filepath.Join(base, name); isDir(old) {
				return old
			}
		}
	}
	return dir
}

func isDir(p string) bool {
	st, err := os.Stat(p)
	return err == nil && st.IsDir()
}

// movedPaths points settings that named a file in an old data folder (a
// program the macOS setup put there, say) at the same file in Nyakuro's,
// once the folder has moved. It says whether anything changed.
func movedPaths(s *Settings) bool {
	dir := defaultDataDir()
	if !isDir(dir) {
		return false
	}
	quoted := func(p string) string {
		b, _ := json.Marshal(p + string(filepath.Separator))
		return strings.Trim(string(b), `"`)
	}
	raw, err := json.Marshal(s)
	if err != nil {
		return false
	}
	text, changed := string(raw), false
	for _, old := range oldDataDirs() {
		if _, err := os.Lstat(old); !errors.Is(err, fs.ErrNotExist) || !strings.Contains(text, quoted(old)) {
			continue
		}
		text, changed = strings.ReplaceAll(text, quoted(old), quoted(dir)), true
	}
	if !changed {
		return false
	}
	var next Settings
	if json.Unmarshal([]byte(text), &next) != nil {
		return false
	}
	*s = next
	return true
}
