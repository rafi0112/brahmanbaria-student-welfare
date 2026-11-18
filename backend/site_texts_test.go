package main

import (
	"strings"
	"testing"
)

// An admin's wording replaces the built-in text for everyone; an emptied text goes back to the built-in one; only an
// admin can change it, and bad input is refused without changing what was saved.
func TestSiteTextsAreChangedByAdminsOnly(t *testing.T) {
	e := cmsApp(t)
	type out struct{ Texts map[string]SiteText }
	get := func() out {
		t.Helper()
		var o out
		rec := jreq(e, "GET", "/api/v1/site-texts", "", nil)
		if rec.Code != 200 {
			t.Fatalf("public get: %d", rec.Code)
		}
		decodeBody(t, rec, &o)
		return o
	}
	if len(get().Texts) != 0 {
		t.Fatal("nothing should be changed at first")
	}
	body := map[string]any{"texts": map[string]any{"about.title": map[string]string{"bn": " আমাদের কথা ", "en": "Who we are"}, "hero.tagline": map[string]string{"bn": "", "en": ""}}}
	if rec := jreq(e, "PUT", "/api/v1/admin/settings/site-texts", "", body); rec.Code != 401 {
		t.Fatalf("a visitor must not change texts: %d", rec.Code)
	}
	if rec := adminJSON(e, "PUT", "/api/v1/admin/settings/site-texts", body); rec.Code != 200 {
		t.Fatalf("save: %d %s", rec.Code, rec.Body)
	}
	got := get().Texts
	if got["about.title"].Bn != "আমাদের কথা" || got["about.title"].En != "Who we are" {
		t.Fatalf("saved wording: %+v", got)
	}
	if _, ok := got["hero.tagline"]; ok {
		t.Fatal("an empty text must not be stored")
	}
	for _, bad := range []map[string]any{
		{"texts": map[string]any{"bad key!": map[string]string{"en": "x"}}},
		{"texts": map[string]any{"about.title": map[string]string{"en": strings.Repeat("a", maxSiteTextLen+1)}}},
	} {
		if rec := adminJSON(e, "PUT", "/api/v1/admin/settings/site-texts", bad); rec.Code != 422 {
			t.Fatalf("bad input accepted: %d", rec.Code)
		}
	}
	if get().Texts["about.title"].En != "Who we are" {
		t.Fatal("a refused save must not change what was saved")
	}
}
