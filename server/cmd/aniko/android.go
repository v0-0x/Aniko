//go:build android

package main

import (
	"os"
	"runtime/debug"
	"time"
)

// Go on Android always starts in UTC: the app gives the device's time zone.
func init() {
	if tz := os.Getenv("TZ"); tz != "" {
		if loc, err := time.LoadLocation(tz); err == nil {
			time.Local = loc
		}
	}
}

// A TV or a phone has little memory, and shares it with the app's window
// (a WebView) and the video player: the server collects its garbage sooner
// than Go's default (which lets the heap double first), and harder once it
// holds 192 MB. $GOGC and $GOMEMLIMIT, when set, decide instead.
func init() {
	if os.Getenv("GOGC") == "" {
		debug.SetGCPercent(50)
	}
	if os.Getenv("GOMEMLIMIT") == "" {
		debug.SetMemoryLimit(192 << 20)
	}
}
