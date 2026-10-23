package main

import (
	"context"
	"strings"
	"testing"
)

func TestRegistrationRequiresARealPhoneAndStoresIt(t *testing.T) {
	e := authApp(t)
	for name, phone := range map[string]string{"missing": "", "short": "0171234", "letters": "01abcdefghi", "wrong prefix": "02712345678", "spaces": "017 1234 5678"} {
		b := validReg(name + "@example.com")
		b["phone"] = phone
		rec := e.do("POST", "/api/v1/auth/register", b, nil)
		if rec.Code != 422 || !strings.Contains(rec.Body.String(), `"phone"`) {
			t.Errorf("%s phone must be refused with a phone error: %d %s", name, rec.Code, rec.Body)
		}
	}
	good := validReg("phone.ok@example.com")
	good["phone"], good["gender"], good["bloodGroup"] = "01987654321", "male", "B+"
	if rec := e.do("POST", "/api/v1/auth/register", good, nil); rec.Code != 201 {
		t.Fatalf("register: %d %s", rec.Code, rec.Body)
	}
	u, _ := e.mem.UserByEmail(context.Background(), "phone.ok@example.com")
	p, _ := e.mem.ProfileByUser(context.Background(), u.ID)
	if p.Phone != "01987654321" || p.Gender != "male" || p.BloodGroup != "B+" || p.Session == "" || p.Union == "" {
		t.Fatalf("every field must be stored: %+v", p)
	}
	if p.ShowPhone != "members" {
		t.Fatalf("a new member's phone is shared with approved members by default: %q", p.ShowPhone)
	}
}

func TestMemberCanEditPhoneGenderAndBloodGroupDirectly(t *testing.T) {
	e := authApp(t)
	c := e.member(t, "edit.me@example.com")
	if rec := e.do("PATCH", "/api/v1/me/profile", map[string]any{"phone": "01811112222", "gender": "female", "bloodGroup": "AB-"}, c); rec.Code != 200 {
		t.Fatalf("patch: %d %s", rec.Code, rec.Body)
	}
	u, _ := e.mem.UserByEmail(context.Background(), "edit.me@example.com")
	if p, _ := e.mem.ProfileByUser(context.Background(), u.ID); p.Phone != "01811112222" || p.Gender != "female" || p.BloodGroup != "AB-" {
		t.Fatalf("stored: %+v", p)
	}
	for field, bad := range map[string]string{"phone": "12345", "gender": "robot", "bloodGroup": "Q+"} {
		if rec := e.do("PATCH", "/api/v1/me/profile", map[string]any{field: bad}, c); rec.Code != 422 {
			t.Errorf("%s=%q must be refused: %d", field, bad, rec.Code)
		}
	}
	// academic details stay locked once approved: they never change through this route
	if rec := e.do("PATCH", "/api/v1/me/profile", map[string]any{"batch": 3, "department": "Law"}, c); rec.Code != 200 {
		t.Fatalf("unknown fields are ignored: %d", rec.Code)
	}
	if p, _ := e.mem.ProfileByUser(context.Background(), u.ID); p.Batch == 3 || p.Department == "Law" {
		t.Fatalf("academic fields must not change here: %+v", p)
	}
}

func TestDirectoryShowsOnlyRealDataAndHidesDetailsByRole(t *testing.T) {
	e := authApp(t)
	ctx := context.Background()
	admin := e.admin(t)
	member := e.member(t, "listed@example.com")
	var memberID string
	all, _ := memberList(t, e, admin, "")
	for id := range all {
		memberID = id
	}
	if err := e.mem.ReviewMember(ctx, "", memberID, StatusApproved); err != nil {
		t.Fatal(err)
	}

	// an admin completes a bundled record with every field
	rec := e.app.Store.Students[3]
	up := e.app.Store.Upazilas[0]
	body := map[string]any{"name": "Zqxw Completed", "batch": 9, "department": e.app.Store.Depts[0], "session": "2018-19", "upazila": up.Slug, "union": up.Unions[0],
		"gender": "female", "bloodGroup": "A+", "phone": "01755555555"}
	if rc := e.do("PATCH", "/api/v1/admin/imported-students/"+rec.ID, body, admin); rc.Code != 200 {
		t.Fatalf("complete: %d %s", rc.Code, rc.Body)
	}
	if rc := setEmail(e, admin, rec.ID, "zqxw@example.org"); rc.Code != 200 {
		t.Fatalf("email: %d", rc.Code)
	}
	list := func(cookieName string) personView {
		var out struct{ Items []personView }
		var rc = e.do("GET", "/api/v1/students?q=Zqxw", nil, nil)
		switch cookieName {
		case "member":
			rc = e.do("GET", "/api/v1/students?q=Zqxw", nil, member)
		case "admin":
			rc = e.do("GET", "/api/v1/students?q=Zqxw", nil, admin)
		}
		decodeBody(t, rc, &out)
		if len(out.Items) != 1 {
			t.Fatalf("%s: want one record, got %d", cookieName, len(out.Items))
		}
		if cookieName == "public" && (strings.Contains(rc.Body.String(), "01755555555") || strings.Contains(rc.Body.String(), "zqxw@example.org") || strings.Contains(rc.Body.String(), "2018-19")) {
			t.Fatalf("the public list leaked details: %s", rc.Body)
		}
		return out.Items[0]
	}
	if v := list("public"); v.Details != nil || v.Name != "Zqxw Completed" {
		t.Fatalf("public: %+v", v)
	}
	// a person nobody registered for has not agreed to share contact details: members see the rest, admins see all
	if v := list("member"); v.Details == nil || v.Details.Session != "2018-19" || v.Details.Union != up.Unions[0] || v.Details.Gender != "female" || v.Details.Phone != "" || v.Details.Email != "" || v.Details.BloodGroup != "" {
		t.Fatalf("member: %+v", v.Details)
	}
	if v := list("admin"); v.Details == nil || v.Details.Phone != "01755555555" || v.Details.Email != "zqxw@example.org" || v.Details.BloodGroup != "A+" || v.Details.Verified == nil {
		t.Fatalf("admin: %+v", v.Details)
	}

	// once that person activates an account and is approved, the account represents them: they never appear twice
	if err := e.mem.CompleteInvite(ctx, rec.ID, memberID); err != nil {
		t.Fatal(err)
	}
	var out struct {
		Items []personView
		Total int
	}
	decodeBody(t, e.do("GET", "/api/v1/students?q=Zqxw", nil, nil), &out)
	if out.Total != 0 {
		t.Fatalf("a claimed directory record must not be listed beside the account: %d", out.Total)
	}
	decodeBody(t, e.do("GET", "/api/v1/students?limit=48", nil, nil), &out)
	seen := 0
	for _, it := range out.Items {
		if it.ID == "m-"+memberID {
			seen++
		}
	}
	if out.Total != len(e.app.Store.Students) || seen > 1 {
		t.Fatalf("total %d (bundled %d), account listed %d times", out.Total, len(e.app.Store.Students), seen)
	}
}

func TestUpazilaMemberCountsComeFromTheRealList(t *testing.T) {
	e := authApp(t)
	var ups struct{ Items []Upazila }
	decodeBody(t, e.do("GET", "/api/v1/upazilas", nil, nil), &ups)
	sum := 0
	for _, u := range ups.Items {
		sum += u.Members
	}
	var st struct{ Students int }
	decodeBody(t, e.do("GET", "/api/v1/stats", nil, nil), &st)
	people := e.app.directoryPeople(context.Background())
	known := map[string]bool{}
	for _, u := range ups.Items {
		known[u.Slug] = true
	}
	want := 0 // some bundled records carry no upazila; they count in the total but on no upazila of the map
	for _, p := range people {
		if known[p.Upazila] {
			want++
		}
	}
	if sum != want || st.Students != len(people) {
		t.Fatalf("map %d (want %d), stats %d, list %d", sum, want, st.Students, len(people))
	}
}

func peopleStoreSuite(t *testing.T, s AuthStore) {
	ctx := context.Background()
	mk := func(email, name string) User {
		u, err := s.CreateUser(ctx, NewUser{Email: email, PasswordHash: "h", Role: RoleMember, Verified: true,
			Profile: &Profile{Name: name, Batch: 12, Department: "Finance", Upazila: "kasba", Union: "Kuti", Session: "2019-20", Gender: "female", BloodGroup: "O+", Phone: "01733333333"}})
		if err != nil {
			t.Fatal(err)
		}
		return u
	}
	shown, pending, hidden, off := mk("pp-shown@example.org", "Pp Shown"), mk("pp-pending@example.org", "Pp Pending"), mk("pp-hidden@example.org", "Pp Hidden"), mk("pp-off@example.org", "Pp Off")
	for _, u := range []User{shown, hidden, off} {
		if err := s.ReviewMember(ctx, "", u.ID, StatusApproved); err != nil {
			t.Fatal(err)
		}
	}
	no := false
	if err := s.UpdateProfile(ctx, hidden.ID, ProfilePatch{ShowInDirectory: &no}); err != nil {
		t.Fatal(err)
	}
	if err := s.SetAccountDisabled(ctx, "", off.ID, true); err != nil {
		t.Fatal(err)
	}
	_ = pending
	var got Person
	n := 0
	ps, err := s.ApprovedPeople(ctx)
	if err != nil {
		t.Fatal(err)
	}
	for _, p := range ps {
		if strings.HasPrefix(p.Name, "Pp ") {
			n++
			got = p
		}
	}
	if n != 1 || got.Name != "Pp Shown" {
		t.Fatalf("only approved, listed, active members: %d (%+v)", n, got)
	}
	if got.ID != "m-"+shown.ID || got.Email != "pp-shown@example.org" || got.Phone != "01733333333" || got.Gender != "female" || got.BloodGroup != "O+" || got.Session != "2019-20" || got.Union != "Kuti" || got.Status != StatusApproved {
		t.Fatalf("every stored field must come back: %+v", got)
	}
	g := "male"
	ph := "01844444444"
	if err := s.UpdateProfile(ctx, shown.ID, ProfilePatch{Gender: &g, Phone: &ph}); err != nil {
		t.Fatal(err)
	}
	if p, _ := s.ProfileByUser(ctx, shown.ID); p.Gender != "male" || p.Phone != "01844444444" {
		t.Fatalf("gender and phone must update: %+v", p)
	}
}

func TestPeopleStoreMemory(t *testing.T) { peopleStoreSuite(t, newMemStore()) }
