package main

import (
	"context"
	"net/http"
	"reflect"
	"strings"
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

func TestDirectoryStartsUnverifiedAndVerificationPersists(t *testing.T) {
	e := authApp(t)
	if len(e.app.Store.Students) < 3 {
		t.Skip("needs the directory data")
	}
	s1 := e.app.Store.Students[0]
	member := e.member(t, "plain1@example.com")
	admin := e.admin(t)
	ctx := context.Background()

	for _, ck := range []*http.Cookie{nil, member} {
		if rec := e.do("POST", "/api/v1/admin/imported-students/"+s1.ID+"/verify", map[string]string{}, ck); rec.Code != 401 && rec.Code != 403 {
			t.Fatalf("non-admin verify: %d", rec.Code)
		}
		if rec := e.do("GET", "/api/v1/admin/export/imported", nil, ck); rec.Code != 401 && rec.Code != 403 {
			t.Fatalf("non-admin export: %d", rec.Code)
		}
	}
	// every existing record starts in the queue; none is verified until an admin does it
	counts := importedList(t, e, admin, "")["counts"].(map[string]any)
	if counts["verified"].(float64) != 0 || int(counts["awaiting"].(float64)) != len(e.app.Store.Students) {
		t.Fatalf("initial state: %v", counts)
	}
	_, usersBefore, _ := e.mem.ListUsers(ctx, "", "", 1, 0)
	mid := ""
	rows, _, _ := e.mem.ListMembersAdmin(ctx, MemberQuery{Page: 1, Limit: 10})
	for _, r := range rows {
		mid = r.ID
	}
	pre, _ := e.mem.MemberAdmin(ctx, mid)

	if rec := e.do("POST", "/api/v1/admin/imported-students/"+s1.ID+"/verify", map[string]string{}, admin); rec.Code != 422 || !strings.Contains(rec.Body.String(), "email_required") {
		t.Fatalf("verifying without an email must be refused: %d %s", rec.Code, rec.Body)
	}
	if rec := setEmail(e, admin, s1.ID, "verified.person@example.org"); rec.Code != 200 {
		t.Fatalf("save email: %d", rec.Code)
	}
	for i := 0; i < 2; i++ { // idempotent
		if rec := e.do("POST", "/api/v1/admin/imported-students/"+s1.ID+"/verify", map[string]string{}, admin); rec.Code != 200 {
			t.Fatalf("verify: %d %s", rec.Code, rec.Body)
		}
	}
	list := importedList(t, e, admin, "?status=verified")
	items := list["items"].([]any)
	first := items[0].(map[string]any)
	if len(items) != 1 || first["id"] != s1.ID || first["verified"] != true || first["verifiedBy"] == "" || first["verifiedAt"] == "" {
		t.Fatalf("verified view: %v", list)
	}
	if got := importedList(t, e, admin, "?status=awaiting")["total"].(float64); int(got) != len(e.app.Store.Students)-1 {
		t.Fatalf("needs-verification view: %v", got)
	}
	if got := importedList(t, e, admin, "")["total"].(float64); int(got) != len(e.app.Store.Students) {
		t.Fatalf("All must keep every record: %v", got)
	}
	// verifying a directory record touches no account, approval or email state
	post, _ := e.mem.MemberAdmin(ctx, mid)
	if _, after, _ := e.mem.ListUsers(ctx, "", "", 1, 0); after != usersBefore || !reflect.DeepEqual(pre, post) {
		t.Fatalf("directory verification must not change accounts: users %d->%d, %+v -> %+v", usersBefore, after, pre, post)
	}
	// and the reverse: approving a membership does not verify any directory record
	e.approve(t, mid)
	if got := importedList(t, e, admin, "?status=verified")["total"].(float64); got != 1 {
		t.Fatalf("membership approval must not verify directory records: %v", got)
	}
	// the approved member, who has no directory record, is listed under All as a registered member
	all := importedList(t, e, admin, "")
	if int(all["total"].(float64)) != len(e.app.Store.Students)+1 || all["counts"].(map[string]any)["registered"].(float64) != 1 {
		t.Fatalf("All lists every student, registered members included: %v %v", all["total"], all["counts"])
	}
	if rec := e.do("POST", "/api/v1/admin/imported-students/does-not-exist/verify", map[string]string{}, admin); rec.Code != 404 {
		t.Fatalf("unknown record: %d", rec.Code)
	}
	if rec := e.do("POST", "/api/v1/admin/imported-students/"+s1.ID+"/unverify", map[string]string{}, admin); rec.Code != 200 {
		t.Fatalf("unverify: %d", rec.Code)
	}
	if got := importedList(t, e, admin, "?status=verified")["total"].(float64); got != 0 {
		t.Fatalf("still verified: %v", got)
	}
}

func TestDirectoryExportFollowsFiltersAndIsSafe(t *testing.T) {
	e := authApp(t)
	if len(e.app.Store.Students) < 3 {
		t.Skip("needs the directory data")
	}
	admin := e.admin(t)
	s1 := e.app.Store.Students[0]
	setEmail(e, admin, s1.ID, "export.person@example.org")
	e.do("POST", "/api/v1/admin/imported-students/"+s1.ID+"/verify", map[string]string{}, admin)
	// a hand-added record with a spreadsheet-formula name, and phone/notes that must not be exported
	e.do("POST", "/api/v1/admin/imported-students", map[string]any{"name": "=SUM(A1) Evil", "batch": 5, "department": e.app.Store.Depts[0], "phone": "01712345678", "note": "private note"}, admin)
	csvOf := func(q string) string {
		rec := e.do("GET", "/api/v1/admin/export/imported"+q, nil, admin)
		if rec.Code != 200 || !strings.HasPrefix(rec.Header().Get("Content-Type"), "text/csv") {
			t.Fatalf("export: %d %s", rec.Code, rec.Header().Get("Content-Type"))
		}
		return rec.Body.String()
	}
	lines := func(s string) int { return len(strings.Split(strings.TrimSpace(s), "\n")) - 1 }
	all := csvOf("")
	if !strings.HasPrefix(all, "\xEF\xBB\xBF") || lines(all) != len(e.app.Store.Students)+1 {
		t.Fatalf("unfiltered export has %d rows, want %d", lines(all), len(e.app.Store.Students)+1)
	}
	if v := csvOf("?status=verified"); lines(v) != 1 || !strings.Contains(v, s1.Name) || !strings.Contains(v, "verified") {
		t.Fatalf("verified export: %q", v)
	}
	if w := csvOf("?status=awaiting"); lines(w) != len(e.app.Store.Students) || strings.Contains(w, ",verified,") {
		t.Fatalf("needs-verification export wrong")
	}
	if strings.Contains(all, "01712345678") || strings.Contains(all, "private note") || strings.Contains(all, "\n=SUM") || !strings.Contains(all, "'=SUM(A1) Evil") {
		t.Fatalf("export leaks private fields or allows formulas")
	}
}

func importedStoreSuite(t *testing.T, s AuthStore) {
	ctx := context.Background()
	admin, err := s.CreateUser(ctx, NewUser{Email: "imp-admin@example.com", PasswordHash: "h", Role: RoleAdmin, Verified: true})
	if err != nil {
		t.Fatal(err)
	}
	if err := s.VerifyImported(ctx, admin.ID, "imp-1"); err != nil {
		t.Fatal(err)
	}
	first, _ := s.ImportedReviews(ctx)
	if err := s.VerifyImported(ctx, admin.ID, "imp-1"); err != nil { // idempotent, keeps the first time
		t.Fatal(err)
	}
	rv, err := s.ImportedReviews(ctx)
	if err != nil || rv["imp-1"].VerifiedAt == "" || rv["imp-1"].VerifiedAt != first["imp-1"].VerifiedAt || rv["imp-2"].ImportedID != "" {
		t.Fatalf("reviews: %+v %v", rv, err)
	}
	if err := s.UnverifyImported(ctx, admin.ID, "imp-1"); err != nil {
		t.Fatal(err)
	}
	if rv, _ = s.ImportedReviews(ctx); rv["imp-1"].ImportedID != "" {
		t.Fatal("still verified")
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
		"no department":   {"name": "Zqxv Uddin", "batch": 12, "department": ""},
		"fake department": {"name": "Zqxv Uddin", "batch": 12, "department": "Astrology"},
		"short name":      {"name": "R", "batch": 12, "department": dept},
		"no batch":        {"name": "Zqxv Uddin", "department": dept},
		"bad phone":       {"name": "Zqxv Uddin", "batch": 12, "department": dept, "phone": "123"},
		"bad session":     {"name": "Zqxv Uddin", "batch": 12, "department": dept, "session": "next year"},
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
	// a bundled record stays a file, but the admin can complete its details; the edit shows in the directory
	fid := e.app.Store.Students[0].ID
	if rec := e.do("PATCH", "/api/v1/admin/imported-students/"+fid, good, admin); rec.Code != 200 {
		t.Fatalf("completing a bundled record: %d %s", rec.Code, rec.Body)
	}
	if lst := importedList(t, e, admin, "?q=Zqxv"); len(lst["items"].([]any)) < 1 {
		t.Fatal("the completed details must show in the directory")
	}
	setEmail(e, admin, made.ID, "manual.person@example.org")
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
	if err := s.VerifyImported(ctx, "", r.ID); err != nil {
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

func TestDashboardCountsContactAndImportedFromTheDatabase(t *testing.T) {
	t.Setenv("CONTACT_RECIPIENT_EMAIL", "")
	e := authApp(t)
	admin := e.admin(t)
	get := func() map[string]any {
		rec := e.do("GET", "/api/v1/admin/dashboard", nil, admin)
		if rec.Code != 200 {
			t.Fatalf("dashboard: %d %s", rec.Code, rec.Body)
		}
		var d map[string]any
		decodeBody(t, rec, &d)
		return d
	}
	d := get()
	if d["messages"].(map[string]any)["new"].(float64) != 0 {
		t.Fatalf("no messages yet: %v", d["messages"])
	}
	e.do("POST", "/api/v1/contact", goodContact, nil)
	e.do("POST", "/api/v1/admin/imported-students", map[string]any{"name": "Dash Person", "batch": 3, "department": e.app.Store.Depts[0]}, admin)
	setEmail(e, admin, e.app.Store.Students[0].ID, "dash.person@example.org")
	e.do("POST", "/api/v1/admin/imported-students/"+e.app.Store.Students[0].ID+"/verify", map[string]string{}, admin)
	d = get()
	imp := d["imported"].(map[string]any)
	if d["messages"].(map[string]any)["new"].(float64) != 1 || imp["addedByAdmins"].(float64) != 1 || imp["verified"].(float64) != 1 ||
		imp["total"].(float64) != float64(len(e.app.Store.Students)+1) || imp["awaiting"].(float64) != imp["total"].(float64)-1 {
		t.Fatalf("dashboard numbers: %v %v", d["messages"], imp)
	}
	if _, ok := d["members"].(map[string]any)["incomplete"]; !ok {
		t.Fatal("incomplete profiles count missing")
	}
}
