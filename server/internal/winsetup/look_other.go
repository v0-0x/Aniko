//go:build !windows

package winsetup

import (
	"context"
	"errors"
)

// Only Windows has these (look_windows.go): elsewhere the package builds
// for the tests, which bring their own.
func gitBash() bool      { return false }
func aniCliScript() bool { return false }
func vcRuntime() bool    { return true }

func unpackGit(context.Context, string, string) error {
	return errors.New("PortableGit only unpacks on Windows")
}
