package app

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/v0-0x/Aniko/server/internal/config"
)

// The device's side of mediaserver (its anime side, a hub): its shared
// settings (config.SharedPrefs) are its AniList account's, kept on the
// server. Changed here they're sent to it; changed on another device, the
// server sends them here.

const prefsAtKey = "share:prefs-at"

// prefsState is when this device's shared settings last changed (ms), and
// which ones those are (a hash): saved again as they are (taken from the
// hub), they didn't change here.
type prefsState struct {
	At   int64  `json:"at"`
	Hash string `json:"hash"`
}

var prefsMu sync.Mutex

func prefsJSON(cfg config.Settings) (json.RawMessage, string) {
	raw, _ := json.Marshal(cfg.SharedPrefs())
	sum := sha256.Sum256(raw)
	return raw, hex.EncodeToString(sum[:8])
}

func (a *App) wirePrefs() {
	load := func() prefsState {
		var st prefsState
		_, _ = a.DB.GetKV(prefsAtKey, &st)
		return st
	}
	a.Share.OwnPrefs = func() (json.RawMessage, int64) {
		raw, _ := prefsJSON(a.Settings.Get())
		return raw, load().At
	}
	a.Share.ApplyPrefs = func(data json.RawMessage, at int64) {
		var p config.SharedPrefs
		if err := json.Unmarshal(data, &p); err != nil {
			return
		}
		prefsMu.Lock()
		defer prefsMu.Unlock()
		if at <= load().At {
			return
		}
		next := a.Settings.Get().WithSharedPrefs(p)
		_, hash := prefsJSON(next)
		// Noted before saving: the change that follows is the hub's.
		_ = a.DB.SetKV(prefsAtKey, prefsState{At: at, Hash: hash})
		if _, err := a.Settings.Save(next); err != nil {
			log.Printf("sharing: settings from the hub: %v", err)
			return
		}
		log.Printf("sharing: took the theme and settings from the hub")
	}
	a.Settings.OnChange(func(old, cur config.Settings) {
		oldRaw, _ := prefsJSON(old)
		_, hash := prefsJSON(cur)
		if _, h := prefsJSON(a.Settings.Get()); h != hash {
			return // changed again meanwhile: that change tells
		}
		prefsMu.Lock()
		st := load()
		changed := string(oldRaw) != string(mustPrefs(cur)) && hash != st.Hash
		if changed {
			_ = a.DB.SetKV(prefsAtKey, prefsState{At: time.Now().UnixMilli(), Hash: hash})
		}
		prefsMu.Unlock()
		if changed {
			a.Share.PrefsChanged()
		}
	})
}

func mustPrefs(cfg config.Settings) json.RawMessage {
	raw, _ := prefsJSON(cfg)
	return raw
}
