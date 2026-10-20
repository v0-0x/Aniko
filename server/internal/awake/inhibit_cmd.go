//go:build (linux && !android) || darwin

package awake

import (
	"errors"
	"os/exec"
	"sync"
)

// A program that keeps the system awake while it runs: systemd-inhibit on
// Linux, caffeinate on macOS.
type cmdInhibitor struct {
	mu   sync.Mutex
	args []string
	cmd  *exec.Cmd
}

func (c *cmdInhibitor) start() error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.cmd != nil {
		return nil
	}
	path, err := exec.LookPath(c.args[0])
	if err != nil {
		return errors.New(c.args[0] + " isn't installed")
	}
	cmd := exec.Command(path, c.args[1:]...)
	if err := cmd.Start(); err != nil {
		return err
	}
	c.cmd = cmd
	// Reaped when it ends (stopped, or the system ended it).
	go func() {
		_ = cmd.Wait()
		c.mu.Lock()
		if c.cmd == cmd {
			c.cmd = nil
		}
		c.mu.Unlock()
	}()
	return nil
}

func (c *cmdInhibitor) stop() {
	c.mu.Lock()
	cmd := c.cmd
	c.cmd = nil
	c.mu.Unlock()
	if cmd != nil && cmd.Process != nil {
		_ = cmd.Process.Kill()
	}
}
