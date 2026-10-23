package main

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func directoryRecordSuite(t *testing.T, s AuthStore) {
	ctx := context.Background()
	b := 17
	recs := []DirectoryRecord{
		{ID: "s-suite-1", Kind: "student", Name: "Suite Student", Batch: &b, Department: "Finance", Session: "2021-22", Upazila: "kasba",
			Private: map[string]string{"phone": "01712345678", "email": "suite@example.org"}, Sources: []json.RawMessage{json.RawMessage(`{"file":"form.xlsx","row":{"Name":"Suite Student"}}`)}},
		{ID: "a-suite-1", Kind: "alumni", Name: "Suite Alumnus", Occupation: "Banker", Workplace: "Sample Bank", Designation: "Officer"},
	}
	added, updated, err := s.UpsertDirectoryRecords(ctx, recs)
	if err != nil || added != 2 || updated != 0 {
		t.Fatalf("first import: %d %d %v", added, updated, err)
	}
	recs[0].Name = "Suite Student Renamed"
	if added, updated, err = s.UpsertDirectoryRecords(ctx, recs); err != nil || added != 0 || updated != 2 {
		t.Fatalf("importing again updates the same records: %d %d %v", added, updated, err)
	}
	got, err := s.DirectoryRecords(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var st *DirectoryRecord
	for i := range got {
		if got[i].ID == "s-suite-1" {
			st = &got[i]
		}
	}
	if st == nil || st.Name != "Suite Student Renamed" || st.Batch == nil || *st.Batch != 17 || st.Private["phone"] != "01712345678" || len(st.Sources) != 1 {
		t.Fatalf("stored record: %+v", st)
	}
}

func TestMemDirectoryRecordSuite(t *testing.T) { directoryRecordSuite(t, newMemStore()) }

// Once imported, the site reads the directory from the database; the private columns reach admins and nobody else.
func TestDirectoryFromDatabaseKeepsPrivateColumnsForAdmins(t *testing.T) {
	e := cmsApp(t)
	ctx := context.Background()
	b := 20
	_, _, err := e.mem.UpsertDirectoryRecords(ctx, []DirectoryRecord{{ID: "s-db-1", Kind: "student", Name: "Database Person", Batch: &b, Department: "Botany", Session: "2020-21", Upazila: "sarail",
		Private: map[string]string{"phone": "01811112222", "email": "dbperson@example.org", "bloodGroup": "B+", "presentAddress": "Mess 4, Old Dhaka", "facebook": "https://facebook.com/dbperson"}}})
	if err != nil {
		t.Fatal(err)
	}
	n, err := useDirectoryFromDB(ctx, e.app.Store, e.mem)
	if err != nil || n != 1 || !e.app.Store.FromDB || len(e.app.Store.Students) != 1 || e.app.Store.Students[0].Name != "Database Person" {
		t.Fatalf("directory from the database: %d %v %+v", n, err, e.app.Store.Students)
	}
	// public and signed-out: four fields, no private column anywhere
	pub := e.do("GET", "/api/v1/students/s-db-1", nil, nil)
	if pub.Code != 200 {
		t.Fatalf("public record: %d %s", pub.Code, pub.Body)
	}
	for _, secret := range []string{"01811112222", "dbperson@example.org", "Mess 4", "facebook.com"} {
		if strings.Contains(pub.Body.String(), secret) {
			t.Fatalf("public response leaks %q: %s", secret, pub.Body)
		}
	}
	// admin: contact details and the rest of the form
	adm := adminJSON(e, "GET", "/api/v1/students/s-db-1", nil)
	body := adm.Body.String()
	for _, want := range []string{"01811112222", "dbperson@example.org", "B+", "Mess 4, Old Dhaka", "facebook.com/dbperson"} {
		if !strings.Contains(body, want) {
			t.Fatalf("admin view misses %q: %s", want, body)
		}
	}
	list := adminJSON(e, "GET", "/api/v1/admin/imported-students?q=Database", nil)
	if !strings.Contains(list.Body.String(), "dbperson@example.org") {
		t.Fatalf("admin directory list misses the private columns: %s", list.Body)
	}
	// a member (not admin) gets no private columns either
	if rec := jreq(e, "GET", "/api/v1/students/s-db-1", "member-token", nil); strings.Contains(rec.Body.String(), "01811112222") {
		t.Fatalf("member sees a directory record's phone: %s", rec.Body)
	}
}

func TestImportDirectoryPreviewWritesNothing(t *testing.T) {
	s := newMemStore()
	dir := t.TempDir()
	f := filepath.Join(dir, "records_full.json")
	if err := os.WriteFile(f, []byte(`{"students":[{"id":"s1","name":"One","private":{"phone":"01700000000"}}],"alumni":[{"id":"a1","name":"Two"}]}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := importDirectory(s, []string{"--file=" + f}); err != nil {
		t.Fatal(err)
	}
	if got, _ := s.DirectoryRecords(context.Background()); len(got) != 0 {
		t.Fatalf("preview wrote %d records", len(got))
	}
	if err := importDirectory(s, []string{"--file=" + f, "--apply"}); err != nil {
		t.Fatal(err)
	}
	if got, _ := s.DirectoryRecords(context.Background()); len(got) != 2 {
		t.Fatalf("apply wrote %d records", len(got))
	}
	if err := os.WriteFile(f, []byte(`{"students":[{"id":"s1","name":"One"},{"id":"s1","name":"Again"}]}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := importDirectory(s, []string{"--file=" + f, "--apply"}); err == nil {
		t.Fatal("duplicate ids must be refused")
	}
}
