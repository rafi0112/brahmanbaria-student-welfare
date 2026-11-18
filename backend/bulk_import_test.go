package main

import (
	"encoding/json"
	"strings"
	"testing"
)

// A spreadsheet of people: the preview saves nothing; the import saves the good rows, skips people already in the
// directory (also twice in the same file) and explains every row it refused. Visitors and members can not import.
func TestBulkImportAddsGoodRowsAndExplainsTheRest(t *testing.T) {
	e := authApp(t)
	if len(e.app.Store.Depts) == 0 || len(e.app.Store.Upazilas) == 0 {
		t.Skip("needs the reference data")
	}
	admin := e.admin(t)
	dept, up := e.app.Store.Depts[0], e.app.Store.Upazilas[0]
	rows := []map[string]string{
		{"name": "Bulk Person One", "batch": "১৫", "department": strings.ToUpper(dept), "upazila": up.NameEn, "phone": "+880 1712-000111", "bloodGroup": "b+", "gender": "Male"},
		{"name": "Bulk Person Two", "batch": "16", "department": dept, "phone": "01712000222"},
		{"name": "Bulk Person Again", "batch": "17", "department": dept, "phone": "01712000222"}, // same phone as the row above
		{"name": "X", "batch": "abc", "department": "No such department"},
	}
	type res struct {
		Counts map[string]int
		Rows   []importResult
	}
	run := func(dry bool) res {
		t.Helper()
		rec := e.do("POST", "/api/v1/admin/imported-students/import", map[string]any{"rows": rows, "dryRun": dry}, admin)
		if rec.Code != 200 {
			t.Fatalf("import: %d %s", rec.Code, rec.Body)
		}
		var out res
		decodeBody(t, rec, &out)
		return out
	}
	before := importedList(t, e, admin, "?scope=all&limit=100")["total"]
	preview := run(true)
	if preview.Counts["ready"] != 2 || preview.Counts["duplicate"] != 1 || preview.Counts["invalid"] != 1 {
		t.Fatalf("preview counts: %+v", preview.Counts)
	}
	if bad := preview.Rows[3].Errors; bad["batch"] == "" || bad["department"] == "" || bad["name"] == "" {
		t.Fatalf("the refused row must say why: %+v", bad)
	}
	if importedList(t, e, admin, "?scope=all&limit=100")["total"] != before {
		t.Fatal("a preview must not save anything")
	}
	done := run(false)
	if done.Counts["added"] != 2 {
		t.Fatalf("import counts: %+v", done.Counts)
	}
	list := importedList(t, e, admin, "?scope=all&limit=100&q=Bulk+Person+One")
	raw, _ := json.Marshal(list)
	body := string(raw)
	if !strings.Contains(body, "01712000111") || !strings.Contains(body, `"bloodGroup":"B+"`) || !strings.Contains(body, `"batch":15`) || !strings.Contains(body, up.Slug) {
		t.Fatalf("the saved record should be cleaned up: %s", body)
	}
	if again := run(false); again.Counts["added"] != 0 || again.Counts["duplicate"] != 3 {
		t.Fatalf("importing the same file twice must add nobody: %+v", again.Counts)
	}
	member := e.member(t, "bulk.member@example.com")
	if rec := e.do("POST", "/api/v1/admin/imported-students/import", map[string]any{"rows": rows}, member); rec.Code != 403 {
		t.Fatalf("a member must not import: %d", rec.Code)
	}
}
