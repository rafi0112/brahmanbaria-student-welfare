package main

import (
	"context"
	"net/http"
	"testing"
)

func importedList(t *testing.T, e *env2, ck *http.Cookie, q string) map[string]any {
	t.Helper()
	rec := e.do("GET", "/api/v1/admin/imported-students"+q, nil, ck)
	if rec.Code != 200 {
		t.Fatalf("list: %d %s", rec.Code, rec.Body)
	}
	var out map[string]any
	decodeBody(t, rec, &out)
	return out
}

func TestImportedVerifyLinkAndGuards(t *testing.T) {
	e := authApp(t)
	if len(e.app.Store.Students) < 3 {
		t.Skip("needs at least three imported records")
	}
	s1, s2 := e.app.Store.Students[0], e.app.Store.Students[1]
	member := e.member(t, "linkme@example.com")
	admin := e.admin(t)

	// only admins may review
	for _, ck := range []*http.Cookie{nil, member} {
		if rec := e.do("POST", "/api/v1/admin/imported-students/"+s1.ID+"/verify", map[string]string{}, ck); rec.Code != 401 && rec.Code != 403 {
			t.Fatalf("non-admin verify: %d", rec.Code)
		}
	}
	before := importedList(t, e, admin, "")
	counts := before["counts"].(map[string]any)
	if counts["verified"].(float64) != 0 || int(counts["awaiting"].(float64)) != len(e.app.Store.Students) {
		t.Fatalf("nothing is verified until an admin does it: %v", counts)
	}

	// verify (idempotent), shows up as verified, filters work
	for i := 0; i < 2; i++ {
		if rec := e.do("POST", "/api/v1/admin/imported-students/"+s1.ID+"/verify", map[string]string{}, admin); rec.Code != 200 {
			t.Fatalf("verify: %d %s", rec.Code, rec.Body)
		}
	}
	list := importedList(t, e, admin, "?status=verified")
	items := list["items"].([]any)
	if len(items) != 1 || items[0].(map[string]any)["id"] != s1.ID || items[0].(map[string]any)["verified"] != true {
		t.Fatalf("verified view: %v", list)
	}
	if got := importedList(t, e, admin, "?status=awaiting")["total"].(float64); int(got) != len(e.app.Store.Students)-1 {
		t.Fatalf("awaiting view: %v", got)
	}

	// linking records the account but changes nothing on it: not its approval, role, or email verification
	var mid string
	for _, r := range func() []MemberAdminRow { rows, _, _ := e.mem.ListMembersAdmin(context.Background(), MemberQuery{Page: 1, Limit: 10}); return rows }() {
		if r.Email == "linkme@example.com" {
			mid = r.ID
		}
	}
	pre, _ := e.mem.MemberAdmin(context.Background(), mid)
	if rec := e.do("POST", "/api/v1/admin/imported-students/"+s1.ID+"/verify", map[string]string{"linkedUserId": mid}, admin); rec.Code != 200 {
		t.Fatalf("link: %d %s", rec.Code, rec.Body)
	}
	post, _ := e.mem.MemberAdmin(context.Background(), mid)
	if pre.Status != post.Status || pre.EmailVerified != post.EmailVerified || pre.Role != post.Role || pre.Name != post.Name {
		t.Fatalf("linking must not alter the account: %+v -> %+v", pre, post)
	}
	if lk := importedList(t, e, admin, "?status=verified")["items"].([]any)[0].(map[string]any)["linked"]; lk == nil {
		t.Fatal("link not shown")
	}
	// the same account cannot be linked to a second record; unknown account/record are refused
	if rec := e.do("POST", "/api/v1/admin/imported-students/"+s2.ID+"/verify", map[string]string{"linkedUserId": mid}, admin); rec.Code != 409 {
		t.Fatalf("duplicate link: %d", rec.Code)
	}
	if rec := e.do("POST", "/api/v1/admin/imported-students/"+s2.ID+"/verify", map[string]string{"linkedUserId": "nobody"}, admin); rec.Code != 422 {
		t.Fatalf("unknown account: %d", rec.Code)
	}
	if rec := e.do("POST", "/api/v1/admin/imported-students/does-not-exist/verify", map[string]string{}, admin); rec.Code != 404 {
		t.Fatalf("unknown record: %d", rec.Code)
	}
	// withdraw the verification
	if rec := e.do("POST", "/api/v1/admin/imported-students/"+s1.ID+"/unverify", map[string]string{}, admin); rec.Code != 200 {
		t.Fatalf("unverify: %d", rec.Code)
	}
	if got := importedList(t, e, admin, "?status=verified")["total"].(float64); got != 0 {
		t.Fatalf("still verified: %v", got)
	}
}

func importedStoreSuite(t *testing.T, s AuthStore) {
	ctx := context.Background()
	admin, err := s.CreateUser(ctx, NewUser{Email: "imp-admin@example.com", PasswordHash: "h", Role: RoleAdmin, Verified: true})
	if err != nil {
		t.Fatal(err)
	}
	u, err := s.CreateUser(ctx, NewUser{Email: "imp-user@example.com", PasswordHash: "h", Role: RoleMember, Verified: true,
		Profile: &Profile{Name: "Imp User", Batch: 17, Department: "Finance", Upazila: "kasba", Union: "Kuti"}})
	if err != nil {
		t.Fatal(err)
	}
	if err := s.VerifyImported(ctx, admin.ID, "imp-1", ""); err != nil {
		t.Fatal(err)
	}
	if err := s.VerifyImported(ctx, admin.ID, "imp-1", ""); err != nil { // idempotent
		t.Fatal(err)
	}
	if err := s.VerifyImported(ctx, admin.ID, "imp-1", u.ID); err != nil {
		t.Fatal(err)
	}
	if err := s.VerifyImported(ctx, admin.ID, "imp-2", u.ID); err != ErrAlreadyLinked {
		t.Fatalf("an account links to one record only: %v", err)
	}
	if err := s.VerifyImported(ctx, admin.ID, "imp-3", "00000000-0000-0000-0000-00000000dead"); err != ErrNotFound {
		t.Fatalf("unknown account: %v", err)
	}
	rv, err := s.ImportedReviews(ctx)
	if err != nil || rv["imp-1"].LinkedUser != u.ID || rv["imp-1"].VerifiedAt == "" || rv["imp-2"].ImportedID != "" || rv["imp-3"].ImportedID != "" {
		t.Fatalf("reviews: %+v %v", rv, err)
	}
	if err := s.UnverifyImported(ctx, admin.ID, "imp-1"); err != nil {
		t.Fatal(err)
	}
	if rv, _ = s.ImportedReviews(ctx); rv["imp-1"].ImportedID != "" {
		t.Fatal("still verified")
	}
	// the freed account can now be linked elsewhere
	if err := s.VerifyImported(ctx, admin.ID, "imp-2", u.ID); err != nil {
		t.Fatal(err)
	}
}

func TestMemImportedStoreSuite(t *testing.T) { importedStoreSuite(t, newMemStore()) }
