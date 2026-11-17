//go:build !darwin && !windows

package util

// addToolsDir: only macOS and Windows have Aniko put programs in its own
// folder.
func addToolsDir(string) {}
