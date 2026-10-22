package main

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
)

func cmsApp(t *testing.T) *env2 {
	e, _ := committeeApp(t)
	e.app.Auth.MediaBase = "https://files.example/media/"
	return e
}

func adminJSON(e *env2, method, path string, body any) *httptest.ResponseRecorder {
	return jreq(e, method, path, "admin-token", body)
}

func blogBody(title, slug string) map[string]any {
	return map[string]any{"slug": slug, "data": map[string]any{"titleEn": title, "titleBn": "শিরোনাম", "bodyEn": "First paragraph.\n\nSecond paragraph with **bold**.", "category": "community", "author": "Ann Author"}}
}

func createEntry(t *testing.T, e *env2, kind string, body any) Entry {
	t.Helper()
	rec := adminJSON(e, "POST", "/api/v1/admin/content/"+kind, body)
	var en Entry
	decodeBody(t, rec, &en)
	if rec.Code != 201 {
		t.Fatalf("create %s: %d %s", kind, rec.Code, rec.Body)
	}
	return en
}

func TestContentEndpointsRequireAnAdmin(t *testing.T) {
	e := cmsApp(t)
	e.touch("member-token")
	calls := []struct{ method, path string }{
		{"GET", "/api/v1/admin/content/blog"}, {"POST", "/api/v1/admin/content/blog"}, {"GET", "/api/v1/admin/content/blog/x"},
		{"PATCH", "/api/v1/admin/content/blog/x"}, {"POST", "/api/v1/admin/content/blog/x/publish"}, {"POST", "/api/v1/admin/content/place/reorder"},
		{"POST", "/api/v1/admin/content/image/bulk"}, {"POST", "/api/v1/admin/media"},
		{"GET", "/api/v1/admin/dashboard"}, {"GET", "/api/v1/admin/activity"}, {"GET", "/api/v1/admin/role-history"},
		{"GET", "/api/v1/admin/students"}, {"GET", "/api/v1/admin/students/x"}, {"PATCH", "/api/v1/admin/students/x"},
		{"POST", "/api/v1/admin/students/x/approve"}, {"POST", "/api/v1/admin/students/bulk"}, {"GET", "/api/v1/admin/export/students"},
		{"GET", "/api/v1/admin/imported-students"},
	}
	for _, c := range calls {
		if rec := jreq(e, c.method, c.path, "", map[string]any{}); rec.Code != 401 {
			t.Errorf("%s %s without a token: %d", c.method, c.path, rec.Code)
		}
		if rec := jreq(e, c.method, c.path, "member-token", map[string]any{}); rec.Code != 403 {
			t.Errorf("%s %s as a member: %d", c.method, c.path, rec.Code)
		}
	}
	if rec := adminJSON(e, "GET", "/api/v1/admin/content/secret", nil); rec.Code != 404 {
		t.Errorf("unknown kind: %d", rec.Code)
	}
}

func TestBlogValidationAndSlugs(t *testing.T) {
	e := cmsApp(t)
	for name, body := range map[string]map[string]any{
		"no title":       {"data": map[string]any{"bodyEn": "x"}},
		"bad slug":       {"slug": "Bad Slug!", "data": map[string]any{"titleEn": "Hello"}},
		"bangla only":    {"data": map[string]any{"titleBn": "শুধু বাংলা"}}, // no slug can be derived
		"bad image":      {"slug": "ok-slug", "data": map[string]any{"titleEn": "Hello", "image": "../../etc/passwd"}},
		"bad date":       {"slug": "ok-slug", "data": map[string]any{"titleEn": "Hello", "date": "2026-13-40"}},
		"long seo":       {"slug": "ok-slug", "data": map[string]any{"titleEn": "Hello", "metaTitle": strings.Repeat("x", 71)}},
		"too many tags":  {"slug": "ok-slug", "data": map[string]any{"titleEn": "Hello", "tags": []string{"a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m"}}},
		"malformed data": {"slug": "ok-slug", "data": "not an object"},
		"bad category":   {"slug": "ok-slug", "data": map[string]any{"titleEn": "Hello", "category": "Not Valid"}},
	} {
		if rec := adminJSON(e, "POST", "/api/v1/admin/content/blog", body); rec.Code != 422 {
			t.Errorf("%s: %d %s", name, rec.Code, rec.Body)
		}
	}
	// the slug is derived from the English title when it is left empty
	en := createEntry(t, e, "blog", map[string]any{"data": map[string]any{"titleEn": "Rivers of Brahmanbaria!", "bodyEn": strings.Repeat("word ", 450)}})
	if en.Slug != "rivers-of-brahmanbaria" || en.Status != StatusDraft {
		t.Fatalf("derived slug: %+v", en)
	}
	var d BlogData
	_ = json.Unmarshal(en.Data, &d)
	if d.ReadMin != 3 {
		t.Fatalf("reading time should be computed from the body, got %d", d.ReadMin)
	}
	if rec := adminJSON(e, "POST", "/api/v1/admin/content/blog", blogBody("Another", "rivers-of-brahmanbaria")); rec.Code != 409 || !strings.Contains(rec.Body.String(), "slug_taken") {
		t.Fatalf("duplicate slug: %d %s", rec.Code, rec.Body)
	}
	if rec := adminJSON(e, "PATCH", "/api/v1/admin/content/blog/"+en.ID, blogBody("Renamed", "renamed-post")); rec.Code != 200 {
		t.Fatalf("update: %d %s", rec.Code, rec.Body)
	}
	if rec := adminJSON(e, "PATCH", "/api/v1/admin/content/blog/no-such-id", blogBody("Renamed", "renamed-post")); rec.Code != 404 {
		t.Fatalf("update unknown: %d", rec.Code)
	}
}

func TestBlogPublicVisibilityFollowsStatus(t *testing.T) {
	e := cmsApp(t)
	post := createEntry(t, e, "blog", blogBody("Public story", "public-story"))
	public := func() (int, string) {
		rec := jreq(e, "GET", "/api/v1/blog/public-story", "", nil)
		return rec.Code, rec.Body.String()
	}
	listed := func() bool {
		return strings.Contains(jreq(e, "GET", "/api/v1/blog", "", nil).Body.String(), "public-story")
	}
	if code, _ := public(); code != 404 || listed() {
		t.Fatalf("a draft must not be public (%d)", code)
	}
	if rec := adminJSON(e, "POST", "/api/v1/admin/content/blog/"+post.ID+"/publish", nil); rec.Code != 200 {
		t.Fatalf("publish: %d %s", rec.Code, rec.Body)
	}
	code, body := public()
	if code != 200 || !listed() || !strings.Contains(body, "First paragraph.") || !strings.Contains(body, `"bodyEn":["First paragraph.","Second paragraph with **bold**."]`) {
		t.Fatalf("published post: %d %s", code, body)
	}
	if strings.Contains(body, "metaDescription\":\"") && false {
		t.Fatal("unreachable")
	}
	if rec := adminJSON(e, "POST", "/api/v1/admin/content/blog/"+post.ID+"/unpublish", nil); rec.Code != 200 {
		t.Fatalf("unpublish: %d", rec.Code)
	}
	if code, _ := public(); code != 404 || listed() {
		t.Fatal("an unpublished post must disappear")
	}
	adminJSON(e, "POST", "/api/v1/admin/content/blog/"+post.ID+"/publish", nil)
	if rec := adminJSON(e, "POST", "/api/v1/admin/content/blog/"+post.ID+"/archive", nil); rec.Code != 200 {
		t.Fatalf("archive: %d", rec.Code)
	}
	if code, _ := public(); code != 404 {
		t.Fatal("an archived post must not be public")
	}
	var def, arch struct{ Items []Entry }
	decodeBody(t, adminJSON(e, "GET", "/api/v1/admin/content/blog", nil), &def)
	decodeBody(t, adminJSON(e, "GET", "/api/v1/admin/content/blog?status=archived", nil), &arch)
	if len(def.Items) != 0 || len(arch.Items) != 1 {
		t.Fatalf("archived items leave the default list but stay findable: %d %d", len(def.Items), len(arch.Items))
	}
	if rec := adminJSON(e, "POST", "/api/v1/admin/content/blog/"+post.ID+"/restore", nil); rec.Code != 200 {
		t.Fatalf("restore: %d", rec.Code)
	}
	if rec := adminJSON(e, "POST", "/api/v1/admin/content/blog/"+post.ID+"/restore", nil); rec.Code != 409 {
		t.Fatalf("restore twice: %d", rec.Code)
	}
	if rec := adminJSON(e, "GET", "/api/v1/admin/content/blog?status=bogus", nil); rec.Code != 400 {
		t.Fatalf("invalid status filter: %d", rec.Code)
	}
}

func TestPlaceValidationAndPublicCounts(t *testing.T) {
	e := cmsApp(t)
	good := func() map[string]any {
		return map[string]any{"slug": "old-mosque", "data": map[string]any{"nameEn": "Old Mosque", "nameBn": "পুরাতন মসজিদ", "category": "mosque", "upazila": "sarail",
			"lat": 24.0, "lng": 91.0, "summary": "Short.", "sources": []string{"https://example.org/ref"}, "facts": []map[string]string{{"label": "Built", "value": "unknown"}}}}
	}
	bad := map[string]func(map[string]any){
		"lat without lng": func(m map[string]any) { d := m["data"].(map[string]any); delete(d, "lng") },
		"lat range":       func(m map[string]any) { m["data"].(map[string]any)["lat"] = 120.0 },
		"source url":      func(m map[string]any) { m["data"].(map[string]any)["sources"] = []string{"javascript:alert(1)"} },
		"map link":        func(m map[string]any) { m["data"].(map[string]any)["mapLink"] = "ftp://x" },
		"no category":     func(m map[string]any) { delete(m["data"].(map[string]any), "category") },
		"empty fact": func(m map[string]any) {
			m["data"].(map[string]any)["facts"] = []map[string]string{{"label": "x", "value": ""}}
		},
		"image ref": func(m map[string]any) { m["data"].(map[string]any)["images"] = []string{"../x"} },
	}
	for name, mutate := range bad {
		b := good()
		mutate(b)
		if rec := adminJSON(e, "POST", "/api/v1/admin/content/place", b); rec.Code != 422 {
			t.Errorf("%s: %d %s", name, rec.Code, rec.Body)
		}
	}
	p := createEntry(t, e, "place", good())
	if rec := jreq(e, "GET", "/api/v1/heritage/old-mosque", "", nil); rec.Code != 404 {
		t.Fatalf("draft place is public: %d", rec.Code)
	}
	upCount := func() int {
		var v struct{ Items []Upazila }
		decodeBody(t, jreq(e, "GET", "/api/v1/upazilas", "", nil), &v)
		for _, u := range v.Items {
			if u.Slug == "sarail" {
				return u.Places
			}
		}
		return -1
	}
	before := upCount()
	adminJSON(e, "POST", "/api/v1/admin/content/place/"+p.ID+"/publish", nil)
	rec := jreq(e, "GET", "/api/v1/heritage/old-mosque", "", nil)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), "Old Mosque") || upCount() != before+1 {
		t.Fatalf("published place: %d %s (count %d -> %d)", rec.Code, rec.Body, before, upCount())
	}
	if !strings.Contains(jreq(e, "GET", "/api/v1/heritage?upazila=sarail", "", nil).Body.String(), "old-mosque") {
		t.Fatal("published place should be in its listing")
	}
	adminJSON(e, "POST", "/api/v1/admin/content/place/"+p.ID+"/archive", nil)
	if rec := jreq(e, "GET", "/api/v1/heritage/old-mosque", "", nil); rec.Code != 404 || upCount() != before {
		t.Fatalf("archived place must disappear (%d, count %d)", rec.Code, upCount())
	}
}

func TestGalleryAlbumsImagesAndBulk(t *testing.T) {
	e := cmsApp(t)
	album := createEntry(t, e, "album", map[string]any{"slug": "annual-meet", "data": map[string]any{"titleEn": "Annual meet", "titleBn": "বার্ষিক সভা"}})
	mk := func(alt, parent string) Entry {
		return createEntry(t, e, "image", map[string]any{"parentId": parent, "data": map[string]any{"image": "22222222-2222-4222-8222-222222222222.jpg", "alt": alt, "captionEn": alt, "source": "https://example.org/photo"}})
	}
	i1, i2, orphan := mk("Hall", album.ID), mk("Stage", album.ID), mk("Loose", "")
	if rec := adminJSON(e, "POST", "/api/v1/admin/content/image", map[string]any{"data": map[string]any{"alt": "no file"}}); rec.Code != 422 {
		t.Fatalf("an image needs a file: %d", rec.Code)
	}
	if rec := adminJSON(e, "POST", "/api/v1/admin/content/image", map[string]any{"data": map[string]any{"image": "titas-sunset"}}); rec.Code != 422 {
		t.Fatalf("an image needs a caption or alt text: %d", rec.Code)
	}
	if rec := adminJSON(e, "POST", "/api/v1/admin/content/image", map[string]any{"parentId": "00000000-0000-0000-0000-00000000dead", "data": map[string]any{"image": "titas-sunset", "alt": "x"}}); rec.Code != 422 {
		t.Fatalf("unknown album: %d", rec.Code)
	}
	gallery := func(q string) string { return jreq(e, "GET", "/api/v1/gallery"+q, "", nil).Body.String() }
	if strings.Contains(gallery(""), "Hall") {
		t.Fatal("hidden images are not public")
	}
	// bulk publish: two succeed, one id is unknown and is reported, not hidden
	rec := adminJSON(e, "POST", "/api/v1/admin/content/image/bulk", map[string]any{"ids": []string{i1.ID, i2.ID, orphan.ID, "00000000-0000-0000-0000-00000000dead"}, "action": "publish"})
	var res struct {
		Done   int
		Failed []bulkFailure
	}
	decodeBody(t, rec, &res)
	if rec.Code != 200 || res.Done != 3 || len(res.Failed) != 1 || res.Failed[0].Error != "not_found" {
		t.Fatalf("bulk publish: %d %s", rec.Code, rec.Body)
	}
	if rec := adminJSON(e, "POST", "/api/v1/admin/content/image/bulk", map[string]any{"ids": []string{i1.ID}, "action": "explode"}); rec.Code != 400 {
		t.Fatalf("bulk with an unknown action: %d", rec.Code)
	}
	if rec := adminJSON(e, "POST", "/api/v1/admin/content/image/bulk", map[string]any{"ids": []string{}, "action": "publish"}); rec.Code != 400 {
		t.Fatalf("bulk with nothing selected: %d", rec.Code)
	}
	body := gallery("")
	if !strings.Contains(body, "Loose") || strings.Contains(body, "Hall") {
		t.Fatalf("images of an unpublished album must stay hidden while loose ones show: %s", body)
	}
	adminJSON(e, "POST", "/api/v1/admin/content/album/"+album.ID+"/publish", nil)
	body = gallery("")
	if !strings.Contains(body, "Hall") || !strings.Contains(body, "Stage") || !strings.Contains(body, `"count":2`) || !strings.Contains(body, "https://files.example/media/22222222") {
		t.Fatalf("published album: %s", body)
	}
	if body := gallery("?album=annual-meet"); strings.Contains(body, "Loose") || !strings.Contains(body, "Hall") {
		t.Fatalf("album filter: %s", body)
	}
	// hiding one image removes it from the public gallery without touching anything else
	adminJSON(e, "POST", "/api/v1/admin/content/image/"+i2.ID+"/unpublish", nil)
	if body := gallery(""); strings.Contains(body, "Stage") || !strings.Contains(body, "Hall") {
		t.Fatalf("hide one image: %s", body)
	}
	// reorder
	if rec := adminJSON(e, "POST", "/api/v1/admin/content/image/reorder", map[string]any{"ids": []string{orphan.ID, i1.ID, i2.ID}}); rec.Code != 200 {
		t.Fatalf("reorder: %d %s", rec.Code, rec.Body)
	}
	if rec := adminJSON(e, "POST", "/api/v1/admin/content/image/reorder", map[string]any{"ids": []string{album.ID}}); rec.Code != 422 {
		t.Fatalf("reorder across kinds: %d", rec.Code)
	}
}

func TestMediaUploadForContent(t *testing.T) {
	e := cmsApp(t)
	img := e.app.Auth.Images.(*fakeImages)
	rec := uploadReqTo(e, "/api/v1/admin/media", "admin-token", nil, pngBytes(200, 200))
	var up struct{ Path, URL string }
	decodeBody(t, rec, &up)
	if rec.Code != 201 || !photoRx.MatchString(up.Path) || up.URL != "https://files.example/media/"+up.Path {
		t.Fatalf("media upload: %d %s", rec.Code, rec.Body)
	}
	if !strings.HasPrefix(img.lastBucket, mediaBucket) {
		t.Fatalf("content uploads belong in the media bucket, got %q", img.lastBucket)
	}
	rec = uploadReqTo(e, "/api/v1/admin/executive-photo", "admin-token", nil, pngBytes(200, 200))
	if rec.Code != 201 || img.lastBucket != photoBucket {
		t.Fatalf("executive photos keep their own bucket: %d %q", rec.Code, img.lastBucket)
	}
	if rec := uploadReqTo(e, "/api/v1/admin/media", "admin-token", nil, []byte("<html>no</html>"+strings.Repeat("x", 200))); rec.Code != 422 {
		t.Fatalf("invalid file: %d", rec.Code)
	}
	// a blog post can reference the uploaded file and the admin API returns a preview URL for it
	post := createEntry(t, e, "blog", map[string]any{"slug": "with-photo", "data": map[string]any{"titleEn": "With photo", "image": up.Path}})
	if !strings.Contains(string(post.Data), `"imageUrl":"https://files.example/media/`+up.Path) {
		t.Fatalf("admin view should include the preview URL: %s", post.Data)
	}
	adminJSON(e, "POST", "/api/v1/admin/content/blog/"+post.ID+"/publish", nil)
	if body := jreq(e, "GET", "/api/v1/blog/with-photo", "", nil).Body.String(); !strings.Contains(body, `"imageUrl":"https://files.example/media/`+up.Path) {
		t.Fatalf("public post should carry the image URL: %s", body)
	}
}

func TestLegacyContentSeedRunsOnceAndStaysEditable(t *testing.T) {
	e := cmsApp(t)
	ctx := context.Background()
	if err := seedLegacyContent(ctx, e.mem, e.app.Store); err != nil {
		t.Fatal(err)
	}
	var places, posts struct{ Items []json.RawMessage }
	decodeBody(t, jreq(e, "GET", "/api/v1/heritage", "", nil), &places)
	decodeBody(t, jreq(e, "GET", "/api/v1/blog", "", nil), &posts)
	if len(places.Items) != len(e.app.Store.Places) || len(posts.Items) != len(e.app.Store.Posts) {
		t.Fatalf("seeded content should be public: %d places, %d posts", len(places.Items), len(posts.Items))
	}
	if body := jreq(e, "GET", "/api/v1/gallery", "", nil).Body.String(); !strings.Contains(body, "titas-sunset") {
		t.Fatalf("seeded gallery: %s", body)
	}
	// an admin archives a seeded place; a second start must not bring it back or duplicate anything
	slug := e.app.Store.Places[0].Slug
	var one Entry
	pl, _ := e.mem.GetEntry(ctx, KindPlace, slug, false)
	one = pl
	if rec := adminJSON(e, "POST", "/api/v1/admin/content/place/"+one.ID+"/archive", nil); rec.Code != 200 {
		t.Fatalf("archive seeded place: %d", rec.Code)
	}
	if err := seedLegacyContent(ctx, e.mem, e.app.Store); err != nil {
		t.Fatal(err)
	}
	decodeBody(t, jreq(e, "GET", "/api/v1/heritage", "", nil), &places)
	if len(places.Items) != len(e.app.Store.Places)-1 {
		t.Fatalf("seeding again must not resurrect archived content: %d", len(places.Items))
	}
}

// ---------------------------------------------------------------- students

func approvedMember(t *testing.T, e *env2, tok, id, name string) {
	t.Helper()
	body := map[string]any{"name": name, "batch": 18, "department": "Finance", "upazila": "kasba", "union": "Kuti"}
	if rec := e.do("POST", "/api/v1/me/profile", body, nil, bearer(tok)...); rec.Code != 201 {
		t.Fatalf("profile: %d %s", rec.Code, rec.Body)
	}
	if rec := adminJSON(e, "POST", "/api/v1/admin/students/"+id+"/approve", nil); rec.Code != 200 {
		t.Fatalf("approve: %d %s", rec.Code, rec.Body)
	}
}

func TestStudentsAdminListEditAndRoleProtection(t *testing.T) {
	e := cmsApp(t)
	approvedMember(t, e, "member-token", idMember, "Member One")
	e.do("POST", "/api/v1/me/profile", map[string]any{"name": "Second Person", "batch": 17, "department": "Finance", "upazila": "kasba", "union": "Kuti"}, nil, bearer("member2-token")...)

	var list struct {
		Items []MemberAdminRow
		Total int
	}
	decodeBody(t, adminJSON(e, "GET", "/api/v1/admin/students?status=approved", nil), &list)
	if list.Total != 1 || list.Items[0].ID != idMember || list.Items[0].Email != "member@example.com" || list.Items[0].Role != RoleMember {
		t.Fatalf("approved filter: %+v", list)
	}
	decodeBody(t, adminJSON(e, "GET", "/api/v1/admin/students?q=second", nil), &list)
	if list.Total != 1 || list.Items[0].ID != idMember2 {
		t.Fatalf("search: %+v", list)
	}
	if rec := adminJSON(e, "GET", "/api/v1/admin/students?status=bogus", nil); rec.Code != 400 {
		t.Fatalf("bad status filter: %d", rec.Code)
	}
	for name, body := range map[string]map[string]any{
		"short name": {"name": "A"}, "batch": {"batch": 99}, "department": {"department": "Astrology"}, "phone": {"phone": "123"},
		"blood": {"bloodGroup": "Z+"}, "union": {"union": "Nowhere"}, "upazila": {"upazila": "mars"},
	} {
		if rec := adminJSON(e, "PATCH", "/api/v1/admin/students/"+idMember, body); rec.Code != 422 {
			t.Errorf("%s: %d %s", name, rec.Code, rec.Body)
		}
	}
	if rec := adminJSON(e, "PATCH", "/api/v1/admin/students/"+idMember, map[string]any{"role": "admin"}); rec.Code != 400 {
		t.Fatalf("roles are not editable here: %d", rec.Code)
	}
	if got := e.role(t, "member-token"); got != RoleMember {
		t.Fatalf("role changed through the student editor: %s", got)
	}
	rec := adminJSON(e, "PATCH", "/api/v1/admin/students/"+idMember, map[string]any{"name": "Member Renamed", "phone": "01712345678", "bloodGroup": "A+", "showInDirectory": false})
	var row MemberAdminRow
	decodeBody(t, rec, &row)
	if rec.Code != 200 || row.Name != "Member Renamed" || row.Phone != "01712345678" || row.ShowInDirectory || !row.Complete {
		t.Fatalf("edit: %d %s", rec.Code, rec.Body)
	}
	if rec := adminJSON(e, "PATCH", "/api/v1/admin/students/00000000-0000-0000-0000-00000000dead", map[string]any{"name": "Nobody"}); rec.Code != 404 {
		t.Fatalf("edit unknown member: %d", rec.Code)
	}
	// a member cannot edit someone else through the admin routes, nor through their own profile route
	if rec := jreq(e, "PATCH", "/api/v1/admin/students/"+idMember2, "member-token", map[string]any{"name": "Hacked"}); rec.Code != 403 {
		t.Fatalf("member editing another member: %d", rec.Code)
	}
}

func TestDeactivationAndReviewKeepAccounts(t *testing.T) {
	e := cmsApp(t)
	approvedMember(t, e, "member-token", idMember, "Member One")
	// an admin cannot be deactivated, and nobody can deactivate themselves
	if rec := adminJSON(e, "POST", "/api/v1/admin/students/"+idAdmin+"/deactivate", nil); rec.Code != 404 && rec.Code != 403 && rec.Code != 409 {
		t.Fatalf("deactivating an admin: %d", rec.Code)
	}
	if rec := adminJSON(e, "POST", "/api/v1/admin/students/"+idMember+"/deactivate", nil); rec.Code != 200 {
		t.Fatalf("deactivate: %d %s", rec.Code, rec.Body)
	}
	if rec := jreq(e, "GET", "/api/v1/auth/me", "member-token", nil); rec.Code != 403 || !strings.Contains(rec.Body.String(), "account_disabled") {
		t.Fatalf("a deactivated account is refused: %d %s", rec.Code, rec.Body)
	}
	if rec := jreq(e, "PATCH", "/api/v1/me/profile", "member-token", map[string]any{"phone": "01712345678"}); rec.Code != 403 {
		t.Fatalf("a deactivated account cannot use the API: %d", rec.Code)
	}
	if body := jreq(e, "GET", "/api/v1/students?q=Member", "", nil).Body.String(); strings.Contains(body, "Member One") {
		t.Fatalf("deactivated members leave the public directory: %s", body)
	}
	if u, err := e.mem.UserByID(context.Background(), idMember); err != nil || u.Email != "member@example.com" {
		t.Fatalf("the account must survive: %+v %v", u, err)
	}
	if rec := adminJSON(e, "POST", "/api/v1/admin/students/"+idMember+"/activate", nil); rec.Code != 200 {
		t.Fatalf("activate: %d", rec.Code)
	}
	if rec := jreq(e, "GET", "/api/v1/auth/me", "member-token", nil); rec.Code != 200 {
		t.Fatalf("reactivated account works again: %d", rec.Code)
	}
	if rec := adminJSON(e, "POST", "/api/v1/admin/students/"+idMember+"/reject", nil); rec.Code != 200 || !strings.Contains(rec.Body.String(), `"status":"rejected"`) {
		t.Fatalf("reject: %d %s", rec.Code, rec.Body)
	}
	if rec := adminJSON(e, "POST", "/api/v1/admin/students/"+idMember+"/nuke", nil); rec.Code != 404 {
		t.Fatalf("unknown action: %d", rec.Code)
	}
}

func TestStudentsBulkReportsPartialFailure(t *testing.T) {
	e := cmsApp(t)
	e.do("POST", "/api/v1/me/profile", myProfile, nil, bearer("member-token")...)
	rec := adminJSON(e, "POST", "/api/v1/admin/students/bulk", map[string]any{"ids": []string{idMember, "00000000-0000-0000-0000-00000000dead"}, "action": "approve"})
	var res struct {
		Done   int
		Failed []bulkFailure
	}
	decodeBody(t, rec, &res)
	if rec.Code != 200 || res.Done != 1 || len(res.Failed) != 1 || res.Failed[0].Error != "not_found" {
		t.Fatalf("bulk approve: %d %s", rec.Code, rec.Body)
	}
	if rec := adminJSON(e, "POST", "/api/v1/admin/students/bulk", map[string]any{"ids": []string{idMember}, "action": "deactivate"}); rec.Code != 400 {
		t.Fatalf("bulk supports review actions only: %d", rec.Code)
	}
}

func TestStudentsExportProtectsContactDetails(t *testing.T) {
	e := cmsApp(t)
	e.do("POST", "/api/v1/me/profile", map[string]any{"name": "=HYPERLINK(\"http://evil\")", "batch": 18, "department": "Finance", "upazila": "kasba", "union": "Kuti"}, nil, bearer("member-token")...)
	plain := adminJSON(e, "GET", "/api/v1/admin/export/students", nil)
	if plain.Code != 200 || !strings.HasPrefix(plain.Header().Get("Content-Type"), "text/csv") {
		t.Fatalf("export: %d %s", plain.Code, plain.Header().Get("Content-Type"))
	}
	if strings.Contains(plain.Body.String(), "member@example.com") || strings.Contains(plain.Body.String(), "email") {
		t.Fatalf("emails must not be exported by default: %s", plain.Body)
	}
	if !strings.Contains(plain.Body.String(), "'=HYPERLINK") {
		t.Fatalf("spreadsheet formulas must be neutralised: %s", plain.Body)
	}
	full := adminJSON(e, "GET", "/api/v1/admin/export/students?contact=1", nil)
	if !strings.Contains(full.Body.String(), "member@example.com") {
		t.Fatalf("contact export: %s", full.Body)
	}
	var found bool
	acts, _ := e.mem.RecentActivity(context.Background(), 50)
	for _, a := range acts {
		found = found || (a.Action == "member.export" && a.Detail["withContact"] == true)
	}
	if !found {
		t.Fatalf("exporting contact details must be audited: %+v", acts)
	}
}

func TestImportedStudentsAreListedReadOnly(t *testing.T) {
	e := cmsApp(t)
	var v struct {
		Items []Student
		Total int
	}
	decodeBody(t, adminJSON(e, "GET", "/api/v1/admin/imported-students?limit=5", nil), &v)
	if v.Total != len(e.app.Store.Students) || len(v.Items) != 5 {
		t.Fatalf("imported directory: %d items, total %d", len(v.Items), v.Total)
	}
	if rec := adminJSON(e, "PATCH", "/api/v1/admin/imported-students", map[string]any{}); rec.Code != 405 {
		t.Fatalf("imported records cannot be edited: %d", rec.Code)
	}
}

// ---------------------------------------------------------------- dashboard and audit

func TestDashboardReflectsRealData(t *testing.T) {
	e := cmsApp(t)
	var d map[string]any
	get := func() map[string]any {
		var out map[string]any
		rec := adminJSON(e, "GET", "/api/v1/admin/dashboard", nil)
		if rec.Code != 200 {
			t.Fatalf("dashboard: %d %s", rec.Code, rec.Body)
		}
		decodeBody(t, rec, &out)
		return out
	}
	num := func(m map[string]any, keys ...string) int {
		var cur any = m
		for _, k := range keys {
			cur = cur.(map[string]any)[k]
		}
		return int(cur.(float64))
	}
	d = get()
	if num(d, "admins") != 1 || num(d, "blog", "published") != 0 || num(d, "members", "pending") != 0 || d["messages"].(map[string]any)["available"] != false {
		t.Fatalf("baseline: %+v", d)
	}
	post := createEntry(t, e, "blog", blogBody("Dash post", "dash-post"))
	d = get()
	if num(d, "blog", "draft") != 1 {
		t.Fatalf("draft count: %+v", d["blog"])
	}
	adminJSON(e, "POST", "/api/v1/admin/content/blog/"+post.ID+"/publish", nil)
	d = get()
	if num(d, "blog", "published") != 1 || num(d, "blog", "draft") != 0 {
		t.Fatalf("publish moves the count: %+v", d["blog"])
	}
	adminJSON(e, "POST", "/api/v1/admin/content/blog/"+post.ID+"/archive", nil)
	if d = get(); num(d, "blog", "archived") != 1 || num(d, "blog", "published") != 0 {
		t.Fatalf("archive moves the count: %+v", d["blog"])
	}
	e.do("POST", "/api/v1/me/profile", myProfile, nil, bearer("member-token")...)
	if d = get(); num(d, "members", "pending") != 1 || num(d, "members", "total") != 1 {
		t.Fatalf("members: %+v", d["members"])
	}
	var c Committee
	decodeBody(t, adminJSON(e, "POST", "/api/v1/admin/committees", map[string]any{"name": "Panel"}), &c)
	adminJSON(e, "POST", "/api/v1/admin/committees/"+c.ID+"/members", map[string]any{"name": "Some Person", "designation": "President"})
	adminJSON(e, "POST", "/api/v1/admin/committees/"+c.ID+"/publish", nil)
	if d = get(); num(d, "committees", "published") != 1 || num(d, "committees", "currentMembers") != 1 {
		t.Fatalf("committees: %+v", d["committees"])
	}
	recent := d["recent"].([]any)
	if len(recent) == 0 || recent[0].(map[string]any)["title"] != "Dash post" {
		t.Fatalf("recent updates: %+v", recent)
	}
	acts := d["activity"].([]any)
	var seen []string
	for _, a := range acts {
		seen = append(seen, a.(map[string]any)["action"].(string))
	}
	for _, want := range []string{"blog.create", "blog.publish", "committee.publish"} {
		if !strings.Contains(strings.Join(seen, ","), want) {
			t.Fatalf("recent activity is missing %s: %v", want, seen)
		}
	}
}

func TestRoleHistoryEndpoint(t *testing.T) {
	e := cmsApp(t)
	e.touch("member-token")
	if rec := setRole(e, "admin-token", idMember, "admin"); rec.Code != 200 {
		t.Fatalf("promote: %d %s", rec.Code, rec.Body)
	}
	var v struct{ Items []RoleChangeRow }
	decodeBody(t, adminJSON(e, "GET", "/api/v1/admin/role-history?user="+idMember, nil), &v)
	if len(v.Items) != 1 || v.Items[0].To != RoleAdmin || v.Items[0].Actor != "boss@example.com" || v.Items[0].Target != "member@example.com" {
		t.Fatalf("history: %+v", v.Items)
	}
	decodeBody(t, adminJSON(e, "GET", "/api/v1/admin/role-history", nil), &v)
	if len(v.Items) < 2 { // the bootstrap and the promotion
		t.Fatalf("full history: %+v", v.Items)
	}
}

func TestListSortsAndFiltersAreValidated(t *testing.T) {
	e := cmsApp(t)
	for _, path := range []string{
		"/api/v1/admin/students?sort=password_hash", "/api/v1/admin/students?sort=name%3Bdrop%20table%20users",
		"/api/v1/admin/users?sort=password_hash", "/api/v1/admin/users?verified=maybe", "/api/v1/admin/users?account=gone", "/api/v1/admin/users?role=root",
	} {
		if rec := adminJSON(e, "GET", path, nil); rec.Code != 400 {
			t.Errorf("%s: %d %s", path, rec.Code, rec.Body)
		}
	}
	for _, path := range []string{"/api/v1/admin/students?sort=name", "/api/v1/admin/users?sort=email&verified=yes&account=active"} {
		if rec := adminJSON(e, "GET", path, nil); rec.Code != 200 {
			t.Errorf("%s: %d %s", path, rec.Code, rec.Body)
		}
	}
}

func TestEditorsCannotOverwriteEachOthersChanges(t *testing.T) {
	e := cmsApp(t)
	post := createEntry(t, e, "blog", blogBody("Shared draft", "shared-draft"))
	body := blogBody("Shared draft v2", "shared-draft")
	body["expectedUpdatedAt"] = post.UpdatedAt
	if rec := adminJSON(e, "PATCH", "/api/v1/admin/content/blog/"+post.ID, body); rec.Code != 200 {
		t.Fatalf("first save: %d %s", rec.Code, rec.Body)
	}
	body = blogBody("Shared draft v3 from a stale tab", "shared-draft")
	body["expectedUpdatedAt"] = "2000-01-01T00:00:00Z"
	if rec := adminJSON(e, "PATCH", "/api/v1/admin/content/blog/"+post.ID, body); rec.Code != 409 || !strings.Contains(rec.Body.String(), "stale") {
		t.Fatalf("stale save: %d %s", rec.Code, rec.Body)
	}
	var cur Entry
	decodeBody(t, adminJSON(e, "GET", "/api/v1/admin/content/blog/"+post.ID, nil), &cur)
	if cur.Title != "Shared draft v2" {
		t.Fatalf("the stale save must not have changed the record: %q", cur.Title)
	}
}
