package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

const (
	idAdmin    = "00000000-0000-0000-0000-0000000000a1"
	idAdmin2   = "00000000-0000-0000-0000-0000000000a2"
	idMember   = "00000000-0000-0000-0000-0000000000b2"
	idMember2  = "00000000-0000-0000-0000-0000000000b3"
	idUnverif  = "00000000-0000-0000-0000-0000000000c3"
	emailAdmin = "boss@example.com"
)

// fakeSupabase answers GET /auth/v1/user like Supabase Auth does for a bearer token.
func fakeSupabase(t *testing.T, calls *int32) *httptest.Server {
	t.Helper()
	users := map[string]supabaseUser{
		"admin-token":       {ID: idAdmin, Email: "Boss@Example.com", EmailConfirmedAt: "2026-10-01T00:00:00Z"},
		"admin2-token":      {ID: idAdmin2, Email: "boss2@example.com", EmailConfirmedAt: "2026-10-01T00:00:00Z"},
		"member-token":      {ID: idMember, Email: "member@example.com", EmailConfirmedAt: "2026-10-01T00:00:00Z"},
		"member2-token":     {ID: idMember2, Email: "second@example.com", EmailConfirmedAt: "2026-10-01T00:00:00Z"},
		"unconfirmed-token": {ID: idUnverif, Email: "new@example.com", EmailConfirmedAt: ""},
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(calls, 1)
		tok := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		u, ok := users[tok]
		if r.URL.Path != "/auth/v1/user" || r.Header.Get("apikey") != "pub-key" || !ok {
			http.Error(w, `{"msg":"invalid"}`, http.StatusUnauthorized)
			return
		}
		_ = json.NewEncoder(w).Encode(u)
	}))
	t.Cleanup(srv.Close)
	return srv
}

func bearer(tok string) []string { return []string{"Authorization", "Bearer " + tok} }

// supaApp is an app wired to the fake Supabase, using the in-memory store.
func supaApp(t *testing.T) *env2 {
	t.Helper()
	var calls int32
	srv := fakeSupabase(t, &calls)
	e := authApp(t)
	e.app.Auth.Verifier = newSupabaseVerifier(srv.URL+"/rest/v1/", "pub-key")
	return e
}

// touch makes the API create the user's row, as the first request after sign-in does.
func (e *env2) touch(token string) *httptest.ResponseRecorder {
	return e.do("GET", "/api/v1/auth/me", nil, nil, bearer(token)...)
}

// makeAdmin creates the account and promotes it the only way the product allows: the operator bootstrap.
func (e *env2) makeAdmin(t *testing.T, token, email string) {
	t.Helper()
	if rec := e.touch(token); rec.Code != 200 {
		t.Fatalf("touch %s: %d", token, rec.Code)
	}
	if _, changed, err := e.mem.PromoteVerifiedByEmail(context.Background(), email, true); err != nil || !changed {
		t.Fatalf("bootstrap %s: changed=%v err=%v", email, changed, err)
	}
}

func (e *env2) role(t *testing.T, token string) string {
	t.Helper()
	var v struct{ User struct{ Role string } }
	_ = json.Unmarshal(e.touch(token).Body.Bytes(), &v)
	return v.User.Role
}

func setRole(e *env2, actorToken, targetID, role string) *httptest.ResponseRecorder {
	return e.do("POST", "/api/v1/admin/users/"+targetID+"/role", map[string]any{"role": role}, nil, bearer(actorToken)...)
}

var myProfile = map[string]any{"name": "Member One", "batch": 18, "department": "Finance", "upazila": "kasba", "union": "Kuti"}

func TestSupabaseBearerAuth(t *testing.T) {
	e := supaApp(t)
	e.makeAdmin(t, "admin-token", emailAdmin)

	if rec := e.touch("nope"); rec.Code != 401 {
		t.Fatalf("bad bearer should be 401, got %d", rec.Code)
	}
	me := e.touch("member-token")
	if me.Code != 200 || !strings.Contains(me.Body.String(), `"role":"member"`) || !strings.Contains(me.Body.String(), `"profile":null`) {
		t.Fatalf("member me: %d %s", me.Code, me.Body)
	}
	bad := e.do("POST", "/api/v1/me/profile", map[string]any{"name": "M", "batch": 99, "department": "Nope", "upazila": "x", "union": "y"}, nil, bearer("member-token")...)
	if bad.Code != 422 {
		t.Fatalf("invalid profile should be 422, got %d", bad.Code)
	}
	ok := e.do("POST", "/api/v1/me/profile", myProfile, nil, bearer("member-token")...)
	if ok.Code != 201 || !strings.Contains(ok.Body.String(), `"status":"pending"`) {
		t.Fatalf("create profile: %d %s", ok.Code, ok.Body)
	}
	if rec := e.do("GET", "/api/v1/admin/members", nil, nil, bearer("member-token")...); rec.Code != 403 {
		t.Fatalf("member on admin route should be 403, got %d", rec.Code)
	}
	list := e.do("GET", "/api/v1/admin/members?status=pending", nil, nil, bearer("admin-token")...)
	var l struct{ Items []MemberRow }
	_ = json.Unmarshal(list.Body.Bytes(), &l)
	if list.Code != 200 || len(l.Items) != 1 || l.Items[0].Name != "Member One" {
		t.Fatalf("admin list: %d %s", list.Code, list.Body)
	}
	if rec := e.do("POST", "/api/v1/admin/members/"+l.Items[0].UserID+"/approve", nil, nil, bearer("admin-token")...); rec.Code != 200 {
		t.Fatalf("approve: %d", rec.Code)
	}
	if pub := e.do("GET", "/api/v1/students?q=Member+One", nil, nil); !strings.Contains(pub.Body.String(), "Member One") {
		t.Fatalf("approved member should be listed: %s", pub.Body)
	}
}

func TestSupabaseTokenCheckIsCached(t *testing.T) {
	var calls int32
	srv := fakeSupabase(t, &calls)
	e := authApp(t)
	e.app.Auth.Verifier = newSupabaseVerifier(srv.URL, "pub-key")
	e.touch("member-token")
	before := atomic.LoadInt32(&calls)
	for i := 0; i < 5; i++ {
		e.touch("member-token")
	}
	if got := atomic.LoadInt32(&calls) - before; got != 0 {
		t.Fatalf("expected cached verification, saw %d extra Supabase calls", got)
	}
}

func TestSupabaseUnverifiedUsersAreHeldBack(t *testing.T) {
	e := supaApp(t)
	me := e.touch("unconfirmed-token")
	if me.Code != 200 || !strings.Contains(me.Body.String(), `"emailVerified":false`) {
		t.Fatalf("unverified me: %d %s", me.Code, me.Body)
	}
	for _, c := range []struct{ method, path string }{{"POST", "/api/v1/me/profile"}, {"PATCH", "/api/v1/me/profile"}, {"GET", "/api/v1/admin/members"}, {"GET", "/api/v1/admin/users"}} {
		rec := e.do(c.method, c.path, myProfile, nil, bearer("unconfirmed-token")...)
		if rec.Code != 403 || !strings.Contains(rec.Body.String(), "email_not_verified") {
			t.Fatalf("%s %s should be 403 email_not_verified, got %d %s", c.method, c.path, rec.Code, rec.Body)
		}
	}
	u, err := e.mem.UserByID(context.Background(), idUnverif)
	if err != nil || u.EmailVerified {
		t.Fatalf("stored user must stay unverified: %+v %v", u, err)
	}
}

func TestLocalCredentialEndpointsOffWhenSupabaseIsOn(t *testing.T) {
	e := supaApp(t)
	for _, path := range []string{"register", "login", "verify-email", "resend-verification", "forgot-password", "reset-password"} {
		if rec := e.do("POST", "/api/v1/auth/"+path, map[string]string{"email": "a@example.com"}, nil); rec.Code != http.StatusGone {
			t.Errorf("%s should be 410 with Supabase on, got %d", path, rec.Code)
		}
	}
	if rec := e.do("POST", "/api/v1/auth/logout", nil, nil); rec.Code != 200 {
		t.Fatalf("logout should stay available, got %d", rec.Code)
	}
}

func TestClientCannotChooseRoleOrIdentity(t *testing.T) {
	e := supaApp(t)
	e.makeAdmin(t, "admin-token", emailAdmin)
	body := map[string]any{"name": "Member One", "batch": 18, "department": "Finance", "upazila": "kasba", "union": "Kuti",
		"role": "admin", "userId": idAdmin, "email": emailAdmin}
	rec := e.do("POST", "/api/v1/me/profile", body, nil, append(bearer("member-token"), "X-Role", "admin", "X-User-Id", idAdmin)...)
	if rec.Code != 201 || strings.Contains(rec.Body.String(), `"role":"admin"`) || !strings.Contains(rec.Body.String(), `"id":"`+idMember+`"`) {
		t.Fatalf("profile must belong to the token's user with role member: %d %s", rec.Code, rec.Body)
	}
	for _, path := range []string{"/api/v1/admin/members", "/api/v1/admin/users"} {
		if got := e.do("GET", path, nil, nil, append(bearer("member-token"), "X-Role", "admin")...); got.Code != 403 {
			t.Fatalf("a role header must not grant access to %s, got %d", path, got.Code)
		}
	}
	// a member cannot smuggle a role through the profile endpoint either
	e.do("PATCH", "/api/v1/me/profile", map[string]any{"role": "admin", "showPhone": "members"}, nil, bearer("member-token")...)
	if got := e.role(t, "member-token"); got != RoleMember {
		t.Fatalf("role changed through the profile endpoint: %s", got)
	}
}

func TestApprovedProfileIsLockedAndRejectedCanReapply(t *testing.T) {
	e := supaApp(t)
	e.makeAdmin(t, "admin-token", emailAdmin)
	mine := map[string]any{"name": "Member One", "batch": 18, "department": "Finance", "upazila": "kasba", "union": "Kuti"}
	e.do("POST", "/api/v1/me/profile", mine, nil, bearer("member-token")...)
	e.do("POST", "/api/v1/admin/members/"+idMember+"/reject", nil, nil, bearer("admin-token")...)
	mine["department"] = "Marketing"
	if rec := e.do("POST", "/api/v1/me/profile", mine, nil, bearer("member-token")...); rec.Code != 201 || !strings.Contains(rec.Body.String(), `"status":"pending"`) || !strings.Contains(rec.Body.String(), "Marketing") {
		t.Fatalf("re-submission after rejection: %d %s", rec.Code, rec.Body)
	}
	e.do("POST", "/api/v1/admin/members/"+idMember+"/approve", nil, nil, bearer("admin-token")...)
	mine["department"] = "Law"
	if rec := e.do("POST", "/api/v1/me/profile", mine, nil, bearer("member-token")...); rec.Code != 409 {
		t.Fatalf("approved profile must be locked, got %d %s", rec.Code, rec.Body)
	}
	me := e.touch("member-token")
	if !strings.Contains(me.Body.String(), "Marketing") || strings.Contains(me.Body.String(), `"department":"Law"`) {
		t.Fatalf("approved details changed: %s", me.Body)
	}
}

// ---------------------------------------------------------------- admin management

func TestRoleEndpointsRequireAnAdmin(t *testing.T) {
	e := supaApp(t)
	e.makeAdmin(t, "admin-token", emailAdmin)
	e.touch("member-token")
	for _, c := range []struct{ method, path string }{
		{"GET", "/api/v1/admin/users"},
		{"POST", "/api/v1/admin/users/" + idMember + "/role"},
	} {
		if rec := e.do(c.method, c.path, map[string]any{"role": "admin"}, nil); rec.Code != 401 {
			t.Errorf("anonymous %s %s should be 401, got %d", c.method, c.path, rec.Code)
		}
		if rec := e.do(c.method, c.path, map[string]any{"role": "admin"}, nil, bearer("garbage")...); rec.Code != 401 {
			t.Errorf("bad token %s %s should be 401, got %d", c.method, c.path, rec.Code)
		}
		if rec := e.do(c.method, c.path, map[string]any{"role": "admin"}, nil, bearer("member-token")...); rec.Code != 403 {
			t.Errorf("member %s %s should be 403, got %d", c.method, c.path, rec.Code)
		}
	}
	if got := e.role(t, "member-token"); got != RoleMember {
		t.Fatalf("member became %s", got)
	}
}

func TestAdminListsSearchesAndFiltersUsers(t *testing.T) {
	e := supaApp(t)
	e.makeAdmin(t, "admin-token", emailAdmin)
	e.do("POST", "/api/v1/me/profile", myProfile, nil, bearer("member-token")...)
	e.touch("member2-token")
	e.touch("unconfirmed-token")

	get := func(query string) (int, struct {
		Items []UserRow
		Total int
		Pages int
	}) {
		rec := e.do("GET", "/api/v1/admin/users"+query, nil, nil, bearer("admin-token")...)
		var v struct {
			Items []UserRow
			Total int
			Pages int
		}
		_ = json.Unmarshal(rec.Body.Bytes(), &v)
		if strings.Contains(rec.Body.String(), "password") || strings.Contains(rec.Body.String(), "$argon2") {
			t.Fatalf("user list leaks credentials: %s", rec.Body)
		}
		return rec.Code, v
	}
	code, all := get("")
	if code != 200 || all.Total != 4 {
		t.Fatalf("list all: %d total=%d", code, all.Total)
	}
	if _, byEmail := get("?q=SECOND@"); byEmail.Total != 1 || byEmail.Items[0].ID != idMember2 {
		t.Fatalf("search by email: %+v", byEmail)
	}
	if _, byName := get("?q=member+one"); byName.Total != 1 || byName.Items[0].ID != idMember || byName.Items[0].Name != "Member One" {
		t.Fatalf("search by name: %+v", byName)
	}
	if _, admins := get("?role=admin"); admins.Total != 1 || admins.Items[0].ID != idAdmin {
		t.Fatalf("role filter: %+v", admins)
	}
	if _, paged := get("?limit=2&page=2"); len(paged.Items) != 2 || paged.Pages != 2 {
		t.Fatalf("paging: %+v", paged)
	}
	if code, _ := get("?role=superuser"); code != 400 {
		t.Fatalf("unknown role filter should be 400, got %d", code)
	}
}

func TestPromoteAndDemoteWithImmediateEffect(t *testing.T) {
	e := supaApp(t)
	e.makeAdmin(t, "admin-token", emailAdmin)
	e.touch("member-token")

	if rec := setRole(e, "admin-token", idMember, "superuser"); rec.Code != 422 {
		t.Fatalf("bad role should be 422, got %d", rec.Code)
	}
	if rec := setRole(e, "admin-token", "00000000-0000-0000-0000-0000000000ff", "admin"); rec.Code != 404 {
		t.Fatalf("unknown user should be 404, got %d", rec.Code)
	}
	if rec := setRole(e, "admin-token", idMember, "admin"); rec.Code != 200 || !strings.Contains(rec.Body.String(), `"role":"admin"`) {
		t.Fatalf("promote: %d %s", rec.Code, rec.Body)
	}
	if rec := e.do("GET", "/api/v1/admin/users", nil, nil, bearer("member-token")...); rec.Code != 200 {
		t.Fatalf("a promoted user should reach admin routes immediately, got %d", rec.Code)
	}
	if rec := setRole(e, "admin-token", idMember, "admin"); rec.Code != 200 {
		t.Fatalf("promoting twice should be idempotent, got %d", rec.Code)
	}
	if rec := setRole(e, "admin-token", idMember, "member"); rec.Code != 200 || !strings.Contains(rec.Body.String(), `"role":"member"`) {
		t.Fatalf("demote: %d %s", rec.Code, rec.Body)
	}
	if rec := e.do("GET", "/api/v1/admin/users", nil, nil, bearer("member-token")...); rec.Code != 403 {
		t.Fatalf("a demoted user must lose access immediately, got %d", rec.Code)
	}
	log := e.mem.RoleLog()
	if len(log) < 3 || log[len(log)-1].New != RoleMember || log[len(log)-1].Actor != idAdmin || log[len(log)-1].Target != idMember {
		t.Fatalf("role changes must be audited: %+v", log)
	}
}

func TestAdminsMayLeaveOnlyWhileAnotherAdminRemains(t *testing.T) {
	e := supaApp(t)
	e.makeAdmin(t, "admin-token", emailAdmin)
	e.touch("member-token")
	if rec := setRole(e, "member-token", idMember, "admin"); rec.Code != 403 {
		t.Fatalf("self-promotion by a member should be 403, got %d", rec.Code)
	}
	if got := e.role(t, "member-token"); got != RoleMember {
		t.Fatalf("member promoted themselves: %s", got)
	}
	// the only admin cannot remove themselves
	rec := setRole(e, "admin-token", idAdmin, "member")
	if rec.Code != 409 || !strings.Contains(rec.Body.String(), "last_admin") {
		t.Fatalf("the only admin must not be able to leave: %d %s", rec.Code, rec.Body)
	}
	// with a second verified admin they may step down, and lose access at once
	if rec := setRole(e, "admin-token", idMember, "admin"); rec.Code != 200 {
		t.Fatalf("promote second admin: %d %s", rec.Code, rec.Body)
	}
	if rec := setRole(e, "admin-token", idAdmin, "member"); rec.Code != 200 {
		t.Fatalf("an admin should be able to leave when another remains: %d %s", rec.Code, rec.Body)
	}
	if got := e.role(t, "admin-token"); got != RoleMember {
		t.Fatalf("admin did not step down: %s", got)
	}
	if got := e.role(t, "member-token"); got != RoleAdmin {
		t.Fatalf("remaining admin lost their role: %s", got)
	}
}

func TestUnverifiedAccountsCannotBePromoted(t *testing.T) {
	e := supaApp(t)
	e.makeAdmin(t, "admin-token", emailAdmin)
	e.touch("unconfirmed-token")
	rec := setRole(e, "admin-token", idUnverif, "admin")
	if rec.Code != 409 || !strings.Contains(rec.Body.String(), "target_unverified") {
		t.Fatalf("promoting an unverified account should be 409: %d %s", rec.Code, rec.Body)
	}
	if u, _ := e.mem.UserByID(context.Background(), idUnverif); u.Role != RoleMember {
		t.Fatalf("unverified account became %s", u.Role)
	}
	// the bootstrap refuses it too
	if _, _, err := e.mem.PromoteVerifiedByEmail(context.Background(), "new@example.com", true); err != ErrTargetUnverified {
		t.Fatalf("bootstrap must refuse unverified accounts, got %v", err)
	}
}

func TestTheLastAdminIsProtected(t *testing.T) {
	e := supaApp(t)
	e.makeAdmin(t, "admin-token", emailAdmin)
	e.touch("member-token")
	ctx := context.Background()

	// one admin: nobody, not even a forged "actor", can demote them
	if _, err := e.mem.SetRole(ctx, idMember, idAdmin, RoleMember); err != ErrLastAdmin {
		t.Fatalf("demoting the only admin must fail with ErrLastAdmin, got %v", err)
	}
	if rec := setRole(e, "member-token", idAdmin, "member"); rec.Code != 409 && rec.Code != 403 {
		t.Fatalf("a member demoting the only admin must be refused, got %d", rec.Code)
	}
	if got := e.role(t, "admin-token"); got != RoleAdmin {
		t.Fatalf("the only admin was demoted: %s", got)
	}

	// two admins: A can demote B, B (now a member) cannot touch A, and A still cannot demote themselves
	e.makeAdmin(t, "admin2-token", "boss2@example.com")
	if rec := setRole(e, "admin-token", idAdmin2, "member"); rec.Code != 200 {
		t.Fatalf("demoting a second admin should work, got %d", rec.Code)
	}
	if rec := setRole(e, "admin2-token", idAdmin, "member"); rec.Code != 403 {
		t.Fatalf("a demoted admin must not demote anyone, got %d", rec.Code)
	}
	if rec := setRole(e, "admin-token", idAdmin, "member"); rec.Code != 409 {
		t.Fatalf("the last admin must not demote themselves, got %d", rec.Code)
	}
	if got := e.role(t, "admin-token"); got != RoleAdmin {
		t.Fatalf("the last admin lost the role: %s", got)
	}
}

func TestApprovingAMemberDoesNotMakeThemAdmin(t *testing.T) {
	e := supaApp(t)
	e.makeAdmin(t, "admin-token", emailAdmin)
	e.do("POST", "/api/v1/me/profile", myProfile, nil, bearer("member-token")...)
	if rec := e.do("POST", "/api/v1/admin/members/"+idMember+"/approve", nil, nil, bearer("admin-token")...); rec.Code != 200 {
		t.Fatalf("approve: %d", rec.Code)
	}
	if got := e.role(t, "member-token"); got != RoleMember {
		t.Fatalf("approval changed the role to %s", got)
	}
	if rec := e.do("GET", "/api/v1/admin/users", nil, nil, bearer("member-token")...); rec.Code != 403 {
		t.Fatalf("an approved member must not reach admin routes, got %d", rec.Code)
	}
}

// ---------------------------------------------------------------- bootstrap

func TestBootstrapPromotesOnlyConfirmedAccountsAndOnlyOnPurpose(t *testing.T) {
	e := supaApp(t)
	ctx := context.Background()
	e.touch("member-token")
	e.touch("unconfirmed-token")

	if _, _, err := e.mem.PromoteVerifiedByEmail(ctx, "nobody@example.com", true); err != ErrNotFound {
		t.Fatalf("unknown email: %v", err)
	}
	if _, _, err := e.mem.PromoteVerifiedByEmail(ctx, "new@example.com", true); err != ErrTargetUnverified {
		t.Fatalf("unconfirmed email: %v", err)
	}
	// preview changes nothing
	if _, changed, err := e.mem.PromoteVerifiedByEmail(ctx, "member@example.com", false); err != nil || !changed {
		t.Fatalf("preview: changed=%v err=%v", changed, err)
	}
	if got := e.role(t, "member-token"); got != RoleMember {
		t.Fatalf("a preview promoted the account: %s", got)
	}
	// apply, then repeat (idempotent)
	if u, changed, err := e.mem.PromoteVerifiedByEmail(ctx, "MEMBER@example.com", true); err != nil || !changed || u.Role != RoleAdmin {
		t.Fatalf("apply: %+v changed=%v err=%v", u, changed, err)
	}
	if _, changed, err := e.mem.PromoteVerifiedByEmail(ctx, "member@example.com", true); err != nil || changed {
		t.Fatalf("second run must be a no-op: changed=%v err=%v", changed, err)
	}
	if got := e.role(t, "member-token"); got != RoleAdmin {
		t.Fatalf("role after bootstrap: %s", got)
	}
	if log := e.mem.RoleLog(); len(log) != 1 || log[0].Source != "bootstrap" {
		t.Fatalf("bootstrap must be audited once: %+v", log)
	}
}

func TestAdminEmailsAloneNeverGrantsAdmin(t *testing.T) {
	t.Setenv("ADMIN_EMAILS", "member@example.com")
	e := supaApp(t)
	e.touch("member-token")
	if rec := e.do("GET", "/api/v1/admin/users", nil, nil, bearer("member-token")...); rec.Code != 403 {
		t.Fatalf("listing an email in ADMIN_EMAILS must not grant access by itself, got %d", rec.Code)
	}
	if got := e.role(t, "member-token"); got != RoleMember {
		t.Fatalf("ADMIN_EMAILS changed a role at runtime: %s", got)
	}
}

func TestBootstrapCommand(t *testing.T) {
	e := supaApp(t)
	e.touch("member-token")
	e.touch("unconfirmed-token")

	if err := bootstrapAdmins(nil, nil); err == nil {
		t.Fatal("no database must be an error")
	}
	t.Setenv("ADMIN_EMAILS", "")
	if err := bootstrapAdmins(e.mem, nil); err == nil {
		t.Fatal("empty ADMIN_EMAILS must be an error")
	}
	t.Setenv("ADMIN_EMAILS", "member@example.com")
	if err := bootstrapAdmins(e.mem, []string{"--force"}); err == nil {
		t.Fatal("unknown flag must be rejected")
	}
	if err := bootstrapAdmins(e.mem, nil); err != nil || e.role(t, "member-token") != RoleMember {
		t.Fatalf("default run is a preview: err=%v role=%s", err, e.role(t, "member-token"))
	}
	t.Setenv("ADMIN_EMAILS", "nobody@example.com, new@example.com")
	if err := bootstrapAdmins(e.mem, []string{"--apply"}); err == nil {
		t.Fatal("nothing promotable must be reported as an error")
	}
	t.Setenv("ADMIN_EMAILS", "nobody@example.com, member@example.com")
	if err := bootstrapAdmins(e.mem, []string{"--apply"}); err != nil || e.role(t, "member-token") != RoleAdmin {
		t.Fatalf("apply: err=%v role=%s", err, e.role(t, "member-token"))
	}
	if err := bootstrapAdmins(e.mem, []string{"--apply"}); err != nil {
		t.Fatalf("repeating must be safe: %v", err)
	}
}
