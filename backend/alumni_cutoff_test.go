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
		{ID: "a-dup", Kind: "alumni", Name: "Twelve  student", Batch: b(12)}, // the same person as s-b12, already an alumnus
	})
	_ = e.app.reloadLive(ctx)
	if err := e.app.ensureAlumniSetting(ctx); err != nil {
		t.Fatal(err)
	}
	_ = e.app.reloadLive(ctx)
	if e.app.data().AlumniUpTo != 12 {
		t.Fatalf("default is the highest batch among the alumni on record: %d", e.app.data().AlumniUpTo)
	}
	names := func(path string) string { return e.do("GET", path, nil, nil).Body.String() }
	if st := names("/api/v1/students"); strings.Contains(st, "Twelve Student") || !strings.Contains(st, "Thirteen Student") {
		t.Fatalf("students up to batch 12 have graduated: %s", st)
	}
	al := names("/api/v1/alumni")
	if !strings.Contains(al, "Ten Alumnus") || strings.Count(strings.ToLower(al), "twelve") != 1 || strings.Contains(al, "Thirteen") {
		t.Fatalf("alumni list: records plus graduated batches, no repeats: %s", al)
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
	if st.AlumniUpToBatch != 13 {
		t.Fatalf("stats: %+v", st)
	}
}
