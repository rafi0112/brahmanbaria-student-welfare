package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
)

// Imported-directory records added by hand. They sit next to the read-only bundled records, are never accounts, and can be
// edited or deleted by admins. Deleting one also removes its review row, but never touches any registered account.

type ManualImported struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Batch      *int   `json:"batch"`
	Department string `json:"department"`
	Session    string `json:"session"`
	Upazila    string `json:"upazila"`
	Phone      string `json:"phone"`
	Note       string `json:"note"`
	AddedBy    string `json:"addedBy,omitempty"`
	CreatedAt  string `json:"createdAt"`
}

type ManualImportedInput struct {
	Name, Department, Session, Upazila, Phone, Note string
	Batch                                          *int
}

type ManualImportedStore interface {
	ListManualImported(ctx context.Context) ([]ManualImported, error)
	CreateManualImported(ctx context.Context, actorID string, in ManualImportedInput) (ManualImported, error)
	UpdateManualImported(ctx context.Context, id string, in ManualImportedInput) (ManualImported, error)
	DeleteManualImported(ctx context.Context, id string) error
}

const manualPrefix = "i-"

var sessionRx = regexp.MustCompile(`^\d{4}-\d{2}$`)

// ---- memory store ----

func (m *memStore) ListManualImported(_ context.Context) ([]ManualImported, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]ManualImported, 0, len(m.manual))
	for i := len(m.manual) - 1; i >= 0; i-- { // newest first
		out = append(out, *m.manual[i])
	}
	return out, nil
}

func (m *memStore) CreateManualImported(_ context.Context, _ string, in ManualImportedInput) (ManualImported, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.seq++
	r := &ManualImported{ID: fmt.Sprintf("%s%08d", manualPrefix, m.seq), Name: in.Name, Batch: in.Batch, Department: in.Department, Session: in.Session,
		Upazila: in.Upazila, Phone: in.Phone, Note: in.Note, CreatedAt: time.Now().UTC().Format(time.RFC3339)}
	m.manual = append(m.manual, r)
	return *r, nil
}

func (m *memStore) UpdateManualImported(_ context.Context, id string, in ManualImportedInput) (ManualImported, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, r := range m.manual {
		if r.ID == id {
			r.Name, r.Batch, r.Department, r.Session, r.Upazila, r.Phone, r.Note = in.Name, in.Batch, in.Department, in.Session, in.Upazila, in.Phone, in.Note
			return *r, nil
		}
	}
	return ManualImported{}, ErrNotFound
}

func (m *memStore) DeleteManualImported(_ context.Context, id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for i, r := range m.manual {
		if r.ID == id {
			m.manual = append(m.manual[:i], m.manual[i+1:]...)
			delete(m.reviews, id)
			delete(m.invites, id)
			return nil
		}
	}
	return ErrNotFound
}

// ---- PostgreSQL store ----

const manualCols = `m.id::text, m.name, m.batch, m.department, m.session, m.upazila, m.phone, m.note, to_char(m.created_at AT TIME ZONE 'UTC', ` + tsFmt + `)`

func scanManual(r rowScanner) (ManualImported, error) {
	var x ManualImported
	err := r.Scan(&x.ID, &x.Name, &x.Batch, &x.Department, &x.Session, &x.Upazila, &x.Phone, &x.Note, &x.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return x, ErrNotFound
	}
	if err == nil {
		x.ID = manualPrefix + x.ID
	}
	return x, err
}

func rawManualID(id string) (string, bool) {
	raw := strings.TrimPrefix(id, manualPrefix)
	return raw, strings.HasPrefix(id, manualPrefix) && okID(raw)
}

func (s *pgStore) ListManualImported(ctx context.Context) ([]ManualImported, error) {
	rows, err := s.db.Query(ctx, `SELECT `+manualCols+` FROM imported_members m ORDER BY m.created_at DESC, m.id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ManualImported{}
	for rows.Next() {
		x, err := scanManual(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, x)
	}
	return out, rows.Err()
}

func (s *pgStore) CreateManualImported(ctx context.Context, actorID string, in ManualImportedInput) (ManualImported, error) {
	return scanManual(s.db.QueryRow(ctx, `INSERT INTO imported_members AS m (name, batch, department, session, upazila, phone, note, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, NULLIF($8, '')::uuid)
		RETURNING `+manualCols, in.Name, in.Batch, in.Department, in.Session, in.Upazila, in.Phone, in.Note, actorID))
}

func (s *pgStore) UpdateManualImported(ctx context.Context, id string, in ManualImportedInput) (ManualImported, error) {
	raw, ok := rawManualID(id)
	if !ok {
		return ManualImported{}, ErrNotFound
	}
	return scanManual(s.db.QueryRow(ctx, `UPDATE imported_members AS m SET name = $2, batch = $3, department = $4, session = $5, upazila = $6, phone = $7, note = $8, updated_at = now()
		WHERE m.id = $1::uuid RETURNING `+manualCols, raw, in.Name, in.Batch, in.Department, in.Session, in.Upazila, in.Phone, in.Note))
}

func (s *pgStore) DeleteManualImported(ctx context.Context, id string) error {
	raw, ok := rawManualID(id)
	if !ok {
		return ErrNotFound
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	t, err := tx.Exec(ctx, `DELETE FROM imported_members WHERE id = $1::uuid`, raw)
	if err != nil {
		return err
	}
	if t.RowsAffected() == 0 {
		return ErrNotFound
	}
	if _, err := tx.Exec(ctx, `DELETE FROM imported_reviews WHERE imported_id = $1`, id); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM directory_invites WHERE imported_id = $1 AND status <> 'completed'`, id); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// ---- handlers ----

func (a *App) manualRoutes(m *http.ServeMux, h func(func(http.ResponseWriter, *http.Request)) http.HandlerFunc) {
	adm := func(f func(http.ResponseWriter, *http.Request, User)) http.HandlerFunc { return h(a.requireAdmin(f)) }
	m.HandleFunc("POST /api/v1/admin/imported-students", adm(a.manualCreate))
	m.HandleFunc("PATCH /api/v1/admin/imported-students/{id}", adm(a.manualUpdate))
	m.HandleFunc("POST /api/v1/admin/imported-students/{id}/delete", adm(a.manualDelete))
}

type manualBody struct {
	Name       string `json:"name"`
	Batch      int    `json:"batch"`
	Department string `json:"department"`
	Session    string `json:"session"`
	Upazila    string `json:"upazila"`
	Phone      string `json:"phone"`
	Note       string `json:"note"`
}

// validateManual cleans the input and returns field errors; department and upazila must come from the real lists.
func (a *App) validateManual(b manualBody) (ManualImportedInput, map[string]string) {
	errs := map[string]string{}
	in := ManualImportedInput{Name: strings.TrimSpace(b.Name), Department: strings.TrimSpace(b.Department), Session: strings.TrimSpace(b.Session),
		Upazila: strings.TrimSpace(b.Upazila), Phone: strings.TrimSpace(b.Phone), Note: strings.TrimSpace(b.Note)}
	if n := utf8.RuneCountInString(in.Name); n < 2 || n > 80 {
		errs["name"] = "Name must be 2-80 characters."
	}
	if b.Batch < 1 || b.Batch > 99 {
		errs["batch"] = "Choose a batch."
	} else {
		v := b.Batch
		in.Batch = &v
	}
	okDept := false
	for _, d := range a.Store.Depts {
		if d == in.Department {
			okDept = true
		}
	}
	if !okDept {
		errs["department"] = "Choose a department from the list."
	}
	if in.Session != "" && !sessionRx.MatchString(in.Session) {
		errs["session"] = "Use a session like 2026-27."
	}
	if in.Upazila != "" {
		found := false
		for _, u := range a.Store.Upazilas {
			if u.Slug == in.Upazila {
				found = true
			}
		}
		if !found {
			errs["upazila"] = "Choose an upazila from the list."
		}
	}
	if in.Phone != "" && !phoneRx.MatchString(in.Phone) {
		errs["phone"] = "Use an 11-digit number starting with 01."
	}
	if utf8.RuneCountInString(in.Note) > 300 {
		errs["note"] = "Keep the note under 300 characters."
	}
	return in, errs
}

func (a *App) manualCreate(w http.ResponseWriter, r *http.Request, u User) {
	var b manualBody
	if !decode(w, r, &b) {
		return
	}
	in, errs := a.validateManual(b)
	if len(errs) > 0 {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"error": "validation failed", "fields": errs})
		return
	}
	rec, err := a.Auth.Store.CreateManualImported(r.Context(), u.ID, in)
	if err != nil {
		log.Printf("manual imported create: %v", err)
		apiError(w, 500, "could not save")
		return
	}
	_ = a.Auth.Store.Audit(r.Context(), u.ID, "imported.create", "imported", rec.ID, nil)
	writeJSON(w, http.StatusCreated, rec)
}

func (a *App) manualUpdate(w http.ResponseWriter, r *http.Request, u User) {
	id := r.PathValue("id")
	if !strings.HasPrefix(id, manualPrefix) {
		if _, ok := a.fileImported(id); ok {
			apiError(w, http.StatusConflict, "read_only_record") // bundled records come from the directory files
			return
		}
		apiError(w, http.StatusNotFound, "imported record not found")
		return
	}
	var b manualBody
	if !decode(w, r, &b) {
		return
	}
	in, errs := a.validateManual(b)
	if len(errs) > 0 {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"error": "validation failed", "fields": errs})
		return
	}
	rec, err := a.Auth.Store.UpdateManualImported(r.Context(), id, in)
	if errors.Is(err, ErrNotFound) {
		apiError(w, http.StatusNotFound, "imported record not found")
		return
	}
	if err != nil {
		log.Printf("manual imported update: %v", err)
		apiError(w, 500, "could not save")
		return
	}
	_ = a.Auth.Store.Audit(r.Context(), u.ID, "imported.update", "imported", id, nil)
	writeJSON(w, 200, rec)
}

func (a *App) manualDelete(w http.ResponseWriter, r *http.Request, u User) {
	id := r.PathValue("id")
	if !strings.HasPrefix(id, manualPrefix) {
		if _, ok := a.fileImported(id); ok {
			apiError(w, http.StatusConflict, "read_only_record")
			return
		}
		apiError(w, http.StatusNotFound, "imported record not found")
		return
	}
	if err := a.Auth.Store.DeleteManualImported(r.Context(), id); err != nil {
		if errors.Is(err, ErrNotFound) {
			apiError(w, http.StatusNotFound, "imported record not found")
			return
		}
		log.Printf("manual imported delete: %v", err)
		apiError(w, 500, "could not delete")
		return
	}
	_ = a.Auth.Store.Audit(r.Context(), u.ID, "imported.delete", "imported", id, nil)
	writeJSON(w, 200, map[string]bool{"ok": true})
}

func (a *App) fileImported(id string) (Student, bool) {
	for _, s := range a.Store.Students {
		if s.ID == id {
			return s, true
		}
	}
	return Student{}, false
}

// importedFind looks a record up among the bundled files and the hand-added ones.
func (a *App) importedFind(ctx context.Context, id string) (Student, bool) {
	if s, ok := a.fileImported(id); ok {
		return s, true
	}
	if strings.HasPrefix(id, manualPrefix) {
		rows, err := a.Auth.Store.ListManualImported(ctx)
		if err == nil {
			for _, m := range rows {
				if m.ID == id {
					return Student{ID: m.ID, Name: m.Name, Batch: m.Batch, Department: m.Department, Session: m.Session, Upazila: m.Upazila}, true
				}
			}
		}
	}
	return Student{}, false
}
