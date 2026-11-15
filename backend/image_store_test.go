package main

import (
	"bytes"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"strings"
	"testing"
)

// solidPNG is a picture with a gradient and some fixed pseudo-random grain, like a photograph is (a flat gradient would
// make the PNG unrealistically small).
func solidPNG(w, h int, a uint8) []byte {
	img := image.NewNRGBA(image.Rect(0, 0, w, h))
	seed := uint32(12345)
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			seed = seed*1664525 + 1013904223
			n := uint8(seed >> 28)
			img.Set(x, y, color.NRGBA{R: uint8(x*255/w) ^ n, G: uint8(y*255/h) ^ n, B: 90 + n, A: a})
		}
	}
	var b bytes.Buffer
	_ = png.Encode(&b, img)
	return b.Bytes()
}

func TestStorableImageShrinksAndPicksTheSmallerFormat(t *testing.T) {
	big := solidPNG(1800, 1200, 255)
	out, ext, ct, err := storableImage(big, 1000)
	if err != nil || ext != ".jpg" || ct != "image/jpeg" {
		t.Fatalf("an opaque PNG photo must be stored as a JPEG: %v %s %s", err, ext, ct)
	}
	cfg, _, _ := image.DecodeConfig(bytes.NewReader(out))
	if cfg.Width != 1000 || cfg.Height != 666 {
		t.Fatalf("the longer side must be cut to the limit keeping the proportions, got %dx%d", cfg.Width, cfg.Height)
	}
	if len(out) >= len(big)/2 {
		t.Fatalf("the stored picture must be much smaller than the PNG upload: %d vs %d", len(out), len(big))
	}
	// a picture that is already small is not enlarged or shrunk
	small, _, _, err := storableImage(solidPNG(300, 200, 255), 2000)
	if c, _, _ := image.DecodeConfig(bytes.NewReader(small)); err != nil || c.Width != 300 || c.Height != 200 {
		t.Fatalf("a small picture keeps its size: %v %v", err, c)
	}
	// a picture with transparency stays a PNG, so the transparent parts are kept
	if _, ext, _, err := storableImage(solidPNG(200, 200, 128), 2000); err != nil || ext != ".png" {
		t.Fatalf("a transparent PNG stays a PNG: %v %s", err, ext)
	}
	// a tall picture is cut by its height
	tall, _, _, _ := storableImage(solidPNG(500, 2000, 255), 1000)
	if c, _, _ := image.DecodeConfig(bytes.NewReader(tall)); c.Height != 1000 || c.Width != 250 {
		t.Fatalf("tall picture: %dx%d", c.Width, c.Height)
	}
}

func TestSamePictureIsStoredOnceAndKeepsOneName(t *testing.T) {
	e, img := committeeApp(t)
	one := func(file []byte) string {
		t.Helper()
		rec := uploadReqTo(e, "/api/v1/admin/media", "admin-token", nil, file)
		var up struct{ Path, URL string }
		decodeBody(t, rec, &up)
		if rec.Code != 201 || !photoRx.MatchString(up.Path) {
			t.Fatalf("upload: %d %s", rec.Code, rec.Body)
		}
		return up.Path
	}
	a := one(solidPNG(800, 600, 255))
	b := one(solidPNG(800, 600, 255))
	if a != b {
		t.Fatalf("the same picture must keep one name: %s and %s", a, b)
	}
	if c := one(solidPNG(801, 600, 255)); c == a {
		t.Fatal("a different picture must get a different name")
	}
	// the same file reaches storage under one object name, and a link to the same picture lands on it too
	same := 0
	for _, p := range img.puts {
		if strings.HasPrefix(p, a+"|") {
			same++
		}
	}
	if same != 2 {
		t.Fatalf("both uploads address the same object (storage ignores the second): %d", same)
	}
	// the picture is a JPEG the site can serve
	j := bytes.Buffer{}
	_ = jpeg.Encode(&j, image.NewRGBA(image.Rect(0, 0, 100, 100)), nil)
	if p := one(j.Bytes()); !strings.HasSuffix(p, ".jpg") {
		t.Fatalf("a JPEG stays a JPEG: %s", p)
	}
}
