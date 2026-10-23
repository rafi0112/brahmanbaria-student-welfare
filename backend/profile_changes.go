package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// Profile change requests. A member whose membership is already approved cannot edit name, batch, department, session or
// location directly (approved details change only through an admin). They submit the new details as a request; it appears in
// Membership Requests next to brand-new registrations. Approving applies the details; rejecting discards them. The member's
// approval and verified status are untouched throughout.

type ProfileChangeData struct {
	Name       string `json:"name"`
	Batch      int    `json:"batch"`
	Department string `json:"department"`
	Session    string `json:"session"`
	Upazila    string `json:"upazila"`
	Union      string `json:"union"`
	Gender     string `json:"gender"`
}

type ProfileChange struct {
	UserID      string            `json:"userId"`
	Data        ProfileChangeData `json:"data"`
	SubmittedAt string            `json:"submittedAt"`
}

type ProfileChangeStore interface {
	// SubmitProfileChange stores (or replaces) the member's single open request.
	SubmitProfileChange(ctx context.Context, userID string, d ProfileChangeData) error
	ProfileChangeFor(ctx context.Context, userID string) (ProfileChange, error) // ErrNotFound when none is open
	ListProfileChanges(ctx context.Context) ([]ProfileChange, error)            // newest first
	// ResolveProfileChange approves (applies the details to the profile) or rejects/withdraws (discards) the open request.
	ResolveProfileChange(ctx context.Context, actorID, userID string, approve bool) error
}

// ---------------------------------------------------------------- memory store

func (m *memStore) SubmitProfileChange(_ context.Context, userID string, d ProfileChangeData) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.profiles[userID]; !ok {
		return ErrNotFound
	}
	if m.changes == nil {
		m.changes = map[string]*ProfileChange{}
	}
	m.changes[userID] = &ProfileChange{UserID: userID, Data: d, SubmittedAt: time.Now().UTC().Format(time.RFC3339Nano)}
	return nil
}

func (m *memStore) ProfileChangeFor(_ context.Context, userID string) (ProfileChange, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if c, ok := m.changes[userID]; ok {
		return *c, nil
	}
	return ProfileChange{}, ErrNotFound
}

func (m *memStore) ListProfileChanges(_ context.Context) ([]ProfileChange, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]ProfileChange, 0, len(m.changes))
	for _, c := range m.changes {
		out = append(out, *c)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].SubmittedAt > out[j].SubmittedAt })
	return out, nil
}

func (m *memStore) ResolveProfileChange(_ context.Context, actorID, userID string, approve bool) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	c, ok := m.changes[userID]
	if !ok {
		return ErrNotFound
	}
	if approve {
		p, ok := m.profiles[userID]
		if !ok {
			return ErrNotFound
		}
		p.Name, p.Batch, p.Department, p.Session, p.Upazila, p.Union, p.Gender = c.Data.Name, c.Data.Batch, c.Data.Department, c.Data.Session, c.Data.Upazila, c.Data.Union, c.Data.Gender
	}
	delete(m.changes, userID)
	action := "profile.change.rejected"
	if approve {
		action = "profile.change.approved"
	}
	m.auditLocked(actorID, action, "user", userID, nil)
	return nil
}

// ---------------------------------------------------------------- PostgreSQL store

const changeCols = `user_id::text, name, batch, department, session, upazila, union_name, gender, to_char(submitted_at AT TIME ZONE 'UTC', ` + tsFmt + `)`

func scanChange(r rowScanner) (ProfileChange, error) {
	var c ProfileChange
	err := r.Scan(&c.UserID, &c.Data.Name, &c.Data.Batch, &c.Data.Department, &c.Data.Session, &c.Data.Upazila, &c.Data.Union, &c.Data.Gender, &c.SubmittedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return c, ErrNotFound
	}
	return c, err
}

func (s *pgStore) SubmitProfileChange(ctx context.Context, userID string, d ProfileChangeData) error {
	if !okID(userID) {
		return ErrNotFound
	}
	_, err := s.db.Exec(ctx, `INSERT INTO profile_changes (user_id, name, batch, department, session, upazila, union_name, gender) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8)
		ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name, batch = EXCLUDED.batch, department = EXCLUDED.department, session = EXCLUDED.session,
			upazila = EXCLUDED.upazila, union_name = EXCLUDED.union_name, gender = EXCLUDED.gender, submitted_at = now()`,
		userID, d.Name, d.Batch, d.Department, d.Session, d.Upazila, d.Union, d.Gender)
	return err
}

func (s *pgStore) ProfileChangeFor(ctx context.Context, userID string) (ProfileChange, error) {
	if !okID(userID) {
		return ProfileChange{}, ErrNotFound
	}
	return scanChange(s.db.QueryRow(ctx, `SELECT `+changeCols+` FROM profile_changes WHERE user_id = $1::uuid`, userID))
}

func (s *pgStore) ListProfileChanges(ctx context.Context) ([]ProfileChange, error) {
	rows, err := s.db.Query(ctx, `SELECT `+changeCols+` FROM profile_changes ORDER BY submitted_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ProfileChange{}
	for rows.Next() {
		c, err := scanChange(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (s *pgStore) ResolveProfileChange(ctx context.Context, actorID, userID string, approve bool) error {
	if !okID(userID) {
		return ErrNotFound
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	if approve {
		t, err := tx.Exec(ctx, `UPDATE profiles p SET name = c.name, batch = c.batch, department = c.department, session = c.session, upazila = c.upazila, union_name = c.union_name, gender = c.gender
			FROM profile_changes c WHERE c.user_id = p.user_id AND p.user_id = $1::uuid`, userID)
		if err != nil {
			return err
		}
		if t.RowsAffected() == 0 {
			return ErrNotFound
		}
	}
	t, err := tx.Exec(ctx, `DELETE FROM profile_changes WHERE user_id = $1::uuid`, userID)
	if err != nil {
		return err
	}
	if t.RowsAffected() == 0 {
		return ErrNotFound
	}
	action := "profile.change.rejected"
	if approve {
		action = "profile.change.approved"
	}
	if err := auditAdmin(ctx, tx, actorID, action, "user", userID, nil); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// ---------------------------------------------------------------- handlers

func (a *App) profileChangeRoutes(m *http.ServeMux, h func(func(http.ResponseWriter, *http.Request)) http.HandlerFunc) {
	adm := func(f func(http.ResponseWriter, *http.Request, User)) http.HandlerFunc { return h(a.requireAdmin(f)) }
	m.HandleFunc("POST /api/v1/me/profile/request", h(a.requireUser(a.submitProfileChange)))
	m.HandleFunc("GET /api/v1/me/profile/request", h(a.requireUser(a.myProfileChange)))
	m.HandleFunc("DELETE /api/v1/me/profile/request", h(a.requireUser(a.withdrawProfileChange)))
	m.HandleFunc("GET /api/v1/admin/membership-requests", adm(a.membershipRequests))
	m.HandleFunc("POST /api/v1/admin/profile-changes/{id}/{action}", adm(a.resolveProfileChange))
}

func (a *App) submitProfileChange(w http.ResponseWriter, r *http.Request, u User) {
	var q registerReq
	if !decode(w, r, &q) {
		return
	}
	q.Name, q.Session = strings.TrimSpace(q.Name), strings.TrimSpace(q.Session)
	p, err := a.Auth.Store.ProfileByUser(r.Context(), u.ID)
	if err != nil || p == nil {
		apiError(w, http.StatusConflict, "no_profile")
		return
	}
	if p.Status != StatusApproved {
		apiError(w, http.StatusConflict, "not_approved") // members who are not approved yet edit their details directly
		return
	}
	if errs := a.validateProfile(&q); len(errs) > 0 {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"error": "validation failed", "fields": errs})
		return
	}
	d := ProfileChangeData{Name: q.Name, Batch: q.Batch, Department: q.Department, Session: q.Session, Upazila: q.Upazila, Union: q.Union, Gender: q.Gender}
	if d == (ProfileChangeData{Name: p.Name, Batch: p.Batch, Department: p.Department, Session: p.Session, Upazila: p.Upazila, Union: p.Union, Gender: p.Gender}) {
		apiError(w, http.StatusUnprocessableEntity, "no_changes")
		return
	}
	if err := a.Auth.Store.SubmitProfileChange(r.Context(), u.ID, d); err != nil {
		log.Printf("profile change: %v", err)
		apiError(w, 500, "could not save")
		return
	}
	_ = a.Auth.Store.Audit(r.Context(), u.ID, "profile.change.requested", "user", u.ID, nil)
	c, _ := a.Auth.Store.ProfileChangeFor(r.Context(), u.ID)
	writeJSON(w, http.StatusCreated, map[string]any{"request": c})
}

func (a *App) myProfileChange(w http.ResponseWriter, r *http.Request, u User) {
	c, err := a.Auth.Store.ProfileChangeFor(r.Context(), u.ID)
	if errors.Is(err, ErrNotFound) {
		writeJSON(w, 200, map[string]any{"request": nil})
		return
	}
	if err != nil {
		apiError(w, 500, "could not load")
		return
	}
	writeJSON(w, 200, map[string]any{"request": c})
}

func (a *App) withdrawProfileChange(w http.ResponseWriter, r *http.Request, u User) {
	if err := a.Auth.Store.ResolveProfileChange(r.Context(), "", u.ID, false); err != nil && !errors.Is(err, ErrNotFound) {
		apiError(w, 500, "could not withdraw")
		return
	}
	writeJSON(w, 200, map[string]bool{"ok": true})
}

func (a *App) resolveProfileChange(w http.ResponseWriter, r *http.Request, u User) {
	action := r.PathValue("action")
	if action != "approve" && action != "reject" {
		apiError(w, http.StatusNotFound, "not_found")
		return
	}
	err := a.Auth.Store.ResolveProfileChange(r.Context(), u.ID, r.PathValue("id"), action == "approve")
	if errors.Is(err, ErrNotFound) {
		apiError(w, http.StatusNotFound, "request not found")
		return
	}
	if err != nil {
		log.Printf("resolve profile change: %v", err)
		apiError(w, 500, "could not save")
		return
	}
	writeJSON(w, 200, map[string]bool{"ok": true})
}

type changeDiff struct {
	Field string `json:"field"`
	From  string `json:"from"`
	To    string `json:"to"`
}

type requestItem struct {
	MemberAdminRow
	Kind        string       `json:"kind"` // new (a pending registration) | update (an approved member asking to change their details)
	SubmittedAt string       `json:"submittedAt,omitempty"`
	Diff        []changeDiff `json:"diff,omitempty"`
	Replaces    string       `json:"replaces,omitempty"` // the earlier email of a verified member who moved to a new address
}

func itoa(n int) string {
	if n == 0 {
		return ""
	}
	return strconv.Itoa(n)
}

func diffOf(cur MemberAdminRow, d ProfileChangeData) []changeDiff {
	out := []changeDiff{}
	add := func(f, from, to string) {
		if from != to {
			out = append(out, changeDiff{f, from, to})
		}
	}
	add("name", cur.Name, d.Name)
	add("batch", itoa(cur.Batch), itoa(d.Batch))
	add("department", cur.Department, d.Department)
	add("session", cur.Session, d.Session)
	add("upazila", cur.Upazila, d.Upazila)
	add("union", cur.Union, d.Union)
	add("gender", cur.Gender, d.Gender)
	return out
}

// membershipRequests is the request queue: brand-new registrations that still await a decision, plus approved members who asked
// to change their details. Updates come first (they are few and already known to the club), then registrations, newest first.
// Both kinds are filtered with the same search and filters, and "complete" means every required detail is present.
func (a *App) membershipRequests(w http.ResponseWriter, r *http.Request, _ User) {
	q, ok := memberQuery(r)
	if !ok {
		apiError(w, http.StatusBadRequest, "invalid filter")
		return
	}
	ctx := r.Context()
	s := a.Auth.Store
	items := []requestItem{}

	changes, err := s.ListProfileChanges(ctx)
	if err != nil {
		log.Printf("requests: %v", err)
		apiError(w, 500, "could not load")
		return
	}
	needle := strings.ToLower(q.Q)
	for _, c := range changes {
		cur, err := s.MemberAdmin(ctx, c.UserID)
		if err != nil || cur.Disabled && q.Disabled == "no" {
			continue
		}
		if q.Complete == "no" || (q.Verified == "yes" && !cur.EmailVerified) || (q.Verified == "no" && cur.EmailVerified) ||
			(q.Department != "" && cur.Department != q.Department && c.Data.Department != q.Department) || (q.Batch > 0 && cur.Batch != q.Batch && c.Data.Batch != q.Batch) {
			continue
		}
		if needle != "" && !strings.Contains(strings.ToLower(cur.Email+" "+cur.Name+" "+c.Data.Name), needle) {
			continue
		}
		items = append(items, requestItem{MemberAdminRow: cur, Kind: "update", SubmittedAt: c.SubmittedAt, Diff: diffOf(cur, c.Data)})
	}

	moved := map[string]string{} // new account -> the earlier account it replaces
	if invs, err := s.Invites(ctx); err == nil {
		for _, iv := range invs {
			if iv.CompletedUser != "" && iv.ReplacesUser != "" {
				moved[iv.CompletedUser] = iv.ReplacesUser
			}
		}
	}
	pq := q
	pq.Status, pq.View, pq.Page, pq.Limit = StatusPending, "", 1, 100
	for pg := 1; pg <= 30; pg++ {
		pq.Page = pg
		rows, _, err := s.ListMembersAdmin(ctx, pq)
		if err != nil {
			log.Printf("requests: %v", err)
			apiError(w, 500, "could not load")
			return
		}
		for _, m := range rows {
			it := requestItem{MemberAdminRow: m, Kind: "new"}
			if old := moved[m.ID]; old != "" { // a verified member signing up again with a new email is an update, not a new person
				if u, err := s.UserByID(ctx, old); err == nil {
					it.Kind, it.Replaces = "update", u.Email
					it.Diff = []changeDiff{{"email", u.Email, m.Email}}
				}
			}
			items = append(items, it)
		}
		if len(rows) < 100 {
			break
		}
	}
	vers := a.photoVersions(ctx)
	for i := range items {
		items[i].PhotoURL = studentPhotoURL(items[i].ID, vers[items[i].ID])
	}
	total := len(items)
	lo, hi, pages := window(total, q.Page, q.Limit)
	writeJSON(w, 200, page{Items: items[lo:hi], Total: total, Page: q.Page, Pages: pages})
}

// afterApproved finishes a move to a new email: once the new account is approved, the member's earlier account is deactivated
// (never deleted, and an administrator's account is never touched) so the member appears once in Registered members.
func (a *App) afterApproved(ctx context.Context, actorID, userID string) {
	s := a.Auth.Store
	invs, err := s.Invites(ctx)
	if err != nil {
		return
	}
	for id, iv := range invs {
		if iv.CompletedUser != userID || iv.ReplacesUser == "" {
			continue
		}
		if old, err := s.UserByID(ctx, iv.ReplacesUser); err == nil && old.Role != RoleAdmin {
			if err := s.SetAccountDisabled(ctx, actorID, old.ID, true); err != nil {
				log.Printf("deactivate earlier account: %v", err)
				return
			}
			_ = s.Audit(ctx, actorID, "member.email.moved", "user", userID, nil)
		}
		_ = s.ClearReplaced(ctx, id)
	}
}
