package main

import (
	"fmt"
	"context"
	"net/http"
	"strings"
	"testing"
)

func memberList(t *testing.T, e *env2, ck *http.Cookie, q string) (ids map[string]bool, total int) {
	t.Helper()
	rec := e.do("GET", "/api/v1/admin/students"+q, nil, ck)
	if rec.Code != 200 {
		t.Fatalf("list %s: %d %s", q, rec.Code, rec.Body)
	}
	var out struct {
		Items []MemberAdminRow
		Total int
	}
	decodeBody(t, rec, &out)
	ids = map[string]bool{}
	for _, r := range out.Items {
		ids[r.ID] = true
	}
	return ids, out.Total
}

func newMember(t *testing.T, e *env2, email, name, session string, verified bool) string {
	t.Helper()
	u, err := e.mem.CreateUser(context.Background(), NewUser{Email: email, PasswordHash: "h", Role: RoleMember, Verified: verified,
		Profile: &Profile{Name: name, Batch: 17, Department: "Finance", Upazila: "kasba", Union: "Kuti", Session: session}})
	if err != nil {
		t.Fatal(err)
	}
	return u.ID
}

func TestMembershipRequestsAndMembersViews(t *testing.T) {
	e := authApp(t)
	admin := e.admin(t)
	regular := e.member(t, "registered@example.com") // goes through real registration

	// a new registration is one account with one pending request, listed in Requests and in Members, All
	var regID string
	all, _ := memberList(t, e, admin, "")
	for id := range all {
		regID = id
	}
	if pend, n := memberList(t, e, admin, "?status=pending"); n != 1 || !pend[regID] {
		t.Fatalf("new registration must be pending: %d", n)
	}
	if got, _ := e.mem.MemberAdmin(context.Background(), regID); got.Status != StatusPending || got.Session != "2020-21" || !got.Complete {
		t.Fatalf("registered profile: %+v", got)
	}

	incomplete := newMember(t, e, "inc@example.com", "Incomplete Person", "", true) // legacy-style profile without a session
	unverified := newMember(t, e, "unv@example.com", "Unverified Person", "2019-20", false)
	e.approve(t, unverified) // approved, but the email is not confirmed
	ok := newMember(t, e, "ok@example.com", "Verified Person", "2019-20", true)
	e.approve(t, ok)
	rejected := newMember(t, e, "rej@example.com", "Rejected Person", "2019-20", true)
	if rec := e.do("POST", "/api/v1/admin/students/"+rejected+"/reject", map[string]string{"reason": "Not a student of the university"}, admin); rec.Code != 200 {
		t.Fatalf("reject: %d %s", rec.Code, rec.Body)
	}

	// Membership Requests: pending only, split by completeness; the two halves add up to the whole queue
	pending, np := memberList(t, e, admin, "?status=pending")
	pc, npc := memberList(t, e, admin, "?status=pending&complete=yes")
	pi, npi := memberList(t, e, admin, "?status=pending&complete=no")
	if npc+npi != np || !pending[incomplete] || !pi[incomplete] || pc[incomplete] || !pc[regID] || pending[ok] || pending[rejected] {
		t.Fatalf("requests views: all %d complete %d incomplete %d", np, npc, npi)
	}
	// Members, All keeps everyone, including the decided ones
	if _, n := memberList(t, e, admin, ""); n != 5 {
		t.Fatalf("members all: %d", n)
	}
	// Verified = approved AND email confirmed; approval alone never makes it verified
	ver, _ := memberList(t, e, admin, "?view=verified")
	if !ver[ok] || ver[unverified] || ver[regID] || ver[rejected] || len(ver) != 1 {
		t.Fatalf("verified view: %v", ver)
	}
	// Needs review: pending, approved-but-unverified and incomplete; not the verified, not the rejected
	rev, _ := memberList(t, e, admin, "?view=review")
	if !rev[unverified] || !rev[incomplete] || !rev[regID] || rev[ok] || rev[rejected] {
		t.Fatalf("review view: %v", rev)
	}
	if rec := e.do("GET", "/api/v1/admin/students?view=bogus", nil, admin); rec.Code != 400 {
		t.Fatalf("unknown view: %d", rec.Code)
	}

	// completing the missing field moves the request from Incomplete to Complete
	if rec := e.do("PATCH", "/api/v1/admin/students/"+incomplete, map[string]any{"session": "2018-19", "gender": "female"}, admin); rec.Code != 200 {
		t.Fatalf("admin edit: %d %s", rec.Code, rec.Body)
	}
	if pc, _ = memberList(t, e, admin, "?status=pending&complete=yes"); !pc[incomplete] {
		t.Fatal("completed profile should join the complete requests")
	}
	if pi, _ = memberList(t, e, admin, "?status=pending&complete=no"); pi[incomplete] {
		t.Fatal("completed profile should leave the incomplete requests")
	}
	if rec := e.do("PATCH", "/api/v1/admin/students/"+incomplete, map[string]any{"session": "soon", "gender": "x"}, admin); rec.Code != 422 {
		t.Fatalf("bad values must be refused: %d", rec.Code)
	}

	// approving removes the request from the queue, keeps the member, and does not verify the email
	if rec := e.do("POST", "/api/v1/admin/students/"+incomplete+"/approve", map[string]string{}, admin); rec.Code != 200 {
		t.Fatalf("approve: %d", rec.Code)
	}
	if pending, _ = memberList(t, e, admin, "?status=pending"); pending[incomplete] {
		t.Fatal("an approved member must leave the queue")
	}
	if _, n := memberList(t, e, admin, ""); n != 5 {
		t.Fatalf("approval must not remove anyone from Members: %d", n)
	}
	row, _ := e.mem.MemberAdmin(context.Background(), unverified)
	if row.EmailVerified {
		t.Fatal("membership approval must not confirm an email address")
	}
	// the decision trail: reviewer, time and the rejection reason are kept and shown to admins
	rj, _ := e.mem.MemberAdmin(context.Background(), rejected)
	if rj.Status != StatusRejected || rj.ReviewNote != "Not a student of the university" || rj.ReviewedAt == "" || rj.ReviewedBy == "" {
		t.Fatalf("rejection not recorded: %+v", rj)
	}
	hist := e.do("GET", "/api/v1/admin/students/"+rejected+"/history", nil, admin)
	if hist.Code != 200 || !strings.Contains(hist.Body.String(), "member.rejected") || !strings.Contains(hist.Body.String(), "Not a student") {
		t.Fatalf("history: %d %s", hist.Code, hist.Body)
	}
	if rec := e.do("POST", "/api/v1/admin/students/"+ok+"/reject", map[string]string{"reason": strings.Repeat("x", 400)}, admin); rec.Code != 422 {
		t.Fatalf("over-long reason: %d", rec.Code)
	}

	// counts match the lists; only admins may read them
	var c map[string]float64
	decodeBody(t, e.do("GET", "/api/v1/admin/student-counts", nil, admin), &c)
	_, nv := memberList(t, e, admin, "?view=verified")
	_, nr := memberList(t, e, admin, "?view=review")
	_, np2 := memberList(t, e, admin, "?status=pending")
	if int(c["verified"]) != nv || int(c["review"]) != nr || int(c["pending"]) != np2 || int(c["all"]) != 5 || c["pendingComplete"]+c["pendingIncomplete"] != c["pending"] {
		t.Fatalf("counts: %v", c)
	}
	for _, ck := range []*http.Cookie{nil, regular} {
		if rec := e.do("GET", "/api/v1/admin/student-counts", nil, ck); rec.Code != 401 && rec.Code != 403 {
			t.Fatalf("counts must be admin-only: %d", rec.Code)
		}
	}
}

// Session, union and gender are optional at registration: blank is accepted and stored blank, a malformed value is refused.
func TestRegistrationKeepsSessionUnionAndGenderOptional(t *testing.T) {
	e := authApp(t)
	bare := validReg("bare@example.com")
	delete(bare, "session")
	delete(bare, "union")
	if rec := e.do("POST", "/api/v1/auth/register", bare, nil); rec.Code != 201 {
		t.Fatalf("session and union are optional: %d %s", rec.Code, rec.Body)
	}
	bu, _ := e.mem.UserByEmail(context.Background(), "bare@example.com")
	if bp, _ := e.mem.ProfileByUser(context.Background(), bu.ID); bp.Session != "" || bp.Union != "" || bp.Upazila == "" {
		t.Fatalf("blank optional fields are stored blank, required ones kept: %+v", bp)
	}
	bad := validReg("badsession@example.com")
	bad["session"] = "twenty-twenty"
	if rec := e.do("POST", "/api/v1/auth/register", bad, nil); rec.Code != 422 || !strings.Contains(rec.Body.String(), "session") {
		t.Fatalf("a malformed session is refused: %d %s", rec.Code, rec.Body)
	}
	bad = validReg("badunion@example.com")
	bad["union"] = "Not A Union"
	if rec := e.do("POST", "/api/v1/auth/register", bad, nil); rec.Code != 422 || !strings.Contains(rec.Body.String(), "union") {
		t.Fatalf("a union outside the upazila is refused: %d %s", rec.Code, rec.Body)
	}
	// what the directory and the membership review need stays required (checked directly: sign-ups are rate-limited)
	errs := e.app.validateProfile(&registerReq{}, true)
	for _, field := range []string{"name", "batch", "department", "upazila"} {
		if errs[field] == "" {
			t.Fatalf("%s stays required: %v", field, errs)
		}
	}
	for _, field := range []string{"session", "union", "gender", "bloodGroup"} {
		if errs[field] != "" {
			t.Fatalf("%s is optional: %v", field, errs)
		}
	}
	bad = validReg("badgender@example.com")
	bad["gender"] = "robot"
	if rec := e.do("POST", "/api/v1/auth/register", bad, nil); rec.Code != 422 {
		t.Fatalf("gender must be a known value: %d", rec.Code)
	}
	good := validReg("optional@example.com")
	good["bloodGroup"] = "O+"
	if rec := e.do("POST", "/api/v1/auth/register", good, nil); rec.Code != 201 {
		t.Fatalf("register: %d %s", rec.Code, rec.Body)
	}
	u, _ := e.mem.UserByEmail(context.Background(), "optional@example.com")
	p, _ := e.mem.ProfileByUser(context.Background(), u.ID)
	if p.Gender != "" || p.BloodGroup != "O+" || p.Status != StatusPending {
		t.Fatalf("gender stays unspecified unless given, blood group is kept, status pending: %+v", p)
	}
}

func TestDirectoryAuditReportsUnresolvedRecordsWithoutCreatingAccounts(t *testing.T) {
	e := authApp(t)
	admin := e.admin(t)
	_, before, _ := e.mem.ListUsers(context.Background(), "", "", 1, 0)
	rec := e.do("GET", "/api/v1/admin/directory-audit", nil, admin)
	if rec.Code != 200 {
		t.Fatalf("audit: %d", rec.Code)
	}
	var a map[string]any
	decodeBody(t, rec, &a)
	if a["provisionable"].(float64) != 0 || a["unresolved"].(float64) != float64(len(e.app.Store.Students)) || a["reason"] != "no_identifier" {
		t.Fatalf("audit: %v", a)
	}
	if _, after, _ := e.mem.ListUsers(context.Background(), "", "", 1, 0); after != before {
		t.Fatal("the audit must not create accounts")
	}
	if rec := e.do("GET", "/api/v1/admin/directory-audit", nil, nil); rec.Code != 401 {
		t.Fatalf("anonymous: %d", rec.Code)
	}
}

// memberViewsSuite runs the view rules against any store (the PostgreSQL run uses temporary tables only).
func memberViewsSuite(t *testing.T, s AuthStore) {
	ctx := context.Background()
	mk := func(email, session string, verified bool) User {
		u, err := s.CreateUser(ctx, NewUser{Email: email, PasswordHash: "h", Role: RoleMember, Verified: verified,
			Profile: &Profile{Name: "View " + email, Batch: 17, Department: "Finance", Upazila: "kasba", Union: "Kuti", Session: session, Gender: "female"}})
		if err != nil {
			t.Fatal(err)
		}
		return u
	}
	admin, err := s.CreateUser(ctx, NewUser{Email: "views-admin@example.com", PasswordHash: "h", Role: RoleAdmin, Verified: true})
	if err != nil {
		t.Fatal(err)
	}
	has := func(q MemberQuery, id string) bool {
		q.Page, q.Limit = 1, 100
		rows, _, err := s.ListMembersAdmin(ctx, q)
		if err != nil {
			t.Fatal(err)
		}
		for _, r := range rows {
			if r.ID == id {
				return true
			}
		}
		return false
	}
	pendingOK := mk("views-a@example.com", "2020-21", true)
	pendingInc := mk("views-b@example.com", "", true)
	approvedUnv := mk("views-c@example.com", "2020-21", false)
	approvedOK := mk("views-d@example.com", "2020-21", true)
	rejected := mk("views-e@example.com", "2020-21", true)
	for _, id := range []string{approvedUnv.ID, approvedOK.ID} {
		if err := s.ReviewMember(ctx, admin.ID, id, StatusApproved); err != nil {
			t.Fatal(err)
		}
	}
	if err := s.ReviewMember(ctx, admin.ID, rejected.ID, StatusRejected, "Duplicate application"); err != nil {
		t.Fatal(err)
	}
	checks := []struct {
		name string
		q    MemberQuery
		id   string
		want bool
	}{
		{"complete pending request", MemberQuery{Status: StatusPending, Complete: "yes"}, pendingOK.ID, true},
		{"incomplete pending request", MemberQuery{Status: StatusPending, Complete: "no"}, pendingInc.ID, true},
		{"incomplete is not in complete", MemberQuery{Status: StatusPending, Complete: "yes"}, pendingInc.ID, false},
		{"approved leaves the queue", MemberQuery{Status: StatusPending}, approvedOK.ID, false},
		{"verified needs approval and email", MemberQuery{View: "verified"}, approvedOK.ID, true},
		{"approved without email is not verified", MemberQuery{View: "verified"}, approvedUnv.ID, false},
		{"pending is not verified", MemberQuery{View: "verified"}, pendingOK.ID, false},
		{"approved without email needs review", MemberQuery{View: "review"}, approvedUnv.ID, true},
		{"pending needs review", MemberQuery{View: "review"}, pendingOK.ID, true},
		{"incomplete needs review", MemberQuery{View: "review"}, pendingInc.ID, true},
		{"verified does not need review", MemberQuery{View: "review"}, approvedOK.ID, false},
		{"rejected is not queued", MemberQuery{View: "review"}, rejected.ID, false},
		{"rejected stays in All", MemberQuery{}, rejected.ID, true},
	}
	for _, c := range checks {
		if got := has(c.q, c.id); got != c.want {
			t.Errorf("%s: got %v want %v", c.name, got, c.want)
		}
	}
	row, err := s.MemberAdmin(ctx, rejected.ID)
	if err != nil || row.ReviewNote != "Duplicate application" || row.ReviewedAt == "" || row.ReviewedBy == "" || row.Gender != "female" {
		t.Fatalf("decision trail: %+v %v", row, err)
	}
	if r, _ := s.MemberAdmin(ctx, approvedUnv.ID); r.EmailVerified || len(r.Missing) != 0 {
		t.Fatalf("approval must not verify the email: %+v", r)
	}
	if r, _ := s.MemberAdmin(ctx, pendingInc.ID); len(r.Missing) != 1 || r.Missing[0] != "session" || r.Complete {
		t.Fatalf("missing fields: %+v", r)
	}
	hist, err := s.MemberHistory(ctx, rejected.ID)
	if err != nil || len(hist) == 0 || hist[0].Action != "member.rejected" {
		t.Fatalf("history: %+v %v", hist, err)
	}
	sess, gender := "2019-20", "other"
	if r, err := s.UpdateMemberAdmin(ctx, admin.ID, pendingInc.ID, MemberPatch{Session: &sess, Gender: &gender}); err != nil || !r.Complete || r.Gender != "other" {
		t.Fatalf("edit: %+v %v", r, err)
	}
}

func TestMemMemberViewsSuite(t *testing.T) { memberViewsSuite(t, newMemStore()) }

// A batch that already counts as alumni must say what the person does now and where; a later batch need not.
func TestRegistrationAsksAlumniBatchesForTheirWork(t *testing.T) {
	e := authApp(t)
	cur := e.app.data()
	next := *cur
	next.AlumniUpTo = 15
	swap := func(s *Store) { e.app.dataMu.Lock(); e.app.Store = s; e.app.dataMu.Unlock() }
	swap(&next)
	t.Cleanup(func() { swap(cur) })
	alum := registerReq{Batch: 12}
	errs := e.app.validateProfile(&alum, true)
	if errs["occupation"] == "" || errs["workplace"] == "" {
		t.Fatalf("batch 12 (alumni) must be asked for profession and workplace, got %v", errs)
	}
	alum = registerReq{Batch: 12, Occupation: "  Lecturer ", Workplace: "Dhaka   College"}
	errs = e.app.validateProfile(&alum, true)
	if errs["occupation"] != "" || errs["workplace"] != "" || alum.Occupation != "Lecturer" || alum.Workplace != "Dhaka College" {
		t.Fatalf("given work must pass and be tidied: %v %q %q", errs, alum.Occupation, alum.Workplace)
	}
	student := registerReq{Batch: 18}
	if errs := e.app.validateProfile(&student, true); errs["occupation"] != "" || errs["workplace"] != "" {
		t.Fatalf("batch 18 (a current student) must not be asked for work: %v", errs)
	}
	change := registerReq{Batch: 12}
	if errs := e.app.validateProfile(&change, false); errs["occupation"] != "" || errs["workplace"] != "" {
		t.Fatalf("a change request does not carry work details and must not be asked: %v", errs)
	}
}

// A new member shows up in the right list, under the right batch, with the details their batch needs.
func TestNewMembersAppearBatchWiseOnceApproved(t *testing.T) {
	e := authApp(t)
	ctx := context.Background()
	cur := e.app.data()
	next := *cur
	next.AlumniUpTo = 15
	swap := func(s *Store) { e.app.dataMu.Lock(); e.app.Store = s; e.app.dataMu.Unlock() }
	swap(&next)
	t.Cleanup(func() { swap(cur) })
	admin := e.admin(t)

	register := func(email, name string, batch int, extra map[string]any) string {
		t.Helper()
		body := validReg(email)
		body["name"], body["batch"] = name, batch
		for k, v := range extra {
			body[k] = v
		}
		if rec := e.do("POST", "/api/v1/auth/register", body, nil); rec.Code != 201 {
			t.Fatalf("register %s: %d %s", name, rec.Code, rec.Body)
		}
		if rec := e.do("POST", "/api/v1/auth/verify-email", map[string]string{"token": tokenIn(t, e.mail.last())}, nil); rec.Code != 200 {
			t.Fatalf("verify %s: %d", name, rec.Code)
		}
		e.mem.mu.Lock()
		id := e.mem.byEmail[email]
		e.mem.mu.Unlock()
		if id == "" {
			t.Fatalf("%s not found after registering", name)
		}
		return id
	}
	approve := func(id string) {
		t.Helper()
		if err := e.mem.ReviewMember(ctx, "", id, StatusApproved); err != nil {
			t.Fatal(err)
		}
	}
	names := func(path string) map[string]map[string]any { // name -> the person's row, over every page
		m := map[string]map[string]any{}
		for pg := 1; ; pg++ {
			var out struct {
				Items []map[string]any
				Pages int
			}
			decodeBody(t, e.do("GET", fmt.Sprintf("%s?limit=40&page=%d", path, pg), nil, nil), &out)
			for _, it := range out.Items {
				m[it["name"].(string)] = it
			}
			if pg >= out.Pages {
				return m
			}
		}
	}

	// an alumni batch must give profession and workplace, and lands on the Alumni page under its batch
	bad := validReg("noword@example.com")
	bad["batch"] = 12
	if rec := e.do("POST", "/api/v1/auth/register", bad, nil); rec.Code != 422 {
		t.Fatalf("batch 12 without work details must be refused, got %d", rec.Code)
	}
	alum := register("alum@example.com", "Qvx Alumnus", 12, map[string]any{"occupation": "Lecturer", "workplace": "Dhaka College"})
	stud := register("stud@example.com", "Qvx Student", 21, nil)
	register("pending@example.com", "Qvx Pending", 20, nil)

	if _, ok := names("/api/v1/alumni")["Qvx Alumnus"]; ok {
		t.Fatal("a member who is not approved yet must not be listed")
	}
	approve(alum)
	approve(stud)

	a := names("/api/v1/alumni")
	row, ok := a["Qvx Alumnus"]
	if !ok {
		t.Fatal("the approved alumni-batch member must be on the Alumni page")
	}
	// the public list says who and which batch; what someone does and where is for signed-in members (see TestAlumniWorkDetailsAreForSignedInMembers)
	if row["batch"].(float64) != 12 || row["occupation"] != "" || row["workplace"] != "" {
		t.Fatalf("the public alumni row must carry the batch and no work details: %v", row)
	}
	if _, ok := names("/api/v1/students")["Qvx Alumnus"]; ok {
		t.Fatal("an alumni-batch member must not be on the Students page")
	}

	s := names("/api/v1/students")
	if _, ok := s["Qvx Student"]; !ok {
		t.Fatal("the approved student must be on the Students page")
	}
	if _, ok := s["Qvx Pending"]; ok {
		t.Fatal("the member who was not approved must not be listed")
	}
	if _, ok := names("/api/v1/alumni")["Qvx Student"]; ok {
		t.Fatal("a student must not be on the Alumni page")
	}

	// the list is ordered batch by batch, the senior batch first, and the batch's session is given
	var list struct {
		Items  []map[string]any
		Facets struct {
			Batches       map[string]int
			BatchSessions map[string]string
		}
	}
	decodeBody(t, e.do("GET", "/api/v1/students?limit=40", nil, nil), &list)
	prev := -1.0
	for _, it := range list.Items {
		if b, _ := it["batch"].(float64); b < prev {
			t.Fatalf("students are not ordered batch by batch: %v after %v", b, prev)
		} else {
			prev = b
		}
	}
	if list.Facets.Batches["21"] < 1 || list.Facets.BatchSessions["21"] == "" {
		t.Fatalf("batch 21 must be counted and carry its session: %v %v", list.Facets.Batches, list.Facets.BatchSessions)
	}
	// an admin adds a directory record by hand: it is listed under its batch too
	up := e.app.Store.Upazilas[0]
	rec := e.do("POST", "/api/v1/admin/imported-students", map[string]any{"name": "Qvx Added", "batch": 19, "department": e.app.Store.Depts[0], "upazila": up.Slug}, admin)
	if rec.Code != 201 && rec.Code != 200 {
		t.Fatalf("admin add: %d %s", rec.Code, rec.Body)
	}
	if row, ok := names("/api/v1/students")["Qvx Added"]; !ok || row["batch"].(float64) != 19 {
		t.Fatalf("a record added by an admin must be listed under its batch: %v", row)
	}
}
