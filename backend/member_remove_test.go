package main

import (
	"context"
	"testing"
)

func TestAdminRemovesAMemberOnlyWithTheTypedEmail(t *testing.T) {
	e := cmsApp(t)
	ctx := context.Background()
	approvedMember(t, e, "member-token", idMember, "Member One")
	target, err := e.mem.UserByID(ctx, idMember)
	if err != nil {
		t.Fatal(err)
	}
	path := "/api/v1/admin/students/" + idMember + "/remove"
	// the second confirmation is the member's email; anything else removes nobody
	for _, c := range []any{map[string]string{}, map[string]string{"confirm": "someone@else.test"}} {
		if rec := adminJSON(e, "POST", path, c); rec.Code != 422 {
			t.Fatalf("remove without the right confirmation: %d %s", rec.Code, rec.Body)
		}
	}
	if _, err := e.mem.UserByID(ctx, idMember); err != nil {
		t.Fatal("a refused removal must keep the account")
	}
	// a member cannot remove anyone; an admin cannot remove an admin (or themselves)
	if rec := jreq(e, "POST", path, "member-token", map[string]string{"confirm": target.Email}); rec.Code != 403 {
		t.Fatalf("member removing: %d", rec.Code)
	}
	adm, _ := e.mem.UserByID(ctx, idAdmin)
	if rec := adminJSON(e, "POST", "/api/v1/admin/students/"+idAdmin+"/remove", map[string]string{"confirm": adm.Email}); rec.Code != 403 && rec.Code != 409 {
		t.Fatalf("removing an admin: %d %s", rec.Code, rec.Body)
	}
	if rec := adminJSON(e, "POST", path, map[string]string{"confirm": "  " + target.Email + " "}); rec.Code != 200 {
		t.Fatalf("remove: %d %s", rec.Code, rec.Body)
	}
	if _, err := e.mem.UserByID(ctx, idMember); err != ErrNotFound {
		t.Fatalf("the account is gone: %v", err)
	}
	if _, err := e.mem.ProfileByUser(ctx, idMember); err == nil {
		t.Fatal("the profile goes with the account")
	}
	if rec := adminJSON(e, "POST", path, map[string]string{"confirm": target.Email}); rec.Code != 404 {
		t.Fatalf("removing twice: %d", rec.Code)
	}
}
