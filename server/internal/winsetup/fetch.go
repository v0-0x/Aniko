package winsetup

import (
	"archive/zip"
	"bufio"
	"context"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

// tries is how often a download is tried before it counts as failed.
const tries = 3

var (
	errChecksum = errors.New("the download doesn't match its checksum")
	errNoSum    = errors.New("the download isn't in its project's list of checksums")
	errStalled  = errors.New("the download stopped coming")
)

// statusError is an answer other than the file.
type statusError struct {
	host string
	code int
}

func (e *statusError) Error() string { return fmt.Sprintf("%s answered %d", e.host, e.code) }

// netError is a failure of the connection, as opposed to one of this
// computer's disk: worth another try.
type netError struct {
	host string
	err  error
}

func (e *netError) Error() string { return e.err.Error() }
func (e *netError) Unwrap() error { return e.err }

// passes reports whether a failure may be gone at the next try.
func passes(err error) bool {
	var st *statusError
	if errors.As(err, &st) {
		return st.code == http.StatusRequestTimeout || st.code == http.StatusRequestedRangeNotSatisfiable || st.code == http.StatusTooManyRequests || st.code >= 500
	}
	var ne *netError
	return errors.As(err, &ne)
}

// plain says why a download failed, in words for the user.
func plain(err error) string {
	var st *statusError
	if errors.As(err, &st) {
		switch {
		case st.code == http.StatusNotFound:
			return fmt.Sprintf("the download isn't on %s any more", st.host)
		case st.code == http.StatusForbidden || st.code == http.StatusTooManyRequests:
			return fmt.Sprintf("%s refused the download for now (%d): try again later", st.host, st.code)
		case st.code >= 500:
			return fmt.Sprintf("%s has a problem (%d): try again later", st.host, st.code)
		}
		return st.Error()
	}
	var ne *netError
	if !errors.As(err, &ne) {
		return err.Error()
	}
	var dns *net.DNSError
	var op *net.OpError
	var cert *tls.CertificateVerificationError
	var unknown x509.UnknownAuthorityError
	var timeout net.Error
	switch {
	case errors.As(err, &cert) || errors.As(err, &unknown):
		return fmt.Sprintf("the secure connection to %s was refused: an antivirus or a proxy may be in the way", ne.host)
	case errors.Is(err, errStalled) || errors.As(err, &timeout) && timeout.Timeout():
		return fmt.Sprintf("%s stopped answering: check the internet connection", ne.host)
	case errors.As(err, &dns) || errors.As(err, &op) && op.Op == "dial":
		return fmt.Sprintf("no connection to %s: check the internet connection", ne.host)
	}
	return fmt.Sprintf("the connection to %s broke: check the internet connection", ne.host)
}

// newClient is the client the downloads use: the proxy of the environment
// (HTTPS_PROXY) is respected. No timeout for a whole download, which takes
// as long as the connection needs: the steps of connecting have theirs, and
// a download that stops coming is given up (setup.stall).
func newClient() *http.Client {
	return &http.Client{Transport: &http.Transport{
		Proxy:                 http.ProxyFromEnvironment,
		DialContext:           (&net.Dialer{Timeout: 20 * time.Second, KeepAlive: 30 * time.Second}).DialContext,
		ForceAttemptHTTP2:     true,
		TLSHandshakeTimeout:   20 * time.Second,
		ResponseHeaderTimeout: 30 * time.Second,
		IdleConnTimeout:       time.Minute,
	}}
}

func hostOf(u string) string {
	if p, err := url.Parse(u); err == nil && p.Host != "" {
		return p.Hostname()
	}
	return u
}

// try runs f, again after a pause while it fails for a reason that may pass.
func (s *setup) try(ctx context.Context, f func() error) error {
	var err error
	for i := 0; i < tries; i++ {
		if i > 0 {
			select {
			case <-ctx.Done():
				return err
			case <-time.After(time.Duration(i) * s.pause):
			}
		}
		if err = f(); err == nil || !passes(err) || ctx.Err() != nil {
			return err
		}
	}
	return err
}

// get asks for a file. The caller closes the answer's body.
func (s *setup) get(ctx context.Context, client *http.Client, u string, header http.Header) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	// As it is, not compressed on the way: its size is known then, and a
	// download can go on where it broke off.
	req.Header.Set("Accept-Encoding", "identity")
	req.Header.Set("User-Agent", "Aniko")
	for k, v := range header {
		req.Header[k] = v
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, &netError{hostOf(u), err}
	}
	return resp, nil
}

// text gets a small text file (a project's checksums).
func (s *setup) text(ctx context.Context, u string) (string, error) {
	var out string
	err := s.try(ctx, func() error {
		ctx, cancel := context.WithTimeout(ctx, s.stall)
		defer cancel()
		resp, err := s.get(ctx, s.client, u, nil)
		if err != nil {
			return err
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			return &statusError{hostOf(u), resp.StatusCode}
		}
		b, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
		if err != nil {
			return &netError{hostOf(u), err}
		}
		out = string(b)
		return nil
	})
	return out, err
}

// sums gets the checksums a project publishes with its release. When the
// release has none (any more), it's "": the download then goes unchecked
// rather than not at all.
func (s *setup) sums(ctx context.Context, u string) (string, error) {
	text, err := s.text(ctx, u)
	var st *statusError
	if errors.As(err, &st) && st.code == http.StatusNotFound {
		return "", nil
	}
	return text, err
}

// sumIn finds a file's SHA-256 in a list of checksums as sha256sum writes
// it ("<sha256>  <name>" lines), or "".
func sumIn(list, name string) string {
	sc := bufio.NewScanner(strings.NewReader(list))
	for sc.Scan() {
		f := strings.Fields(sc.Text())
		if len(f) == 2 && strings.TrimPrefix(f[1], "*") == name {
			return f[0]
		}
	}
	return ""
}

func sha256File(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

var releaseFile = regexp.MustCompile(`^(.*/releases/download/([A-Za-z0-9._-]+)/)[^/]+$`)

// latest finds the newest release of a GitHub repository: its tag, and the
// address its files are under. Not with GitHub's API, which only answers so
// many requests an hour per network: GitHub answers
// releases/latest/download/<file> with a redirect to
// releases/download/<tag>/<file>, whatever the file.
func (s *setup) latest(ctx context.Context, repo string) (base, tag string, err error) {
	stay := *s.client
	stay.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	err = s.try(ctx, func() error {
		ctx, cancel := context.WithTimeout(ctx, s.stall)
		defer cancel()
		at := s.github + "/" + repo + "/releases/latest/download/x"
		// A repository that moved redirects to its new place first.
		for hop := 0; hop < 5; hop++ {
			resp, err := s.get(ctx, &stay, at, nil)
			if err != nil {
				return err
			}
			_ = resp.Body.Close()
			loc, err := resp.Location()
			if err != nil {
				if resp.StatusCode == http.StatusOK {
					break
				}
				return &statusError{hostOf(at), resp.StatusCode}
			}
			if m := releaseFile.FindStringSubmatch(loc.EscapedPath()); m != nil {
				base, tag = loc.Scheme+"://"+loc.Host+m[1], m[2]
				return nil
			}
			at = loc.String()
		}
		return fmt.Errorf("couldn't find the newest release of %s", repo)
	})
	return base, tag, err
}

// download gets a file into dst: into dst.part first, which becomes dst
// only when it's complete and verify (if given) accepts it, so that a
// download that fails or is cut off leaves nothing behind. A try that
// breaks off goes on from where it was.
func (s *setup) download(ctx context.Context, t *task, u, dst string, verify func(path string) error) (err error) {
	part := dst + ".part"
	_ = os.Remove(part)
	defer func() {
		if err != nil {
			_ = os.Remove(part)
		}
	}()
	// etag names the file the part belongs to, for going on with it.
	etag := ""
	err = s.try(ctx, func() error {
		var err error
		etag, err = s.fetch(ctx, t, u, part, etag)
		return err
	})
	if err != nil {
		return err
	}
	if verify != nil {
		if err := verify(part); err != nil {
			return err
		}
	}
	return os.Rename(part, dst)
}

// fetch downloads u to the end of part and returns the file's ETag. With
// the ETag of an earlier try, it asks only for what part lacks.
func (s *setup) fetch(ctx context.Context, t *task, u, part, etag string) (string, error) {
	host := hostOf(u)
	parent := ctx
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	// Cancels the download when nothing has come for a while.
	watchdog := time.AfterFunc(s.stall, cancel)
	defer watchdog.Stop()
	stalled := func(err error) error {
		if parent.Err() == nil && ctx.Err() != nil {
			err = errStalled
		}
		return &netError{host, err}
	}

	var have int64
	header := http.Header{}
	if st, err := os.Stat(part); err == nil && etag != "" && st.Size() > 0 {
		have = st.Size()
		header.Set("Range", fmt.Sprintf("bytes=%d-", have))
		// Only if it's still the same file: or else all of the new one.
		header.Set("If-Range", etag)
	}
	resp, err := s.get(ctx, s.client, u, header)
	if err != nil {
		var ne *netError
		if errors.As(err, &ne) {
			err = stalled(ne.err)
		}
		return etag, err
	}
	defer resp.Body.Close()
	flags := os.O_WRONLY | os.O_CREATE
	switch {
	case resp.StatusCode == http.StatusPartialContent && have > 0:
		flags |= os.O_APPEND
	case resp.StatusCode == http.StatusOK:
		have = 0
		flags |= os.O_TRUNC
	case resp.StatusCode == http.StatusRequestedRangeNotSatisfiable:
		// The part isn't of this file: all of it at the next try.
		_ = os.Remove(part)
		return "", &statusError{host, resp.StatusCode}
	default:
		return "", &statusError{host, resp.StatusCode}
	}
	// A weak ETag (W/"…") can't be used to go on with a file.
	etag = resp.Header.Get("ETag")
	if strings.HasPrefix(etag, "W/") {
		etag = ""
	}
	var total int64
	if resp.ContentLength >= 0 {
		total = have + resp.ContentLength
	}
	f, err := os.OpenFile(part, flags, 0o755)
	if err != nil {
		return etag, err
	}
	defer f.Close()
	t.bytes(have, total)
	buf := make([]byte, 256<<10)
	for {
		n, rerr := resp.Body.Read(buf)
		if n > 0 {
			watchdog.Reset(s.stall)
			if _, err := f.Write(buf[:n]); err != nil {
				return etag, err
			}
			have += int64(n)
			t.bytes(have, total)
		}
		if rerr == io.EOF {
			break
		}
		if rerr != nil {
			return etag, stalled(rerr)
		}
	}
	if total > 0 && have != total {
		return etag, &netError{host, io.ErrUnexpectedEOF}
	}
	return etag, f.Close()
}

// unzip puts the files called names from a zip in dir, whatever folder of
// the zip they're in, each through a .part file like a download. A name
// that starts with "?" may be missing from the zip. Nothing else is
// unpacked, and nothing is written under the names the zip gives: an entry
// can't land outside dir. Entries whose path leaves the zip's folder (..,
// an absolute path) are not looked at.
func unzip(zipPath, dir string, names []string) error {
	r, err := zip.OpenReader(zipPath)
	if err != nil {
		return fmt.Errorf("the download isn't a zip: %w", err)
	}
	defer r.Close()
	for _, name := range names {
		optional := strings.HasPrefix(name, "?")
		name = strings.TrimPrefix(name, "?")
		var entry *zip.File
		for _, f := range r.File {
			if inside(f.Name) && !f.FileInfo().IsDir() && strings.EqualFold(path.Base(strings.ReplaceAll(f.Name, `\`, "/")), name) {
				entry = f
				break
			}
		}
		if entry == nil {
			if optional {
				continue
			}
			return fmt.Errorf("%s isn't in the download", name)
		}
		if err := unzipFile(entry, filepath.Join(dir, name)); err != nil {
			return err
		}
	}
	return nil
}

// inside reports whether a zip entry's path stays in the zip's folder.
func inside(name string) bool {
	name = strings.ReplaceAll(name, `\`, "/")
	if name == "" || strings.HasPrefix(name, "/") || strings.Contains(name, ":") {
		return false
	}
	for _, part := range strings.Split(name, "/") {
		if part == ".." {
			return false
		}
	}
	return true
}

func unzipFile(entry *zip.File, dst string) (err error) {
	src, err := entry.Open()
	if err != nil {
		return err
	}
	defer src.Close()
	part := dst + ".part"
	defer func() {
		if err != nil {
			_ = os.Remove(part)
		}
	}()
	out, err := os.OpenFile(part, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o755)
	if err != nil {
		return err
	}
	// Reading to the end also checks the entry's CRC.
	_, err = io.Copy(out, src)
	if cerr := out.Close(); err == nil {
		err = cerr
	}
	if err != nil {
		return err
	}
	return os.Rename(part, dst)
}
