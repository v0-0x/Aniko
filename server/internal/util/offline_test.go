package util

import (
	"context"
	"errors"
	"testing"
	"time"
)

// Offline mode: the public clients fail at once, without trying.
func TestOfflineModeDialsNothing(t *testing.T) {
	SetOffline(true)
	t.Cleanup(func() { SetOffline(false) })
	start := time.Now()
	_, err := HTTP.Get("https://example.com/")
	if !errors.Is(err, ErrOffline) {
		t.Fatalf("offline: %v (want %v)", err, ErrOffline)
	}
	if time.Since(start) > time.Second {
		t.Errorf("took %v: it tried", time.Since(start))
	}
	if _, err := PublicDialContext(time.Second)(context.Background(), "tcp", "1.1.1.1:443"); !errors.Is(err, ErrOffline) {
		t.Errorf("dial offline: %v", err)
	}
}
