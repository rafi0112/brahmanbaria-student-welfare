package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"log"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

// Videos for the home slides and the gallery: either a file uploaded to the "site-video" bucket (MP4 or WebM, up to
// 50 MB: the most Supabase's free plan stores in one file), or a YouTube video, stored as its 11-character id only.
// A file is checked by its first bytes (not by its name or declared type) and named after its content, so the same
// video uploaded twice is stored once.

const (
	videoBucket   = "site-video"
	maxVideoBytes = 50 << 20
)

var (
	videoRx   = regexp.MustCompile(`^[0-9a-f-]{36}\.(mp4|webm)$`)
	youtubeRx = regexp.MustCompile(`^[A-Za-z0-9_-]{11}$`)

	ErrVideoInvalid = errors.New("the file is not an MP4 or WebM video")
	ErrVideoMOV     = errors.New("QuickTime (.mov) videos do not play in every browser; save or export the video as MP4")
)

// youtubeID reads the video id from the forms of YouTube links people paste (watch, youtu.be, shorts, embed, live,
// music, with or without extra parameters), or accepts a bare id. "" when it is not a YouTube video.
func youtubeID(s string) string {
	s = strings.TrimSpace(s)
	if youtubeRx.MatchString(s) {
		return s
	}
	if !strings.Contains(s, "://") {
		s = "https://" + s
	}
	u, err := url.Parse(s)
	if err != nil {
		return ""
	}
	host := strings.TrimPrefix(strings.ToLower(u.Hostname()), "www.")
	host = strings.TrimPrefix(host, "m.")
	parts := strings.Split(strings.Trim(u.Path, "/"), "/")
	id := ""
	switch host {
	case "youtu.be":
		id = parts[0]
	case "youtube.com", "music.youtube.com", "youtube-nocookie.com":
		if v := u.Query().Get("v"); v != "" {
			id = v
		} else if len(parts) >= 2 && (parts[0] == "shorts" || parts[0] == "embed" || parts[0] == "live" || parts[0] == "v") {
			id = parts[1]
		}
	}
	if youtubeRx.MatchString(id) {
		return id
	}
	return ""
}

// sniffVideo tells MP4 and WebM files apart from anything else by their first bytes.
func sniffVideo(head []byte) (ext, contentType string, err error) {
	if len(head) >= 4 && bytes.Equal(head[:4], []byte{0x1A, 0x45, 0xDF, 0xA3}) {
		return ".webm", "video/webm", nil
	}
	if len(head) >= 12 && string(head[4:8]) == "ftyp" {
		if string(head[8:12]) == "qt  " {
			return "", "", ErrVideoMOV
		}
		return ".mp4", "video/mp4", nil
	}
	return "", "", ErrVideoInvalid
}

// contentVideoName is the stored name of a video: its SHA-256, shaped like the picture names (36 characters).
func contentVideoName(data []byte, ext string) string {
	h := sha256.Sum256(data)
	x := hex.EncodeToString(h[:16])
	return x[0:8] + "-" + x[8:12] + "-" + x[12:16] + "-" + x[16:20] + "-" + x[20:32] + ext
}

func (a *App) videoURL(ref string) string {
	if a.Auth == nil || a.Auth.VideoBase == "" || !videoRx.MatchString(ref) {
		return ""
	}
	return a.Auth.VideoBase + ref
}

func validVideoRef(s string) bool   { return s == "" || videoRx.MatchString(s) }
func validYouTubeRef(s string) bool { return s == "" || youtubeRx.MatchString(s) }

func (a *App) videoRoutes(m *http.ServeMux, h func(func(http.ResponseWriter, *http.Request)) http.HandlerFunc) {
	adm := func(f func(http.ResponseWriter, *http.Request, User)) http.HandlerFunc { return h(a.requireAdmin(f)) }
	m.HandleFunc("POST /api/v1/admin/video", adm(a.uploadVideo))
	m.HandleFunc("GET /api/v1/admin/youtube", adm(a.checkYouTube))
}

// uploadVideo stores one video file (multipart field "file") and answers its stored name and address.
func (a *App) uploadVideo(w http.ResponseWriter, r *http.Request, u User) {
	token := bearerToken(r)
	if a.Auth.Images == nil || token == "" || a.Auth.VideoBase == "" {
		apiError(w, http.StatusServiceUnavailable, "storage_off")
		return
	}
	if !a.Auth.uploadUser.Allow(u.ID) {
		apiError(w, http.StatusTooManyRequests, "rate_limited")
		return
	}
	// a video takes longer to arrive and to pass on than the server's usual limits allow
	rc := http.NewResponseController(w)
	_ = rc.SetReadDeadline(time.Now().Add(15 * time.Minute))
	_ = rc.SetWriteDeadline(time.Now().Add(20 * time.Minute))
	r.Body = http.MaxBytesReader(w, r.Body, maxVideoBytes+(1<<20))
	f, _, err := r.FormFile("file")
	if err != nil {
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			apiError(w, http.StatusRequestEntityTooLarge, "video_too_big")
			return
		}
		apiError(w, http.StatusUnprocessableEntity, "no_video")
		return
	}
	defer f.Close()
	if r.MultipartForm != nil {
		defer r.MultipartForm.RemoveAll() //nolint:errcheck
	}
	data, err := io.ReadAll(io.LimitReader(f, maxVideoBytes+1))
	if err != nil {
		apiError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if len(data) > maxVideoBytes {
		apiError(w, http.StatusRequestEntityTooLarge, "video_too_big")
		return
	}
	ext, ctype, err := sniffVideo(data)
	if errors.Is(err, ErrVideoMOV) {
		apiError(w, http.StatusUnprocessableEntity, "video_mov")
		return
	}
	if err != nil {
		apiError(w, http.StatusUnprocessableEntity, "video_invalid")
		return
	}
	name := contentVideoName(data, ext)
	if err := a.Auth.Images.Put(r.Context(), token, videoBucket, name, ctype, data); err != nil {
		log.Printf("video upload: %v", err)
		apiError(w, http.StatusBadGateway, "storage_failed")
		return
	}
	_ = a.Auth.Store.Audit(r.Context(), u.ID, "media.video_upload", "media", name, map[string]any{"bytes": len(data)})
	writeJSON(w, http.StatusCreated, map[string]string{"path": name, "url": a.videoURL(name)})
}

// checkYouTube turns a pasted link into the video id (and its picture), so the admin sees at once whether it is usable.
func (a *App) checkYouTube(w http.ResponseWriter, r *http.Request, _ User) {
	id := youtubeID(r.URL.Query().Get("url"))
	if id == "" {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"error": "youtube_invalid"})
		return
	}
	writeJSON(w, 200, map[string]string{"id": id, "thumbnail": "https://i.ytimg.com/vi/" + id + "/hqdefault.jpg"})
}
