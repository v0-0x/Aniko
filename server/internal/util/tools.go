package util

import "sync"

var (
	toolsMu  sync.Mutex
	toolsDir string
)

// SetToolsDir sets the folder where Aniko puts programs itself (the macOS
// and Windows programs setups: ffmpeg, yt-dlp, ani-cli...). On macOS and
// Windows it goes first on the PATH, for Aniko's lookups and the programs
// it starts; it needn't exist yet.
func SetToolsDir(dir string) {
	toolsMu.Lock()
	toolsDir = dir
	toolsMu.Unlock()
	addToolsDir(dir)
}

// ToolsDir is the folder SetToolsDir set, or "".
func ToolsDir() string {
	toolsMu.Lock()
	defer toolsMu.Unlock()
	return toolsDir
}
