package main

import (
	"context"
	"testing"
)

func profileChangeStoreSuite(t *testing.T, s AuthStore) {
	ctx := context.Background()
	admin, err := s.CreateUser(ctx, NewUser{Email: "pc-admin@example.com", PasswordHash: "h", Role: RoleAdmin, Verified: true})
	if err != nil {
		t.Fatal(err)
	}
	u, err := s.CreateUser(ctx, NewUser{Email: "pc-member@example.com", PasswordHash: "h", Role: RoleMember, Verified: true,
		Profile: &Profile{Name: "Change Person", Batch: 17, Department: "Finance", Upazila: "kasba", Union: "Kuti", Session: "2019-20"}})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.ProfileChangeFor(ctx, u.ID); err != ErrNotFound {
		t.Fatalf("no request yet: %v", err)
	}
	d := ProfileChangeData{Name: "Changed Person", Batch: 18, Department: "Law", Session: "2020-21", Upazila: "kasba", Union: "Kuti", Gender: "male"}
	if err := s.SubmitProfileChange(ctx, u.ID, d); err != nil {
		t.Fatal(err)
	}
	d.Name = "Changed Again" // a second submission replaces the first: one open request per member
	if err := s.SubmitProfileChange(ctx, u.ID, d); err != nil {
		t.Fatal(err)
	}
	if list, _ := s.ListProfileChanges(ctx); len(list) != 1 || list[0].Data.Name != "Changed Again" {
		t.Fatalf("list: %+v", list)
	}
	if err := s.ResolveProfileChange(ctx, admin.ID, u.ID, false); err != nil {
		t.Fatal(err)
	}
	if p, _ := s.ProfileByUser(ctx, u.ID); p.Name != "Change Person" || p.Batch != 17 {
		t.Fatalf("a rejected request must not change the profile: %+v", p)
	}
	if err := s.ResolveProfileChange(ctx, admin.ID, u.ID, true); err != ErrNotFound {
		t.Fatalf("resolving twice: %v", err)
	}
	if err := s.SubmitProfileChange(ctx, u.ID, d); err != nil {
		t.Fatal(err)
	}
	if err := s.ResolveProfileChange(ctx, admin.ID, u.ID, true); err != nil {
		t.Fatal(err)
	}
	if p, _ := s.ProfileByUser(ctx, u.ID); p.Name != "Changed Again" || p.Batch != 18 || p.Department != "Law" || p.Session != "2020-21" || p.Gender != "male" {
		t.Fatalf("an approved request must apply: %+v", p)
	}
	if _, err := s.ProfileChangeFor(ctx, u.ID); err != ErrNotFound {
		t.Fatalf("request must be gone: %v", err)
	}
}

func TestProfileChangeStoreMemory(t *testing.T) { profileChangeStoreSuite(t, newMemStore()) }

func TestProfileChangeRequestFlow(t *testing.T) {
	e := authApp(t)
	admin := e.admin(t)
	mc := e.member(t, "change@example.com")
	var id string
	all, _ := memberList(t, e, admin, "")
	for k := range all {
		id = k
	}
	body := validReg("change@example.com")
	body["name"], body["batch"] = "Renamed Member", 19

	// a member who is not approved yet edits directly; the request route is only for approved members
	if rec := e.do("POST", "/api/v1/me/profile/request", body, mc); rec.Code != 409 {
		t.Fatalf("pending member request: %d %s", rec.Code, rec.Body)
	}
	if err := e.mem.ReviewMember(context.Background(), "", id, StatusApproved); err != nil {
		t.Fatal(err)
	}
	same := validReg("change@example.com")
	if rec := e.do("POST", "/api/v1/me/profile/request", same, mc); rec.Code != 422 {
		t.Fatalf("identical details: %d %s", rec.Code, rec.Body)
	}
	if rec := e.do("POST", "/api/v1/me/profile/request", body, nil); rec.Code != 401 {
		t.Fatalf("anonymous: %d", rec.Code)
	}
	if rec := e.do("POST", "/api/v1/me/profile/request", body, mc); rec.Code != 201 {
		t.Fatalf("submit: %d %s", rec.Code, rec.Body)
	}
	var mine struct{ Request *ProfileChange }
	decodeBody(t, e.do("GET", "/api/v1/me/profile/request", nil, mc), &mine)
	if mine.Request == nil || mine.Request.Data.Name != "Renamed Member" {
		t.Fatalf("mine: %+v", mine.Request)
	}

	// the admin queue shows the update, with a diff, and the counts include it
	var q struct {
		Items []requestItem
		Total int
	}
	decodeBody(t, e.do("GET", "/api/v1/admin/membership-requests", nil, admin), &q)
	if q.Total != 1 || q.Items[0].Kind != "update" || q.Items[0].ID != id || len(q.Items[0].Diff) != 2 {
		t.Fatalf("queue: %+v", q)
	}
	var c map[string]int
	decodeBody(t, e.do("GET", "/api/v1/admin/student-counts", nil, admin), &c)
	if c["pending"] != 1 || c["pendingComplete"] != 1 || c["updates"] != 1 {
		t.Fatalf("counts: %v", c)
	}
	if rec := e.do("POST", "/api/v1/admin/profile-changes/"+id+"/approve", nil, mc); rec.Code != 403 {
		t.Fatalf("member approving: %d", rec.Code)
	}
	if rec := e.do("POST", "/api/v1/admin/profile-changes/"+id+"/approve", nil, admin); rec.Code != 200 {
		t.Fatalf("approve: %d %s", rec.Code, rec.Body)
	}
	if p, _ := e.mem.ProfileByUser(context.Background(), id); p.Name != "Renamed Member" || p.Batch != 19 || p.Status != StatusApproved {
		t.Fatalf("applied: %+v", p)
	}
	if rec := e.do("POST", "/api/v1/admin/profile-changes/"+id+"/approve", nil, admin); rec.Code != 404 {
		t.Fatalf("second approve: %d", rec.Code)
	}
	// withdraw
	body["name"] = "Another Name"
	e.do("POST", "/api/v1/me/profile/request", body, mc)
	if rec := e.do("DELETE", "/api/v1/me/profile/request", nil, mc); rec.Code != 200 {
		t.Fatalf("withdraw: %d", rec.Code)
	}
	decodeBody(t, e.do("GET", "/api/v1/admin/membership-requests", nil, admin), &q)
	if q.Total != 0 {
		t.Fatalf("withdrawn request must leave the queue: %d", q.Total)
	}
}

func TestVerifiedMemberMovesToANewEmail(t *testing.T) {
	e := authApp(t)
	admin := e.admin(t)
	ctx := context.Background()
	rec := e.app.Store.Students[0].ID
	oldID := newMember(t, e, "old@example.com", "Moving Person", "2019-20", true)

	counts := func() (all, awaiting, verified int) {
		var out struct {
			Counts map[string]int
		}
		decodeBody(t, e.do("GET", "/api/v1/admin/imported-students?limit=1", nil, admin), &out)
		return out.Counts["verified"] + out.Counts["awaiting"], out.Counts["awaiting"], out.Counts["verified"]
	}
	all0, aw0, v0 := counts()

	// the person activated an invitation and was approved: the record becomes verified by itself, the other counts follow
	if err := e.mem.SetInviteEmail(ctx, rec, "old@example.com"); err != nil {
		t.Fatal(err)
	}
	if err := e.mem.CompleteInvite(ctx, rec, oldID); err != nil {
		t.Fatal(err)
	}
	if _, aw, v := counts(); v != v0 || aw != aw0 {
		t.Fatalf("a pending member must not verify the record: awaiting %d verified %d", aw, v)
	}
	if rc := e.do("POST", "/api/v1/admin/students/"+oldID+"/approve", nil, admin); rc.Code != 200 {
		t.Fatalf("approve: %d", rc.Code)
	}
	if all, aw, v := counts(); all != all0 || aw != aw0-1 || v != v0+1 {
		t.Fatalf("after approval: all %d awaiting %d verified %d (was %d/%d/%d)", all, aw, v, all0, aw0, v0)
	}

	// the admin moves the verified person to a new address; the record stays verified while the move is pending
	if rc := e.do("PATCH", "/api/v1/admin/imported-students/"+rec+"/email", map[string]string{"email": "new@example.com"}, admin); rc.Code != 200 {
		t.Fatalf("change email: %d %s", rc.Code, rc.Body)
	}
	if _, aw, v := counts(); v != v0+1 || aw != aw0-1 {
		t.Fatalf("moving must keep the record verified: awaiting %d verified %d", aw, v)
	}
	if rc := e.do("PATCH", "/api/v1/admin/imported-students/"+rec+"/email", map[string]string{"email": "new@example.com"}, admin); rc.Code != 200 {
		t.Fatalf("saving the same address again: %d", rc.Code)
	}

	// the new account activates and appears in the queue as an update of the earlier member
	newID := newMember(t, e, "new@example.com", "Moving Person", "2019-20", true)
	if err := e.mem.CompleteInvite(ctx, rec, newID); err != nil {
		t.Fatal(err)
	}
	var q struct{ Items []requestItem }
	decodeBody(t, e.do("GET", "/api/v1/admin/membership-requests", nil, admin), &q)
	if len(q.Items) != 1 || q.Items[0].ID != newID || q.Items[0].Kind != "update" || q.Items[0].Replaces != "old@example.com" {
		t.Fatalf("queue: %+v", q.Items)
	}
	if rc := e.do("POST", "/api/v1/admin/students/"+newID+"/approve", nil, admin); rc.Code != 200 {
		t.Fatalf("approve new: %d", rc.Code)
	}
	var reg struct{ Items []MemberAdminRow }
	decodeBody(t, e.do("GET", "/api/v1/admin/students?status=approved&disabled=no", nil, admin), &reg)
	seen := map[string]bool{}
	for _, r := range reg.Items {
		seen[r.ID] = true
	}
	if !seen[newID] || seen[oldID] {
		t.Fatalf("Registered members must list the new account only: %v", seen)
	}
	if iv, _ := e.mem.InviteFor(ctx, rec); iv.ReplacesUser != "" {
		t.Fatal("the replacement must be finished")
	}
	if _, aw, v := counts(); v != v0+1 || aw != aw0-1 {
		t.Fatalf("final counts: awaiting %d verified %d", aw, v)
	}
}

func directoryEmailStoreSuite(t *testing.T, s AuthStore) {
	ctx := context.Background()
	if err := s.SetInviteEmailVerified(ctx, "de-1", true); err != ErrNotFound {
		t.Fatalf("no address saved: %v", err)
	}
	if err := s.SetInviteEmail(ctx, "de-1", "dir.email@example.org"); err != nil {
		t.Fatal(err)
	}
	if err := s.SetInviteEmailVerified(ctx, "de-1", true); err != nil {
		t.Fatal(err)
	}
	if iv, _ := s.InviteFor(ctx, "de-1"); !iv.EmailVerified {
		t.Fatal("the address must be marked verified")
	}
	if err := s.SetInviteEmail(ctx, "de-1", "dir.email@example.org"); err != nil { // same address keeps the mark
		t.Fatal(err)
	}
	if iv, _ := s.InviteFor(ctx, "de-1"); !iv.EmailVerified {
		t.Fatal("saving the same address must keep the mark")
	}
	if err := s.SetInviteEmail(ctx, "de-1", "other.dir.email@example.org"); err != nil {
		t.Fatal(err)
	}
	if iv, _ := s.InviteFor(ctx, "de-1"); iv.EmailVerified {
		t.Fatal("a different address must not inherit the mark")
	}
	batch := 12
	if err := s.SetImportedEdit(ctx, "", "de-file-1", ManualImportedInput{Name: "Completed Person", Batch: &batch, Department: "Finance", Session: "2019-20", Upazila: "kasba"}); err != nil {
		t.Fatal(err)
	}
	batch = 13
	if err := s.SetImportedEdit(ctx, "", "de-file-1", ManualImportedInput{Name: "Completed Again", Batch: &batch, Department: "Finance", Session: "2019-20", Upazila: "kasba"}); err != nil {
		t.Fatal(err)
	}
	if e, _ := s.ImportedEdits(ctx); e["de-file-1"].Name != "Completed Again" || *e["de-file-1"].Batch != 13 {
		t.Fatalf("edits: %+v", e["de-file-1"])
	}
}

func TestDirectoryEmailStoreMemory(t *testing.T) { directoryEmailStoreSuite(t, newMemStore()) }
