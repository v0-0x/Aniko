//go:build windows

package util

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// What the programs setup downloads into Aniko's folder is found like any
// program on the PATH, and so is the bash of the Git it unpacks there.
func TestToolsDirIsOnThePath(t *testing.T) {
	dir := t.TempDir()
	bin := filepath.Join(dir, "git", "bin")
	if err := os.MkdirAll(bin, 0o755); err != nil {
		t.Fatal(err)
	}
	for _, p := range []string{filepath.Join(dir, "aniko-test-tool.exe"), filepath.Join(bin, "aniko-test-bash.exe")} {
		if err := os.WriteFile(p, nil, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	t.Setenv("PATH", os.Getenv("PATH")) // restored afterwards
	old := ToolsDir()
	t.Cleanup(func() {
		toolsMu.Lock()
		toolsDir = old
		toolsMu.Unlock()
	})

	SetToolsDir(dir)
	for name, want := range map[string]string{"aniko-test-tool": dir, "aniko-test-bash": bin} {
		p, ok := LookPath(name)
		if !ok || !strings.EqualFold(filepath.Dir(p), want) {
			t.Errorf("LookPath(%s) = %q %v, want it in %s", name, p, ok, want)
		}
	}
	path := os.Getenv("PATH")
	if !strings.HasPrefix(path, dir+string(os.PathListSeparator)+bin+string(os.PathListSeparator)) {
		t.Errorf("PATH %q should start with Aniko's folder and its Git's bin", path)
	}
	// Set again: not on the PATH twice.
	SetToolsDir(dir)
	if os.Getenv("PATH") != path {
		t.Error("SetToolsDir put the folder on the PATH twice")
	}
}
