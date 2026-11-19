package main

import (
	"bytes"
	"context"
	"image"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func submitBlogForm(e *env2, ck *http.Cookie, title, body string, photos ...[]byte) *httptest.ResponseRecorder {
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	_ = mw.WriteField("title", title)
	_ = mw.WriteField("body", body)
	for i, p := range photos {
		fw, _ := mw.CreateFormFile("photos", "p"+string(rune('a'+i))+".png")
		_, _ = fw.Write(p)
	}
	_ = mw.Close()
	req := httptest.NewRequest("POST", "/api/v1/me/blog-submissions", &buf)
	req.RemoteAddr = "9.9.9.9:1000"
	req.Header.Set("Content-Type", mw.FormDataContentType())
	if ck != nil {
		req.AddCookie(ck)
	}
	rec := httptest.NewRecorder()
	e.app.Routes().ServeHTTP(rec, req)
	return rec
}

const goodBlogBody = "আমাদের তিতাস নদীর পাড়ে এক বিকেলের গল্প, বন্ধুদের সাথে নৌকা ভ্রমণ।"

// A signed-in member sends a title, text and several pictures; admins (only) read it, see its pictures, mark it, turn
// it into a blog draft and delete it. The member sees what they sent and its state.
func TestBlogSubmissionFlow(t *testing.T) {
	e := authApp(t)
	if rec := submitBlogForm(e, nil, "A title", goodBlogBody); rec.Code != 401 {
		t.Fatalf("signed out: want 401, got %d", rec.Code)
	}
	member := e.member(t, "writer@example.com")
	rec := submitBlogForm(e, member, "  তিতাসের বিকেল  ", goodBlogBody, pngBytes(2400, 1200), pngBytes(300, 300))
	if rec.Code != 201 {
		t.Fatalf("submit: %d %s", rec.Code, rec.Body)
	}
	var made struct{ Item BlogSubmission }
	decodeBody(t, rec, &made)
	if made.Item.Title != "তিতাসের বিকেল" || made.Item.Photos != 2 || made.Item.Status != "new" || made.Item.Email != "writer@example.com" {
		t.Fatalf("saved: %+v", made.Item)
	}
	// the pictures are re-encoded and scaled down
	p, err := e.mem.SubmissionPhoto(context.Background(), made.Item.ID, 0)
	if err != nil {
		t.Fatal(err)
	}
	if im, _, err := image.DecodeConfig(bytes.NewReader(p.Data)); err != nil || im.Width != submissionPhotoSide {
		t.Fatalf("scaled picture: %v %v", im, err)
	}

	// members cannot reach the admin side
	for _, path := range []string{"/api/v1/admin/blog-submissions", "/api/v1/admin/blog-submissions/" + made.Item.ID, "/api/v1/admin/blog-submissions/" + made.Item.ID + "/photos/0"} {
		if rec := e.do("GET", path, nil, member); rec.Code != 403 {
			t.Errorf("%s as member: %d", path, rec.Code)
		}
	}
	// the member's own list hides admin fields
	rec = e.do("GET", "/api/v1/me/blog-submissions", nil, member)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), "তিতাসের বিকেল") || strings.Contains(rec.Body.String(), "নৌকা") {
		t.Fatalf("mine: %d %s", rec.Code, rec.Body)
	}

	admin := e.admin(t)
	rec = e.do("GET", "/api/v1/admin/blog-submissions?status=new", nil, admin)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"new":1`) || !strings.Contains(rec.Body.String(), "নৌকা") {
		t.Fatalf("admin list: %d %s", rec.Code, rec.Body)
	}
	rec = e.do("GET", "/api/v1/admin/blog-submissions/"+made.Item.ID+"/photos/1", nil, admin)
	if rec.Code != 200 || !strings.HasPrefix(rec.Header().Get("Content-Type"), "image/") {
		t.Fatalf("photo: %d %s", rec.Code, rec.Header())
	}
	if rec := e.do("GET", "/api/v1/admin/blog-submissions/"+made.Item.ID+"/photos/6", nil, admin); rec.Code != 404 {
		t.Fatalf("missing photo: %d", rec.Code)
	}
	if rec := e.do("POST", "/api/v1/admin/blog-submissions/"+made.Item.ID+"/status", map[string]string{"status": "read"}, admin); rec.Code != 200 {
		t.Fatalf("status: %d %s", rec.Code, rec.Body)
	}
	if rec := e.do("POST", "/api/v1/admin/blog-submissions/"+made.Item.ID+"/status", map[string]string{"status": "gone"}, admin); rec.Code != 422 {
		t.Fatalf("bad status: %d", rec.Code)
	}

	// to a blog draft: the text and the member's name, not published
	rec = e.do("POST", "/api/v1/admin/blog-submissions/"+made.Item.ID+"/draft", nil, admin)
	if rec.Code != 201 {
		t.Fatalf("draft: %d %s", rec.Code, rec.Body)
	}
	var d struct{ Post Entry }
	decodeBody(t, rec, &d)
	if d.Post.Status == "published" || !strings.Contains(string(d.Post.Data), "নৌকা") || !strings.Contains(string(d.Post.Data), "Test Student") {
		t.Fatalf("draft post: %+v %s", d.Post, d.Post.Data)
	}
	got, _ := e.mem.GetSubmission(context.Background(), made.Item.ID)
	if got.Status != "accepted" || got.PostID != d.Post.ID {
		t.Fatalf("after draft: %+v", got)
	}

	if rec := e.do("POST", "/api/v1/admin/blog-submissions/"+made.Item.ID+"/delete", nil, admin); rec.Code != 200 {
		t.Fatalf("delete: %d", rec.Code)
	}
	if _, err := e.mem.GetSubmission(context.Background(), made.Item.ID); err != ErrNotFound {
		t.Fatalf("still there: %v", err)
	}
}

func TestBlogSubmissionValidationAndLimits(t *testing.T) {
	e := authApp(t)
	member := e.member(t, "w2@example.com")
	if rec := submitBlogForm(e, member, "ab", "too short"); rec.Code != 422 || !strings.Contains(rec.Body.String(), `"title"`) || !strings.Contains(rec.Body.String(), `"body"`) {
		t.Fatalf("short: %d %s", rec.Code, rec.Body)
	}
	seven := make([][]byte, 7)
	for i := range seven {
		seven[i] = pngBytes(50, 50)
	}
	if rec := submitBlogForm(e, member, "Seven pictures", goodBlogBody, seven...); rec.Code != 422 || !strings.Contains(rec.Body.String(), "photos") {
		t.Fatalf("seven: %d %s", rec.Code, rec.Body)
	}
	if rec := submitBlogForm(e, member, "Not a picture", goodBlogBody, []byte("<script>alert(1)</script>")); rec.Code != 422 {
		t.Fatalf("not a picture: %d %s", rec.Code, rec.Body)
	}
	for i := 0; i < 5; i++ {
		if rec := submitBlogForm(e, member, "Story number", goodBlogBody); rec.Code != 201 {
			t.Fatalf("submit %d: %d %s", i, rec.Code, rec.Body)
		}
	}
	if rec := submitBlogForm(e, member, "One too many", goodBlogBody); rec.Code != 429 {
		t.Fatalf("sixth in a day: %d", rec.Code)
	}
}

func TestMemBlogSubmissionStore(t *testing.T) { blogSubmissionSuite(t, newMemStore()) }

// blogSubmissionSuite also runs in TestPostgresStoreSuite against a throwaway database.
func blogSubmissionSuite(t *testing.T, s AuthStore) {
	ctx := context.Background()
	u1, err := s.CreateUser(ctx, NewUser{Email: "sub1@example.com", PasswordHash: "x", Role: RoleMember, Verified: true})
	if err != nil {
		t.Fatal(err)
	}
	u2, _ := s.CreateUser(ctx, NewUser{Email: "sub2@example.com", PasswordHash: "x", Role: RoleMember, Verified: true})
	a, err := s.CreateSubmission(ctx, BlogSubmission{UserID: u1.ID, AuthorName: "A", Email: u1.Email, Title: "One", Body: goodBlogBody}, nil)
	if err != nil || a.Status != "new" || a.Photos != 0 || a.CreatedAt == "" {
		t.Fatalf("create: %+v %v", a, err)
	}
	b, err := s.CreateSubmission(ctx, BlogSubmission{UserID: u2.ID, AuthorName: "B", Title: "Two", Body: goodBlogBody},
		[]SubmissionPhoto{{"image/jpeg", []byte{1, 2}}, {"image/png", []byte{3}}})
	if err != nil || b.Photos != 2 {
		t.Fatalf("create with photos: %+v %v", b, err)
	}
	if items, counts, _ := s.ListSubmissions(ctx, "all", ""); len(items) != 2 || counts["new"] != 2 {
		t.Fatalf("list: %+v %v", items, counts)
	}
	if items, _, _ := s.ListSubmissions(ctx, "", u1.ID); len(items) != 1 || items[0].ID != a.ID {
		t.Fatalf("mine: %+v", items)
	}
	if p, err := s.SubmissionPhoto(ctx, b.ID, 1); err != nil || p.ContentType != "image/png" || len(p.Data) != 1 {
		t.Fatalf("photo: %+v %v", p, err)
	}
	if _, err := s.SubmissionPhoto(ctx, b.ID, 2); err != ErrNotFound {
		t.Fatalf("missing photo: %v", err)
	}
	if n, _ := s.CountRecentSubmissions(ctx, u1.ID, time.Now().Add(-time.Hour)); n != 1 {
		t.Fatalf("recent: %d", n)
	}
	if err := s.SetSubmissionStatus(ctx, a.ID, "read", ""); err != nil {
		t.Fatal(err)
	}
	if items, counts, _ := s.ListSubmissions(ctx, "read", ""); len(items) != 1 || counts["read"] != 1 || counts["new"] != 1 {
		t.Fatalf("by status: %+v %v", items, counts)
	}
	if err := s.SetSubmissionStatus(ctx, "00000000-0000-4000-8000-999999999999", "read", ""); err != ErrNotFound {
		t.Fatalf("missing: %v", err)
	}
	if err := s.DeleteSubmission(ctx, b.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.GetSubmission(ctx, b.ID); err != ErrNotFound {
		t.Fatalf("deleted: %v", err)
	}
}
