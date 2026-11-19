package main

import (
	"fmt"
	"strings"
	"testing"
)

type siteImgOut struct {
	Hero []struct {
		ID, Image, ImageURL, CaptionEn string
		Published                      bool
	}
	Pages           map[string]any
	GalleryFeatured any
	Explore         any
}

// A picture chosen for one place on the site is saved for that place only, and for nothing else.
func TestSitePicturesAreSavedForTheSectionTheyWereChosenFor(t *testing.T) {
	e := cmsApp(t)
	upload := func(w int) string {
		t.Helper()
		rec := uploadReqTo(e, "/api/v1/admin/media", "admin-token", nil, solidPNG(w, 120, 255))
		var up struct{ Path string }
		decodeBody(t, rec, &up)
		if rec.Code != 201 {
			t.Fatalf("upload: %d", rec.Code)
		}
		return up.Path
	}
	slide1, slide2, students, featured, explore := upload(200), upload(210), upload(220), upload(230), upload(240)
	url := func(p string) string { return "https://files.example/media/" + p }
	get := func(path string) siteImgOut {
		t.Helper()
		var out siteImgOut
		decodeBody(t, jreq(e, "GET", path, "", nil), &out)
		return out
	}

	body := map[string]any{
		"hero":            []map[string]any{{"image": slide1, "captionEn": "First", "published": true}, {"image": slide2, "captionEn": "Hidden", "published": false}},
		"pages":           map[string]string{"students": students},
		"galleryFeatured": featured, "explore": explore,
	}
	if rec := adminJSON(e, "PUT", "/api/v1/admin/settings/site-images", body); rec.Code != 200 {
		t.Fatalf("save: %d %s", rec.Code, rec.Body)
	}

	pub := get("/api/v1/site-images")
	if len(pub.Hero) != 1 || pub.Hero[0].ImageURL != url(slide1) || pub.Hero[0].CaptionEn != "First" {
		t.Fatalf("only the published slide is public, with its own picture: %+v", pub.Hero)
	}
	if len(pub.Pages) != 1 || pub.Pages["students"] != url(students) {
		t.Fatalf("the Students page picture must be on the Students page and on no other: %v", pub.Pages)
	}
	if pub.GalleryFeatured != url(featured) || pub.Explore != url(explore) {
		t.Fatalf("featured and explore must keep their own pictures: %v %v", pub.GalleryFeatured, pub.Explore)
	}
	// every slot holds a different picture; none leaked into another
	seen := map[string]string{}
	for slot, u := range map[string]string{"hero": pub.Hero[0].ImageURL, "students": fmt.Sprint(pub.Pages["students"]), "featured": fmt.Sprint(pub.GalleryFeatured), "explore": fmt.Sprint(pub.Explore)} {
		if other, dup := seen[u]; dup {
			t.Fatalf("%s and %s show the same picture", slot, other)
		}
		seen[u] = slot
	}

	// the admin sees the unpublished slide too, in the saved order, with stable ids
	adm := get("/api/v1/admin/settings/site-images")
	rec := jreq(e, "GET", "/api/v1/admin/settings/site-images", "admin-token", nil)
	decodeBody(t, rec, &adm)
	if len(adm.Hero) != 2 || adm.Hero[1].Published || adm.Hero[0].ID == "" || adm.Hero[0].ID == adm.Hero[1].ID {
		t.Fatalf("admin view: %+v", adm.Hero)
	}

	// changing the order and the number a slide shows at
	body["hero"] = []map[string]any{{"id": adm.Hero[1].ID, "image": slide2, "published": true}, {"id": adm.Hero[0].ID, "image": slide1, "published": true}}
	if rec := adminJSON(e, "PUT", "/api/v1/admin/settings/site-images", body); rec.Code != 200 {
		t.Fatalf("reorder: %d %s", rec.Code, rec.Body)
	}
	pub = get("/api/v1/site-images")
	if len(pub.Hero) != 2 || pub.Hero[0].ImageURL != url(slide2) || pub.Hero[1].ImageURL != url(slide1) || pub.Hero[0].ID != adm.Hero[1].ID {
		t.Fatalf("the saved order is the shown order: %+v", pub.Hero)
	}

	// pictures the site does not know, odd page names and paths are refused, and nothing is saved
	for name, bad := range map[string]map[string]any{
		"unknown page":     {"hero": []any{}, "pages": map[string]string{"nope": students}},
		"path in a slot":   {"hero": []any{}, "pages": map[string]string{"students": "../../etc/passwd"}},
		"foreign url":      {"hero": []any{}, "pages": map[string]string{}, "explore": "https://evil.example/x.jpg"},
		"slide no picture": {"hero": []map[string]any{{"image": "", "published": true}}},
		"too many slides":  {"hero": manySlides(slide1, 13)},
	} {
		if rec := adminJSON(e, "PUT", "/api/v1/admin/settings/site-images", bad); rec.Code != 422 {
			t.Errorf("%s: want 422, got %d %s", name, rec.Code, rec.Body)
		}
	}
	if pub = get("/api/v1/site-images"); len(pub.Hero) != 2 || pub.Pages["students"] != url(students) {
		t.Fatalf("a refused save must change nothing: %+v %v", pub.Hero, pub.Pages)
	}

	// only an admin may change them
	if rec := jreq(e, "PUT", "/api/v1/admin/settings/site-images", "", body); rec.Code != 401 && rec.Code != 403 {
		t.Fatalf("a visitor must not save: %d", rec.Code)
	}

	// clearing a slot removes only that slot
	body["pages"], body["explore"] = map[string]string{}, ""
	if rec := adminJSON(e, "PUT", "/api/v1/admin/settings/site-images", body); rec.Code != 200 {
		t.Fatalf("clear: %d", rec.Code)
	}
	pub = get("/api/v1/site-images")
	if len(pub.Pages) != 0 || pub.Explore != "" || pub.GalleryFeatured != url(featured) || len(pub.Hero) != 2 {
		t.Fatalf("clearing students and explore must keep the rest: %+v", pub)
	}

	// pictures bundled with the site (older gallery entries) can be chosen as well
	body["explore"] = "titas-boat"
	if rec := adminJSON(e, "PUT", "/api/v1/admin/settings/site-images", body); rec.Code != 200 {
		t.Fatalf("bundled: %d %s", rec.Code, rec.Body)
	}
	if pub = get("/api/v1/site-images"); !strings.HasSuffix(fmt.Sprint(pub.Explore), "/images/titas-boat-1280.webp") {
		t.Fatalf("a bundled picture is served from the site: %v", pub.Explore)
	}
}

func manySlides(img string, n int) []map[string]any {
	out := []map[string]any{}
	for i := 0; i < n; i++ {
		out = append(out, map[string]any{"image": img, "published": true})
	}
	return out
}

// The logo, the sketches and the student profile cover are places an admin may give a picture of their own.
func TestLogoSketchesAndProfileCoverAcceptAPicture(t *testing.T) {
	e := cmsApp(t)
	rec := uploadReqTo(e, "/api/v1/admin/media", "admin-token", nil, solidPNG(300, 300, 120))
	var up struct{ Path string }
	decodeBody(t, rec, &up)
	pages := map[string]string{}
	for _, k := range []string{"logo", "profile-cover", "sketch-river", "sketch-heritage", "sketch-students", "sketch-vine-tl"} {
		pages[k] = up.Path
	}
	if rec := adminJSON(e, "PUT", "/api/v1/admin/settings/site-images", map[string]any{"pages": pages}); rec.Code != 200 {
		t.Fatalf("save: %d %s", rec.Code, rec.Body)
	}
	var pub struct{ Pages map[string]string }
	decodeBody(t, jreq(e, "GET", "/api/v1/site-images", "", nil), &pub)
	for k := range pages {
		if !strings.HasSuffix(pub.Pages[k], up.Path) {
			t.Errorf("%s not shown: %v", k, pub.Pages)
		}
	}
}
