//go:build windows

package winsetup

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"
)

// gitBash reports whether Git for Windows' bash is on this computer, in the
// places Aniko looks for it to run ani-cli (anicli's gitBash): where Git's
// installers and Scoop put it, then the PATH, which has the folder this
// setup unpacks Git into (util.SetToolsDir).
func gitBash() bool {
	var candidates []string
	for _, env := range []string{"ProgramW6432", "ProgramFiles", "ProgramFiles(x86)"} {
		if d := os.Getenv(env); d != "" {
			candidates = append(candidates, filepath.Join(d, "Git", "bin", "bash.exe"))
		}
	}
	if d := os.Getenv("LOCALAPPDATA"); d != "" {
		candidates = append(candidates, filepath.Join(d, "Programs", "Git", "bin", "bash.exe"))
	}
	if home, err := os.UserHomeDir(); err == nil {
		candidates = append(candidates, filepath.Join(home, "scoop", "apps", "git", "current", "bin", "bash.exe"))
	}
	for _, c := range candidates {
		if isFile(c) {
			return true
		}
	}
	// Not WSL's bash (in System32): that's Linux.
	p, err := exec.LookPath("bash")
	return err == nil && !strings.Contains(strings.ToLower(p), `\windows\system32\`)
}

// aniCliScript reports whether the ani-cli script is where Aniko looks for
// it (anicli's findScript): a file without an extension, in a folder of
// the PATH or where Scoop puts it.
func aniCliScript() bool {
	dirs := filepath.SplitList(os.Getenv("PATH"))
	if home, err := os.UserHomeDir(); err == nil {
		dirs = append(dirs, filepath.Join(home, "scoop", "apps", "ani-cli", "current"))
	}
	for _, d := range dirs {
		if d != "" && isFile(filepath.Join(d, "ani-cli")) {
			return true
		}
	}
	return false
}

// vcRuntime reports whether Microsoft's Visual C++ runtime is installed: it
// isn't part of Windows, though most computers have it from another program.
func vcRuntime() bool {
	root := os.Getenv("SystemRoot")
	if root == "" {
		root = `C:\Windows`
	}
	for _, dll := range []string{"vcruntime140.dll", "vcruntime140_1.dll", "msvcp140.dll"} {
		if !isFile(filepath.Join(root, "System32", dll)) {
			return false
		}
	}
	return true
}

// unpackGit runs PortableGit's download, an archive that unpacks itself
// (7-Zip's), so that it unpacks into dir without asking or showing
// anything: -y answers its questions, -gm2 hides its window, -nr leaves out
// Git's own setup script at the end (for its login shells; Aniko runs bash
// without one, as it did with the Git that 7-Zip unpacked for Scoop). An
// archive that doesn't take the last two gets -y alone, with more time: it
// may have been waiting with a message.
func unpackGit(ctx context.Context, exe, dir string) error {
	var err error
	var out []byte
	for _, try := range []struct {
		flags string
		limit time.Duration
	}{{"-y -gm2 -nr", 6 * time.Minute}, {"-y", 12 * time.Minute}} {
		_ = os.RemoveAll(dir)
		tctx, cancel := context.WithTimeout(ctx, try.limit)
		cmd := exec.CommandContext(tctx, exe)
		// The command line as the archive reads it itself: -o"folder",
		// which Go's own quoting would write "-ofolder".
		cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CmdLine: fmt.Sprintf(`"%s" %s -o"%s"`, exe, try.flags, dir)}
		out, err = cmd.CombinedOutput()
		cancel()
		if err == nil && isFile(filepath.Join(dir, "bin", "bash.exe")) {
			return nil
		}
		if ctx.Err() != nil {
			break
		}
	}
	if err == nil {
		return errors.New("Git for Windows didn't unpack")
	}
	return fmt.Errorf("Git for Windows didn't unpack: %w %s", err, strings.TrimSpace(string(out)))
}
