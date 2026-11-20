package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
)

// Blog submissions: a signed-in member sends a title, the text and up to six pictures from the Blog page. They are kept
// in the database (like contact messages) for admins, who read them in the panel, mark them, and may turn one into a
// blog draft (its pictures then move to the site's media storage). Members see what they sent and its state.

const (
	maxSubmissionPhotos = 6
	submissionPhotoSide = 1600
)

type BlogSubmission struct {
	ID         string `json:"id"`
	UserID     string `json:"userId,omitempty"`
	AuthorName string `json:"authorName"`
	Email      string `json:"email,omitempty"`
	Title      string `json:"title"`
	Body       string `json:"body"`
	Status     string `json:"status"` // new | read | accepted | declined
	PostID     string `json:"postId,omitempty"`
	PostSlug   string `json:"postSlug,omitempty"` // in a member's own list: the published post's address
	Photos     int    `json:"photos"`
	CreatedAt  string `json:"createdAt"`
	PhotoURL   string `json:"photoUrl,omitempty"` // filled by the API for admins: the writer's profile photo
}

// withWriterPhotos adds each writer's profile photo (when they have one) for the admin views.
func (a *App) withWriterPhotos(ctx context.Context, items []BlogSubmission) {
	vers := a.photoVersions(ctx)
	for i := range items {
		if items[i].UserID != "" {
			items[i].PhotoURL = studentPhotoURL(items[i].UserID, vers[items[i].UserID])
		}
	}
}

type SubmissionPhoto struct {
	ContentType string
	Data        []byte
}

type BlogSubmissionStore interface {
	CreateSubmission(ctx context.Context, s BlogSubmission, photos []SubmissionPhoto) (BlogSubmission, error)
	ListSubmissions(ctx context.Context, status, userID string) ([]BlogSubmission, map[string]int, error)
	GetSubmission(ctx context.Context, id string) (BlogSubmission, error)
	SubmissionPhoto(ctx context.Context, id string, idx int) (SubmissionPhoto, error)
	SetSubmissionStatus(ctx context.Context, id, status, postID string) error
	DeleteSubmission(ctx context.Context, id string) error
	CountRecentSubmissions(ctx context.Context, userID string, since time.Time) (int, error)
}

// ---------------------------------------------------------------- memory store

type memSubmission struct {
	BlogSubmission
	photos  []SubmissionPhoto
	created time.Time
}

func (m *memStore) CreateSubmission(_ context.Context, s BlogSubmission, photos []SubmissionPhoto) (BlogSubmission, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.seq++
	now := time.Now().UTC()
	s.ID, s.Status, s.Photos, s.CreatedAt = fmt.Sprintf("00000000-0000-4000-8000-%012d", m.seq), "new", len(photos), now.Format(time.RFC3339)
	m.submissions = append(m.submissions, &memSubmission{BlogSubmission: s, photos: photos, created: now})
	return s, nil
}

func (m *memStore) ListSubmissions(_ context.Context, status, userID string) ([]BlogSubmission, map[string]int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	out, counts := []BlogSubmission{}, map[string]int{}
	for i := len(m.submissions) - 1; i >= 0; i-- {
		s := m.submissions[i]
		if userID != "" && s.UserID != userID {
			continue
		}
		counts[s.Status]++
		if status == "" || status == "all" || s.Status == status {
			out = append(out, s.BlogSubmission)
		}
	}
	return out, counts, nil
}

func (m *memStore) findSubmission(id string) *memSubmission {
	for _, s := range m.submissions {
		if s.ID == id {
			return s
		}
	}
	return nil
}

func (m *memStore) GetSubmission(_ context.Context, id string) (BlogSubmission, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if s := m.findSubmission(id); s != nil {
		return s.BlogSubmission, nil
	}
	return BlogSubmission{}, ErrNotFound
}

func (m *memStore) SubmissionPhoto(_ context.Context, id string, idx int) (SubmissionPhoto, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if s := m.findSubmission(id); s != nil && idx >= 0 && idx < len(s.photos) {
		return s.photos[idx], nil
	}
	return SubmissionPhoto{}, ErrNotFound
}

func (m *memStore) SetSubmissionStatus(_ context.Context, id, status, postID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	s := m.findSubmission(id)
	if s == nil {
		return ErrNotFound
	}
	s.Status = status
	if postID != "" {
		s.PostID = postID
	}
	return nil
}

func (m *memStore) DeleteSubmission(_ context.Context, id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for i, s := range m.submissions {
		if s.ID == id {
			m.submissions = append(m.submissions[:i], m.submissions[i+1:]...)
			return nil
		}
	}
	return ErrNotFound
}

func (m *memStore) CountRecentSubmissions(_ context.Context, userID string, since time.Time) (int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	n := 0
	for _, s := range m.submissions {
		if s.UserID == userID && s.created.After(since) {
			n++
		}
	}
	return n, nil
}

// ---------------------------------------------------------------- postgres store

const submissionCols = `s.id::text, COALESCE(s.user_id::text, ''), s.author_name, s.email, s.title, s.body, s.status, COALESCE(s.post_id::text, ''),
	(SELECT count(*) FROM blog_submission_photos p WHERE p.submission_id = s.id)::int, to_char(s.created_at AT TIME ZONE 'UTC', ` + tsFmt + `)`

func scanSubmission(r rowScanner) (BlogSubmission, error) {
	var s BlogSubmission
	err := r.Scan(&s.ID, &s.UserID, &s.AuthorName, &s.Email, &s.Title, &s.Body, &s.Status, &s.PostID, &s.Photos, &s.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return s, ErrNotFound
	}
	return s, err
}

func (s *pgStore) CreateSubmission(ctx context.Context, in BlogSubmission, photos []SubmissionPhoto) (BlogSubmission, error) {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return BlogSubmission{}, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	var id string
	if err := tx.QueryRow(ctx, `INSERT INTO blog_submissions (user_id, author_name, email, title, body) VALUES (NULLIF($1, '')::uuid, $2, $3, $4, $5) RETURNING id::text`,
		in.UserID, in.AuthorName, in.Email, in.Title, in.Body).Scan(&id); err != nil {
		return BlogSubmission{}, err
	}
	for i, p := range photos {
		if _, err := tx.Exec(ctx, `INSERT INTO blog_submission_photos (submission_id, idx, content_type, data) VALUES ($1::uuid, $2, $3, $4)`, id, i, p.ContentType, p.Data); err != nil {
			return BlogSubmission{}, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return BlogSubmission{}, err
	}
	return s.GetSubmission(ctx, id)
}

func (s *pgStore) ListSubmissions(ctx context.Context, status, userID string) ([]BlogSubmission, map[string]int, error) {
	where, args := []string{"true"}, []any{}
	if userID != "" {
		args = append(args, userID)
		where = append(where, fmt.Sprintf("s.user_id = $%d::uuid", len(args)))
	}
	counts := map[string]int{}
	rows, err := s.db.Query(ctx, `SELECT s.status, count(*)::int FROM blog_submissions s WHERE `+strings.Join(where, " AND ")+` GROUP BY s.status`, args...)
	if err != nil {
		return nil, nil, err
	}
	for rows.Next() {
		var st string
		var n int
		if err := rows.Scan(&st, &n); err != nil {
			rows.Close()
			return nil, nil, err
		}
		counts[st] = n
	}
	rows.Close()
	if status != "" && status != "all" {
		args = append(args, status)
		where = append(where, fmt.Sprintf("s.status = $%d", len(args)))
	}
	rows, err = s.db.Query(ctx, `SELECT `+submissionCols+` FROM blog_submissions s WHERE `+strings.Join(where, " AND ")+` ORDER BY s.created_at DESC LIMIT 500`, args...)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	out := []BlogSubmission{}
	for rows.Next() {
		x, err := scanSubmission(rows)
		if err != nil {
			return nil, nil, err
		}
		out = append(out, x)
	}
	return out, counts, rows.Err()
}

func (s *pgStore) GetSubmission(ctx context.Context, id string) (BlogSubmission, error) {
	if !okID(id) {
		return BlogSubmission{}, ErrNotFound
	}
	return scanSubmission(s.db.QueryRow(ctx, `SELECT `+submissionCols+` FROM blog_submissions s WHERE s.id = $1::uuid`, id))
}

func (s *pgStore) SubmissionPhoto(ctx context.Context, id string, idx int) (SubmissionPhoto, error) {
	var p SubmissionPhoto
	if !okID(id) {
		return p, ErrNotFound
	}
	err := s.db.QueryRow(ctx, `SELECT content_type, data FROM blog_submission_photos WHERE submission_id = $1::uuid AND idx = $2`, id, idx).Scan(&p.ContentType, &p.Data)
	if errors.Is(err, pgx.ErrNoRows) {
		return p, ErrNotFound
	}
	return p, err
}

func (s *pgStore) SetSubmissionStatus(ctx context.Context, id, status, postID string) error {
	if !okID(id) {
		return ErrNotFound
	}
	tag, err := s.db.Exec(ctx, `UPDATE blog_submissions SET status = $2, post_id = COALESCE(NULLIF($3, '')::uuid, post_id), updated_at = now() WHERE id = $1::uuid`, id, status, postID)
	if err == nil && tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return err
}

func (s *pgStore) DeleteSubmission(ctx context.Context, id string) error {
	if !okID(id) {
		return ErrNotFound
	}
	tag, err := s.db.Exec(ctx, `DELETE FROM blog_submissions WHERE id = $1::uuid`, id)
	if err == nil && tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return err
}

func (s *pgStore) CountRecentSubmissions(ctx context.Context, userID string, since time.Time) (int, error) {
	var n int
	err := s.db.QueryRow(ctx, `SELECT count(*)::int FROM blog_submissions WHERE user_id = $1::uuid AND created_at > $2`, userID, since.UTC()).Scan(&n)
	return n, err
}

// ---------------------------------------------------------------- HTTP

func (a *App) blogSubmissionRoutes(m *http.ServeMux, h func(func(http.ResponseWriter, *http.Request)) http.HandlerFunc) {
	adm := func(f func(http.ResponseWriter, *http.Request, User)) http.HandlerFunc { return h(a.requireAdmin(f)) }
	m.HandleFunc("POST /api/v1/me/blog-submissions", h(a.requireUser(a.submitBlog)))
	m.HandleFunc("GET /api/v1/me/blog-submissions", h(a.requireUser(a.mySubmissions)))
	m.HandleFunc("GET /api/v1/admin/blog-submissions", adm(a.listSubmissions))
	m.HandleFunc("GET /api/v1/admin/blog-submissions/{id}", adm(a.oneSubmission))
	m.HandleFunc("GET /api/v1/admin/blog-submissions/{id}/photos/{n}", adm(a.submissionPhoto))
	m.HandleFunc("POST /api/v1/admin/blog-submissions/{id}/status", adm(a.submissionStatus))
	m.HandleFunc("POST /api/v1/admin/blog-submissions/{id}/draft", adm(a.submissionToDraft))
	m.HandleFunc("POST /api/v1/admin/blog-submissions/{id}/delete", adm(a.submissionDelete))
}

func (a *App) submissionFail(w http.ResponseWriter, err error) {
	if errors.Is(err, ErrNotFound) {
		apiError(w, http.StatusNotFound, "not_found")
		return
	}
	log.Printf("blog submission: %v", err)
	apiError(w, http.StatusInternalServerError, "could not save")
}

// submitBlog takes a multipart form: title, body, and up to six "photos" files (JPEG or PNG, 5 MB each).
func (a *App) submitBlog(w http.ResponseWriter, r *http.Request, u User) {
	if n, err := a.Auth.Store.CountRecentSubmissions(r.Context(), u.ID, time.Now().Add(-24*time.Hour)); err == nil && n >= 5 {
		apiError(w, http.StatusTooManyRequests, "too_many_submissions")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxSubmissionPhotos*maxPhotoBytes+(1<<20))
	if err := r.ParseMultipartForm(4 << 20); err != nil {
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			apiError(w, http.StatusRequestEntityTooLarge, "too_big")
			return
		}
		apiError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	defer r.MultipartForm.RemoveAll() //nolint:errcheck
	title := oneLine(r.FormValue("title"), 160)
	body := strings.TrimSpace(strings.ReplaceAll(r.FormValue("body"), "\r\n", "\n"))
	errs := map[string]string{}
	if n := utf8.RuneCountInString(title); n < 3 {
		errs["title"] = "Write a title of at least 3 characters."
	}
	if n := utf8.RuneCountInString(body); n < 20 || n > 20000 {
		errs["body"] = "Write between 20 and 20000 characters."
	}
	files := r.MultipartForm.File["photos"]
	if len(files) > maxSubmissionPhotos {
		errs["photos"] = "At most 6 pictures."
	}
	if len(errs) > 0 {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"error": "validation failed", "fields": errs})
		return
	}
	photos := []SubmissionPhoto{}
	for _, fh := range files {
		f, err := fh.Open()
		if err != nil {
			apiError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		raw, err := io.ReadAll(io.LimitReader(f, maxPhotoBytes+1))
		f.Close()
		if err != nil {
			apiError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		out, _, ct, err := storableImage(raw, submissionPhotoSide) // re-encoded: nothing but the picture is kept
		if err != nil {
			writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"error": "validation failed", "fields": map[string]string{"photos": "One of the pictures is not a usable JPEG or PNG under 5 MB."}})
			return
		}
		photos = append(photos, SubmissionPhoto{ContentType: ct, Data: out})
	}
	// the writer's name shown under the post: the one the member typed, else the name on their profile
	name := oneLine(r.FormValue("author"), 80)
	if name == "" {
		name = u.Email
		if p, err := a.Auth.Store.ProfileByUser(r.Context(), u.ID); err == nil && p != nil && p.Name != "" {
			name = p.Name
		}
	}
	s, err := a.Auth.Store.CreateSubmission(r.Context(), BlogSubmission{UserID: u.ID, AuthorName: oneLine(name, 120), Email: u.Email, Title: title, Body: body}, photos)
	if err != nil {
		a.submissionFail(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"item": s})
}

func (a *App) mySubmissions(w http.ResponseWriter, r *http.Request, u User) {
	items, _, err := a.Auth.Store.ListSubmissions(r.Context(), "all", u.ID)
	if err != nil {
		a.submissionFail(w, err)
		return
	}
	for i := range items { // a member sees the state of what they sent, not the admins' working fields
		if items[i].PostID != "" {
			if e, err := a.Auth.Store.GetEntry(r.Context(), KindBlog, items[i].PostID, true); err == nil {
				items[i].PostSlug = e.Slug // only once it is on the site
				items[i].Status = "published"
			}
		}
		items[i].Email, items[i].PostID, items[i].Body = "", "", ""
	}
	writeJSON(w, 200, map[string]any{"items": items})
}

func (a *App) listSubmissions(w http.ResponseWriter, r *http.Request, _ User) {
	items, counts, err := a.Auth.Store.ListSubmissions(r.Context(), r.URL.Query().Get("status"), "")
	if err != nil {
		a.submissionFail(w, err)
		return
	}
	a.withWriterPhotos(r.Context(), items)
	writeJSON(w, 200, map[string]any{"items": items, "counts": counts})
}

func (a *App) oneSubmission(w http.ResponseWriter, r *http.Request, _ User) {
	s, err := a.Auth.Store.GetSubmission(r.Context(), r.PathValue("id"))
	if err != nil {
		a.submissionFail(w, err)
		return
	}
	one := []BlogSubmission{s}
	a.withWriterPhotos(r.Context(), one)
	writeJSON(w, 200, map[string]any{"item": one[0]})
}

func (a *App) submissionPhoto(w http.ResponseWriter, r *http.Request, _ User) {
	n, err := strconv.Atoi(r.PathValue("n"))
	if err != nil {
		apiError(w, http.StatusNotFound, "not_found")
		return
	}
	p, err := a.Auth.Store.SubmissionPhoto(r.Context(), r.PathValue("id"), n)
	if err != nil {
		a.submissionFail(w, err)
		return
	}
	w.Header().Set("Content-Type", p.ContentType)
	w.Header().Set("Cache-Control", "private, max-age=3600")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	_, _ = w.Write(p.Data)
}

func (a *App) submissionStatus(w http.ResponseWriter, r *http.Request, u User) {
	var b struct {
		Status string `json:"status"`
	}
	if !decode(w, r, &b) {
		return
	}
	if b.Status != "new" && b.Status != "read" && b.Status != "accepted" && b.Status != "declined" {
		apiError(w, http.StatusUnprocessableEntity, "bad status")
		return
	}
	id := r.PathValue("id")
	if err := a.Auth.Store.SetSubmissionStatus(r.Context(), id, b.Status, ""); err != nil {
		a.submissionFail(w, err)
		return
	}
	_ = a.Auth.Store.Audit(r.Context(), u.ID, "blog_submission.status", "blog_submission", id, map[string]any{"status": b.Status})
	a.oneSubmission(w, r, u)
}

func (a *App) submissionDelete(w http.ResponseWriter, r *http.Request, u User) {
	id := r.PathValue("id")
	if err := a.Auth.Store.DeleteSubmission(r.Context(), id); err != nil {
		a.submissionFail(w, err)
		return
	}
	_ = a.Auth.Store.Audit(r.Context(), u.ID, "blog_submission.delete", "blog_submission", id, nil)
	writeJSON(w, 200, map[string]bool{"ok": true})
}

// submissionToDraft makes a blog post from a submission: its title and text, the member as author, and its pictures
// stored in the site's media (the first is the cover; the others are added at the end of the text). With {"publish": true}
// (the admin's "Approve and publish") the post goes on the site at once; otherwise it is a draft the admin edits and
// publishes as any other post. Approving one that already has a draft publishes that draft.
func (a *App) submissionToDraft(w http.ResponseWriter, r *http.Request, u User) {
	var b struct {
		Publish bool `json:"publish"`
	}
	if r.ContentLength != 0 {
		if err := json.NewDecoder(io.LimitReader(r.Body, 1<<10)).Decode(&b); err != nil && !errors.Is(err, io.EOF) {
			apiError(w, http.StatusBadRequest, "invalid request body")
			return
		}
	}
	s, err := a.Auth.Store.GetSubmission(r.Context(), r.PathValue("id"))
	if err != nil {
		a.submissionFail(w, err)
		return
	}
	if s.PostID != "" { // already made into a post
		if !b.Publish {
			apiError(w, http.StatusConflict, "already_drafted")
			return
		}
		e, err := a.Auth.Store.SetEntryStatus(r.Context(), u.ID, s.PostID, "publish")
		if err != nil {
			a.cmsFail(w, err)
			return
		}
		_ = a.Auth.Store.SetSubmissionStatus(r.Context(), s.ID, "published", "")
		_ = a.Auth.Store.Audit(r.Context(), u.ID, "blog_submission.publish", "blog_submission", s.ID, map[string]any{"post": e.ID})
		writeJSON(w, http.StatusOK, map[string]any{"post": e, "published": true})
		return
	}
	images := []string{}
	if a.Auth.Images != nil && bearerToken(r) != "" {
		for i := 0; i < s.Photos; i++ {
			p, err := a.Auth.Store.SubmissionPhoto(r.Context(), s.ID, i)
			if err != nil {
				continue
			}
			ext := ".jpg"
			if p.ContentType == "image/png" {
				ext = ".png"
			}
			name := contentName(p.Data, ext)
			if err := a.Auth.Images.Put(r.Context(), bearerToken(r), mediaBucket, name, p.ContentType, p.Data); err != nil {
				log.Printf("blog submission draft: picture %d: %v", i, err)
				continue
			}
			images = append(images, name)
		}
	}
	body := s.Body
	for _, im := range images[min(1, len(images)):] {
		if u := a.mediaURL(im); u != "" {
			body += "\n\n![" + strings.ReplaceAll(s.Title, "]", "") + "](" + u + ")"
		}
	}
	cover := ""
	if len(images) > 0 {
		cover = images[0]
	}
	data, _ := json.Marshal(map[string]any{"titleBn": s.Title, "titleEn": "", "bodyBn": body, "excerptBn": excerptOf(s.Body, 180), "author": s.AuthorName,
		"category": "community", "image": cover, "imageAlt": s.Title})
	slug := slugify(s.Title)
	if !validSlug(slug) {
		slug = "member-post"
	}
	slug = fmt.Sprintf("%s-%d", strings.TrimSuffix(slug[:min(len(slug), 60)], "-"), time.Now().Unix()%100000)
	in, errs := kindParsers[KindBlog](data, &entryBody{Slug: slug})
	if len(errs) > 0 {
		keys := make([]string, 0, len(errs))
		for k := range errs {
			keys = append(keys, k+": "+errs[k])
		}
		sort.Strings(keys)
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"error": "draft_invalid", "detail": strings.Join(keys, "; ")})
		return
	}
	e, err := a.Auth.Store.CreateEntry(r.Context(), u.ID, in)
	if err != nil {
		a.cmsFail(w, err)
		return
	}
	state := "accepted"
	if b.Publish {
		pub, err := a.Auth.Store.SetEntryStatus(r.Context(), u.ID, e.ID, "publish")
		if err != nil {
			_ = a.Auth.Store.SetSubmissionStatus(r.Context(), s.ID, "accepted", e.ID) // the draft exists; publishing can be retried
			a.cmsFail(w, err)
			return
		}
		e = pub
		state = "published"
	}
	_ = a.Auth.Store.SetSubmissionStatus(r.Context(), s.ID, state, e.ID)
	_ = a.Auth.Store.Audit(r.Context(), u.ID, "blog_submission."+map[bool]string{true: "publish", false: "draft"}[b.Publish], "blog_submission", s.ID, map[string]any{"post": e.ID, "pictures": len(images)})
	writeJSON(w, http.StatusCreated, map[string]any{"post": e, "pictures": len(images), "published": b.Publish})
}

// excerptOf is the first words of a text, on one line, cut at a word boundary.
func excerptOf(text string, max int) string {
	t := strings.Join(strings.Fields(text), " ")
	if utf8.RuneCountInString(t) <= max {
		return t
	}
	r := []rune(t)[:max]
	if i := strings.LastIndex(string(r), " "); i > max/2 {
		return string(r)[:i] + "…"
	}
	return string(r) + "…"
}
