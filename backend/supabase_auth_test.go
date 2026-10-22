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

// fakeSupabase answers GET /auth/v1/user like Supabase Auth does for a bearer token.
func fakeSupabase(t *testing.T, calls *int32) *httptest.Server {
	t.Helper()
	users := map[string]supabaseUser{
		"admin-token":      {ID: "00000000-0000-0000-0000-0000000000a1", Email: "Boss@Example.com", EmailConfirmedAt: "2026-10-01T00:00:00Z"},
		"member-token":     {ID: "00000000-0000-0000-0000-0000000000b2", Email: "member@example.com", EmailConfirmedAt: "2026-10-01T00:00:00Z"},
		"unconfirmed-boss": {ID: "00000000-0000-0000-0000-0000000000c3", Email: "boss@example.com", EmailConfirmedAt: ""},
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

func TestSupabaseBearerAuth(t *testing.T) {
	var calls int32
	srv := fakeSupabase(t, &calls)
	e := authApp(t)
	e.app.Auth.Verifier = newSupabaseVerifier(srv.URL+"/rest/v1/", "pub-key")
	e.app.Auth.AdminEmails = parseEmailSet("boss@example.com, other@example.com")

	// an unconfirmed address that matches ADMIN_EMAILS must never become admin (separate app: one email, one account)
	e2 := authApp(t)
	e2.app.Auth.Verifier = newSupabaseVerifier(srv.URL, "pub-key")
	e2.app.Auth.AdminEmails = parseEmailSet("boss@example.com")
	if rec := e2.do("GET", "/api/v1/admin/members", nil, nil, bearer("unconfirmed-boss")...); rec.Code != 403 {
		t.Fatalf("unconfirmed admin address should be 403, got %d", rec.Code)
	}

	// a bad token is rejected
	if rec := e.do("GET", "/api/v1/auth/me", nil, nil, bearer("nope")...); rec.Code != 401 {
		t.Fatalf("bad bearer should be 401, got %d", rec.Code)
	}

	// confirmed member: no profile yet, then create one
	me := e.do("GET", "/api/v1/auth/me", nil, nil, bearer("member-token")...)
	if me.Code != 200 || !strings.Contains(me.Body.String(), `"role":"member"`) || !strings.Contains(me.Body.String(), `"profile":null`) {
		t.Fatalf("member me: %d %s", me.Code, me.Body)
	}
	bad := e.do("POST", "/api/v1/me/profile", map[string]any{"name": "M", "batch": 99, "department": "Nope", "upazila": "x", "union": "y"}, nil, bearer("member-token")...)
	if bad.Code != 422 {
		t.Fatalf("invalid profile should be 422, got %d", bad.Code)
	}
	ok := e.do("POST", "/api/v1/me/profile", map[string]any{"name": "Member One", "batch": 18, "department": "Finance", "upazila": "kasba", "union": "Kuti"}, nil, bearer("member-token")...)
	if ok.Code != 201 || !strings.Contains(ok.Body.String(), `"status":"pending"`) {
		t.Fatalf("create profile: %d %s", ok.Code, ok.Body)
	}

	// the member cannot use admin endpoints, the configured confirmed admin can
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

	// verification results are cached, so repeated calls do not hit Supabase each time
	before := atomic.LoadInt32(&calls)
	for i := 0; i < 5; i++ {
		e.do("GET", "/api/v1/auth/me", nil, nil, bearer("member-token")...)
	}
	if got := atomic.LoadInt32(&calls) - before; got != 0 {
		t.Fatalf("expected cached verification, saw %d extra Supabase calls", got)
	}
}

func TestSupabaseUnverifiedUsersAreHeldBack(t *testing.T) {
	var calls int32
	srv := fakeSupabase(t, &calls)
	e := authApp(t)
	e.app.Auth.Verifier = newSupabaseVerifier(srv.URL, "pub-key")

	// the account is visible to itself, flagged unverified, and nothing that needs a member works
	me := e.do("GET", "/api/v1/auth/me", nil, nil, bearer("unconfirmed-boss")...)
	if me.Code != 200 || !strings.Contains(me.Body.String(), `"emailVerified":false`) {
		t.Fatalf("unverified me: %d %s", me.Code, me.Body)
	}
	body := map[string]any{"name": "Nope", "batch": 18, "department": "Finance", "upazila": "kasba", "union": "Kuti"}
	for _, c := range []struct{ method, path string }{{"POST", "/api/v1/me/profile"}, {"PATCH", "/api/v1/me/profile"}, {"GET", "/api/v1/admin/members"}} {
		rec := e.do(c.method, c.path, body, nil, bearer("unconfirmed-boss")...)
		if rec.Code != 403 || !strings.Contains(rec.Body.String(), "email_not_verified") {
			t.Fatalf("%s %s should be 403 email_not_verified, got %d %s", c.method, c.path, rec.Code, rec.Body)
		}
	}
	// the stored copy must not claim verification Supabase never gave
	u, err := e.mem.UserByID(context.Background(), "00000000-0000-0000-0000-0000000000c3")
	if err != nil || u.EmailVerified {
		t.Fatalf("stored user must stay unverified: %+v %v", u, err)
	}
}

func TestLocalCredentialEndpointsOffWhenSupabaseIsOn(t *testing.T) {
	var calls int32
	srv := fakeSupabase(t, &calls)
	e := authApp(t)
	e.app.Auth.Verifier = newSupabaseVerifier(srv.URL, "pub-key")
	for _, path := range []string{"register", "login", "verify-email", "resend-verification", "forgot-password", "reset-password"} {
		if rec := e.do("POST", "/api/v1/auth/"+path, map[string]string{"email": "a@example.com"}, nil); rec.Code != http.StatusGone {
			t.Errorf("%s should be 410 with Supabase on, got %d", path, rec.Code)
		}
	}
	if rec := e.do("POST", "/api/v1/auth/logout", nil, nil); rec.Code != 200 {
		t.Fatalf("logout should stay available, got %d", rec.Code)
	}
}
