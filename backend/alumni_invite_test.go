package main

import (
	"context"
	"strings"
	"testing"
)

// An alumni record gets the same email, invitation and verification steps as a directory student.
func TestAlumniRecordsCanBeInvitedAndVerified(t *testing.T) {
	e, inv, ck := inviteEnv(t)
	ctx := context.Background()
	b := 9
	if _, _, err := e.mem.UpsertDirectoryRecords(ctx, []DirectoryRecord{{ID: "a-inv-1", Kind: "alumni", Name: "Invited Alumnus", Batch: &b, Department: "Finance", Occupation: "Banker",
		Private: map[string]string{"phone": "01712345678", "bloodGroup": "O+"}}}); err != nil {
		t.Fatal(err)
	}
	if err := e.app.reloadLive(ctx); err != nil {
		t.Fatal(err)
	}
	// email, then the invitation
	if rec := setEmail(e, ck, "a-inv-1", "alum.invite@example.org"); rec.Code != 200 {
		t.Fatalf("save email: %d %s", rec.Code, rec.Body)
	}
	if rec := e.do("POST", "/api/v1/admin/imported-students/a-inv-1/invite", map[string]string{}, ck); rec.Code != 200 {
		t.Fatalf("send invitation: %d %s", rec.Code, rec.Body)
	}
	if len(inv.calls) != 1 || !strings.HasPrefix(inv.calls[0], "alum.invite@example.org|") {
		t.Fatalf("one invitation to the saved address: %v", inv.calls)
	}
	list := e.do("GET", "/api/v1/admin/alumni?q=Invited", nil, ck).Body.String()
	if !strings.Contains(list, `"email":"alum.invite@example.org"`) || !strings.Contains(list, `"status":"sent"`) {
		t.Fatalf("the alumni list shows the invitation: %s", list)
	}
	// verification by an admin, and undoing it
	if rec := e.do("POST", "/api/v1/admin/imported-students/a-inv-1/verify", map[string]string{}, ck); rec.Code != 200 {
		t.Fatalf("verify: %d %s", rec.Code, rec.Body)
	}
	if !strings.Contains(e.do("GET", "/api/v1/admin/alumni?status=verified", nil, ck).Body.String(), "Invited Alumnus") {
		t.Fatal("verified filter")
	}
	if rec := e.do("POST", "/api/v1/admin/imported-students/a-inv-1/unverify", map[string]string{}, ck); rec.Code != 200 {
		t.Fatalf("unverify: %d", rec.Code)
	}
	if strings.Contains(e.do("GET", "/api/v1/admin/alumni?status=verified", nil, ck).Body.String(), "Invited Alumnus") {
		t.Fatal("unverified record left the verified view")
	}
	// removing the saved address
	if rec := e.do("DELETE", "/api/v1/admin/imported-students/a-inv-1/email", nil, ck); rec.Code != 200 {
		t.Fatalf("remove email: %d %s", rec.Code, rec.Body)
	}
	if extra := e.app.importedExtra(ctx, "a-inv-1"); extra.Phone != "01712345678" || extra.BloodGroup != "O+" {
		t.Fatalf("activation prefill uses the alumni record's contact columns: %+v", extra)
	}
}
