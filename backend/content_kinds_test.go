package main

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
)

// The bundled FAQ, departments and upazilas are copied into the database once; later edits are never overwritten.
func TestReferenceDataSeedsOnceAndIsReadFromTheDatabase(t *testing.T) {
	e := cmsApp(t)
	ctx := context.Background()
	local := e.app.data()
	if err := seedReference(ctx, e.mem, local); err != nil {
		t.Fatal(err)
	}
	if err := seedReference(ctx, e.mem, local); err != nil {
		t.Fatal(err)
	}
	faqs, _, _ := e.mem.ListEntries(ctx, EntryQuery{Kind: KindFAQ, Status: "all", Limit: 100})
	if len(faqs) != len(local.FAQs) || len(faqs) == 0 {
		t.Fatalf("FAQ seeded once: %d of %d", len(faqs), len(local.FAQs))
	}
	if err := e.app.reloadLive(ctx); err != nil {
		t.Fatal(err)
	}
	if len(e.app.data().Upazilas) != len(local.Upazilas) || len(e.app.data().Depts) != len(local.Depts) {
		t.Fatalf("reference from the database: %d upazilas, %d departments", len(e.app.data().Upazilas), len(e.app.data().Depts))
	}
	var pub struct{ Items []FAQData }
	decodeBody(t, e.do("GET", "/api/v1/faq", nil, nil), &pub)
	if len(pub.Items) != len(local.FAQs) {
		t.Fatalf("public FAQ from the database: %d", len(pub.Items))
	}
}

func TestEventsAndFAQAreEditedByAdmins(t *testing.T) {
	e := cmsApp(t)
	// validation
	if rec := adminJSON(e, "POST", "/api/v1/admin/content/event", map[string]any{"data": map[string]any{"titleEn": "Iftar", "date": "nope"}}); rec.Code != 422 {
		t.Fatalf("bad event date: %d %s", rec.Code, rec.Body)
	}
	rec := adminJSON(e, "POST", "/api/v1/admin/content/event", map[string]any{"data": map[string]any{"titleEn": "Freshers reception", "titleBn": "নবীনবরণ", "date": "2026-11-20", "time": "15:30", "venue": "TSC", "summaryEn": "Welcome for the new batch."}})
	var ev Entry
	decodeBody(t, rec, &ev)
	if rec.Code != 201 || ev.Slug != "freshers-reception" {
		t.Fatalf("create event: %d %s", rec.Code, rec.Body)
	}
	var pub struct{ Items []eventOut }
	decodeBody(t, e.do("GET", "/api/v1/events", nil, nil), &pub)
	if len(pub.Items) != 0 {
		t.Fatalf("a draft event is not public: %+v", pub.Items)
	}
	if rec := adminJSON(e, "POST", "/api/v1/admin/content/event/"+ev.ID+"/publish", nil); rec.Code != 200 {
		t.Fatalf("publish: %d %s", rec.Code, rec.Body)
	}
	decodeBody(t, e.do("GET", "/api/v1/events", nil, nil), &pub)
	if len(pub.Items) != 1 || pub.Items[0].TitleBn != "নবীনবরণ" || pub.Items[0].Venue != "TSC" || pub.Items[0].Summary != "Welcome for the new batch." {
		t.Fatalf("published event: %+v", pub.Items)
	}
	if rec := adminJSON(e, "POST", "/api/v1/admin/content/event/"+ev.ID+"/archive", nil); rec.Code != 200 {
		t.Fatalf("archive: %d", rec.Code)
	}
	decodeBody(t, e.do("GET", "/api/v1/events", nil, nil), &pub)
	if len(pub.Items) != 0 {
		t.Fatalf("an archived event leaves the site: %+v", pub.Items)
	}
	// FAQ
	if rec := adminJSON(e, "POST", "/api/v1/admin/content/faq", map[string]any{"data": map[string]any{"qEn": "Only a question"}}); rec.Code != 422 {
		t.Fatalf("FAQ without an answer: %d", rec.Code)
	}
	// a member cannot edit content
	if rec := jreq(e, "POST", "/api/v1/admin/content/faq", "member-token", map[string]any{"data": map[string]any{"qEn": "Q", "aEn": "A"}}); rec.Code != 403 {
		t.Fatalf("member creating FAQ: %d", rec.Code)
	}
}

func TestDepartmentAndUpazilaChangesShowWithoutARestart(t *testing.T) {
	e := cmsApp(t)
	ctx := context.Background()
	if err := seedReference(ctx, e.mem, e.app.data()); err != nil {
		t.Fatal(err)
	}
	_ = e.app.reloadLive(ctx)
	rec := adminJSON(e, "POST", "/api/v1/admin/content/department", map[string]any{"data": map[string]any{"name": "  Disaster   Management "}})
	var d Entry
	decodeBody(t, rec, &d)
	if rec.Code != 201 {
		t.Fatalf("create department: %d %s", rec.Code, rec.Body)
	}
	adminJSON(e, "POST", "/api/v1/admin/content/department/"+d.ID+"/publish", nil)
	var deps struct{ Items []string }
	decodeBody(t, e.do("GET", "/api/v1/departments", nil, nil), &deps)
	if !strings.Contains(strings.Join(deps.Items, "|"), "Disaster Management") {
		t.Fatalf("the new department is listed at once: %v", deps.Items)
	}
	// rename an upazila's English name
	ups, _, _ := e.mem.ListEntries(ctx, EntryQuery{Kind: KindUpazila, Status: "all", Limit: 50})
	var u Upazila
	_ = json.Unmarshal(ups[0].Data, &u)
	u.NameEn = "Renamed Upazila"
	if rec := adminJSON(e, "PATCH", "/api/v1/admin/content/upazila/"+ups[0].ID, map[string]any{"slug": u.Slug, "data": u}); rec.Code != 200 {
		t.Fatalf("edit upazila: %d %s", rec.Code, rec.Body)
	}
	found := false
	for _, x := range e.app.data().Upazilas {
		found = found || x.NameEn == "Renamed Upazila"
	}
	if !found {
		t.Fatal("the edited upazila is used at once")
	}
}

func TestAlumniAddEditDeleteFromThePanel(t *testing.T) {
	e := cmsApp(t)
	ctx := context.Background()
	_, _, _ = e.mem.UpsertDirectoryRecords(ctx, []DirectoryRecord{{ID: "s-x", Kind: "student", Name: "Some Student"}})
	_ = e.app.reloadLive(ctx)
	if rec := adminJSON(e, "POST", "/api/v1/admin/alumni", map[string]any{"name": "A", "private": map[string]string{"email": "bad"}}); rec.Code != 422 {
		t.Fatalf("validation: %d", rec.Code)
	}
	rec := adminJSON(e, "POST", "/api/v1/admin/alumni", map[string]any{"name": "New Alumnus", "batch": 9, "department": "Finance", "occupation": "Banker", "workplace": "Some Bank", "upazila": e.app.data().Upazilas[0].Slug,
		"private": map[string]string{"phone": "01712345678", "email": "alum@example.org"}})
	var row alumniAdminRow
	decodeBody(t, rec, &row)
	if rec.Code != 201 || !strings.HasPrefix(row.ID, "a-") {
		t.Fatalf("create alumnus: %d %s", rec.Code, rec.Body)
	}
	var pub struct{ Items []Alumnus }
	decodeBody(t, e.do("GET", "/api/v1/alumni?q=New+Alumnus", nil, nil), &pub)
	if len(pub.Items) != 1 || pub.Items[0].Workplace != "Some Bank" {
		t.Fatalf("public alumni list shows the new person at once: %+v", pub.Items)
	}
	if strings.Contains(e.do("GET", "/api/v1/alumni?q=New+Alumnus", nil, nil).Body.String(), "alum@example.org") {
		t.Fatal("private columns must not be public")
	}
	if rec := adminJSON(e, "PATCH", "/api/v1/admin/alumni/"+row.ID, map[string]any{"name": "New Alumnus", "batch": 9, "occupation": "Manager", "private": map[string]string{"phone": "01712345678"}}); rec.Code != 200 {
		t.Fatalf("edit: %d %s", rec.Code, rec.Body)
	}
	decodeBody(t, e.do("GET", "/api/v1/alumni?q=New+Alumnus", nil, nil), &pub)
	if pub.Items[0].Occupation != "Manager" {
		t.Fatalf("edited: %+v", pub.Items)
	}
	// a student record is not an alumnus
	if rec := adminJSON(e, "POST", "/api/v1/admin/alumni/s-x/delete", nil); rec.Code != 404 {
		t.Fatalf("deleting a student through alumni: %d", rec.Code)
	}
	if rec := adminJSON(e, "POST", "/api/v1/admin/alumni/"+row.ID+"/delete", nil); rec.Code != 200 {
		t.Fatalf("delete: %d", rec.Code)
	}
	decodeBody(t, e.do("GET", "/api/v1/alumni?q=New+Alumnus", nil, nil), &pub)
	if len(pub.Items) != 0 {
		t.Fatalf("deleted alumnus still listed: %+v", pub.Items)
	}
	if rec := jreq(e, "GET", "/api/v1/admin/alumni", "member-token", nil); rec.Code != 403 {
		t.Fatalf("member listing admin alumni: %d", rec.Code)
	}
}

func TestOriginalDirectoryRecordsCanBeDeletedOnceInTheDatabase(t *testing.T) {
	e := cmsApp(t)
	ctx := context.Background()
	_, _, _ = e.mem.UpsertDirectoryRecords(ctx, []DirectoryRecord{{ID: "s-del-1", Kind: "student", Name: "Delete Me"}, {ID: "s-keep-1", Kind: "student", Name: "Keep Me"}})
	_ = e.app.reloadLive(ctx)
	if rec := adminJSON(e, "POST", "/api/v1/admin/imported-students/s-del-1/delete", nil); rec.Code != 200 {
		t.Fatalf("delete an original record: %d %s", rec.Code, rec.Body)
	}
	for _, s := range e.app.data().Students {
		if s.ID == "s-del-1" {
			t.Fatal("the deleted record is still served")
		}
	}
	if rec := e.do("GET", "/api/v1/students/s-del-1", nil, nil); rec.Code != 404 {
		t.Fatalf("deleted record page: %d", rec.Code)
	}
}
