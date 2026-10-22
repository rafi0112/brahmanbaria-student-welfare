package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// Imported directory review. An imported record is a directory entry, not an account. Verifying it records that an admin
// confirmed the person is real; it never touches email confirmation, roles, or the registered profile it may be linked to.

var ErrAlreadyLinked = errors.New("that account is already linked to another imported record")

type ImportedReview struct {
	ImportedID string
	VerifiedAt string
	VerifiedBy string // display name of the admin
	LinkedUser string // registered user id, or ""
}

type ImportedStore interface {
	ImportedReviews(ctx context.Context) (map[string]ImportedReview, error)
	// VerifyImported is idempotent. linkedUserID is optional; an account can be linked to one record only (ErrAlreadyLinked).
	VerifyImported(ctx context.Context, actorID, importedID, linkedUserID string) error
	UnverifyImported(ctx context.Context, actorID, importedID string) error
}

// ---- memory store ----

type memReview struct{ at, by, linked string }

func (m *memStore) ImportedReviews(_ context.Context) (map[string]ImportedReview, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := map[string]ImportedReview{}
	for id, r := range m.reviews {
		out[id] = ImportedReview{ImportedID: id, VerifiedAt: r.at, VerifiedBy: r.by, LinkedUser: r.linked}
	}
	return out, nil
}

func (m *memStore) VerifyImported(_ context.Context, actorID, importedID, linkedUserID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.reviews == nil {
		m.reviews = map[string]memReview{}
	}
	if linkedUserID != "" {
		if _, ok := m.users[linkedUserID]; !ok {
			return ErrNotFound
		}
		for id, r := range m.reviews {
			if r.linked == linkedUserID && id != importedID {
				return ErrAlreadyLinked
			}
		}
	}
	old, had := m.reviews[importedID]
	at := old.at
	if !had {
		at = time.Now().UTC().Format(time.RFC3339)
	}
	by := actorID
	if p, ok := m.profiles[actorID]; ok && p.Name != "" {
		by = p.Name
	} else if u, ok := m.users[actorID]; ok {
		by = u.Email
	}
	m.reviews[importedID] = memReview{at: at, by: by, linked: linkedUserID}
	return nil
}

func (m *memStore) UnverifyImported(_ context.Context, _, importedID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.reviews, importedID)
	return nil
}

// ---- PostgreSQL store ----

func (s *pgStore) ImportedReviews(ctx context.Context) (map[string]ImportedReview, error) {
	rows, err := s.db.Query(ctx, `SELECT r.imported_id, to_char(r.verified_at AT TIME ZONE 'UTC', `+tsFmt+`), COALESCE(NULLIF(p.name, ''), u.email, ''), COALESCE(r.linked_user_id::text, '')
		FROM imported_reviews r LEFT JOIN users u ON u.id = r.verified_by LEFT JOIN profiles p ON p.user_id = r.verified_by`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]ImportedReview{}
	for rows.Next() {
		var r ImportedReview
		if err := rows.Scan(&r.ImportedID, &r.VerifiedAt, &r.VerifiedBy, &r.LinkedUser); err != nil {
			return nil, err
		}
		out[r.ImportedID] = r
	}
	return out, rows.Err()
}

func (s *pgStore) VerifyImported(ctx context.Context, actorID, importedID, linkedUserID string) error {
	if linkedUserID != "" && !okID(linkedUserID) {
		return ErrNotFound
	}
	_, err := s.db.Exec(ctx, `INSERT INTO imported_reviews (imported_id, verified_by, linked_user_id) VALUES ($1, NULLIF($2, '')::uuid, NULLIF($3, '')::uuid)
		ON CONFLICT (imported_id) DO UPDATE SET linked_user_id = EXCLUDED.linked_user_id, verified_by = EXCLUDED.verified_by`, importedID, actorID, linkedUserID)
	var pe *pgconn.PgError
	if errors.As(err, &pe) {
		switch pe.Code {
		case "23505":
			return ErrAlreadyLinked
		case "23503":
			return ErrNotFound
		}
	}
	return err
}

func (s *pgStore) UnverifyImported(ctx context.Context, _, importedID string) error {
	_, err := s.db.Exec(ctx, `DELETE FROM imported_reviews WHERE imported_id = $1`, importedID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	return err
}

// ---- handlers ----

func (a *App) importedRoutes(m *http.ServeMux, h func(func(http.ResponseWriter, *http.Request)) http.HandlerFunc) {
	adm := func(f func(http.ResponseWriter, *http.Request, User)) http.HandlerFunc { return h(a.requireAdmin(f)) }
	m.HandleFunc("GET /api/v1/admin/imported-students/{id}/matches", adm(a.importedMatches))
	m.HandleFunc("POST /api/v1/admin/imported-students/{id}/verify", adm(a.importedVerify))
	m.HandleFunc("POST /api/v1/admin/imported-students/{id}/unverify", adm(a.importedUnverify))
}


type importedView struct {
	Student
	Source     string         `json:"source"` // file | manual
	Phone      string         `json:"phone,omitempty"`
	Note       string         `json:"note,omitempty"`
	AddedAt    string         `json:"addedAt,omitempty"`
	Verified   bool           `json:"verified"`
	VerifiedAt string         `json:"verifiedAt,omitempty"`
	VerifiedBy string         `json:"verifiedBy,omitempty"`
	Linked     *MemberAdminRow `json:"linked,omitempty"`
}

func (a *App) linkedSummary(ctx context.Context, userID string) *MemberAdminRow {
	if userID == "" {
		return nil
	}
	r, err := a.Auth.Store.MemberAdmin(ctx, userID)
	if err != nil {
		return nil
	}
	return &MemberAdminRow{ID: r.ID, Name: r.Name, Email: r.Email, Status: r.Status}
}

func (a *App) importedMatches(w http.ResponseWriter, r *http.Request, _ User) {
	st, ok := a.importedFind(r.Context(), r.PathValue("id"))
	if !ok {
		apiError(w, http.StatusNotFound, "imported record not found")
		return
	}
	reviews, err := a.Auth.Store.ImportedReviews(r.Context())
	if err != nil {
		log.Printf("imported matches: %v", err)
		apiError(w, 500, "could not load matches")
		return
	}
	taken := map[string]bool{}
	for id, rv := range reviews {
		if rv.LinkedUser != "" && id != st.ID {
			taken[rv.LinkedUser] = true
		}
	}
	// candidates: registered members with the same name (ignoring case); a matching batch and department raise confidence
	rows, _, err := a.Auth.Store.ListMembersAdmin(r.Context(), MemberQuery{Q: st.Name, Page: 1, Limit: 20})
	if err != nil {
		apiError(w, 500, "could not load matches")
		return
	}
	type cand struct {
		ID, Name, Email, Status string
		Batch                   int
		Department              string
		SameBatch, SameDept     bool
	}
	out := []map[string]any{}
	for _, m := range rows {
		if !strings.EqualFold(strings.TrimSpace(m.Name), strings.TrimSpace(st.Name)) || taken[m.ID] {
			continue
		}
		out = append(out, map[string]any{"id": m.ID, "name": m.Name, "email": m.Email, "status": m.Status, "batch": m.Batch, "department": m.Department,
			"sameBatch": st.Batch != nil && *st.Batch == m.Batch, "sameDepartment": st.Department != "" && st.Department == m.Department})
	}
	writeJSON(w, 200, map[string]any{"items": out})
}

func (a *App) importedVerify(w http.ResponseWriter, r *http.Request, u User) {
	var q struct {
		LinkedUserID string `json:"linkedUserId"`
	}
	if !decode(w, r, &q) {
		return
	}
	id := r.PathValue("id")
	if _, ok := a.importedFind(r.Context(), id); !ok {
		apiError(w, http.StatusNotFound, "imported record not found")
		return
	}
	link := strings.TrimSpace(q.LinkedUserID)
	if link != "" {
		if _, err := a.Auth.Store.MemberAdmin(r.Context(), link); err != nil {
			apiError(w, http.StatusUnprocessableEntity, "match_not_found")
			return
		}
	}
	if err := a.Auth.Store.VerifyImported(r.Context(), u.ID, id, link); err != nil {
		switch {
		case errors.Is(err, ErrAlreadyLinked):
			apiError(w, http.StatusConflict, "already_linked")
		case errors.Is(err, ErrNotFound):
			apiError(w, http.StatusUnprocessableEntity, "match_not_found")
		default:
			log.Printf("imported verify: %v", err)
			apiError(w, 500, "could not save")
		}
		return
	}
	_ = a.Auth.Store.Audit(r.Context(), u.ID, "imported.verify", "imported", id, map[string]any{"linked": link != ""})
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (a *App) importedUnverify(w http.ResponseWriter, r *http.Request, u User) {
	id := r.PathValue("id")
	if _, ok := a.importedFind(r.Context(), id); !ok {
		apiError(w, http.StatusNotFound, "imported record not found")
		return
	}
	if err := a.Auth.Store.UnverifyImported(r.Context(), u.ID, id); err != nil {
		log.Printf("imported unverify: %v", err)
		apiError(w, 500, "could not save")
		return
	}
	_ = a.Auth.Store.Audit(r.Context(), u.ID, "imported.unverify", "imported", id, nil)
	writeJSON(w, 200, map[string]any{"ok": true})
}

// importedStudents lists the bundled directory records with their review state. The records themselves are read-only.
func (a *App) importedStudents(w http.ResponseWriter, r *http.Request, _ User) {
	v := r.URL.Query()
	pg, limit := paging(r, 100)
	needle := strings.TrimSpace(v.Get("q"))
	b, _ := strconv.Atoi(v.Get("batch"))
	status := v.Get("status") // "", verified, awaiting
	reviews, err := a.Auth.Store.ImportedReviews(r.Context())
	if err != nil {
		log.Printf("imported reviews: %v", err)
		apiError(w, 500, "could not load the directory")
		return
	}
	manual, err := a.Auth.Store.ListManualImported(r.Context())
	if err != nil {
		log.Printf("manual imported: %v", err)
		apiError(w, 500, "could not load the directory")
		return
	}
	type rec struct {
		Student
		src, phone, note, added string
	}
	all := make([]rec, 0, len(manual)+len(a.Store.Students))
	for _, m := range manual { // hand-added records first, newest first
		all = append(all, rec{Student{ID: m.ID, Name: m.Name, Batch: m.Batch, Department: m.Department, Session: m.Session, Upazila: m.Upazila}, "manual", m.Phone, m.Note, m.CreatedAt})
	}
	for _, s := range a.Store.Students {
		all = append(all, rec{Student: s, src: "file"})
	}
	out := []importedView{}
	counts := map[string]int{"verified": 0, "awaiting": 0}
	for _, r0 := range all {
		s := r0.Student
		if needle != "" && !contains(s.Name, needle) {
			continue
		}
		if d := v.Get("department"); d != "" && s.Department != d {
			continue
		}
		if b > 0 && (s.Batch == nil || *s.Batch != b) {
			continue
		}
		rv, verified := reviews[s.ID]
		if verified {
			counts["verified"]++
		} else {
			counts["awaiting"]++
		}
		if (status == "verified" && !verified) || (status == "awaiting" && verified) {
			continue
		}
		iv := importedView{Student: s, Source: r0.src, Phone: r0.phone, Note: r0.note, AddedAt: r0.added, Verified: verified}
		if verified {
			iv.VerifiedAt, iv.VerifiedBy = rv.VerifiedAt, rv.VerifiedBy
		}
		out = append(out, iv)
	}
	lo, hi, pages := window(len(out), pg, limit)
	page := out[lo:hi]
	for i := range page { // only the visible page needs linked-account details
		if rv, ok := reviews[page[i].ID]; ok {
			page[i].Linked = a.linkedSummary(r.Context(), rv.LinkedUser)
		}
	}
	writeJSON(w, 200, map[string]any{"items": page, "total": len(out), "page": pg, "pages": pages, "sample": a.Store.Sample, "counts": counts})
}
