package main

import (
	"bytes"
	"context"
	"errors"
	"image"
	"image/color"
	"image/jpeg"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// Profile photos. A member (or an admin on their behalf) uploads a JPEG or PNG; it is validated by decoding, cropped to a
// square, scaled down to photoSide pixels and re-encoded as JPEG, which also drops EXIF data such as GPS positions.
// The bytes live in PostgreSQL and are served only through the API, so the same viewer rules as every other personal
// detail apply: the member themself, approved members (when the member is listed in the directory) and admins. Public
// visitors see initials instead.

const (
	photoSide       = 480
	maxStoredPhoto  = 1 << 20
	photoVersionFmt = "20060102150405"
)

type PhotoStore interface {
	SetProfilePhoto(ctx context.Context, userID string, data []byte, contentType string) error // ErrNotFound without a profile
	ProfilePhoto(ctx context.Context, userID string) (data []byte, contentType, version string, err error)
	DeleteProfilePhoto(ctx context.Context, userID string) error
	PhotoVersions(ctx context.Context) (map[string]string, error) // user id -> version (changes on every upload)
}

// squarePhoto validates an upload and returns a JPEG of photoSide x photoSide (or smaller when the source is smaller).
func squarePhoto(data []byte) ([]byte, error) {
	if _, _, _, err := cleanImage(data); err != nil {
		return nil, err
	}
	src, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, ErrPhotoInvalid
	}
	b := src.Bounds()
	side := b.Dx()
	if b.Dy() < side {
		side = b.Dy()
	}
	x0, y0 := b.Min.X+(b.Dx()-side)/2, b.Min.Y+(b.Dy()-side)/2
	out := side
	if out > photoSide {
		out = photoSide
	}
	dst := image.NewRGBA(image.Rect(0, 0, out, out))
	// box filter: every destination pixel is the average of the source pixels it covers
	for dy := 0; dy < out; dy++ {
		sy0, sy1 := y0+dy*side/out, y0+(dy+1)*side/out
		if sy1 <= sy0 {
			sy1 = sy0 + 1
		}
		for dx := 0; dx < out; dx++ {
			sx0, sx1 := x0+dx*side/out, x0+(dx+1)*side/out
			if sx1 <= sx0 {
				sx1 = sx0 + 1
			}
			var r, g, bl, a, n uint64
			for sy := sy0; sy < sy1; sy++ {
				for sx := sx0; sx < sx1; sx++ {
					cr, cg, cb, ca := src.At(sx, sy).RGBA()
					r, g, bl, a, n = r+uint64(cr), g+uint64(cg), bl+uint64(cb), a+uint64(ca), n+1
				}
			}
			// flatten transparency onto white so PNGs with alpha look right as JPEG
			al := float64(a) / float64(n) / 0xffff
			mix := func(c uint64) uint8 { return uint8((float64(c)/float64(n)/0xffff*al + (1 - al)) * 255) }
			dst.SetRGBA(dx, dy, color.RGBA{mix(r), mix(g), mix(bl), 255})
		}
	}
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, dst, &jpeg.Options{Quality: 86}); err != nil {
		return nil, ErrPhotoInvalid
	}
	if buf.Len() > maxStoredPhoto {
		return nil, ErrPhotoTooBig
	}
	return buf.Bytes(), nil
}

// ---------------------------------------------------------------- memory store

type memPhoto struct {
	data    []byte
	ct, ver string
}

func (m *memStore) SetProfilePhoto(_ context.Context, userID string, data []byte, ct string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.profiles[userID]; !ok {
		return ErrNotFound
	}
	if m.photos == nil {
		m.photos = map[string]memPhoto{}
	}
	m.seq++
	m.photos[userID] = memPhoto{data: append([]byte(nil), data...), ct: ct, ver: time.Now().UTC().Format(photoVersionFmt) + "-" + strconv.Itoa(m.seq)}
	return nil
}

func (m *memStore) ProfilePhoto(_ context.Context, userID string) ([]byte, string, string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	p, ok := m.photos[userID]
	if !ok {
		return nil, "", "", ErrNotFound
	}
	return p.data, p.ct, p.ver, nil
}

func (m *memStore) DeleteProfilePhoto(_ context.Context, userID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.photos[userID]; !ok {
		return ErrNotFound
	}
	delete(m.photos, userID)
	return nil
}

func (m *memStore) PhotoVersions(_ context.Context) (map[string]string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := map[string]string{}
	for id, p := range m.photos {
		out[id] = p.ver
	}
	return out, nil
}

// ---------------------------------------------------------------- PostgreSQL store

func (s *pgStore) SetProfilePhoto(ctx context.Context, userID string, data []byte, ct string) error {
	if !okID(userID) {
		return ErrNotFound
	}
	t, err := s.db.Exec(ctx, `INSERT INTO profile_photos (user_id, data, content_type) SELECT p.user_id, $2, $3 FROM profiles p WHERE p.user_id = $1::uuid
		ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, content_type = EXCLUDED.content_type, updated_at = clock_timestamp()`, userID, data, ct)
	if err != nil {
		return err
	}
	if t.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *pgStore) ProfilePhoto(ctx context.Context, userID string) ([]byte, string, string, error) {
	if !okID(userID) {
		return nil, "", "", ErrNotFound
	}
	var data []byte
	var ct, ver string
	err := s.db.QueryRow(ctx, `SELECT data, content_type, to_char(updated_at AT TIME ZONE 'UTC', 'YYYYMMDDHH24MISSUS') FROM profile_photos WHERE user_id = $1::uuid`, userID).Scan(&data, &ct, &ver)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, "", "", ErrNotFound
	}
	return data, ct, ver, err
}

func (s *pgStore) DeleteProfilePhoto(ctx context.Context, userID string) error {
	if !okID(userID) {
		return ErrNotFound
	}
	t, err := s.db.Exec(ctx, `DELETE FROM profile_photos WHERE user_id = $1::uuid`, userID)
	if err != nil {
		return err
	}
	if t.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *pgStore) PhotoVersions(ctx context.Context) (map[string]string, error) {
	rows, err := s.db.Query(ctx, `SELECT user_id::text, to_char(updated_at AT TIME ZONE 'UTC', 'YYYYMMDDHH24MISSUS') FROM profile_photos`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]string{}
	for rows.Next() {
		var id, v string
		if err := rows.Scan(&id, &v); err != nil {
			return nil, err
		}
		out[id] = v
	}
	return out, rows.Err()
}

// ---------------------------------------------------------------- handlers

func (a *App) photoRoutes(m *http.ServeMux, h func(func(http.ResponseWriter, *http.Request)) http.HandlerFunc) {
	adm := func(f func(http.ResponseWriter, *http.Request, User)) http.HandlerFunc { return h(a.requireAdmin(f)) }
	m.HandleFunc("GET /api/v1/me/photo", h(a.requireUser(func(w http.ResponseWriter, r *http.Request, u User) { a.servePhoto(w, r, u.ID) })))
	m.HandleFunc("POST /api/v1/me/photo", h(a.requireUser(func(w http.ResponseWriter, r *http.Request, u User) { a.putPhoto(w, r, u, u.ID, false) })))
	m.HandleFunc("DELETE /api/v1/me/photo", h(a.requireUser(func(w http.ResponseWriter, r *http.Request, u User) { a.dropPhoto(w, r, u, u.ID, false) })))
	m.HandleFunc("GET /api/v1/students/{id}/photo", h(a.studentPhoto))
	m.HandleFunc("POST /api/v1/admin/students/{id}/photo", adm(func(w http.ResponseWriter, r *http.Request, u User) { a.putPhoto(w, r, u, r.PathValue("id"), true) }))
	m.HandleFunc("DELETE /api/v1/admin/students/{id}/photo", adm(func(w http.ResponseWriter, r *http.Request, u User) { a.dropPhoto(w, r, u, r.PathValue("id"), true) }))
}

func (a *App) servePhoto(w http.ResponseWriter, r *http.Request, userID string) {
	data, ct, ver, err := a.Auth.Store.ProfilePhoto(r.Context(), userID)
	if err != nil {
		apiError(w, http.StatusNotFound, "no photo")
		return
	}
	etag := `"` + ver + `"`
	w.Header().Set("Cache-Control", "private, max-age=86400")
	w.Header().Set("ETag", etag)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	if r.Header.Get("If-None-Match") == etag {
		w.WriteHeader(http.StatusNotModified)
		return
	}
	w.Header().Set("Content-Type", ct)
	_, _ = w.Write(data)
}

// studentPhoto serves a member's photo to exactly the viewers who may see their other personal details.
func (a *App) studentPhoto(w http.ResponseWriter, r *http.Request) {
	uid, ok := strings.CutPrefix(r.PathValue("id"), "m-")
	if !ok || a.Auth == nil || uid == "" || len(uid) > 64 { // the store rejects malformed ids itself
		apiError(w, http.StatusNotFound, "no photo")
		return
	}
	v := a.whoIsViewing(r)
	allowed := v.Kind == "admin" || v.ID == uid
	if !allowed && v.Kind == "member" {
		p, err := a.Auth.Store.ProfileByUser(r.Context(), uid)
		u, uerr := a.Auth.Store.UserByID(r.Context(), uid)
		allowed = err == nil && uerr == nil && p.Status == StatusApproved && p.ShowInDirectory && !u.Disabled
	}
	if !allowed {
		apiError(w, http.StatusNotFound, "no photo") // the same answer as "no photo", so nothing is revealed
		return
	}
	a.servePhoto(w, r, uid)
}

func (a *App) putPhoto(w http.ResponseWriter, r *http.Request, actor User, target string, byAdmin bool) {
	if !a.Auth.uploadUser.Allow(actor.ID) {
		apiError(w, http.StatusTooManyRequests, "rate_limited")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxPhotoBytes+(512<<10))
	if err := r.ParseMultipartForm(1 << 20); err != nil {
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			apiError(w, http.StatusRequestEntityTooLarge, "photo_too_big")
			return
		}
		apiError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	defer r.MultipartForm.RemoveAll() //nolint:errcheck
	var raw []byte
	if link := strings.TrimSpace(r.FormValue("imageUrl")); link != "" {
		// a public link (Google Drive share link or any https image): downloaded once, then treated like an upload
		data, err := a.fetchLinked(r.Context(), link)
		if !a.linkFailed(w, err) {
			return
		}
		raw = data
	} else {
		f, _, err := r.FormFile("file")
		if err != nil {
			apiError(w, http.StatusUnprocessableEntity, "no_photo")
			return
		}
		defer f.Close()
		raw, err = io.ReadAll(io.LimitReader(f, maxPhotoBytes+1))
		if err != nil {
			apiError(w, http.StatusBadRequest, "invalid request body")
			return
		}
	}
	data, err := squarePhoto(raw)
	if err != nil {
		switch {
		case errors.Is(err, ErrPhotoTooBig):
			apiError(w, http.StatusRequestEntityTooLarge, "photo_too_big")
		case errors.Is(err, ErrPhotoDimensions):
			apiError(w, http.StatusUnprocessableEntity, "photo_dimensions")
		default:
			apiError(w, http.StatusUnprocessableEntity, "photo_invalid")
		}
		return
	}
	if err := a.Auth.Store.SetProfilePhoto(r.Context(), target, data, "image/jpeg"); err != nil {
		if errors.Is(err, ErrNotFound) {
			apiError(w, http.StatusConflict, "no_profile")
			return
		}
		log.Printf("profile photo: %v", err)
		apiError(w, 500, "could not save the photo")
		return
	}
	_ = a.Auth.Store.Audit(r.Context(), actor.ID, "profile.photo.set", "user", target, nil)
	a.photoDone(w, r, actor, target, byAdmin)
}

func (a *App) dropPhoto(w http.ResponseWriter, r *http.Request, actor User, target string, byAdmin bool) {
	if err := a.Auth.Store.DeleteProfilePhoto(r.Context(), target); err != nil && !errors.Is(err, ErrNotFound) {
		log.Printf("delete profile photo: %v", err)
		apiError(w, 500, "could not remove the photo")
		return
	}
	_ = a.Auth.Store.Audit(r.Context(), actor.ID, "profile.photo.removed", "user", target, nil)
	a.photoDone(w, r, actor, target, byAdmin)
}

func (a *App) photoDone(w http.ResponseWriter, r *http.Request, actor User, target string, byAdmin bool) {
	if !byAdmin {
		writeJSON(w, 200, a.meBody(r.Context(), actor))
		return
	}
	row, err := a.Auth.Store.MemberAdmin(r.Context(), target)
	if err != nil {
		a.memberFail(w, err)
		return
	}
	rows := []MemberAdminRow{row}
	a.withMemberPhotos(r.Context(), rows)
	writeJSON(w, 200, rows[0])
}

// photo URLs carry the version so browsers fetch a new picture after every change and cache it otherwise
func studentPhotoURL(userID, ver string) string {
	if ver == "" {
		return ""
	}
	return "/api/v1/students/m-" + userID + "/photo?v=" + ver
}

func (a *App) photoVersions(ctx context.Context) map[string]string {
	if a.Auth == nil {
		return map[string]string{}
	}
	v, err := a.Auth.Store.PhotoVersions(ctx)
	if err != nil {
		log.Printf("photo versions: %v", err)
		return map[string]string{}
	}
	return v
}

func (a *App) withMemberPhotos(ctx context.Context, rows []MemberAdminRow) {
	vers := a.photoVersions(ctx)
	for i := range rows {
		rows[i].PhotoURL = studentPhotoURL(rows[i].ID, vers[rows[i].ID])
	}
}


// photoFromLink downloads and prepares an optional photo link sent with a profile form. An empty link is fine; a bad one
// is reported as a field error on "photoLink" (and nothing else is saved).
func (a *App) photoFromLink(w http.ResponseWriter, r *http.Request, link string) ([]byte, bool) {
	link = strings.TrimSpace(link)
	if link == "" {
		return nil, true
	}
	fail := func(msg string) ([]byte, bool) {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"error": "validation failed", "fields": map[string]string{"photoLink": msg}})
		return nil, false
	}
	if len(link) > 1000 || !strings.HasPrefix(strings.ToLower(link), "https://") {
		return fail("Use a public https link to an image.")
	}
	raw, err := a.fetchLinked(r.Context(), link)
	switch {
	case errors.Is(err, ErrDriveNotPublic):
		return fail("Share the Google Drive file as 'Anyone with the link' and try again.")
	case err != nil:
		return fail("The link does not open a JPG or PNG image.")
	}
	data, err := squarePhoto(raw)
	if err != nil {
		return fail("The link does not open a usable JPG or PNG image (at least 64 px, up to 5 MB).")
	}
	return data, true
}
