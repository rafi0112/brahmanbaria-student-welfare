package main

import (
	"context"
	"encoding/csv"
	"errors"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// Member directory review. The directory is the existing list of members (content_documents, kind "students", seeded from the
// bundled directory data) plus any records an admin adds by hand (imported_members). Every record starts in "needs verification".
// An admin verifies it, which stores who and when in imported_reviews. Verifying changes nothing else: it creates no account,
// confirms no email address, approves no membership and grants no role. There is no matching or merging of people across sources.

type ImportedReview struct {
	ImportedID string
	VerifiedAt string
	VerifiedBy string // display name of the admin
}

type ImportedStore interface {
	ImportedReviews(ctx context.Context) (map[string]ImportedReview, error)
	// VerifyImported is idempotent: verifying twice keeps the first verifier and time.
	VerifyImported(ctx context.Context, actorID, importedID string) error
	UnverifyImported(ctx context.Context, actorID, importedID string) error
}

// ---- memory store ----

type memReview struct{ at, by string }

func (m *memStore) ImportedReviews(_ context.Context) (map[string]ImportedReview, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := map[string]ImportedReview{}
	for id, r := range m.reviews {
		out[id] = ImportedReview{ImportedID: id, VerifiedAt: r.at, VerifiedBy: r.by}
	}
	return out, nil
}

func (m *memStore) VerifyImported(_ context.Context, actorID, importedID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.reviews == nil {
		m.reviews = map[string]memReview{}
	}
	if _, had := m.reviews[importedID]; had {
		return nil
	}
	by := actorID
	if p, ok := m.profiles[actorID]; ok && p.Name != "" {
		by = p.Name
	} else if u, ok := m.users[actorID]; ok {
		by = u.Email
	}
	m.reviews[importedID] = memReview{at: time.Now().UTC().Format(time.RFC3339), by: by}
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
	rows, err := s.db.Query(ctx, `SELECT r.imported_id, to_char(r.verified_at AT TIME ZONE 'UTC', `+tsFmt+`), COALESCE(NULLIF(p.name, ''), u.email, '')
		FROM imported_reviews r LEFT JOIN users u ON u.id = r.verified_by LEFT JOIN profiles p ON p.user_id = r.verified_by`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]ImportedReview{}
	for rows.Next() {
		var r ImportedReview
		if err := rows.Scan(&r.ImportedID, &r.VerifiedAt, &r.VerifiedBy); err != nil {
			return nil, err
		}
		out[r.ImportedID] = r
	}
	return out, rows.Err()
}

func (s *pgStore) VerifyImported(ctx context.Context, actorID, importedID string) error {
	_, err := s.db.Exec(ctx, `INSERT INTO imported_reviews (imported_id, verified_by) VALUES ($1, NULLIF($2, '')::uuid) ON CONFLICT (imported_id) DO NOTHING`, importedID, actorID)
	return err
}

func (s *pgStore) UnverifyImported(ctx context.Context, _, importedID string) error {
	_, err := s.db.Exec(ctx, `DELETE FROM imported_reviews WHERE imported_id = $1`, importedID)
	return err
}

// ---- handlers ----

func (a *App) importedRoutes(m *http.ServeMux, h func(func(http.ResponseWriter, *http.Request)) http.HandlerFunc) {
	adm := func(f func(http.ResponseWriter, *http.Request, User)) http.HandlerFunc { return h(a.requireAdmin(f)) }
	m.HandleFunc("POST /api/v1/admin/imported-students/{id}/verify", adm(a.importedVerify))
	m.HandleFunc("POST /api/v1/admin/imported-students/{id}/unverify", adm(a.importedUnverify))
	m.HandleFunc("GET /api/v1/admin/export/imported", adm(a.importedExport))
}

type importedView struct {
	Student
	Source     string            `json:"source"` // file (the existing directory) | manual (added by an admin) | member (registered without a record)
	Phone      string            `json:"phone,omitempty"`
	Union      string            `json:"union"`
	Gender     string            `json:"gender"`
	BloodGroup string            `json:"bloodGroup"`
	Note       string            `json:"note,omitempty"`
	AddedAt    string            `json:"addedAt,omitempty"` // only hand-added records carry a real date; the original directory stores none
	Verified   bool              `json:"verified"`
	Edited     bool              `json:"edited,omitempty"`
	Auto       bool              `json:"autoVerified,omitempty"` // verified because the person activated an invitation and was approved as a member
	VerifiedAt string            `json:"verifiedAt,omitempty"`
	VerifiedBy string            `json:"verifiedBy,omitempty"`
	Invite     map[string]any    `json:"invite,omitempty"`  // saved email and the real outcome of inviting it (admin view only)
	Private    map[string]string `json:"private,omitempty"` // the original form's contact columns (admin view only)
}

func (a *App) importedVerify(w http.ResponseWriter, r *http.Request, u User) {
	id := r.PathValue("id")
	if _, ok := a.importedFind(r.Context(), id); !ok {
		apiError(w, http.StatusNotFound, "imported record not found")
		return
	}
	// A record cannot be verified without an email: verifying also marks that address as confirmed by the admin.
	if inv, err := a.Auth.Store.InviteFor(r.Context(), id); err != nil || inv.Email == "" {
		apiError(w, http.StatusUnprocessableEntity, "email_required")
		return
	}
	if err := a.Auth.Store.SetInviteEmailVerified(r.Context(), id, true); err != nil {
		log.Printf("imported verify email: %v", err)
		apiError(w, 500, "could not save")
		return
	}
	if err := a.Auth.Store.VerifyImported(r.Context(), u.ID, id); err != nil {
		log.Printf("imported verify: %v", err)
		apiError(w, 500, "could not save")
		return
	}
	_ = a.Auth.Store.Audit(r.Context(), u.ID, "imported.verify", "imported", id, nil)
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (a *App) importedUnverify(w http.ResponseWriter, r *http.Request, u User) {
	id := r.PathValue("id")
	if _, ok := a.importedFind(r.Context(), id); !ok {
		apiError(w, http.StatusNotFound, "imported record not found")
		return
	}
	_ = a.Auth.Store.SetInviteEmailVerified(r.Context(), id, false)
	if err := a.Auth.Store.UnverifyImported(r.Context(), u.ID, id); err != nil {
		log.Printf("imported unverify: %v", err)
		apiError(w, 500, "could not save")
		return
	}
	_ = a.Auth.Store.Audit(r.Context(), u.ID, "imported.unverify", "imported", id, nil)
	writeJSON(w, 200, map[string]any{"ok": true})
}

// importedAll applies the list filters (q, department, batch, status) to the whole directory and counts both queues for
// the same search, so the tab counters match what each tab shows.
func (a *App) importedAll(ctx context.Context, v url.Values) ([]importedView, map[string]int, error) {
	needle := strings.TrimSpace(v.Get("q"))
	b, _ := strconv.Atoi(v.Get("batch"))
	status := v.Get("status") // "", verified, awaiting
	reviews, err := a.Auth.Store.ImportedReviews(ctx)
	if err != nil {
		return nil, nil, err
	}
	manual, err := a.Auth.Store.ListManualImported(ctx)
	if err != nil {
		return nil, nil, err
	}
	invites, err := a.Auth.Store.Invites(ctx)
	if err != nil {
		return nil, nil, err
	}
	edits, err := a.Auth.Store.ImportedEdits(ctx)
	if err != nil {
		return nil, nil, err
	}
	// A record is verified once its person has activated an invitation and an admin approved their membership. This is
	// derived on every read, so the tab counts and the lists always agree and nothing needs to be written.
	approvedVia := map[string]bool{}
	for id, inv := range invites {
		for _, uid := range []string{inv.CompletedUser, inv.ReplacesUser} { // the earlier account keeps the record verified while a move to a new email is pending
			if uid == "" {
				continue
			}
			if p, err := a.Auth.Store.ProfileByUser(ctx, uid); err == nil && p != nil && p.Status == StatusApproved {
				approvedVia[id] = true
			}
		}
	}
	type rec struct {
		Student
		src, phone, note, added string
		union, gender, blood    string
	}
	all := make([]rec, 0, len(manual)+len(a.data().Students))
	for _, m := range manual { // hand-added records first, newest first
		all = append(all, rec{Student{ID: m.ID, Name: m.Name, Batch: m.Batch, Department: m.Department, Session: m.Session, Upazila: m.Upazila}, "manual", m.Phone, m.Note, m.CreatedAt, m.Union, m.Gender, m.BloodGroup})
	}
	for _, s := range a.data().Students {
		if x, has := edits[s.ID]; has { // the admin completed this record
			s.Name, s.Batch, s.Department, s.Session, s.Upazila = x.Name, x.Batch, x.Department, x.Session, x.Upazila
		}
		r := rec{Student: s, src: "file"}
		if x, has := edits[s.ID]; has {
			r.phone, r.union, r.gender, r.blood = x.Phone, x.Union, x.Gender, x.BloodGroup
		}
		all = append(all, r)
	}
	// Registered members who joined without a directory record are students too, so the directory lists every one of them.
	// Members linked to a record through an invitation already appear as that record.
	linked := map[string]bool{}
	for _, inv := range invites {
		linked[inv.CompletedUser], linked[inv.ReplacesUser] = true, true
	}
	members, err := a.Auth.Store.ListMembers(ctx, StatusApproved)
	if err != nil {
		return nil, nil, err
	}
	memberVerified := map[string]bool{}
	for _, m := range members {
		if linked[m.UserID] {
			continue
		}
		var bp *int
		if m.Batch > 0 {
			b := m.Batch
			bp = &b
		}
		id := "m-" + m.UserID
		memberVerified[id] = m.EmailVerified
		all = append(all, rec{Student{ID: id, Name: m.Name, Batch: bp, Department: m.Department, Session: m.Session, Upazila: m.Upazila}, "member", m.Phone, "", "", m.Union, m.Gender, m.BloodGroup})
	}
	out := []importedView{}
	counts := map[string]int{"verified": 0, "awaiting": 0, "registered": 0}
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
		rv, reviewed := reviews[s.ID]
		verified := reviewed || approvedVia[s.ID] || memberVerified[s.ID] // a registered member: approved, with a confirmed email
		switch {
		case r0.src == "member": // counted on their own, so the record verification figures stay about records
			counts["registered"]++
		case verified:
			counts["verified"]++
		default:
			counts["awaiting"]++
		}
		// the verified / needs-verification views are about records; registered members show under All
		if (status != "" && r0.src == "member") || (status == "verified" && !verified) || (status == "awaiting" && verified) {
			continue
		}
		iv := importedView{Student: s, Source: r0.src, Phone: r0.phone, Union: r0.union, Gender: r0.gender, BloodGroup: r0.blood, Note: r0.note, AddedAt: r0.added, Verified: verified}
		if pv := a.data().Private[s.ID]; pv != nil && r0.src == "file" {
			iv.Private = pv
			if iv.Phone == "" {
				iv.Phone = pv["phone"]
			}
			if iv.BloodGroup == "" {
				iv.BloodGroup = pv["bloodGroup"]
			}
		}
		if reviewed {
			iv.VerifiedAt, iv.VerifiedBy = rv.VerifiedAt, rv.VerifiedBy
		} else if verified && r0.src != "member" {
			iv.Auto = true
		}
		_, iv.Edited = edits[s.ID]
		if inv, ok := invites[s.ID]; ok {
			iv.Invite = a.inviteView(inv)
			if iv.Auto {
				iv.Invite["emailVerified"] = true // the person confirmed it by activating the invitation
			}
		}
		out = append(out, iv)
	}
	return out, counts, nil
}

func (a *App) importedStudents(w http.ResponseWriter, r *http.Request, _ User) {
	pg, limit := paging(r, 100)
	out, counts, err := a.importedAll(r.Context(), r.URL.Query())
	if err != nil {
		log.Printf("imported list: %v", err)
		apiError(w, 500, "could not load the directory")
		return
	}
	lo, hi, pages := window(len(out), pg, limit)
	writeJSON(w, 200, map[string]any{"items": out[lo:hi], "total": len(out), "page": pg, "pages": pages, "sample": a.data().Sample, "counts": counts})
}

// importedExport streams the filtered directory as CSV (UTF-8 with a byte-order mark so Bangla opens correctly in spreadsheets).
// Phone numbers and notes of hand-added records are left out; they are admin working notes, not directory data.
func (a *App) importedExport(w http.ResponseWriter, r *http.Request, u User) {
	out, _, err := a.importedAll(r.Context(), r.URL.Query())
	if err != nil {
		log.Printf("imported export: %v", err)
		apiError(w, 500, "could not export")
		return
	}
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="member-directory.csv"`)
	_, _ = w.Write([]byte{0xEF, 0xBB, 0xBF})
	cw := csv.NewWriter(w)
	_ = cw.Write([]string{"name", "batch", "department", "session", "upazila", "source", "verification", "verified_by", "verified_at", "added_to_directory"})
	for _, x := range out {
		batch := ""
		if x.Batch != nil {
			batch = strconv.Itoa(*x.Batch)
		}
		state := "needs_verification"
		if x.Verified {
			state = "verified"
		}
		_ = cw.Write([]string{csvCell(x.Name), batch, csvCell(x.Department), x.Session, x.Upazila, x.Source, state, csvCell(x.VerifiedBy), x.VerifiedAt, x.AddedAt})
	}
	cw.Flush()
	_ = a.Auth.Store.Audit(r.Context(), u.ID, "imported.export", "imported", "", map[string]any{"rows": len(out)})
}

var _ = errors.New
