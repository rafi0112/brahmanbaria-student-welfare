package main

import (
	"bytes"
	"strings"
	"testing"
)

func TestYouTubeIDFromTheLinksPeoplePaste(t *testing.T) {
	ok := map[string]string{
		"https://www.youtube.com/watch?v=dQw4w9WgXcQ":              "dQw4w9WgXcQ",
		"https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s&list=PL1":   "dQw4w9WgXcQ",
		"https://youtu.be/dQw4w9WgXcQ?si=abc":                      "dQw4w9WgXcQ",
		"youtu.be/dQw4w9WgXcQ":                                     "dQw4w9WgXcQ",
		"https://m.youtube.com/watch?v=dQw4w9WgXcQ":                "dQw4w9WgXcQ",
		"https://www.youtube.com/shorts/dQw4w9WgXcQ":               "dQw4w9WgXcQ",
		"https://www.youtube.com/embed/dQw4w9WgXcQ":                "dQw4w9WgXcQ",
		"https://www.youtube.com/live/dQw4w9WgXcQ?feature=share":   "dQw4w9WgXcQ",
		"https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0": "dQw4w9WgXcQ",
		"dQw4w9WgXcQ": "dQw4w9WgXcQ",
	}
	for in, want := range ok {
		if got := youtubeID(in); got != want {
			t.Errorf("youtubeID(%q) = %q, want %q", in, got, want)
		}
	}
	for _, bad := range []string{"", "https://vimeo.com/123", "https://youtube.com/watch?v=short", "https://evil.example/watch?v=dQw4w9WgXcQ", "javascript:alert(1)", "https://youtube.com/channel/UC123"} {
		if got := youtubeID(bad); got != "" {
			t.Errorf("youtubeID(%q) = %q, want none", bad, got)
		}
	}
}

func TestSniffVideoKnowsMP4WebMAndRefusesTheRest(t *testing.T) {
	mp4 := append([]byte{0, 0, 0, 0x18}, []byte("ftypisom0000")...)
	if ext, ct, err := sniffVideo(mp4); err != nil || ext != ".mp4" || ct != "video/mp4" {
		t.Fatalf("mp4: %q %q %v", ext, ct, err)
	}
	if ext, _, err := sniffVideo([]byte{0x1A, 0x45, 0xDF, 0xA3, 1, 2}); err != nil || ext != ".webm" {
		t.Fatalf("webm: %q %v", ext, err)
	}
	if _, _, err := sniffVideo(append([]byte{0, 0, 0, 0x14}, []byte("ftypqt  0000")...)); err != ErrVideoMOV {
		t.Fatalf("mov must be refused with advice: %v", err)
	}
	if _, _, err := sniffVideo(solidPNG(80, 80, 200)); err != ErrVideoInvalid {
		t.Fatalf("a picture is not a video: %v", err)
	}
}

// An admin uploads a video; it is stored once under its content name in the video bucket; others can not upload.
func TestVideoUploadIsAdminOnlyAndChecked(t *testing.T) {
	e, img := committeeApp(t)
	e.app.Auth.VideoBase = "https://files.example/video/"
	mp4 := append(append([]byte{0, 0, 0, 0x18}, []byte("ftypmp42")...), bytes.Repeat([]byte{7}, 4000)...)
	rec := uploadReqTo(e, "/api/v1/admin/video", "admin-token", nil, mp4)
	if rec.Code != 201 {
		t.Fatalf("upload: %d %s", rec.Code, rec.Body)
	}
	var out struct{ Path, URL string }
	decodeBody(t, rec, &out)
	if !videoRx.MatchString(out.Path) || !strings.HasSuffix(out.Path, ".mp4") || out.URL != "https://files.example/video/"+out.Path || img.lastBucket != videoBucket {
		t.Fatalf("stored as %+v in %q", out, img.lastBucket)
	}
	if rec := uploadReqTo(e, "/api/v1/admin/video", "admin-token", nil, solidPNG(80, 80, 9)); rec.Code != 422 {
		t.Fatalf("a picture must be refused: %d", rec.Code)
	}
	if rec := uploadReqTo(e, "/api/v1/admin/video", "", nil, mp4); rec.Code != 401 {
		t.Fatalf("a visitor must not upload: %d", rec.Code)
	}
}

// Home slides and gallery entries take a video file or a YouTube link (stored as the id) instead of a picture.
func TestSlidesAndGalleryTakeVideosAndYouTube(t *testing.T) {
	e := cmsApp(t)
	e.app.Auth.VideoBase = "https://files.example/video/"
	vid := "0123abcd-0123-4567-89ab-0123456789ab.mp4"
	body := map[string]any{"hero": []map[string]any{
		{"youtube": "https://youtu.be/dQw4w9WgXcQ", "captionEn": "Our film", "published": true},
		{"video": vid, "captionEn": "Boat race", "published": true},
	}}
	if rec := adminJSON(e, "PUT", "/api/v1/admin/settings/site-images", body); rec.Code != 200 {
		t.Fatalf("save slides: %d %s", rec.Code, rec.Body)
	}
	var pub struct{ Hero []HeroSlide }
	decodeBody(t, jreq(e, "GET", "/api/v1/site-images", "", nil), &pub)
	if len(pub.Hero) != 2 || pub.Hero[0].YouTube != "dQw4w9WgXcQ" || pub.Hero[1].VideoURL != "https://files.example/video/"+vid {
		t.Fatalf("public slides: %+v", pub.Hero)
	}
	for _, bad := range []map[string]any{{"youtube": "https://vimeo.com/1", "published": true}, {"video": "../x.mp4", "published": true}, {"captionEn": "nothing", "published": true}} {
		if rec := adminJSON(e, "PUT", "/api/v1/admin/settings/site-images", map[string]any{"hero": []map[string]any{bad}}); rec.Code != 422 {
			t.Fatalf("bad slide %v accepted: %d", bad, rec.Code)
		}
	}

	yt := createEntry(t, e, "image", map[string]any{"data": map[string]any{"youtube": "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "alt": "Our film"}})
	vf := createEntry(t, e, "image", map[string]any{"data": map[string]any{"video": vid, "alt": "Boat race video"}})
	for _, id := range []string{yt.ID, vf.ID} {
		if rec := adminJSON(e, "POST", "/api/v1/admin/content/image/"+id+"/publish", nil); rec.Code != 200 {
			t.Fatalf("publish: %d", rec.Code)
		}
	}
	var g struct{ Items []galleryOut }
	decodeBody(t, jreq(e, "GET", "/api/v1/gallery", "", nil), &g)
	found := map[string]galleryOut{}
	for _, it := range g.Items {
		found[it.Alt] = it
	}
	if found["Our film"].YouTube != "dQw4w9WgXcQ" || found["Boat race video"].VideoURL != "https://files.example/video/"+vid {
		t.Fatalf("gallery: %+v", g.Items)
	}
	if rec := adminJSON(e, "POST", "/api/v1/admin/content/image", map[string]any{"data": map[string]any{"youtube": "https://vimeo.com/1", "alt": "x"}}); rec.Code != 422 {
		t.Fatalf("a non-YouTube link must be refused: %d", rec.Code)
	}
}
