package main

import (
	"strings"
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

// approve gives an existing account an approved member profile, the precondition for promoting it to administrator.
func (e *env2) approve(t *testing.T, id string) {
	t.Helper()
	ctx := context.Background()
	if err := e.mem.UpsertProfile(ctx, id, Profile{UserID: id, Name: "Approved Person", Batch: 17, Department: "Finance", Upazila: "kasba", Union: "Kuti"}); err != nil {
		t.Fatal(err)
	}
	if err := e.mem.ReviewMember(ctx, "", id, StatusApproved); err != nil {
		t.Fatal(err)
	}
}

func TestPromotionRequiresApprovedMembership(t *testing.T) {
	e := supaApp(t)
	e.makeAdmin(t, "admin-token", emailAdmin)
	e.touch("member-token")
	// no member profile / pending profile: refused, and nothing changes
	rec := setRole(e, "admin-token", idMember, "admin")
	if rec.Code != 409 || !strings.Contains(rec.Body.String(), "target_unapproved") {
		t.Fatalf("a member without an approved membership must not be promoted: %d %s", rec.Code, rec.Body)
	}
	ctx := context.Background()
	if err := e.mem.UpsertProfile(ctx, idMember, Profile{UserID: idMember, Name: "Pending Person", Batch: 17, Department: "Finance", Upazila: "kasba", Union: "Kuti"}); err != nil {
		t.Fatal(err)
	}
	if rec := setRole(e, "admin-token", idMember, "admin"); rec.Code != 409 {
		t.Fatalf("pending membership: %d", rec.Code)
	}
	if u, _ := e.mem.UserByID(ctx, idMember); u.Role != RoleMember {
		t.Fatal("role changed despite the refusal")
	}
	_ = e.mem.ReviewMember(ctx, "", idMember, StatusApproved)
	if rec := setRole(e, "admin-token", idMember, "admin"); rec.Code != 200 {
		t.Fatalf("approved and verified member should be promotable: %d %s", rec.Code, rec.Body)
	}
}

func TestManualImportedRecordsCrudWithoutAccounts(t *testing.T) {
	e := authApp(t)
	if len(e.app.Store.Students) == 0 || len(e.app.Store.Depts) == 0 {
		t.Skip("needs directory data")
	}
	admin, member := e.admin(t), e.member(t, "plain@example.com")
	dept := e.app.Store.Depts[0]
	good := map[string]any{"name": "Zqxv Uddin", "batch": 12, "department": dept, "session": "2026-27", "phone": "01712345678", "note": "Added from the 2025 reunion list"}
	_, usersBefore, _ := e.mem.ListUsers(context.Background(), "", "", 1, 0)

	if rec := e.do("POST", "/api/v1/admin/imported-students", good, member); rec.Code != 403 {
		t.Fatalf("members cannot add: %d", rec.Code)
	}
	for name, bad := range map[string]map[string]any{
		"no department":  {"name": "Zqxv Uddin", "batch": 12, "department": ""},
		"fake department": {"name": "Zqxv Uddin", "batch": 12, "department": "Astrology"},
		"short name":     {"name": "R", "batch": 12, "department": dept},
		"no batch":       {"name": "Zqxv Uddin", "department": dept},
		"bad phone":      {"name": "Zqxv Uddin", "batch": 12, "department": dept, "phone": "123"},
		"bad session":    {"name": "Zqxv Uddin", "batch": 12, "department": dept, "session": "next year"},
	} {
		if rec := e.do("POST", "/api/v1/admin/imported-students", bad, admin); rec.Code != 422 {
			t.Errorf("%s: want 422 got %d %s", name, rec.Code, rec.Body)
		}
	}
	rec := e.do("POST", "/api/v1/admin/imported-students", good, admin)
	if rec.Code != 201 {
		t.Fatalf("create: %d %s", rec.Code, rec.Body)
	}
	var made ManualImported
	decodeBody(t, rec, &made)
	if !strings.HasPrefix(made.ID, "i-") {
		t.Fatalf("id: %s", made.ID)
	}
	// it is listed first, marked as hand-added, and no account exists for it
	items := importedList(t, e, admin, "?q=Zqxv")["items"].([]any)
	if len(items) != 1 || items[0].(map[string]any)["source"] != "manual" || items[0].(map[string]any)["phone"] != "01712345678" {
		t.Fatalf("listing: %v", items)
	}
	if _, after, _ := e.mem.ListUsers(context.Background(), "", "", 1, 0); after != usersBefore {
		t.Fatalf("adding an imported record must not create accounts (%d -> %d)", usersBefore, after)
	}
	// edit, verify, link-free; bundled records stay read-only
	good["name"] = "Zqxv Uddin Ahmed"
	if rec := e.do("PATCH", "/api/v1/admin/imported-students/"+made.ID, good, admin); rec.Code != 200 {
		t.Fatalf("edit: %d %s", rec.Code, rec.Body)
	}
	if rec := e.do("PATCH", "/api/v1/admin/imported-students/"+e.app.Store.Students[0].ID, good, admin); rec.Code != 409 {
		t.Fatalf("bundled records are read-only: %d", rec.Code)
	}
	if rec := e.do("POST", "/api/v1/admin/imported-students/"+made.ID+"/verify", map[string]string{}, admin); rec.Code != 200 {
		t.Fatalf("verify manual: %d", rec.Code)
	}
	if v := importedList(t, e, admin, "?status=verified")["total"].(float64); v != 1 {
		t.Fatalf("verified: %v", v)
	}
	if rec := e.do("POST", "/api/v1/admin/imported-students/"+e.app.Store.Students[0].ID+"/delete", map[string]string{}, admin); rec.Code != 409 {
		t.Fatalf("bundled records cannot be deleted: %d", rec.Code)
	}
	if rec := e.do("POST", "/api/v1/admin/imported-students/"+made.ID+"/delete", map[string]string{}, admin); rec.Code != 200 {
		t.Fatalf("delete: %d", rec.Code)
	}
	if v := importedList(t, e, admin, "?status=verified")["total"].(float64); v != 0 {
		t.Fatalf("a deleted record must take its verification with it: %v", v)
	}
	if rec := e.do("POST", "/api/v1/admin/imported-students/"+made.ID+"/delete", map[string]string{}, admin); rec.Code != 404 {
		t.Fatalf("second delete: %d", rec.Code)
	}
}

func manualStoreSuite(t *testing.T, s AuthStore) {
	ctx := context.Background()
	batch := 14
	r, err := s.CreateManualImported(ctx, "", ManualImportedInput{Name: "Store Person", Batch: &batch, Department: "Finance", Phone: "01712345678"})
	if err != nil || !strings.HasPrefix(r.ID, "i-") {
		t.Fatalf("create: %+v %v", r, err)
	}
	rows, _ := s.ListManualImported(ctx)
	found := false
	for _, x := range rows {
		found = found || x.ID == r.ID
	}
	if !found {
		t.Fatal("not listed")
	}
	if u, err := s.UpdateManualImported(ctx, r.ID, ManualImportedInput{Name: "Store Person Two", Batch: &batch, Department: "Finance"}); err != nil || u.Name != "Store Person Two" || u.Phone != "" {
		t.Fatalf("update: %+v %v", u, err)
	}
	if err := s.VerifyImported(ctx, "", r.ID, ""); err != nil {
		t.Fatal(err)
	}
	if err := s.DeleteManualImported(ctx, r.ID); err != nil {
		t.Fatal(err)
	}
	if rv, _ := s.ImportedReviews(ctx); rv[r.ID].ImportedID != "" {
		t.Fatal("review row outlived its record")
	}
	if err := s.DeleteManualImported(ctx, r.ID); err != ErrNotFound {
		t.Fatalf("second delete: %v", err)
	}
	if _, err := s.UpdateManualImported(ctx, "i-not-a-uuid", ManualImportedInput{Name: "X Y"}); err != ErrNotFound {
		t.Fatalf("bad id: %v", err)
	}
}

func TestMemManualImportedStoreSuite(t *testing.T) { manualStoreSuite(t, newMemStore()) }
