package main

import (
	"bytes"
	"context"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func testPNG(t *testing.T, w, h int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			img.Set(x, y, color.RGBA{uint8(x), uint8(y), 120, 255})
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func uploadPhoto(e *env2, path string, data []byte, ck *http.Cookie) *httptest.ResponseRecorder {
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	fw, _ := mw.CreateFormFile("file", "me.png")
	_, _ = fw.Write(data)
	_ = mw.Close()
	req := httptest.NewRequest("POST", path, &body)
	req.RemoteAddr = "9.9.9.9:1000"
	req.Header.Set("Content-Type", mw.FormDataContentType())
	if ck != nil {
		req.AddCookie(ck)
	}
	rec := httptest.NewRecorder()
	e.app.Routes().ServeHTTP(rec, req)
	return rec
}

func TestSquarePhotoCropsScalesAndRejectsBadFiles(t *testing.T) {
	out, err := squarePhoto(testPNG(t, 1000, 600))
	if err != nil {
		t.Fatal(err)
	}
	img, format, err := image.Decode(bytes.NewReader(out))
	if err != nil || format != "jpeg" || img.Bounds().Dx() != photoSide || img.Bounds().Dy() != photoSide {
		t.Fatalf("want a %dpx square JPEG, got %s %v %v", photoSide, format, img.Bounds(), err)
	}
	small, _ := squarePhoto(testPNG(t, 200, 120))
	if im, _, _ := image.Decode(bytes.NewReader(small)); im.Bounds().Dx() != 120 {
		t.Fatalf("small photos are not enlarged: %v", im.Bounds())
	}
	if _, err := squarePhoto([]byte("not an image at all")); err == nil {
		t.Fatal("text must be refused")
	}
	if _, err := squarePhoto(testPNG(t, 20, 20)); err == nil {
		t.Fatal("tiny images must be refused")
	}
	var gif bytes.Buffer
	_ = jpeg.Encode(&gif, image.NewRGBA(image.Rect(0, 0, 100, 100)), nil)
	if _, err := squarePhoto(gif.Bytes()); err != nil {
		t.Fatalf("JPEG is accepted: %v", err)
	}
}

func photoStoreSuite(t *testing.T, s AuthStore) {
	ctx := context.Background()
	u, err := s.CreateUser(ctx, NewUser{Email: "photo-owner@example.org", PasswordHash: "h", Role: RoleMember, Verified: true,
		Profile: &Profile{Name: "Photo Owner", Batch: 12, Department: "Finance", Upazila: "kasba", Union: "Kuti", Session: "2019-20"}})
	if err != nil {
		t.Fatal(err)
	}
	noProfile, _ := s.CreateUser(ctx, NewUser{Email: "photo-none@example.org", PasswordHash: "h", Role: RoleMember, Verified: true})
	if err := s.SetProfilePhoto(ctx, noProfile.ID, []byte{1, 2, 3}, "image/jpeg"); err != ErrNotFound {
		t.Fatalf("a photo needs a profile: %v", err)
	}
	if err := s.SetProfilePhoto(ctx, u.ID, []byte("first"), "image/jpeg"); err != nil {
		t.Fatal(err)
	}
	_, _, v1, _ := s.ProfilePhoto(ctx, u.ID)
	if err := s.SetProfilePhoto(ctx, u.ID, []byte("second"), "image/jpeg"); err != nil {
		t.Fatal(err)
	}
	data, ct, v2, err := s.ProfilePhoto(ctx, u.ID)
	if err != nil || string(data) != "second" || ct != "image/jpeg" || v1 == v2 {
		t.Fatalf("replace: %q %s %s %s %v", data, ct, v1, v2, err)
	}
	if vers, _ := s.PhotoVersions(ctx); vers[u.ID] != v2 {
		t.Fatalf("versions: %v", vers)
	}
	if err := s.DeleteProfilePhoto(ctx, u.ID); err != nil {
		t.Fatal(err)
	}
	if _, _, _, err := s.ProfilePhoto(ctx, u.ID); err != ErrNotFound {
		t.Fatalf("deleted: %v", err)
	}
	if err := s.DeleteProfilePhoto(ctx, u.ID); err != ErrNotFound {
		t.Fatalf("second delete: %v", err)
	}
}

func TestPhotoStoreMemory(t *testing.T) { photoStoreSuite(t, newMemStore()) }

func TestProfilePhotosFollowTheViewerRules(t *testing.T) {
	e := authApp(t)
	ctx := context.Background()
	admin := e.admin(t)
	owner := e.member(t, "owner@example.com")
	viewer := e.member(t, "viewer@example.com")
	ownerU, _ := e.mem.UserByEmail(ctx, "owner@example.com")
	viewerU, _ := e.mem.UserByEmail(ctx, "viewer@example.com")

	if rec := uploadPhoto(e, "/api/v1/me/photo", []byte("plain text"), owner); rec.Code != 422 {
		t.Fatalf("a non-image must be refused: %d", rec.Code)
	}
	rec := uploadPhoto(e, "/api/v1/me/photo", testPNG(t, 800, 800), owner)
	if rec.Code != 200 {
		t.Fatalf("upload: %d %s", rec.Code, rec.Body)
	}
	var me struct{ Profile Profile }
	decodeBody(t, rec, &me)
	if !strings.HasPrefix(me.Profile.PhotoURL, "/api/v1/me/photo?v=") {
		t.Fatalf("me carries the photo url: %+v", me.Profile)
	}
	if got := e.do("GET", "/api/v1/me/photo", nil, owner); got.Code != 200 || got.Header().Get("Content-Type") != "image/jpeg" {
		t.Fatalf("own photo: %d %s", got.Code, got.Header().Get("Content-Type"))
	}
	path := "/api/v1/students/m-" + ownerU.ID + "/photo"
	// not approved yet: only the owner and admins
	if got := e.do("GET", path, nil, viewer); got.Code != 404 {
		t.Fatalf("a pending viewer must not see it: %d", got.Code)
	}
	if got := e.do("GET", path, nil, admin); got.Code != 200 {
		t.Fatalf("admins see it: %d", got.Code)
	}
	for _, id := range []string{ownerU.ID, viewerU.ID} {
		if err := e.mem.ReviewMember(ctx, "", id, StatusApproved); err != nil {
			t.Fatal(err)
		}
	}
	if got := e.do("GET", path, nil, nil); got.Code != 200 {
		t.Fatalf("everyone sees an approved, listed member's photo: %d", got.Code)
	}
	if got := e.do("GET", path, nil, viewer); got.Code != 200 {
		t.Fatalf("approved members see listed members' photos: %d", got.Code)
	}
	var list struct{ Items []personView }
	decodeBody(t, e.do("GET", "/api/v1/students?q=Test", nil, viewer), &list)
	found := false
	for _, it := range list.Items {
		if it.ID == "m-"+ownerU.ID {
			found = it.Details != nil && strings.HasPrefix(it.Details.PhotoURL, path)
		}
	}
	if !found {
		t.Fatalf("member list carries the photo url: %+v", list.Items)
	}
	var pub struct{ Items []personView }
	decodeBody(t, e.do("GET", "/api/v1/students?q=Test", nil, nil), &pub)
	shown := false
	for _, it := range pub.Items {
		if it.Details != nil {
			t.Fatal("the public list carries no personal details")
		}
		if it.ID == "m-"+ownerU.ID {
			shown = strings.HasPrefix(it.Photo, path)
		}
	}
	if !shown {
		t.Fatalf("the public list carries the photo address: %+v", pub.Items)
	}
	// an admin can replace and remove anyone's photo
	if got := uploadPhoto(e, "/api/v1/admin/students/"+viewerU.ID+"/photo", testPNG(t, 300, 200), admin); got.Code != 200 || !strings.Contains(got.Body.String(), "photoUrl") {
		t.Fatalf("admin upload: %d %s", got.Code, got.Body)
	}
	if got := uploadPhoto(e, "/api/v1/admin/students/"+viewerU.ID+"/photo", testPNG(t, 300, 200), viewer); got.Code != 403 {
		t.Fatalf("members cannot use the admin route: %d", got.Code)
	}
	if got := e.do("DELETE", "/api/v1/admin/students/"+ownerU.ID+"/photo", nil, admin); got.Code != 200 {
		t.Fatalf("admin delete: %d", got.Code)
	}
	if got := e.do("GET", path, nil, viewer); got.Code != 404 {
		t.Fatalf("deleted photo: %d", got.Code)
	}
	if got := e.do("DELETE", "/api/v1/me/photo", nil, viewer); got.Code != 200 {
		t.Fatalf("own delete: %d", got.Code)
	}
}

func TestProfilePhotoFromALink(t *testing.T) {
	img := testPNG(t, 300, 300)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/me.png" {
			w.Header().Set("Content-Type", "image/png")
			_, _ = w.Write(img)
			return
		}
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte("<html>not an image</html>"))
	}))
	defer srv.Close()
	e := authApp(t)
	e.app.Auth.AllowPrivateImageHosts = true
	ctx := context.Background()

	// registration: a bad link is a field error and creates nothing
	bad := validReg("link.bad@example.com")
	bad["photoLink"] = "http://example.com/x.png"
	if rec := e.do("POST", "/api/v1/auth/register", bad, nil); rec.Code != 422 || !strings.Contains(rec.Body.String(), "photoLink") {
		t.Fatalf("plain http must be refused: %d %s", rec.Code, rec.Body)
	}
	if _, err := e.mem.UserByEmail(ctx, "link.bad@example.com"); err != ErrNotFound {
		t.Fatal("a refused registration must not create the account")
	}

	// in-app update: the same endpoint as uploads accepts imageUrl (the test server is plain http, allowed for tests)
	c := e.member(t, "link.ok@example.com")
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	_ = mw.WriteField("imageUrl", srv.URL+"/me.png")
	_ = mw.Close()
	req := httptest.NewRequest("POST", "/api/v1/me/photo", &body)
	req.RemoteAddr = "9.9.9.9:1000"
	req.Header.Set("Content-Type", mw.FormDataContentType())
	req.AddCookie(c)
	rec := httptest.NewRecorder()
	e.app.Routes().ServeHTTP(rec, req)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), "/api/v1/me/photo?v=") {
		t.Fatalf("photo from link: %d %s", rec.Code, rec.Body)
	}
	u, _ := e.mem.UserByEmail(ctx, "link.ok@example.com")
	if data, _, _, err := e.mem.ProfilePhoto(ctx, u.ID); err != nil || len(data) == 0 {
		t.Fatalf("stored: %v", err)
	}
	// a link to something that is not an image is refused
	body.Reset()
	mw = multipart.NewWriter(&body)
	_ = mw.WriteField("imageUrl", srv.URL+"/page")
	_ = mw.Close()
	req = httptest.NewRequest("POST", "/api/v1/me/photo", &body)
	req.RemoteAddr = "9.9.9.9:1000"
	req.Header.Set("Content-Type", mw.FormDataContentType())
	req.AddCookie(c)
	rec = httptest.NewRecorder()
	e.app.Routes().ServeHTTP(rec, req)
	if rec.Code == 200 {
		t.Fatalf("an html page must be refused: %d", rec.Code)
	}
}
