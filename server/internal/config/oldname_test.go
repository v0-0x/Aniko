package config

import (
	"os"
	"path/filepath"
	"testing"
)

// Kumo's data folder becomes Nyakuro's, unless Nyakuro has one already.
func TestMoveOld(t *testing.T) {
	dir := t.TempDir()
	old, now := filepath.Join(dir, "kumo"), filepath.Join(dir, "nyakuro")
	if got := MoveOld(old, now); got != now {
		t.Fatalf("nothing to move: %q", got)
	}
	if err := os.MkdirAll(old, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(old, "settings.json"), []byte("{}"), 0o600); err != nil {
		t.Fatal(err)
	}
	if got := MoveOld(old, now); got != now {
		t.Fatalf("moved to %q", got)
	}
	if _, err := os.Stat(filepath.Join(now, "settings.json")); err != nil {
		t.Fatalf("the files didn't move: %v", err)
	}
	if _, err := os.Stat(old); !os.IsNotExist(err) {
		t.Fatalf("the old folder stays: %v", err)
	}
	// Both: Nyakuro's is kept, Kumo's left alone.
	if err := os.MkdirAll(old, 0o700); err != nil {
		t.Fatal(err)
	}
	if got := MoveOld(old, now); got != now {
		t.Fatalf("both: %q", got)
	}
	if _, err := os.Stat(old); err != nil {
		t.Fatalf("Kumo's folder went: %v", err)
	}
}

// The database moves with its journal; logs go; a database Nyakuro has
// already is never replaced.
func TestMoveOldFiles(t *testing.T) {
	dir := t.TempDir()
	write := func(name, data string) {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(data), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	write("kumo.db", "db")
	write("kumo.db-wal", "wal")
	write("kumo.log", "log")
	write("kumo.log.1", "log")
	MoveOldFiles(dir)
	for name, want := range map[string]string{"nyakuro.db": "db", "nyakuro.db-wal": "wal"} {
		if b, err := os.ReadFile(filepath.Join(dir, name)); err != nil || string(b) != want {
			t.Fatalf("%s: %q %v", name, b, err)
		}
	}
	for _, name := range []string{"kumo.db", "kumo.db-wal", "kumo.log", "kumo.log.1", "nyakuro.db-shm"} {
		if _, err := os.Stat(filepath.Join(dir, name)); !os.IsNotExist(err) {
			t.Fatalf("%s is there: %v", name, err)
		}
	}
	write("kumo.db", "older")
	MoveOldFiles(dir)
	if b, _ := os.ReadFile(filepath.Join(dir, "nyakuro.db")); string(b) != "db" {
		t.Fatalf("Nyakuro's database was replaced: %q", b)
	}
}

// Aniko's database (the name before Nyakuro's) moves the same way, and
// comes before a Kumo one left behind; its logs in logs/ go.
func TestMoveOldFilesAniko(t *testing.T) {
	dir := t.TempDir()
	write := func(name, data string) {
		if err := os.MkdirAll(filepath.Dir(filepath.Join(dir, name)), 0o700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(dir, name), []byte(data), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	write("aniko.db", "db")
	write("aniko.db-wal", "wal")
	write("kumo.db", "older")
	write("logs/aniko.log", "log")
	write("logs/aniko.log.9", "log")
	write("logs/nyakuro.log", "keep")
	MoveOldFiles(dir)
	for name, want := range map[string]string{"nyakuro.db": "db", "nyakuro.db-wal": "wal", "kumo.db": "older", "logs/nyakuro.log": "keep"} {
		if b, err := os.ReadFile(filepath.Join(dir, name)); err != nil || string(b) != want {
			t.Fatalf("%s: %q %v", name, b, err)
		}
	}
	for _, name := range []string{"aniko.db", "aniko.db-wal", "logs/aniko.log", "logs/aniko.log.9"} {
		if _, err := os.Stat(filepath.Join(dir, name)); !os.IsNotExist(err) {
			t.Fatalf("%s is there: %v", name, err)
		}
	}
}

// The data folder Aniko had becomes Nyakuro's, or Kumo's when there's no
// Aniko one; nothing moves once Nyakuro has its own.
func TestMoveOldData(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("XDG_DATA_HOME", filepath.Join(home, "data"))
	t.Setenv("APPDATA", filepath.Join(home, "data", "Roaming"))
	dir := defaultDataDir()
	olds := oldDataDirs()
	if len(olds) != 2 || filepath.Dir(olds[0]) != filepath.Dir(dir) || filepath.Base(olds[0]) == filepath.Base(dir) {
		t.Fatalf("old folders: %q", olds)
	}
	if got := MoveOldData(dir); got != dir {
		t.Fatalf("nothing to move: %q", got)
	}
	mk := func(p, mark string) {
		if err := os.MkdirAll(p, 0o700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(p, mark), nil, 0o600); err != nil {
			t.Fatal(err)
		}
	}
	// Both old folders: Aniko's (the latest) moves, Kumo's is left alone.
	mk(olds[0], "from-aniko")
	mk(olds[1], "from-kumo")
	if got := MoveOldData(dir); got != dir {
		t.Fatalf("moved to %q", got)
	}
	if _, err := os.Stat(filepath.Join(dir, "from-aniko")); err != nil {
		t.Fatalf("Aniko's files didn't move: %v", err)
	}
	if _, err := os.Stat(olds[0]); !os.IsNotExist(err) {
		t.Fatalf("Aniko's folder stays: %v", err)
	}
	if _, err := os.Stat(filepath.Join(olds[1], "from-kumo")); err != nil {
		t.Fatalf("Kumo's folder went: %v", err)
	}
	// Nyakuro's folder is there: Kumo's stays where it is.
	if got := MoveOldData(dir); got != dir {
		t.Fatalf("both: %q", got)
	}
	if _, err := os.Stat(filepath.Join(olds[1], "from-kumo")); err != nil {
		t.Fatalf("Kumo's folder went: %v", err)
	}
	// Only Kumo's (a copy that never ran as Aniko): it moves.
	if err := os.RemoveAll(dir); err != nil {
		t.Fatal(err)
	}
	if got := MoveOldData(dir); got != dir {
		t.Fatalf("Kumo's: %q", got)
	}
	if _, err := os.Stat(filepath.Join(dir, "from-kumo")); err != nil {
		t.Fatalf("Kumo's files didn't move: %v", err)
	}
}

func TestGetenvOldName(t *testing.T) {
	t.Setenv("NYAKURO_DEVICE_NAME", "")
	t.Setenv("ANIKO_DEVICE_NAME", "")
	t.Setenv("KUMO_DEVICE_NAME", "Den TV")
	if got := Getenv("DEVICE_NAME"); got != "Den TV" {
		t.Fatalf("KUMO_ only: %q", got)
	}
	t.Setenv("ANIKO_DEVICE_NAME", "Bedroom")
	if got := Getenv("DEVICE_NAME"); got != "Bedroom" {
		t.Fatalf("ANIKO_ and KUMO_: %q", got)
	}
	t.Setenv("NYAKURO_DEVICE_NAME", "Living room")
	if got := Getenv("DEVICE_NAME"); got != "Living room" {
		t.Fatalf("all three: %q", got)
	}
}

// A hub installed as Aniko Hub or Kumo Hub keeps its aniko-hub or kumo-hub
// folder (its service names it); a new one gets nyakuro-hub.
func TestHubDataDir(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("XDG_DATA_HOME", filepath.Join(home, "data"))
	t.Setenv("APPDATA", filepath.Join(home, "data", "Roaming"))
	base := filepath.Dir(defaultDataDir())
	if got := HubDataDir(); got != filepath.Join(base, "nyakuro-hub") {
		t.Fatalf("new hub: %q", got)
	}
	if err := os.MkdirAll(filepath.Join(base, "kumo-hub"), 0o700); err != nil {
		t.Fatal(err)
	}
	if got := HubDataDir(); got != filepath.Join(base, "kumo-hub") {
		t.Fatalf("Kumo Hub's: %q", got)
	}
	if err := os.MkdirAll(filepath.Join(base, "aniko-hub"), 0o700); err != nil {
		t.Fatal(err)
	}
	if got := HubDataDir(); got != filepath.Join(base, "aniko-hub") {
		t.Fatalf("Aniko Hub's: %q", got)
	}
}

// A setting naming a file in Aniko's or Kumo's data folder follows it to
// Nyakuro's.
func TestMovedPaths(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("XDG_DATA_HOME", filepath.Join(home, "data"))
	t.Setenv("APPDATA", filepath.Join(home, "data", "Roaming"))
	olds, dir := oldDataDirs(), defaultDataDir()
	s := Defaults()
	s.Mpv.Path = filepath.Join(olds[0], "bin", "mpv")
	s.Transcode.FfmpegPath = filepath.Join(olds[1], "bin", "ffmpeg")
	if movedPaths(&s) {
		t.Fatal("changed before the folder moved")
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	if !movedPaths(&s) || s.Mpv.Path != filepath.Join(dir, "bin", "mpv") || s.Transcode.FfmpegPath != filepath.Join(dir, "bin", "ffmpeg") {
		t.Fatalf("mpv %q, ffmpeg %q", s.Mpv.Path, s.Transcode.FfmpegPath)
	}
	if movedPaths(&s) {
		t.Fatal("changed twice")
	}
}
