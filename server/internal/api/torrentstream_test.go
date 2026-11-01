//go:build !android

package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/anacrolix/torrent"
	"github.com/anacrolix/torrent/bencode"
	"github.com/anacrolix/torrent/metainfo"
)

// seedTorrent seeds the files of dir (a batch) from another client, and
// returns its magnet link (with its address in it).
func seedTorrent(t *testing.T, dir string) string {
	t.Helper()
	info := metainfo.Info{PieceLength: 64 << 10}
	if err := info.BuildFromFilePath(dir); err != nil {
		t.Fatal(err)
	}
	var mi metainfo.MetaInfo
	var err error
	if mi.InfoBytes, err = bencode.Marshal(info); err != nil {
		t.Fatal(err)
	}
	cfg := torrent.NewDefaultClientConfig()
	cfg.DataDir, cfg.Seed, cfg.NoDHT, cfg.DisableIPv6, cfg.ListenPort = filepath.Dir(dir), true, true, true, 0
	cl, err := torrent.NewClient(cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cl.Close() })
	tor, err := cl.AddTorrent(&mi)
	if err != nil {
		t.Fatal(err)
	}
	if err := tor.VerifyData(); err != nil {
		t.Fatal(err)
	}
	h := mi.HashInfoBytes()
	return mi.Magnet(&h, &info).String() + fmt.Sprintf("&x.pe=127.0.0.1:%d", cl.LocalPort())
}

// A Torrents tab result played as it downloads: the episode's file of a
// batch, opened by the in-app player as a library file is (probed, its
// file served by ranges).
func TestTorrentStream(t *testing.T) {
	ffmpeg, err := exec.LookPath("ffmpeg")
	if err != nil {
		t.Skip("no ffmpeg")
	}
	if _, err := exec.LookPath("ffprobe"); err != nil {
		t.Skip("no ffprobe")
	}
	const local = "127.0.0.1:5000"
	s := newTestServer(t)
	batch := filepath.Join(seedDir(t), "[Group] Show (01-02) [1080p]")
	if err := os.MkdirAll(batch, 0o755); err != nil {
		t.Fatal(err)
	}
	for ep, secs := range map[int]int{1: 2, 2: 3} {
		out := filepath.Join(batch, fmt.Sprintf("[Group] Show - %02d [1080p].mkv", ep))
		cmd := exec.Command(ffmpeg, "-loglevel", "error", "-f", "lavfi", "-i", fmt.Sprintf("testsrc=duration=%d:size=320x240:rate=24", secs), "-f", "lavfi", "-i", fmt.Sprintf("sine=duration=%d", secs),
			"-c:v", "libx264", "-c:a", "aac", "-shortest", "-y", out)
		if b, err := cmd.CombinedOutput(); err != nil {
			t.Skipf("ffmpeg: %v %s", err, b)
		}
	}
	magnet := seedTorrent(t, batch)

	var started struct {
		Player, Path string
		Torrent      struct{ ID, Name string }
	}
	w := do(s, "POST", "/api/torrents/stream", local, fmt.Sprintf(`{"mediaId":1,"episode":2,"magnet":%q,"player":"builtin"}`, magnet), nil)
	if w.Code != http.StatusOK || json.Unmarshal(w.Body.Bytes(), &started) != nil || started.Player != "builtin" || !strings.HasPrefix(started.Path, "torrent:") ||
		started.Torrent.Name != "[Group] Show - 02 [1080p].mkv" {
		t.Fatalf("stream: %d %s", w.Code, w.Body)
	}
	var opened struct {
		Player string
		Probe  struct {
			Duration float64
			Path     string
			Video    []struct{ Codec string }
		}
	}
	w = do(s, "POST", "/api/playback/local", local, fmt.Sprintf(`{"path":%q,"mediaId":1,"episode":2,"player":"builtin"}`, started.Path), nil)
	if w.Code != http.StatusOK || json.Unmarshal(w.Body.Bytes(), &opened) != nil || opened.Player != "builtin" || opened.Probe.Duration < 2.5 ||
		opened.Probe.Path != started.Path || len(opened.Probe.Video) != 1 || opened.Probe.Video[0].Codec != "h264" {
		t.Fatalf("open: %d %s", w.Code, w.Body)
	}
	want, _ := os.ReadFile(filepath.Join(batch, "[Group] Show - 02 [1080p].mkv"))
	w = do(s, "GET", "/api/local/file?path="+started.Path, local, "", func(r *http.Request) { r.Header.Set("Range", "bytes=1000-1999") })
	if w.Code != http.StatusPartialContent || !bytes.Equal(w.Body.Bytes(), want[1000:2000]) {
		t.Fatalf("file: %d, %d bytes", w.Code, w.Body.Len())
	}
	// Stopped: gone.
	do(s, "DELETE", "/api/torrentstream/"+started.Torrent.ID, local, "", nil)
	if w := do(s, "POST", "/api/playback/local", local, fmt.Sprintf(`{"path":%q,"mediaId":1,"episode":2}`, started.Path), nil); w.Code != http.StatusNotFound {
		t.Fatalf("after stop: %d %s", w.Code, w.Body)
	}
}

// seedDir is a temporary folder for a seeder's files, removed after the
// test as well as it can be: on Windows, a file a client has just closed
// can't be removed at once (t.TempDir would fail the test).
func seedDir(t *testing.T) string {
	t.Helper()
	dir, err := os.MkdirTemp("", "seed-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		for i := 0; i < 50 && os.RemoveAll(dir) != nil; i++ {
			time.Sleep(100 * time.Millisecond)
		}
	})
	return dir
}
