//go:build linux && !android

package awake

// systemd-inhibit holds logind's sleep lock while its program (sleep) runs:
// the system doesn't suspend, by itself or from the desktop's idle timer;
// the screen may still turn off.
func newInhibitor() inhibitor {
	return &cmdInhibitor{args: []string{"systemd-inhibit", "--what=sleep", "--who=Kumo", "--why=A device is playing this computer's anime", "--mode=block", "sleep", "infinity"}}
}
