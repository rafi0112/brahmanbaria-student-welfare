package main

import (
	"context"
	"strings"
	"testing"
)

func settingsSuite(t *testing.T, s AuthStore) {
	ctx := context.Background()
	if _, ok, err := alumniUpTo(ctx, s); err != nil || ok {
		t.Fatalf("unset setting: %v %v", ok, err)
	}
	if err := s.SetSetting(ctx, "", settingAlumniUpTo, 12); err != nil {
		t.Fatal(err)
	}
	if err := s.SetSetting(ctx, "", settingAlumniUpTo, 13); err != nil {
		t.Fatal(err)
	}
	if n, ok, err := alumniUpTo(ctx, s); err != nil || !ok || n != 13 {
		t.Fatalf("setting: %d %v %v", n, ok, err)
	}
}

func TestMemSettingsSuite(t *testing.T) { settingsSuite(t, newMemStore()) }

// Raising the setting by one moves a whole batch from Students to Alumni, at once and without a restart.
func TestAlumniCutoffMovesGraduatedBatches(t *testing.T) {
	e := cmsApp(t)
	ctx := context.Background()
	b := func(n int) *int { return &n }
	_, _, _ = e.mem.UpsertDirectoryRecords(ctx, []DirectoryRecord{
		{ID: "s-b12", Kind: "student", Name: "Twelve Student", Batch: b(12), Department: "Finance"},
		{ID: "s-b13", Kind: "student", Name: "Thirteen Student", Batch: b(13), Department: "Finance"},
		{ID: "a-b10", Kind: "alumni", Name: "Ten Alumnus", Batch: b(11), Occupation: "Banker"},
		{ID: "a-dup", Kind: "alumni", Name: "Twelve  student", Batch: b(12)},  // the same person as s-b12, already an alumnus
		{ID: "a-b14", Kind: "alumni", Name: "Fourteen Alumnus", Batch: b(14)}, // an alumni record of a batch not yet reached
	})
	_ = e.app.reloadLive(ctx)
	if err := e.app.ensureAlumniSetting(ctx); err != nil {
		t.Fatal(err)
	}
	_ = e.app.reloadLive(ctx)
	_ = e.mem.SetSetting(ctx, "", settingAlumniUpTo, 12) // the default would be 14 (the latest alumni batch); start the year at 12
	_ = e.app.reloadLive(ctx)
	if e.app.data().AlumniUpTo != 12 {
		t.Fatalf("saved setting: %d", e.app.data().AlumniUpTo)
	}
	names := func(path string) string { return e.do("GET", path, nil, nil).Body.String() }
	if st := names("/api/v1/students"); strings.Contains(st, "Twelve Student") || !strings.Contains(st, "Thirteen Student") {
		t.Fatalf("students up to batch 12 have graduated: %s", st)
	}
	al := names("/api/v1/alumni")
	if !strings.Contains(al, "Ten Alumnus") || strings.Count(strings.ToLower(al), "twelve") != 1 || strings.Contains(al, "Thirteen") {
		t.Fatalf("alumni list: records plus graduated batches, no repeats: %s", al)
	}
	// the batch filters offer only the batches of each page
	var facet struct {
		Facets struct {
			Batches map[string]int `json:"batches"`
		} `json:"facets"`
		AlumniUpToBatch int `json:"alumniUpToBatch"`
	}
	decodeBody(t, e.do("GET", "/api/v1/alumni", nil, nil), &facet)
	if _, later := facet.Facets.Batches["14"]; later || facet.Facets.Batches["12"] == 0 || facet.AlumniUpToBatch != 12 {
		t.Fatalf("alumni batches stop at the saved batch: %+v", facet)
	}
	if strings.Contains(al, "Fourteen Alumnus") {
		t.Fatal("an alumni record of a later batch waits until that batch is reached")
	}
	var sfacet struct {
		Facets struct {
			Batches map[string]int `json:"batches"`
		} `json:"facets"`
	}
	decodeBody(t, e.do("GET", "/api/v1/students", nil, nil), &sfacet) // a fresh value: decoding into a used map keeps old keys
	for k := range sfacet.Facets.Batches {
		if k == "12" || k == "11" {
			t.Fatalf("students batches start after the saved batch: %+v", sfacet.Facets.Batches)
		}
	}
	if rec := e.do("GET", "/api/v1/students?batch=12", nil, nil); strings.Contains(rec.Body.String(), "Twelve Student") {
		t.Fatal("a graduated batch cannot be listed on the students page by its filter either")
	}
	// a year later the admin raises it to 13
	if rec := adminJSON(e, "PUT", "/api/v1/admin/settings/alumni", map[string]int{"upToBatch": 13}); rec.Code != 200 {
		t.Fatalf("set: %d %s", rec.Code, rec.Body)
	}
	if st := names("/api/v1/students"); strings.Contains(st, "Thirteen Student") {
		t.Fatalf("batch 13 moved to alumni at once: %s", st)
	}
	if !strings.Contains(names("/api/v1/alumni"), "Thirteen Student") {
		t.Fatal("batch 13 shows as alumni")
	}
	if rec := adminJSON(e, "PUT", "/api/v1/admin/settings/alumni", map[string]int{"upToBatch": 14}); rec.Code != 200 {
		t.Fatalf("set 14: %d", rec.Code)
	}
	if !strings.Contains(names("/api/v1/alumni"), "Fourteen Alumnus") {
		t.Fatal("the batch-14 alumni record appears once batch 14 is reached")
	}
	if got, ok, _ := alumniUpTo(ctx, e.mem); !ok || got != 14 {
		t.Fatalf("the setting is stored: %d %v", got, ok)
	}
	if rec := adminJSON(e, "PUT", "/api/v1/admin/settings/alumni", map[string]int{"upToBatch": 99}); rec.Code != 422 {
		t.Fatalf("out of range: %d", rec.Code)
	}
	if rec := jreq(e, "PUT", "/api/v1/admin/settings/alumni", "member-token", map[string]int{"upToBatch": 1}); rec.Code != 403 {
		t.Fatalf("members cannot change it: %d", rec.Code)
	}
	var st struct {
		Students, Alumni, AlumniUpToBatch int
	}
	decodeBody(t, e.do("GET", "/api/v1/stats", nil, nil), &st)
	if st.AlumniUpToBatch != 14 {
		t.Fatalf("stats: %+v", st)
	}
}
