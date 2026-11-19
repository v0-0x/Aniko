package winsetup

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"
)

// host stands in for github.com and raw.githubusercontent.com: release
// files by their path, and the redirect from releases/latest/download.
type host struct {
	*httptest.Server
	mu    sync.Mutex
	files map[string][]byte // by path
	tags  map[string]string // a repository's newest release
	hits  map[string]int    // requests by path
	// answer replaces the answer for a path.
	answer map[string]http.HandlerFunc
}

func newHost(t *testing.T) *host {
	h := &host{files: map[string][]byte{}, tags: map[string]string{}, hits: map[string]int{}, answer: map[string]http.HandlerFunc{}}
	h.Server = httptest.NewServer(http.HandlerFunc(h.serve))
	t.Cleanup(h.Close)
	return h
}

func (h *host) serve(w http.ResponseWriter, r *http.Request) {
	h.mu.Lock()
	h.hits[r.URL.Path]++
	answer := h.answer[r.URL.Path]
	body, ok := h.files[r.URL.Path]
	repo, file, latest := strings.Cut(strings.TrimPrefix(r.URL.Path, "/"), "/releases/latest/download/")
	tag := h.tags[repo]
	h.mu.Unlock()
	switch {
	case answer != nil:
		answer(w, r)
	case latest && tag != "":
		http.Redirect(w, r, "/"+repo+"/releases/download/"+tag+"/"+file, http.StatusFound)
	case ok:
		w.Header().Set("ETag", `"`+sum(body)[:16]+`"`)
		http.ServeContent(w, r, "", time.Time{}, bytes.NewReader(body))
	default:
		http.NotFound(w, r)
	}
}

// release puts a release's files on the host as the repository's newest.
func (h *host) release(repo, tag string, files map[string][]byte) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.tags[repo] = tag
	for name, body := range files {
		h.files["/"+repo+"/releases/download/"+tag+"/"+name] = body
	}
}

func (h *host) requests() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	n := 0
	for _, c := range h.hits {
		n += c
	}
	return n
}

func sum(b []byte) string {
	s := sha256.Sum256(b)
	return hex.EncodeToString(s[:])
}

// sumsOf is a checksums file as sha256sum writes it.
func sumsOf(files map[string][]byte) []byte {
	var names []string
	for n := range files {
		names = append(names, n)
	}
	sort.Strings(names)
	var b strings.Builder
	for _, n := range names {
		b.WriteString(sum(files[n]) + "  " + n + "\n")
	}
	return []byte(b.String())
}

// zipOf makes a zip of entries given as name, content, name, content...
func zipOf(t *testing.T, entries ...string) []byte {
	var buf bytes.Buffer
	w := zip.NewWriter(&buf)
	for i := 0; i < len(entries); i += 2 {
		f, err := w.CreateHeader(&zip.FileHeader{Name: entries[i], Method: zip.Deflate})
		if err != nil {
			t.Fatal(err)
		}
		_, _ = f.Write([]byte(entries[i+1]))
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

const portableGitExe = "MZ PortableGit, unpacks itself"

// releases puts every program's newest release on the host, laid out like
// the real ones.
func (h *host) releases(t *testing.T) {
	ffmpeg := func(v string) []byte {
		d := "ffmpeg-" + v + "/"
		return zipOf(t, d+"LICENSE.txt", "GPL", d+"bin/ffmpeg.exe", "ffmpeg "+v, d+"bin/ffplay.exe", "ffplay "+v, d+"bin/ffprobe.exe", "ffprobe "+v, d+"doc/ffmpeg.html", "<html>")
	}
	btbn := map[string][]byte{
		"ffmpeg-master-latest-linux64-gpl.tar.xz":     []byte("linux"),
		"ffmpeg-master-latest-win64-gpl.zip":          ffmpeg("master"),
		"ffmpeg-master-latest-win64-gpl-shared.zip":   ffmpeg("master shared"),
		"ffmpeg-n8.1-latest-win64-gpl-8.1.zip":        ffmpeg("8.1"),
		"ffmpeg-n9.0-latest-win64-gpl-9.0.zip":        ffmpeg("9.0"),
		"ffmpeg-n9.0-latest-win64-gpl-shared-9.0.zip": ffmpeg("9.0 shared"),
		"ffmpeg-n9.0-latest-win64-lgpl-9.0.zip":       ffmpeg("9.0 lgpl"),
		"ffmpeg-n9.0-latest-winarm64-gpl-9.0.zip":     ffmpeg("9.0 arm"),
	}
	btbn["checksums.sha256"] = sumsOf(btbn)
	h.release("BtbN/FFmpeg-Builds", "latest", btbn)

	ytdlp := map[string][]byte{"yt-dlp.exe": []byte("MZ yt-dlp"), "yt-dlp": []byte("python"), "yt-dlp_x86.exe": []byte("MZ yt-dlp 32")}
	ytdlp["SHA2-256SUMS"] = sumsOf(ytdlp)
	h.release("yt-dlp/yt-dlp", "2026.10.26", ytdlp)

	h.release("git-for-windows/git", "v2.56.1.windows.1", map[string][]byte{"PortableGit-2.56.1-64-bit.7z.exe": []byte(portableGitExe)})

	// Not 1.37.0, whose real checksum Nyakuro knows.
	h.release("aria2/aria2", "release-1.38.0", map[string][]byte{
		"aria2-1.38.0-win-64bit-build1.zip": zipOf(t, "aria2-1.38.0-win-64bit-build1/", "", "aria2-1.38.0-win-64bit-build1/aria2c.exe", "aria2c", "aria2-1.38.0-win-64bit-build1/COPYING", "GPL"),
	})

	fzf := map[string][]byte{"fzf-0.75.0-windows_amd64.zip": zipOf(t, "fzf.exe", "fzf"), "fzf-0.75.0-windows_arm64.zip": zipOf(t, "fzf.exe", "fzf arm")}
	fzf["fzf_0.75.0_checksums.txt"] = sumsOf(fzf)
	h.release("junegunn/fzf", "v0.75.0", fzf)

	h.release("mpv-player/mpv", "v0.42.0", map[string][]byte{
		"mpv-v0.42.0-x86_64-pc-windows-msvc.zip": zipOf(t, "mpv-register.bat", "@echo", "mpv.com", "com", "mpv.exe", "mpv", "vulkan-1.dll", "vulkan"),
	})

	h.mu.Lock()
	h.files["/pystardust/ani-cli/master/ani-cli"] = []byte("#!/bin/sh\necho ani-cli\n")
	h.mu.Unlock()
}

// newTestSetup is a setup that downloads from the host into dir, on a
// computer that has only what's in dir.
func newTestSetup(h *host, dir string) *setup {
	return &setup{
		dir:        dir,
		client:     h.Client(),
		github:     h.URL,
		raw:        h.URL,
		have:       func(name string) bool { return isFile(filepath.Join(dir, name+".exe")) },
		haveBash:   func() bool { return isFile(filepath.Join(dir, "git", "bin", "bash.exe")) },
		haveAniCli: func() bool { return isFile(filepath.Join(dir, "ani-cli")) },
		vcRuntime:  func() bool { return true },
		// Like PortableGit: unpacks into the folder it's told.
		unpackGit: func(_ context.Context, exe, into string) error {
			if b, err := os.ReadFile(exe); err != nil || string(b) != portableGitExe {
				return errors.New("not the PortableGit download")
			}
			if err := os.MkdirAll(filepath.Join(into, "bin"), 0o755); err != nil {
				return err
			}
			return os.WriteFile(filepath.Join(into, "bin", "bash.exe"), []byte("bash"), 0o755)
		},
		pause: time.Millisecond,
		stall: 10 * time.Second,
	}
}

// tree lists the files under dir with their contents.
func tree(t *testing.T, dir string) map[string]string {
	out := map[string]string{}
	err := filepath.WalkDir(dir, func(p string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return err
		}
		b, err := os.ReadFile(p)
		rel, _ := filepath.Rel(dir, p)
		out[filepath.ToSlash(rel)] = string(b)
		return err
	})
	if err != nil {
		t.Fatal(err)
	}
	return out
}

func item(t *testing.T, items []Item, name string) Item {
	for _, it := range items {
		if it.Name == name {
			return it
		}
	}
	t.Fatalf("no %s among %+v", name, items)
	return Item{}
}

func equal(a, b map[string]string) bool {
	if len(a) != len(b) {
		return false
	}
	for k, v := range a {
		if w, ok := b[k]; !ok || v != w {
			return false
		}
	}
	return true
}

// everything is Nyakuro's folder after a setup that had to download it all.
var everything = map[string]string{
	"ffmpeg.exe":       "ffmpeg 9.0",
	"ffprobe.exe":      "ffprobe 9.0",
	"yt-dlp.exe":       "MZ yt-dlp",
	"git/bin/bash.exe": "bash",
	"ani-cli":          "#!/bin/sh\necho ani-cli\n",
	"aria2c.exe":       "aria2c",
	"fzf.exe":          "fzf",
	"mpv.exe":          "mpv",
	"vulkan-1.dll":     "vulkan",
}

// A computer with none of the programs gets each from its newest release:
// only the program files, out of whatever folder of the zip they're in, the
// newest ffmpeg release rather than an older one or the current code's
// build, and nothing else left in the folder.
func TestDownloadsEverything(t *testing.T) {
	h := newHost(t)
	h.releases(t)
	dir := filepath.Join(t.TempDir(), "bin") // made by the setup
	items := newTestSetup(h, dir).run(context.Background(), nil)
	for _, it := range items {
		if it.State != Done || it.Error != "" {
			t.Errorf("%s: %s %s", it.Name, it.State, it.Error)
		}
	}
	if got := tree(t, dir); !equal(got, everything) {
		t.Errorf("Nyakuro's folder has %q, want %q", got, everything)
	}
	// The projects that publish checksums had theirs checked.
	for name, want := range map[string]bool{"ffmpeg": true, "yt-dlp": true, "fzf": true, "Git Bash": false, "ani-cli": false, "aria2": false, "mpv": false} {
		if got := item(t, items, name).Verified; got != want {
			t.Errorf("%s: verified %v, want %v", name, got, want)
		}
	}
}

// What's there is left alone, and nothing is asked of the hosts for it: the
// setup can run again and again.
func TestSkipsWhatIsThere(t *testing.T) {
	h := newHost(t)
	h.releases(t)
	dir := t.TempDir()
	s := newTestSetup(h, dir)
	s.run(context.Background(), nil)
	before := h.requests()
	for _, it := range s.run(context.Background(), nil) {
		if it.State != Skipped {
			t.Errorf("%s: %s the second time, want it skipped", it.Name, it.State)
		}
	}
	if n := h.requests() - before; n != 0 {
		t.Errorf("%d requests for programs that are there", n)
	}

	// With ffmpeg from elsewhere and no ffprobe, only ffprobe is taken.
	dir = t.TempDir()
	s = newTestSetup(h, dir)
	s.have = func(name string) bool { return name != "ffprobe" }
	s.haveBash = func() bool { return true }
	s.haveAniCli = func() bool { return true }
	items := s.run(context.Background(), nil)
	if it := item(t, items, "ffmpeg"); it.State != Done {
		t.Errorf("ffmpeg: %s %s", it.State, it.Error)
	}
	if got, want := tree(t, dir), map[string]string{"ffprobe.exe": "ffprobe 9.0"}; !equal(got, want) {
		t.Errorf("Nyakuro's folder has %q, want %q", got, want)
	}
}

// A zip can't write outside Nyakuro's folder: entries whose path leaves the
// zip aren't taken, and the others land under the program's own name.
func TestUnzipStaysInTheFolder(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, "bin")
	if err := os.Mkdir(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	write := func(entries ...string) string {
		p := filepath.Join(root, "test.zip")
		if err := os.WriteFile(p, zipOf(t, entries...), 0o644); err != nil {
			t.Fatal(err)
		}
		return p
	}
	escaping := []string{"../ffmpeg.exe", "evil", "/abs/ffmpeg.exe", "evil", `C:\Windows\ffmpeg.exe`, "evil", "a/../../ffmpeg.exe", "evil", `..\ffmpeg.exe`, "evil", "ffmpeg.exe/", ""}
	if err := unzip(write(escaping...), dir, []string{"ffmpeg.exe"}); err == nil {
		t.Error("took ffmpeg.exe from a path that leaves the zip")
	}
	if got := tree(t, root); len(got) != 1 {
		t.Errorf("files written: %q", got)
	}

	good := append(escaping, "build/bin/FFmpeg.exe", "good", "build/readme.txt", "text", "../../evil.exe", "evil")
	if err := unzip(write(good...), dir, []string{"ffmpeg.exe", "?ffprobe.exe"}); err != nil {
		t.Fatal(err)
	}
	got := tree(t, root)
	delete(got, "test.zip")
	if want := map[string]string{"bin/ffmpeg.exe": "good"}; !equal(got, want) {
		t.Errorf("files written: %q, want %q", got, want)
	}

	// A file that has to be there and isn't.
	if err := unzip(write("readme.txt", "text"), dir, []string{"ffprobe.exe"}); err == nil || !strings.Contains(err.Error(), "ffprobe.exe isn't in the download") {
		t.Errorf("a zip without ffprobe.exe: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, "not.zip"), []byte("<html>"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := unzip(filepath.Join(root, "not.zip"), dir, []string{"ffmpeg.exe"}); err == nil {
		t.Error("unpacked a file that isn't a zip")
	}
}

// A download that doesn't match its project's checksum isn't kept, nor one
// the checksums don't list; the other programs are installed all the same.
func TestChecksums(t *testing.T) {
	h := newHost(t)
	h.releases(t)
	// Someone else's yt-dlp.exe and fzf, and an ffmpeg zip that isn't
	// listed (with nowhere else to get ffmpeg).
	h.mu.Lock()
	h.files["/yt-dlp/yt-dlp/releases/download/2026.10.26/yt-dlp.exe"] = []byte("MZ something else")
	h.files["/junegunn/fzf/releases/download/v0.75.0/fzf-0.75.0-windows_amd64.zip"] = zipOf(t, "fzf.exe", "something else")
	h.files["/BtbN/FFmpeg-Builds/releases/download/latest/checksums.sha256"] = []byte("00  ffmpeg-master-latest-win64-gpl.zip\n")
	h.mu.Unlock()
	dir := t.TempDir()
	items := newTestSetup(h, dir).run(context.Background(), nil)
	for _, name := range []string{"yt-dlp", "fzf", "ffmpeg"} {
		it := item(t, items, name)
		if it.State != Failed || !strings.Contains(it.Error, "checksum") || it.Verified {
			t.Errorf("%s: %s %q, want it failed for its checksum", name, it.State, it.Error)
		}
	}
	want := map[string]string{}
	for k, v := range everything {
		want[k] = v
	}
	for _, gone := range []string{"yt-dlp.exe", "fzf.exe", "ffmpeg.exe", "ffprobe.exe"} {
		delete(want, gone)
	}
	if got := tree(t, dir); !equal(got, want) {
		t.Errorf("Nyakuro's folder has %q, want %q", got, want)
	}

	// aria2 publishes none: the one of the release Nyakuro knows is checked.
	h.release("aria2/aria2", "release-1.37.0", map[string][]byte{"aria2-1.37.0-win-64bit-build1.zip": zipOf(t, "aria2c.exe", "not the real 1.37.0")})
	dir = t.TempDir()
	items = newTestSetup(h, dir).run(context.Background(), nil)
	if it := item(t, items, "aria2"); it.State != Failed || !strings.Contains(it.Error, "checksum") {
		t.Errorf("aria2 1.37.0 with other contents: %s %q", it.State, it.Error)
	}
	if isFile(filepath.Join(dir, "aria2c.exe")) {
		t.Error("kept an aria2c.exe that isn't the release's")
	}
}

// A project that stops publishing checksums: its program is still
// installed, unchecked.
func TestNoChecksumsPublished(t *testing.T) {
	h := newHost(t)
	h.releases(t)
	h.mu.Lock()
	delete(h.files, "/yt-dlp/yt-dlp/releases/download/2026.10.26/SHA2-256SUMS")
	delete(h.files, "/BtbN/FFmpeg-Builds/releases/download/latest/checksums.sha256")
	h.mu.Unlock()
	dir := t.TempDir()
	items := newTestSetup(h, dir).run(context.Background(), nil)
	for _, name := range []string{"yt-dlp", "ffmpeg"} {
		if it := item(t, items, name); it.State != Done || it.Verified {
			t.Errorf("%s: %s %s, verified %v", name, it.State, it.Error, it.Verified)
		}
	}
	// With no list to pick from: the build whose name is always the same.
	if got := tree(t, dir)["ffmpeg.exe"]; got != "ffmpeg master" {
		t.Errorf("ffmpeg.exe is %q", got)
	}
}

// cut answers with the start of a file and then breaks the connection.
func cut(body []byte, n int) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Length", "1000000")
		w.Header().Set("ETag", `"`+sum(body)[:16]+`"`)
		_, _ = w.Write(body[:n])
		w.(http.Flusher).Flush()
		panic(http.ErrAbortHandler)
	}
}

// A download that keeps breaking off leaves nothing in the folder, not even
// a part of the file, and says why in plain words; so does a host that
// isn't there, or one that doesn't have the file.
func TestFailedDownloadLeavesNothing(t *testing.T) {
	h := newHost(t)
	h.releases(t)
	exe := "/yt-dlp/yt-dlp/releases/download/2026.10.26/yt-dlp.exe"
	zipPath := "/junegunn/fzf/releases/download/v0.75.0/fzf-0.75.0-windows_amd64.zip"
	h.mu.Lock()
	h.answer[exe] = cut(h.files[exe], 4)
	h.answer[zipPath] = cut(h.files[zipPath], 10)
	delete(h.files, "/mpv-player/mpv/releases/download/v0.42.0/mpv-v0.42.0-x86_64-pc-windows-msvc.zip")
	delete(h.tags, "aria2/aria2")
	h.mu.Unlock()
	dir := t.TempDir()
	// Left by a setup that was cut off: swept at the start.
	for _, p := range []string{"ffmpeg.exe.part", "setup-123.zip", "setup-PortableGit.exe", filepath.Join("git.part", "bin", "bash.exe")} {
		_ = os.MkdirAll(filepath.Dir(filepath.Join(dir, p)), 0o755)
		if err := os.WriteFile(filepath.Join(dir, p), []byte("half"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	s := newTestSetup(h, dir)
	items := s.run(context.Background(), nil)
	host := hostOf(h.URL)
	for name, want := range map[string]string{
		"yt-dlp": "the connection to " + host + " broke: check the internet connection",
		"fzf":    "the connection to " + host + " broke: check the internet connection",
		"mpv":    "the download isn't on " + host + " any more",
		"aria2":  "the download isn't on " + host + " any more",
	} {
		if it := item(t, items, name); it.State != Failed || it.Error != want {
			t.Errorf("%s: %s %q, want it failed with %q", name, it.State, it.Error, want)
		}
	}
	// Tried again before giving up; a file that isn't there is not.
	h.mu.Lock()
	if n := h.hits[exe]; n != tries {
		t.Errorf("yt-dlp.exe asked for %d times, want %d", n, tries)
	}
	if n := h.hits["/mpv-player/mpv/releases/download/v0.42.0/mpv-v0.42.0-x86_64-pc-windows-msvc.zip"]; n != 1 {
		t.Errorf("a missing file asked for %d times", n)
	}
	h.mu.Unlock()
	want := map[string]string{}
	for k, v := range everything {
		want[k] = v
	}
	for _, gone := range []string{"yt-dlp.exe", "fzf.exe", "mpv.exe", "vulkan-1.dll", "aria2c.exe"} {
		delete(want, gone)
	}
	if got := tree(t, dir); !equal(got, want) {
		t.Errorf("Nyakuro's folder has %q, want %q", got, want)
	}

	// No host at all.
	h.Close()
	dir = t.TempDir()
	for _, it := range newTestSetup(h, dir).run(context.Background(), nil) {
		if it.State != Failed || it.Error != "no connection to "+host+": check the internet connection" {
			t.Errorf("%s without a host: %s %q", it.Name, it.State, it.Error)
		}
	}
	if got := tree(t, dir); len(got) != 0 {
		t.Errorf("Nyakuro's folder has %q after a setup with no connection", got)
	}
}

// A download that breaks off goes on from where it was at the next try.
func TestDownloadGoesOn(t *testing.T) {
	h := newHost(t)
	h.releases(t)
	exe := "/yt-dlp/yt-dlp/releases/download/2026.10.26/yt-dlp.exe"
	body := bytes.Repeat([]byte("MZ yt-dlp "), 1000)
	ytdlp := map[string][]byte{"yt-dlp.exe": body}
	ytdlp["SHA2-256SUMS"] = sumsOf(ytdlp)
	h.release("yt-dlp/yt-dlp", "2026.10.26", ytdlp)
	var ranges []string
	h.mu.Lock()
	h.answer[exe] = func(w http.ResponseWriter, r *http.Request) {
		h.mu.Lock()
		ranges = append(ranges, r.Header.Get("Range"))
		first := len(ranges) == 1
		h.mu.Unlock()
		w.Header().Set("ETag", `"`+sum(body)[:16]+`"`)
		if first {
			w.Header().Set("Content-Length", "10000")
			_, _ = w.Write(body[:4000])
			w.(http.Flusher).Flush()
			panic(http.ErrAbortHandler)
		}
		http.ServeContent(w, r, "", time.Time{}, bytes.NewReader(body))
	}
	h.mu.Unlock()
	dir := t.TempDir()
	s := newTestSetup(h, dir)
	s.have = func(name string) bool { return name != "yt-dlp" }
	s.haveBash = func() bool { return true }
	s.haveAniCli = func() bool { return true }
	items := s.run(context.Background(), nil)
	if it := item(t, items, "yt-dlp"); it.State != Done || !it.Verified {
		t.Fatalf("yt-dlp: %s %s", it.State, it.Error)
	}
	if got := tree(t, dir); !equal(got, map[string]string{"yt-dlp.exe": string(body)}) {
		t.Errorf("yt-dlp.exe isn't the whole file (%d files)", len(got))
	}
	if len(ranges) != 2 || ranges[0] != "" || ranges[1] != "bytes=4000-" {
		t.Errorf("asked for the ranges %q, want all of it and then the rest", ranges)
	}
}

// A host that can't go on with the part it's asked to (the file changed)
// is asked for all of it.
func TestDownloadStartsOver(t *testing.T) {
	h := newHost(t)
	h.releases(t)
	exe := "/yt-dlp/yt-dlp/releases/download/2026.10.26/yt-dlp.exe"
	h.mu.Lock()
	body := h.files[exe]
	asked := 0
	h.answer[exe] = func(w http.ResponseWriter, r *http.Request) {
		h.mu.Lock()
		asked++
		n := asked
		h.mu.Unlock()
		switch {
		case n == 1:
			cut(body, 4)(w, r)
		case r.Header.Get("Range") != "":
			w.WriteHeader(http.StatusRequestedRangeNotSatisfiable)
		default:
			_, _ = w.Write(body)
		}
	}
	h.mu.Unlock()
	dir := t.TempDir()
	s := newTestSetup(h, dir)
	s.have = func(name string) bool { return name != "yt-dlp" }
	s.haveBash = func() bool { return true }
	s.haveAniCli = func() bool { return true }
	items := s.run(context.Background(), nil)
	if it := item(t, items, "yt-dlp"); it.State != Done || !it.Verified {
		t.Fatalf("yt-dlp: %s %s", it.State, it.Error)
	}
	if got := tree(t, dir); !equal(got, map[string]string{"yt-dlp.exe": string(body)}) {
		t.Errorf("Nyakuro's folder has %q", got)
	}
}

// A download that stops coming is given up, instead of waiting for good.
func TestStalledDownload(t *testing.T) {
	h := newHost(t)
	h.releases(t)
	exe := "/yt-dlp/yt-dlp/releases/download/2026.10.26/yt-dlp.exe"
	release := make(chan struct{})
	t.Cleanup(func() { close(release) })
	h.mu.Lock()
	h.answer[exe] = func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Length", "10000")
		_, _ = w.Write([]byte("MZ"))
		w.(http.Flusher).Flush()
		select {
		case <-release:
		case <-r.Context().Done():
		}
	}
	h.mu.Unlock()
	dir := t.TempDir()
	s := newTestSetup(h, dir)
	s.stall = 200 * time.Millisecond
	s.have = func(name string) bool { return name != "yt-dlp" }
	s.haveBash = func() bool { return true }
	s.haveAniCli = func() bool { return true }
	items := s.run(context.Background(), nil)
	if it := item(t, items, "yt-dlp"); it.State != Failed || !strings.Contains(it.Error, "stopped answering") {
		t.Errorf("yt-dlp: %s %q", it.State, it.Error)
	}
	if got := tree(t, dir); len(got) != 0 {
		t.Errorf("Nyakuro's folder has %q", got)
	}
}

// The pages are told which program is being downloaded and how far it is,
// then how each ended.
func TestReportsProgress(t *testing.T) {
	h := newHost(t)
	h.releases(t)
	big := bytes.Repeat([]byte("MZ"), 600<<10) // more than one read
	ytdlp := map[string][]byte{"yt-dlp.exe": big}
	ytdlp["SHA2-256SUMS"] = sumsOf(ytdlp)
	h.release("yt-dlp/yt-dlp", "2026.10.26", ytdlp)
	h.mu.Lock()
	delete(h.tags, "junegunn/fzf")
	h.mu.Unlock()

	var mu sync.Mutex
	var seen [][]Item
	final := newTestSetup(h, t.TempDir()).run(context.Background(), func(items []Item) {
		mu.Lock()
		seen = append(seen, items)
		mu.Unlock()
	})
	if len(seen) == 0 {
		t.Fatal("nothing reported")
	}
	var names []string
	for _, it := range seen[0] {
		names = append(names, it.Name)
		if it.Name != "ffmpeg" && it.State != Waiting {
			t.Errorf("%s starts as %s", it.Name, it.State)
		}
	}
	if got, want := strings.Join(names, ", "), "ffmpeg, yt-dlp, Git Bash, ani-cli, aria2, fzf, mpv"; got != want {
		t.Errorf("programs: %s, want %s", got, want)
	}
	// yt-dlp's bytes go up to its size, while nothing else downloads.
	var last int64
	steps, unpacking := 0, false
	for _, items := range seen {
		busy := 0
		for _, it := range items {
			if it.State == Downloading || it.State == Unpacking {
				busy++
			}
			if it.Name == "Git Bash" && it.State == Unpacking {
				unpacking = true
			}
		}
		if busy > 1 {
			t.Fatalf("%d programs at once: %+v", busy, items)
		}
		it := item(t, items, "yt-dlp")
		if it.State != Downloading || it.Total == 0 {
			continue
		}
		if it.Total != int64(len(big)) || it.Done < last || it.Done > it.Total {
			t.Fatalf("yt-dlp at %d of %d after %d", it.Done, it.Total, last)
		}
		if it.Done > last {
			steps++
		}
		last = it.Done
	}
	if last != int64(len(big)) || steps < 2 {
		t.Errorf("yt-dlp's download was reported up to %d of %d in %d steps", last, len(big), steps)
	}
	if !unpacking {
		t.Error("Git's unpacking wasn't reported")
	}
	if got := seen[len(seen)-1]; len(got) != len(final) || item(t, got, "fzf") != item(t, final, "fzf") {
		t.Errorf("last report %+v isn't the outcome %+v", got, final)
	}

	p := Progress{Items: final}
	if ok, text := p.Outcome(); ok || text != "Not installed: fzf (the download isn't on "+hostOf(h.URL)+" any more)" {
		t.Errorf("outcome: %v %q", ok, text)
	}
	for i := range final {
		final[i].State, final[i].Error = Done, ""
	}
	if ok, text := p.Outcome(); !ok || text != "Nyakuro's programs are installed" {
		t.Errorf("outcome: %v %q", ok, text)
	}
	for i := range final {
		final[i].State = Skipped
	}
	if ok, text := p.Outcome(); !ok || text != "Nyakuro's programs were there already" {
		t.Errorf("outcome: %v %q", ok, text)
	}
}

// The newest release is found from GitHub's redirect, also for a
// repository that moved, and its files' names from the release's tag.
func TestLatestRelease(t *testing.T) {
	h := newHost(t)
	h.release("new-owner/tool", "v1.2.3", nil)
	h.mu.Lock()
	h.answer["/old-owner/tool/releases/latest/download/x"] = func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/new-owner/tool/releases/latest/download/x", http.StatusMovedPermanently)
	}
	h.answer["/odd/tool/releases/latest/download/x"] = func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/odd/tool/releases/download/a%2Fb/x", http.StatusFound)
	}
	h.mu.Unlock()
	s := newTestSetup(h, t.TempDir())
	for _, repo := range []string{"new-owner/tool", "old-owner/tool"} {
		base, tag, err := s.latest(context.Background(), repo)
		if err != nil || tag != "v1.2.3" || base != h.URL+"/new-owner/tool/releases/download/v1.2.3/" {
			t.Errorf("latest(%s) = %q %q %v", repo, base, tag, err)
		}
	}
	for _, repo := range []string{"none/tool", "odd/tool"} {
		if base, tag, err := s.latest(context.Background(), repo); err == nil {
			t.Errorf("latest(%s) = %q %q", repo, base, tag)
		}
	}

	for tag, want := range map[string]string{
		"v2.56.1.windows.1": "PortableGit-2.56.1-64-bit.7z.exe",
		"v2.47.1.windows.2": "PortableGit-2.47.1.2-64-bit.7z.exe",
		"v2.57.0-rc0":       "",
		"../../x":           "",
	} {
		if got, err := portableGit(tag); got != want || (err == nil) != (want != "") {
			t.Errorf("portableGit(%s) = %q %v, want %q", tag, got, err, want)
		}
	}
}

// Git that unpacks without its bash, or not at all, isn't kept.
func TestGitWithoutBash(t *testing.T) {
	h := newHost(t)
	h.releases(t)
	dir := t.TempDir()
	s := newTestSetup(h, dir)
	s.unpackGit = func(_ context.Context, _, into string) error {
		return os.MkdirAll(filepath.Join(into, "cmd"), 0o755)
	}
	items := s.run(context.Background(), nil)
	if it := item(t, items, "Git Bash"); it.State != Failed || it.Error != "Git for Windows unpacked without its bash" {
		t.Errorf("Git Bash: %s %q", it.State, it.Error)
	}
	// ani-cli is still downloaded: it runs once there's a bash.
	if it := item(t, items, "ani-cli"); it.State != Done {
		t.Errorf("ani-cli: %s %q", it.State, it.Error)
	}
	entries, _ := os.ReadDir(dir)
	for _, e := range entries {
		if strings.HasPrefix(e.Name(), "git") || strings.HasPrefix(e.Name(), "setup-") {
			t.Errorf("%s left in Nyakuro's folder", e.Name())
		}
	}
}

// What isn't the ani-cli script (a web page saying it moved) isn't kept,
// and mpv isn't downloaded for a computer that couldn't start it.
func TestAniCliAndMpvChecks(t *testing.T) {
	h := newHost(t)
	h.releases(t)
	h.mu.Lock()
	h.files["/pystardust/ani-cli/master/ani-cli"] = []byte("<html>moved</html>")
	h.mu.Unlock()
	dir := t.TempDir()
	s := newTestSetup(h, dir)
	s.vcRuntime = func() bool { return false }
	items := s.run(context.Background(), nil)
	if it := item(t, items, "ani-cli"); it.State != Failed || it.Error != "what came isn't the ani-cli script" {
		t.Errorf("ani-cli: %s %q", it.State, it.Error)
	}
	if it := item(t, items, "mpv"); it.State != Failed || !strings.Contains(it.Error, "Visual C++ runtime") || !strings.Contains(it.Error, "mpv.io") {
		t.Errorf("mpv: %s %q", it.State, it.Error)
	}
	got := tree(t, dir)
	for _, name := range []string{"ani-cli", "mpv.exe", "vulkan-1.dll"} {
		if _, ok := got[name]; ok {
			t.Errorf("%s is in Nyakuro's folder", name)
		}
	}
	if n := h.hits["/mpv-player/mpv/releases/latest/download/x"]; n != 0 {
		t.Error("asked for mpv's release")
	}
}

func TestChecksumLists(t *testing.T) {
	list := "aa11  yt-dlp\nbb22 *yt-dlp.exe\n\ncc33  yt-dlp_x86.exe\nnot a line of it\n"
	for name, want := range map[string]string{"yt-dlp.exe": "bb22", "yt-dlp": "aa11", "yt-dlp_x86.exe": "cc33", "yt-dlp.ex": "", "a": ""} {
		if got := sumIn(list, name); got != want {
			t.Errorf("sumIn(%s) = %q, want %q", name, got, want)
		}
	}
	if got := btbnBuild("1  ffmpeg-n7.1-latest-win64-gpl-7.1.zip\n2  ffmpeg-n10.0-latest-win64-gpl-10.0.zip\n3  ffmpeg-n9.1-latest-win64-gpl-9.1.zip\n4  ffmpeg-master-latest-win64-gpl.zip\n5  ffmpeg-n11.0-latest-win64-gpl-shared-11.0.zip\n6  ffmpeg-n11.0-latest-linux64-gpl-11.0.tar.xz\n"); got != "ffmpeg-n10.0-latest-win64-gpl-10.0.zip" {
		t.Errorf("btbnBuild picked %q", got)
	}
	if got := btbnBuild("1  ffmpeg-master-latest-win64-gpl.zip\n2  ffmpeg-master-latest-linux64-gpl.tar.xz\n"); got != "ffmpeg-master-latest-win64-gpl.zip" {
		t.Errorf("btbnBuild picked %q with no release build", got)
	}
	if got := btbnBuild("1  ffmpeg-master-latest-linux64-gpl.tar.xz\n"); got != "" {
		t.Errorf("btbnBuild picked %q from a list with nothing for Windows", got)
	}
}

func TestStartIsForWindows(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("it would download the programs")
	}
	if Start() == nil {
		t.Error("Start worked outside Windows")
	}
	if Running() || State().Running || len(Wait().Items) != 0 {
		t.Error("running outside Windows")
	}
}

func TestInside(t *testing.T) {
	for name, want := range map[string]bool{"ffmpeg.exe": true, "a/b/ffmpeg.exe": true, `a\b\ffmpeg.exe`: true, "": false, "/ffmpeg.exe": false, "../ffmpeg.exe": false, "a/../../ffmpeg.exe": false, `..\ffmpeg.exe`: false, `C:\ffmpeg.exe`: false, "a/..b/ffmpeg.exe": true} {
		if got := inside(name); got != want {
			t.Errorf("inside(%q) = %v, want %v", name, got, want)
		}
	}
}
