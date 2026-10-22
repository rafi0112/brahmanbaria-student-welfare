package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"image"
	"image/jpeg"
	"image/png"
	"io"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"syscall"
	"time"
)

const (
	photoBucket   = "executive-photos"
	mediaBucket   = "site-media"
	maxPhotoBytes = 5 << 20
	maxPhotoSide  = 8000
	minPhotoSide  = 64
)

var (
	ErrPhotoTooBig      = errors.New("photo is larger than 5 MB")
	ErrPhotoInvalid     = errors.New("the file is not a valid JPEG or PNG image")
	ErrPhotoDimensions  = errors.New("photo dimensions are not allowed")
	ErrDriveLink        = errors.New("that is not a Google Drive image link")
	ErrDriveNotPublic   = errors.New("the Drive image cannot be displayed; share it as 'Anyone with the link'")
	ErrDriveUnreachable = errors.New("Google Drive could not be reached")
	ErrImageLink        = errors.New("that is not a usable image link")
	ErrImageNotImage    = errors.New("the link does not lead to an image")
	ErrImageUnreachable = errors.New("the image could not be downloaded")
	ErrStorageOff       = errors.New("photo storage is not configured")
)

// ImageStore puts one object into the photo bucket on behalf of the signed-in admin. The admin's own access
// token is forwarded, so Supabase Storage policies (admins only) decide, and no service key exists anywhere.
type ImageStore interface {
	Put(ctx context.Context, userToken, bucket, name, contentType string, data []byte) error
}

type supabaseStorage struct {
	baseURL, apiKey string
	client          *http.Client
}

func newSupabaseStorage(baseURL, apiKey string) *supabaseStorage {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	for _, suffix := range []string{"/rest/v1", "/auth/v1"} {
		baseURL = strings.TrimSuffix(baseURL, suffix)
	}
	if baseURL == "" || apiKey == "" {
		return nil
	}
	return &supabaseStorage{baseURL: baseURL, apiKey: apiKey, client: &http.Client{Timeout: 12 * time.Second}}
}

// PublicBase is the URL prefix under which a bucket's objects are readable.
func (s *supabaseStorage) PublicBase(bucket string) string {
	return s.baseURL + "/storage/v1/object/public/" + bucket + "/"
}

func (s *supabaseStorage) Put(ctx context.Context, userToken, bucket, name, contentType string, data []byte) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.baseURL+"/storage/v1/object/"+bucket+"/"+url.PathEscape(name), bytes.NewReader(data))
	if err != nil {
		return err
	}
	req.Header.Set("apikey", s.apiKey)
	req.Header.Set("Authorization", "Bearer "+userToken)
	req.Header.Set("Content-Type", contentType)
	req.Header.Set("x-upsert", "false") // never overwrite an existing object
	res, err := s.client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode/100 != 2 {
		b, _ := io.ReadAll(io.LimitReader(res.Body, 300))
		return fmt.Errorf("storage returned %d: %s", res.StatusCode, strings.TrimSpace(string(b)))
	}
	return nil
}

// cleanImage validates the image by decoding it (not by trusting the extension or the declared type) and
// re-encodes it. Re-encoding drops EXIF data such as GPS positions and anything hidden after the image data.
func cleanImage(data []byte) (out []byte, ext, contentType string, err error) {
	if len(data) > maxPhotoBytes {
		return nil, "", "", ErrPhotoTooBig
	}
	cfg, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || (format != "jpeg" && format != "png") {
		return nil, "", "", ErrPhotoInvalid
	}
	if cfg.Width > maxPhotoSide || cfg.Height > maxPhotoSide || cfg.Width < minPhotoSide || cfg.Height < minPhotoSide {
		return nil, "", "", ErrPhotoDimensions
	}
	img, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, "", "", ErrPhotoInvalid
	}
	var buf bytes.Buffer
	if format == "png" {
		if err := png.Encode(&buf, img); err != nil {
			return nil, "", "", ErrPhotoInvalid
		}
		return buf.Bytes(), ".png", "image/png", nil
	}
	if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: 88}); err != nil {
		return nil, "", "", ErrPhotoInvalid
	}
	return buf.Bytes(), ".jpg", "image/jpeg", nil
}

func newObjectName(ext string) (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x%s", b[0:4], b[4:6], b[6:8], b[8:10], b[10:], ext), nil
}

var driveIDRx = regexp.MustCompile(`^[A-Za-z0-9_-]{20,80}$`)

var driveFileRx = regexp.MustCompile(`^/file/d/([A-Za-z0-9_-]+)`)

// driveFileID extracts the file id from the usual Google Drive share links. Only the id is used afterwards, and
// the request is always built for drive.google.com itself, so a pasted link cannot point the server elsewhere.
func driveFileID(raw string) (string, error) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u.Scheme != "https" || !strings.EqualFold(u.Hostname(), "drive.google.com") {
		return "", ErrDriveLink
	}
	id := ""
	if m := driveFileRx.FindStringSubmatch(u.Path); m != nil {
		id = m[1]
	} else if u.Path == "/open" || u.Path == "/uc" || u.Path == "/thumbnail" {
		id = u.Query().Get("id")
	}
	if !driveIDRx.MatchString(id) {
		return "", ErrDriveLink
	}
	return id, nil
}

// fetchDriveImage downloads a publicly shared Drive image (as a thumbnail rendition) so it can be validated
// and stored in our own bucket; this proves the image really can be displayed.
func fetchDriveImage(ctx context.Context, base, id string, allowHost func(string) bool) ([]byte, error) {
	client := &http.Client{Timeout: 10 * time.Second, CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) > 4 || !allowHost(req.URL.Hostname()) {
			return ErrDriveNotPublic
		}
		return nil
	}}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, base+"/thumbnail?id="+url.QueryEscape(id)+"&sz=w1200", nil)
	if err != nil {
		return nil, ErrDriveLink
	}
	res, err := client.Do(req)
	if err != nil {
		if errors.Is(err, ErrDriveNotPublic) {
			return nil, ErrDriveNotPublic
		}
		return nil, ErrDriveUnreachable
	}
	defer res.Body.Close()
	ct := strings.ToLower(res.Header.Get("Content-Type"))
	if res.StatusCode != http.StatusOK || !strings.HasPrefix(ct, "image/") {
		return nil, ErrDriveNotPublic
	}
	data, err := io.ReadAll(io.LimitReader(res.Body, maxPhotoBytes+1))
	if err != nil {
		return nil, ErrDriveUnreachable
	}
	return data, nil
}

func driveHostAllowed(host string) bool {
	host = strings.ToLower(host)
	return host == "google.com" || strings.HasSuffix(host, ".google.com") || strings.HasSuffix(host, ".googleusercontent.com")
}

// blockedIP reports addresses a server must never be tricked into contacting: loopback, private, link-local
// (including cloud metadata), unspecified, multicast and carrier-grade NAT ranges.
func blockedIP(ip net.IP) bool {
	if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsMulticast() || ip.IsUnspecified() {
		return true
	}
	if v4 := ip.To4(); v4 != nil && v4[0] == 100 && v4[1]&0xc0 == 64 {
		return true
	}
	return false
}

// fetchImageURL downloads any public image link so it can be validated and stored in our own bucket. Because the
// server makes the request, it is restricted: https only, no credentials in the link, standard port, at most four
// redirects, and the connection itself refuses internal addresses (checked at dial time, so DNS tricks cannot help).
// allowPrivate exists only so tests can use a local server.
func fetchImageURL(ctx context.Context, raw string, allowPrivate bool) ([]byte, error) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u.Host == "" || u.User != nil || len(raw) > 2000 {
		return nil, ErrImageLink
	}
	okScheme := func(x *url.URL) bool { return x.Scheme == "https" || (allowPrivate && x.Scheme == "http") }
	if !okScheme(u) {
		return nil, ErrImageLink
	}
	dialer := &net.Dialer{Timeout: 6 * time.Second, Control: func(_, address string, _ syscall.RawConn) error {
		host, port, err := net.SplitHostPort(address)
		if err != nil {
			return ErrImageLink
		}
		ip := net.ParseIP(host)
		if allowPrivate {
			return nil
		}
		if ip == nil || blockedIP(ip) || port != "443" {
			return ErrImageLink
		}
		return nil
	}}
	client := &http.Client{
		Timeout:   12 * time.Second,
		Transport: &http.Transport{Proxy: nil, DialContext: dialer.DialContext, TLSHandshakeTimeout: 6 * time.Second, DisableKeepAlives: true},
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) > 4 || !okScheme(req.URL) || req.URL.User != nil {
				return ErrImageLink
			}
			return nil
		},
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, ErrImageLink
	}
	req.Header.Set("Accept", "image/jpeg,image/png")
	req.Header.Set("User-Agent", "JelaKollanImageFetch/1")
	res, err := client.Do(req)
	if err != nil {
		if errors.Is(err, ErrImageLink) {
			return nil, ErrImageLink
		}
		return nil, ErrImageUnreachable
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, ErrImageUnreachable
	}
	data, err := io.ReadAll(io.LimitReader(res.Body, maxPhotoBytes+1))
	if err != nil {
		return nil, ErrImageUnreachable
	}
	if len(data) > maxPhotoBytes {
		return nil, ErrPhotoTooBig
	}
	return data, nil // the bytes are decoded and re-encoded by cleanImage, so only a real JPEG or PNG is ever stored
}
