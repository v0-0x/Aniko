//go:build windows

package util

import (
	"os"
	"path/filepath"
	"strings"
)

// addToolsDir puts Aniko's own programs folder first on the PATH, and with
// it the bash of the Git that the programs setup unpacks there (winsetup):
// ahead of System32, whose bash is WSL's, which can't run ani-cli.
func addToolsDir(dir string) {
	if dir == "" {
		return
	}
	cur := os.Getenv("PATH")
	have := map[string]bool{}
	for _, d := range filepath.SplitList(cur) {
		have[pathKey(d)] = true
	}
	var dirs []string
	for _, d := range []string{dir, filepath.Join(dir, "git", "bin")} {
		if !have[pathKey(d)] {
			dirs = append(dirs, d)
		}
	}
	if len(dirs) == 0 {
		return
	}
	if cur != "" {
		dirs = append(dirs, cur)
	}
	_ = os.Setenv("PATH", strings.Join(dirs, string(os.PathListSeparator)))
}
