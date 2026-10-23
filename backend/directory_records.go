package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"sort"
	"strings"
	"sync"
)

// DirectoryRecord is one person of the original directory as stored in the database (table directory_records).
// Private and Sources never reach a public response.
type DirectoryRecord struct {
	ID          string            `json:"id"`
	Kind        string            `json:"kind"` // student | alumni
	Name        string            `json:"name"`
	Batch       *int              `json:"batch"`
	Department  string            `json:"department"`
	Session     string            `json:"session"`
	Upazila     string            `json:"upazila"`
	Occupation  string            `json:"occupation"`
	Workplace   string            `json:"workplace"`
	Designation string            `json:"designation"`
	Private     map[string]string `json:"private"`
	Sources     []json.RawMessage `json:"sources"`
}

// DirectoryRecordStore keeps the directory in the database. Upsert is keyed on the record id, so importing again updates
// the same people instead of adding copies; it never deletes.
type DirectoryRecordStore interface {
	DirectoryRecords(ctx context.Context) ([]DirectoryRecord, error)
	UpsertDirectoryRecords(ctx context.Context, recs []DirectoryRecord) (added, updated int, err error)
	// DeleteDirectoryRecord removes one record for good; ErrNotFound when there is none.
	DeleteDirectoryRecord(ctx context.Context, id string) error
}

// ---------------------------------------------------------------- Postgres

func (s *pgStore) DirectoryRecords(ctx context.Context) ([]DirectoryRecord, error) {
	rows, err := s.db.Query(ctx, `SELECT id, kind, name, batch, department, session, upazila, occupation, workplace, designation, private, sources
		FROM directory_records ORDER BY kind, name, id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []DirectoryRecord{}
	for rows.Next() {
		var r DirectoryRecord
		var priv, src []byte
		if err := rows.Scan(&r.ID, &r.Kind, &r.Name, &r.Batch, &r.Department, &r.Session, &r.Upazila, &r.Occupation, &r.Workplace, &r.Designation, &priv, &src); err != nil {
			return nil, err
		}
		_ = json.Unmarshal(priv, &r.Private)
		_ = json.Unmarshal(src, &r.Sources)
		out = append(out, r)
	}
	return out, rows.Err()
}

func (s *pgStore) UpsertDirectoryRecords(ctx context.Context, recs []DirectoryRecord) (int, int, error) {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return 0, 0, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	added, updated := 0, 0
	for _, r := range recs {
		priv, _ := json.Marshal(nonNilMap(r.Private))
		src, _ := json.Marshal(nonNilSources(r.Sources))
		var inserted bool
		err := tx.QueryRow(ctx, `INSERT INTO directory_records (id, kind, name, batch, department, session, upazila, occupation, workplace, designation, private, sources)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb)
			ON CONFLICT (id) DO UPDATE SET kind = EXCLUDED.kind, name = EXCLUDED.name, batch = EXCLUDED.batch, department = EXCLUDED.department,
				session = EXCLUDED.session, upazila = EXCLUDED.upazila, occupation = EXCLUDED.occupation, workplace = EXCLUDED.workplace,
				designation = EXCLUDED.designation, private = EXCLUDED.private, sources = EXCLUDED.sources, updated_at = now()
			RETURNING (xmax = 0)`,
			r.ID, r.Kind, r.Name, r.Batch, r.Department, r.Session, r.Upazila, r.Occupation, r.Workplace, r.Designation, string(priv), string(src)).Scan(&inserted)
		if err != nil {
			return 0, 0, fmt.Errorf("%s: %w", r.ID, err)
		}
		if inserted {
			added++
		} else {
			updated++
		}
	}
	return added, updated, tx.Commit(ctx)
}

func (s *pgStore) DeleteDirectoryRecord(ctx context.Context, id string) error {
	tag, err := s.db.Exec(ctx, `DELETE FROM directory_records WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func nonNilMap(m map[string]string) map[string]string {
	if m == nil {
		return map[string]string{}
	}
	return m
}

func nonNilSources(s []json.RawMessage) []json.RawMessage {
	if s == nil {
		return []json.RawMessage{}
	}
	return s
}

// ---------------------------------------------------------------- memory (tests and local development)

type memDirectory struct {
	mu   sync.Mutex
	recs map[string]DirectoryRecord
}

func (m *memStore) DirectoryRecords(_ context.Context) ([]DirectoryRecord, error) {
	m.dir.mu.Lock()
	defer m.dir.mu.Unlock()
	out := make([]DirectoryRecord, 0, len(m.dir.recs))
	for _, r := range m.dir.recs {
		out = append(out, r)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Kind != out[j].Kind {
			return out[i].Kind < out[j].Kind
		}
		return out[i].Name+out[i].ID < out[j].Name+out[j].ID
	})
	return out, nil
}

func (m *memStore) UpsertDirectoryRecords(_ context.Context, recs []DirectoryRecord) (int, int, error) {
	m.dir.mu.Lock()
	defer m.dir.mu.Unlock()
	if m.dir.recs == nil {
		m.dir.recs = map[string]DirectoryRecord{}
	}
	added, updated := 0, 0
	for _, r := range recs {
		if _, ok := m.dir.recs[r.ID]; ok {
			updated++
		} else {
			added++
		}
		m.dir.recs[r.ID] = r
	}
	return added, updated, nil
}

func (m *memStore) DeleteDirectoryRecord(_ context.Context, id string) error {
	m.dir.mu.Lock()
	defer m.dir.mu.Unlock()
	if _, ok := m.dir.recs[id]; !ok {
		return ErrNotFound
	}
	delete(m.dir.recs, id)
	return nil
}

// ---------------------------------------------------------------- the site reads the directory from the database

// useDirectoryFromDB replaces the file-based students and alumni with the database records when there are any, and keeps
// the admin-only columns beside them. It returns how many records came from the database (0 means the files are still used).
func useDirectoryFromDB(ctx context.Context, store *Store, s DirectoryRecordStore) (int, error) {
	recs, err := s.DirectoryRecords(ctx)
	if err != nil || len(recs) == 0 {
		return 0, err
	}
	applyDirectoryRecords(store, recs)
	recount(store)
	return len(recs), nil
}

// applyDirectoryRecords puts the database records in place of the file lists (counts are derived by the caller).
// Students and alumni are decided separately: a kind comes from the database once it has records there, and stays so
// (an empty list after the last one is deleted) instead of falling back to the files.
func applyDirectoryRecords(store *Store, recs []DirectoryRecord) {
	students, alumni := []Student{}, []Alumnus{}
	private := map[string]map[string]string{}
	for _, r := range recs {
		if len(r.Private) > 0 {
			private[r.ID] = r.Private
		}
		if r.Kind == "alumni" {
			alumni = append(alumni, Alumnus{ID: r.ID, Name: r.Name, Batch: r.Batch, Department: r.Department, Occupation: r.Occupation, Workplace: r.Workplace, Designation: r.Designation, Upazila: r.Upazila})
		} else {
			students = append(students, Student{ID: r.ID, Name: r.Name, Batch: r.Batch, Department: r.Department, Session: r.Session, Upazila: r.Upazila})
		}
	}
	if len(students) > 0 || store.StudentsFromDB {
		store.Students, store.StudentsFromDB, store.Sample = students, true, false
	}
	if len(alumni) > 0 || store.AlumniFromDB {
		store.Alumni, store.AlumniFromDB = alumni, true
	}
	store.Private = private
	store.FromDB = store.StudentsFromDB && store.AlumniFromDB
}

// ---------------------------------------------------------------- import command

type directoryFile struct {
	Students []fileRecord `json:"students"`
	Alumni   []fileRecord `json:"alumni"`
}

type fileRecord struct {
	ID          string            `json:"id"`
	Name        string            `json:"name"`
	Batch       *int              `json:"batch"`
	Department  string            `json:"department"`
	Session     string            `json:"session"`
	Upazila     string            `json:"upazila"`
	Occupation  string            `json:"occupation"`
	Workplace   string            `json:"workplace"`
	Designation string            `json:"designation"`
	Private     map[string]string `json:"private"`
	Sources     []json.RawMessage `json:"sources"`
}

// importDirectory copies backend/data/records_full.json (built by scripts/build_data.py from the files in Data/) into the
// directory_records table. Without --apply it only reports what would happen. Running it again updates the same records.
//
//	go run . import-directory            (preview)
//	go run . import-directory --apply    (writes)
func importDirectory(s AuthStore, args []string) error {
	if s == nil {
		return fmt.Errorf("DATABASE_URL is not set")
	}
	file, apply := "data/records_full.json", false
	for _, a := range args {
		switch {
		case a == "--apply":
			apply = true
		case strings.HasPrefix(a, "--file="):
			file = strings.TrimPrefix(a, "--file=")
		default:
			return fmt.Errorf("unknown flag %q", a)
		}
	}
	raw, err := os.ReadFile(file)
	if err != nil {
		return fmt.Errorf("%w (run python scripts/build_data.py first)", err)
	}
	var in directoryFile
	if err := json.Unmarshal(raw, &in); err != nil {
		return fmt.Errorf("%s: %w", file, err)
	}
	recs := make([]DirectoryRecord, 0, len(in.Students)+len(in.Alumni))
	seen := map[string]bool{}
	add := func(kind string, f fileRecord) error {
		f.ID, f.Name = strings.TrimSpace(f.ID), strings.TrimSpace(f.Name)
		if f.ID == "" || f.Name == "" {
			return fmt.Errorf("a %s record has no id or name", kind)
		}
		if seen[f.ID] {
			return fmt.Errorf("id %s appears twice", f.ID)
		}
		seen[f.ID] = true
		recs = append(recs, DirectoryRecord{ID: f.ID, Kind: kind, Name: f.Name, Batch: f.Batch, Department: f.Department, Session: f.Session, Upazila: f.Upazila,
			Occupation: f.Occupation, Workplace: f.Workplace, Designation: f.Designation, Private: f.Private, Sources: f.Sources})
		return nil
	}
	for _, f := range in.Students {
		if err := add("student", f); err != nil {
			return err
		}
	}
	for _, f := range in.Alumni {
		if err := add("alumni", f); err != nil {
			return err
		}
	}
	ctx := context.Background()
	existing, err := s.DirectoryRecords(ctx)
	if err != nil {
		return err
	}
	have := map[string]bool{}
	for _, r := range existing {
		have[r.ID] = true
	}
	news, filled := 0, map[string]int{}
	for _, r := range recs {
		if !have[r.ID] {
			news++
		}
		for k, v := range r.Private {
			if v != "" {
				filled[k]++
			}
		}
	}
	keys := make([]string, 0, len(filled))
	for k := range filled {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	parts := []string{}
	for _, k := range keys {
		parts = append(parts, fmt.Sprintf("%s %d", k, filled[k]))
	}
	log.Printf("import-directory: %d students and %d alumni in %s; %d new, %d already in the database", len(in.Students), len(in.Alumni), file, news, len(recs)-news)
	log.Printf("import-directory: private columns with a value: %s", strings.Join(parts, ", "))
	if !apply {
		log.Printf("import-directory: preview only, nothing written (add --apply)")
		return nil
	}
	added, updated, err := s.UpsertDirectoryRecords(ctx, recs)
	if err != nil {
		return err
	}
	log.Printf("import-directory: wrote %d new and updated %d records", added, updated)
	return nil
}
