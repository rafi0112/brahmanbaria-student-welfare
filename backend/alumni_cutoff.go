package main

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync"

	"github.com/jackc/pgx/v5"
)

// Batches graduate every year: the setting "alumni up to batch N" moves every student of batch N or earlier to the
// Alumni page. Admins change N in the panel (raise it by one each year); it is stored in site_settings.
const settingAlumniUpTo = "alumni.up_to_batch"

// SettingsStore keeps site-wide settings as JSON values. Setting returns ErrNotFound when the key was never set.
type SettingsStore interface {
	Setting(ctx context.Context, key string) (json.RawMessage, error)
	SetSetting(ctx context.Context, actorID, key string, value any) error
}

func (s *pgStore) Setting(ctx context.Context, key string) (json.RawMessage, error) {
	var v []byte
	err := s.db.QueryRow(ctx, `SELECT value FROM site_settings WHERE key = $1`, key).Scan(&v)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return v, err
}

func (s *pgStore) SetSetting(ctx context.Context, actorID, key string, value any) error {
	b, err := json.Marshal(value)
	if err != nil {
		return err
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	if _, err := tx.Exec(ctx, `INSERT INTO site_settings (key, value, updated_by) VALUES ($1, $2::jsonb, NULLIF($3, '')::uuid)
		ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`, key, string(b), actorID); err != nil {
		return err
	}
	if err := auditAdmin(ctx, tx, actorID, "settings.update", "setting", key, map[string]any{"value": json.RawMessage(b)}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

type memSettings struct {
	mu sync.Mutex
	kv map[string]json.RawMessage
}

func (m *memStore) Setting(_ context.Context, key string) (json.RawMessage, error) {
	m.settings.mu.Lock()
	defer m.settings.mu.Unlock()
	v, ok := m.settings.kv[key]
	if !ok {
		return nil, ErrNotFound
	}
	return v, nil
}

func (m *memStore) SetSetting(_ context.Context, actorID, key string, value any) error {
	b, err := json.Marshal(value)
	if err != nil {
		return err
	}
	m.settings.mu.Lock()
	if m.settings.kv == nil {
		m.settings.kv = map[string]json.RawMessage{}
	}
	m.settings.kv[key] = b
	m.settings.mu.Unlock()
	m.mu.Lock()
	m.auditLocked(actorID, "settings.update", "setting", key, map[string]any{"value": json.RawMessage(b)})
	m.mu.Unlock()
	return nil
}

// alumniUpTo reads the setting; ok is false when it was never set.
func alumniUpTo(ctx context.Context, s SettingsStore) (int, bool, error) {
	raw, err := s.Setting(ctx, settingAlumniUpTo)
	if errors.Is(err, ErrNotFound) {
		return 0, false, nil
	}
	if err != nil {
		return 0, false, err
	}
	var n int
	if err := json.Unmarshal(raw, &n); err != nil {
		return 0, false, err
	}
	return n, true, nil
}

// defaultAlumniUpTo is the highest batch among the alumni on record: the batches the association already treats as alumni.
func defaultAlumniUpTo(alumni []Alumnus) int {
	n := 0
	for _, a := range alumni {
		if a.Batch != nil && *a.Batch > n {
			n = *a.Batch
		}
	}
	return n
}

// ensureAlumniSetting stores the default once, so the rule is visible and editable from the first start.
func (a *App) ensureAlumniSetting(ctx context.Context) error {
	if a.Auth == nil {
		return nil
	}
	if _, ok, err := alumniUpTo(ctx, a.Auth.Store); err != nil || ok {
		return err
	}
	n := defaultAlumniUpTo(a.data().Alumni)
	log.Printf("alumni: batches up to %d count as alumni (default from the alumni on record; change it in the admin panel)", n)
	return a.Auth.Store.SetSetting(ctx, "", settingAlumniUpTo, n)
}

// graduated reports whether a person of this batch counts as alumni under the current setting.
func (s *Store) graduated(batch *int) bool {
	return batch != nil && s.AlumniUpTo > 0 && *batch <= s.AlumniUpTo
}

// shownAlumni is every alumnus the site shows: the alumni records up to the saved batch (and those without a batch),
// then every student or member whose batch has graduated. A person already listed by name and batch is not repeated.
// The saved batch decides for everyone, so an alumni record of a later batch waits until that batch is reached.
// With the setting at 0 nobody is moved and every alumni record is shown.
func (a *App) shownAlumni(ctx context.Context) []Alumnus {
	d := a.data()
	out := []Alumnus{}
	for _, al := range d.Alumni {
		if d.AlumniUpTo == 0 || al.Batch == nil || *al.Batch <= d.AlumniUpTo {
			out = append(out, al)
		}
	}
	seen := map[string]bool{}
	key := func(name string, b *int) string {
		k := strings.ToLower(strings.Join(strings.Fields(name), " "))
		if b != nil {
			k += "#" + strconv.Itoa(*b)
		}
		return k
	}
	for _, al := range out {
		seen[key(al.Name, al.Batch)] = true
	}
	for _, p := range a.directoryPeople(ctx) {
		if !d.graduated(p.Batch) || seen[key(p.Name, p.Batch)] {
			continue
		}
		seen[key(p.Name, p.Batch)] = true
		out = append(out, Alumnus{ID: p.ID, Name: p.Name, Batch: p.Batch, Department: p.Department, Upazila: p.Upazila})
	}
	return out
}

// ---------------------------------------------------------------- admin endpoints

func (a *App) settingsRoutes(m *http.ServeMux, h func(func(http.ResponseWriter, *http.Request)) http.HandlerFunc) {
	adm := func(f func(http.ResponseWriter, *http.Request, User)) http.HandlerFunc { return h(a.requireAdmin(f)) }
	m.HandleFunc("GET /api/v1/admin/settings/alumni", adm(a.alumniSettingGet))
	m.HandleFunc("PUT /api/v1/admin/settings/alumni", adm(a.alumniSettingPut))
}

func (a *App) alumniSettingGet(w http.ResponseWriter, r *http.Request, _ User) {
	d := a.data()
	byBatch := map[int]int{}
	for _, p := range a.directoryPeople(r.Context()) {
		if p.Batch != nil {
			byBatch[*p.Batch]++
		}
	}
	writeJSON(w, 200, map[string]any{"upToBatch": d.AlumniUpTo, "suggested": defaultAlumniUpTo(d.Alumni), "alumniRecords": len(d.Alumni),
		"alumniShown": len(a.shownAlumni(r.Context())), "studentsByBatch": byBatch})
}

func (a *App) alumniSettingPut(w http.ResponseWriter, r *http.Request, u User) {
	var body struct {
		UpToBatch *int `json:"upToBatch"`
	}
	if !decode(w, r, &body) {
		return
	}
	if body.UpToBatch == nil || *body.UpToBatch < 0 || *body.UpToBatch > 60 {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"error": "validation failed", "fields": map[string]string{"upToBatch": "Choose a batch between 0 and 60 (0 means nobody is moved to alumni)."}})
		return
	}
	if err := a.Auth.Store.SetSetting(r.Context(), u.ID, settingAlumniUpTo, *body.UpToBatch); err != nil {
		log.Printf("alumni setting: %v", err)
		apiError(w, 500, "could not save")
		return
	}
	if err := a.reloadLive(r.Context()); err != nil {
		log.Printf("reload after the alumni setting: %v", err)
	}
	a.alumniSettingGet(w, r, u)
}
