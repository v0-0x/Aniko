//go:build darwin

package awake

// caffeinate -i: no idle sleep while it runs (the screen may still turn off).
func newInhibitor() inhibitor {
	return &cmdInhibitor{args: []string{"caffeinate", "-i"}}
}
