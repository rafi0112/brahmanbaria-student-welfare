package main

import (
	"strings"
	"testing"
)

// The Alumni page shows a saved photo to everyone, and contact details only to signed-in approved members and admins.
func TestAlumniContactForMembersPhotoForEveryone(t *testing.T) {
	e := cmsApp(t)
	rec := adminJSON(e, "POST", "/api/v1/admin/alumni", map[string]any{"name": "Contact Alumnus", "batch": 9, "department": "Finance",
		"private": map[string]string{"phone": "01712345678", "email": "alum@example.org", "facebook": "https://facebook.com/alum", "bloodGroup": "B+", "photoLink": "https://example.org/alum.jpg"}})
	var row alumniAdminRow
	decodeBody(t, rec, &row)
	if rec.Code != 201 {
		t.Fatalf("create: %d %s", rec.Code, rec.Body)
	}
	photo := `"photo":"/api/v1/alumni/` + row.ID + `/photo?v=`

	pub := e.do("GET", "/api/v1/alumni?q=Contact+Alumnus", nil, nil).Body.String()
	if !strings.Contains(pub, photo) || !strings.Contains(pub, `"view":"public"`) {
		t.Fatalf("the public list carries the photo address: %s", pub)
	}
	for _, leak := range []string{"01712345678", "alum@example.org", "facebook.com", "example.org/alum.jpg", `"contact"`, "B+"} {
		if strings.Contains(pub, leak) {
			t.Fatalf("public alumni list leaks %q: %s", leak, pub)
		}
	}

	approvedMember(t, e, "member-token", idMember, "Member One")
	mem := e.do("GET", "/api/v1/alumni?q=Contact+Alumnus", nil, nil, bearer("member-token")...).Body.String()
	for _, want := range []string{`"phone":"01712345678"`, `"email":"alum@example.org"`, `"facebook":"https://facebook.com/alum"`, `"bloodGroup":"B+"`, `"view":"member"`} {
		if !strings.Contains(mem, want) {
			t.Fatalf("a signed-in member sees %s: %s", want, mem)
		}
	}
	if strings.Contains(mem, "example.org/alum.jpg") {
		t.Fatal("the saved photo link itself is never sent out")
	}

	// the admin list shows the same photo
	adm := adminJSON(e, "GET", "/api/v1/admin/alumni?q=Contact+Alumnus", nil).Body.String()
	if !strings.Contains(adm, photo) {
		t.Fatalf("admin row carries the photo: %s", adm)
	}
	// only people the page lists have a photo address
	if rec := e.do("GET", "/api/v1/alumni/nobody/photo", nil, nil); rec.Code != 404 {
		t.Fatalf("unknown alumnus photo: %d", rec.Code)
	}
}
