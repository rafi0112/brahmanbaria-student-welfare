package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"testing"
	"time"
)

type sentMail struct{ to, subject, body string }

type captureMailer struct {
	mu   sync.Mutex
	msgs []sentMail
}

func (c *captureMailer) Send(_ context.Context, to, subject, body string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.msgs = append(c.msgs, sentMail{to, subject, body})
	return nil
}

func (c *captureMailer) last() sentMail {
	c.mu.Lock()
	defer c.mu.Unlock()
	if len(c.msgs) == 0 {
		return sentMail{}
	}
	return c.msgs[len(c.msgs)-1]
}

func (c *captureMailer) count() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return len(c.msgs)
}

var tokenRx = regexp.MustCompile(`token=([A-Za-z0-9_-]+)`)

func tokenIn(t *testing.T, m sentMail) string {
	t.Helper()
	g := tokenRx.FindStringSubmatch(m.body)
	if g == nil {
		t.Fatalf("no token in mail: %q", m.body)
	}
	return g[1]
}

type env2 struct {
	app  *App
	mail *captureMailer
	mem  *memStore
}

func authApp(t *testing.T) *env2 {
	t.Helper()
	s, err := loadStore("data")
	if err != nil {
		t.Fatal(err)
	}
	mem, mail := newMemStore(), &captureMailer{}
	app := &App{Store: s, Origin: "http://localhost:5173", ContactLog: filepath.Join(t.TempDir(), "c.jsonl"), Limiter: newLimiter(50, time.Hour)}
	app.Auth = newAuth(mem, mail, "http://localhost:5173", false, http.SameSiteLaxMode)
	return &env2{app, mail, mem}
}

func (e *env2) do(method, path string, body any, cookie *http.Cookie, headers ...string) *httptest.ResponseRecorder {
	var buf bytes.Buffer
	if body != nil {
		_ = json.NewEncoder(&buf).Encode(body)
	}
	req := httptest.NewRequest(method, path, &buf)
	req.RemoteAddr = "9.9.9.9:1000"
	req.Header.Set("Content-Type", "application/json")
	for i := 0; i+1 < len(headers); i += 2 {
		req.Header.Set(headers[i], headers[i+1])
	}
	if cookie != nil {
		req.AddCookie(cookie)
	}
	rec := httptest.NewRecorder()
	e.app.Routes().ServeHTTP(rec, req)
	return rec
}

func sessionCookie(rec *httptest.ResponseRecorder) *http.Cookie {
	for _, c := range rec.Result().Cookies() {
		if c.Name == cookieName && c.MaxAge > 0 {
			return c
		}
	}
	return nil
}

func validReg(email string) map[string]any {
	return map[string]any{"name": "Test Student", "email": email, "password": "correct horse 1", "batch": 18,
		"department": "Finance", "upazila": "nabinagar", "union": "Barail", "session": "2020-21"}
}

// registerAndVerify creates a verified member and returns the session cookie.
func (e *env2) member(t *testing.T, email string) *http.Cookie {
	t.Helper()
	if rec := e.do("POST", "/api/v1/auth/register", validReg(email), nil); rec.Code != 201 {
		t.Fatalf("register: %d %s", rec.Code, rec.Body)
	}
	tok := tokenIn(t, e.mail.last())
	if rec := e.do("POST", "/api/v1/auth/verify-email", map[string]string{"token": tok}, nil); rec.Code != 200 {
		t.Fatalf("verify: %d", rec.Code)
	}
	rec := e.do("POST", "/api/v1/auth/login", map[string]string{"email": email, "password": "correct horse 1"}, nil)
	c := sessionCookie(rec)
	if rec.Code != 200 || c == nil {
		t.Fatalf("login: %d %s", rec.Code, rec.Body)
	}
	return c
}

func (e *env2) admin(t *testing.T) *http.Cookie {
	t.Helper()
	h, _ := hashPassword("admin password 123")
	if _, err := e.mem.CreateUser(context.Background(), NewUser{Email: "admin@example.com", PasswordHash: h, Role: RoleAdmin, Verified: true}); err != nil {
		t.Fatal(err)
	}
	rec := e.do("POST", "/api/v1/auth/login", map[string]string{"email": "admin@example.com", "password": "admin password 123"}, nil)
	c := sessionCookie(rec)
	if c == nil {
		t.Fatalf("admin login failed: %d", rec.Code)
	}
	return c
}

func TestPasswordHashing(t *testing.T) {
	h, err := hashPassword("s3cret-pass")
	if err != nil || !strings.HasPrefix(h, "$argon2id$") {
		t.Fatalf("bad hash %q %v", h, err)
	}
	if !verifyPassword("s3cret-pass", h) || verifyPassword("wrong", h) || verifyPassword("s3cret-pass", "garbage") {
		t.Fatal("verify misbehaves")
	}
	h2, _ := hashPassword("s3cret-pass")
	if h == h2 {
		t.Fatal("salts must differ")
	}
}

func TestRegisterValidation(t *testing.T) {
	e := authApp(t)
	bad := validReg("nope")
	bad["union"] = "Kaitala North" // belongs to Nabinagar, so this one is fine; break upazila instead
	bad["upazila"] = "sarail"
	bad["department"] = "Underwater Basket Weaving"
	bad["password"] = "short"
	rec := e.do("POST", "/api/v1/auth/register", bad, nil)
	if rec.Code != 422 {
		t.Fatalf("want 422 got %d", rec.Code)
	}
	var v struct{ Fields map[string]string }
	_ = json.Unmarshal(rec.Body.Bytes(), &v)
	for _, f := range []string{"email", "password", "department", "union"} {
		if v.Fields[f] == "" {
			t.Errorf("expected error for %s, got %v", f, v.Fields)
		}
	}
	if e.mail.count() != 0 {
		t.Fatal("no mail for invalid registration")
	}
}

func TestRegisterVerifyLoginLogout(t *testing.T) {
	e := authApp(t)
	e.do("POST", "/api/v1/auth/register", validReg("Nusrat@Example.com"), nil)
	if e.mail.count() != 1 || e.mail.last().to != "nusrat@example.com" {
		t.Fatalf("verification mail missing: %+v", e.mail.msgs)
	}
	body := map[string]string{"email": "nusrat@example.com", "password": "correct horse 1"}
	if rec := e.do("POST", "/api/v1/auth/login", body, nil); rec.Code != 403 || !strings.Contains(rec.Body.String(), "email_not_verified") {
		t.Fatalf("unverified login should be 403, got %d %s", rec.Code, rec.Body)
	}
	tok := tokenIn(t, e.mail.last())
	if rec := e.do("POST", "/api/v1/auth/verify-email", map[string]string{"token": tok}, nil); rec.Code != 200 {
		t.Fatalf("verify %d", rec.Code)
	}
	if rec := e.do("POST", "/api/v1/auth/verify-email", map[string]string{"token": tok}, nil); rec.Code != 400 {
		t.Fatalf("token must be single use, got %d", rec.Code)
	}
	rec := e.do("POST", "/api/v1/auth/login", body, nil)
	c := sessionCookie(rec)
	if rec.Code != 200 || c == nil {
		t.Fatalf("login %d", rec.Code)
	}
	if !c.HttpOnly || c.SameSite != http.SameSiteLaxMode || c.Path != "/" {
		t.Fatalf("cookie flags wrong: %+v", c)
	}
	me := e.do("GET", "/api/v1/auth/me", nil, c)
	if me.Code != 200 || !strings.Contains(me.Body.String(), `"status":"pending"`) {
		t.Fatalf("me: %d %s", me.Code, me.Body)
	}
	if strings.Contains(me.Body.String(), "password") {
		t.Fatal("me must not leak the hash")
	}
	e.do("POST", "/api/v1/auth/logout", nil, c)
	if rec := e.do("GET", "/api/v1/auth/me", nil, c); rec.Code != 401 {
		t.Fatalf("session should be gone, got %d", rec.Code)
	}
}

func TestNoAccountEnumeration(t *testing.T) {
	e := authApp(t)
	e.do("POST", "/api/v1/auth/register", validReg("a@example.com"), nil)
	first := e.do("POST", "/api/v1/auth/register", validReg("a@example.com"), nil)
	fresh := e.do("POST", "/api/v1/auth/register", validReg("b@example.com"), nil)
	if first.Code != fresh.Code || first.Body.String() != fresh.Body.String() {
		t.Fatalf("duplicate registration must look identical: %d %q vs %d %q", first.Code, first.Body, fresh.Code, fresh.Body)
	}
	unknown := e.do("POST", "/api/v1/auth/login", map[string]string{"email": "ghost@example.com", "password": "whatever123"}, nil)
	wrong := e.do("POST", "/api/v1/auth/login", map[string]string{"email": "a@example.com", "password": "wrong password"}, nil)
	if unknown.Code != 401 || wrong.Code != 401 || unknown.Body.String() != wrong.Body.String() {
		t.Fatalf("login failures must be identical: %d %q vs %d %q", unknown.Code, unknown.Body, wrong.Code, wrong.Body)
	}
	before := e.mail.count()
	if rec := e.do("POST", "/api/v1/auth/forgot-password", map[string]string{"email": "ghost@example.com"}, nil); rec.Code != 202 {
		t.Fatalf("forgot must be 202, got %d", rec.Code)
	}
	if e.mail.count() != before {
		t.Fatal("no mail should be sent for unknown emails")
	}
}

func TestPasswordReset(t *testing.T) {
	e := authApp(t)
	c := e.member(t, "r@example.com")
	e.do("POST", "/api/v1/auth/forgot-password", map[string]string{"email": "r@example.com"}, nil)
	tok := tokenIn(t, e.mail.last())
	if rec := e.do("POST", "/api/v1/auth/reset-password", map[string]string{"token": tok, "password": "tiny"}, nil); rec.Code != 422 {
		t.Fatalf("weak password should be 422, got %d", rec.Code)
	}
	if rec := e.do("POST", "/api/v1/auth/reset-password", map[string]string{"token": tok, "password": "brand new password"}, nil); rec.Code != 200 {
		t.Fatalf("reset: %d %s", rec.Code, rec.Body)
	}
	if rec := e.do("POST", "/api/v1/auth/reset-password", map[string]string{"token": tok, "password": "another password!"}, nil); rec.Code != 400 {
		t.Fatalf("reset token must be single use, got %d", rec.Code)
	}
	if rec := e.do("GET", "/api/v1/auth/me", nil, c); rec.Code != 401 {
		t.Fatalf("old sessions must end after a reset, got %d", rec.Code)
	}
	if rec := e.do("POST", "/api/v1/auth/login", map[string]string{"email": "r@example.com", "password": "correct horse 1"}, nil); rec.Code != 401 {
		t.Fatal("old password must stop working")
	}
	if rec := e.do("POST", "/api/v1/auth/login", map[string]string{"email": "r@example.com", "password": "brand new password"}, nil); rec.Code != 200 {
		t.Fatalf("new password should work, got %d", rec.Code)
	}
}

func TestExpiredTokenRejected(t *testing.T) {
	e := authApp(t)
	e.member(t, "x@example.com")
	u, _ := e.mem.UserByEmail(context.Background(), "x@example.com")
	raw, digest, _ := newToken()
	_ = e.mem.SaveToken(context.Background(), u.ID, PurposeReset, digest, time.Now().Add(-time.Minute))
	if rec := e.do("POST", "/api/v1/auth/reset-password", map[string]string{"token": raw, "password": "brand new password"}, nil); rec.Code != 400 {
		t.Fatalf("expired token should be rejected, got %d", rec.Code)
	}
	// a verify token cannot be used for a reset
	raw2, d2, _ := newToken()
	_ = e.mem.SaveToken(context.Background(), u.ID, PurposeVerify, d2, time.Now().Add(time.Hour))
	if rec := e.do("POST", "/api/v1/auth/reset-password", map[string]string{"token": raw2, "password": "brand new password"}, nil); rec.Code != 400 {
		t.Fatalf("token purposes must not mix, got %d", rec.Code)
	}
}

func TestAdminGateAndApprovalReachesDirectory(t *testing.T) {
	e := authApp(t)
	if rec := e.do("GET", "/api/v1/admin/members", nil, nil); rec.Code != 401 {
		t.Fatalf("anonymous admin call should be 401, got %d", rec.Code)
	}
	mc := e.member(t, "m@example.com")
	if rec := e.do("GET", "/api/v1/admin/members", nil, mc); rec.Code != 403 {
		t.Fatalf("member must not reach admin, got %d", rec.Code)
	}
	if rec := e.do("POST", "/api/v1/admin/members/u0001/approve", nil, mc); rec.Code != 403 {
		t.Fatalf("member must not approve, got %d", rec.Code)
	}
	ac := e.admin(t)
	list := e.do("GET", "/api/v1/admin/members?status=pending", nil, ac)
	var l struct{ Items []MemberRow }
	_ = json.Unmarshal(list.Body.Bytes(), &l)
	if list.Code != 200 || len(l.Items) != 1 || l.Items[0].Email != "m@example.com" {
		t.Fatalf("pending list wrong: %d %s", list.Code, list.Body)
	}
	id := l.Items[0].UserID
	pub := e.do("GET", "/api/v1/students?q=Test+Student", nil, nil)
	if strings.Contains(pub.Body.String(), "Test Student") {
		t.Fatal("pending members must not be listed publicly")
	}
	if rec := e.do("POST", "/api/v1/admin/members/"+id+"/approve", nil, ac); rec.Code != 200 {
		t.Fatalf("approve: %d", rec.Code)
	}
	pub = e.do("GET", "/api/v1/students?q=Test+Student", nil, nil)
	if !strings.Contains(pub.Body.String(), "Test Student") || !strings.Contains(pub.Body.String(), `"m-`+id) {
		t.Fatalf("approved member should appear: %s", pub.Body)
	}
	for _, leak := range []string{"m@example.com", "phone", "bloodGroup", "email"} {
		if strings.Contains(pub.Body.String(), leak) {
			t.Fatalf("public directory leaks %q", leak)
		}
	}
	// opting out hides the member again
	if rec := e.do("PATCH", "/api/v1/me/profile", map[string]any{"showInDirectory": false}, mc); rec.Code != 200 {
		t.Fatalf("patch: %d %s", rec.Code, rec.Body)
	}
	pub = e.do("GET", "/api/v1/students?q=Test+Student", nil, nil)
	if strings.Contains(pub.Body.String(), "Test Student") {
		t.Fatal("hidden members must disappear from the directory")
	}
	if rec := e.do("GET", "/api/v1/admin/overview", nil, ac); !strings.Contains(rec.Body.String(), `"approved":1`) {
		t.Fatalf("overview: %s", rec.Body)
	}
}

func TestProfileValidation(t *testing.T) {
	e := authApp(t)
	mc := e.member(t, "p@example.com")
	rec := e.do("PATCH", "/api/v1/me/profile", map[string]any{"phone": "12345", "bloodGroup": "Z+", "showPhone": "everyone"}, mc)
	if rec.Code != 422 {
		t.Fatalf("want 422 got %d", rec.Code)
	}
	ok := e.do("PATCH", "/api/v1/me/profile", map[string]any{"phone": "01712345678", "bloodGroup": "O+", "showPhone": "members"}, mc)
	if ok.Code != 200 || !strings.Contains(ok.Body.String(), `"showPhone":"members"`) {
		t.Fatalf("patch: %d %s", ok.Code, ok.Body)
	}
	if rec := e.do("PATCH", "/api/v1/me/profile", map[string]any{"phone": "01712345678"}, nil); rec.Code != 401 {
		t.Fatalf("anonymous patch should be 401, got %d", rec.Code)
	}
}

func TestCrossSiteWritesBlocked(t *testing.T) {
	e := authApp(t)
	rec := e.do("POST", "/api/v1/auth/login", map[string]string{"email": "a@example.com", "password": "x"}, nil, "Origin", "https://evil.example")
	if rec.Code != 403 {
		t.Fatalf("foreign Origin must be blocked, got %d", rec.Code)
	}
	rec = e.do("POST", "/api/v1/auth/login", map[string]string{"email": "a@example.com", "password": "x"}, nil, "Origin", "http://localhost:5173")
	if rec.Code == 403 {
		t.Fatal("the real frontend origin must pass")
	}
}

func TestLoginRateLimit(t *testing.T) {
	e := authApp(t)
	var last int
	for i := 0; i < 12; i++ {
		last = e.do("POST", "/api/v1/auth/login", map[string]string{"email": "brute@example.com", "password": "guess"}, nil).Code
	}
	if last != 429 {
		t.Fatalf("expected 429 after repeated failures, got %d", last)
	}
}

func TestAuthDisabledReturns503(t *testing.T) {
	a := testApp(t) // no Auth configured
	rec := httptest.NewRecorder()
	a.Routes().ServeHTTP(rec, httptest.NewRequest("GET", "/api/v1/auth/me", nil))
	if rec.Code != 503 {
		t.Fatalf("want 503 got %d", rec.Code)
	}
}

// "My profile" can only change contact and visibility: role, name, batch, department and status are not accepted.
func TestProfilePatchCannotChangeProtectedFields(t *testing.T) {
	e := authApp(t)
	mc := e.member(t, "protect@example.com")
	before := e.do("GET", "/api/v1/auth/me", nil, mc)
	rec := e.do("PATCH", "/api/v1/me/profile", map[string]any{"role": "admin", "name": "Hijacked", "batch": 1, "department": "Law", "status": "approved", "phone": "01712345678"}, mc)
	if rec.Code == 200 {
		after := rec.Body.String()
		if strings.Contains(after, `"role":"admin"`) || strings.Contains(after, "Hijacked") || strings.Contains(after, `"status":"approved"`) {
			t.Fatalf("protected field changed through profile: %s", after)
		}
	} else if rec.Code != 400 && rec.Code != 422 {
		t.Fatalf("unexpected status %d", rec.Code)
	}
	now := e.do("GET", "/api/v1/auth/me", nil, mc)
	if !strings.Contains(now.Body.String(), `"role":"member"`) || strings.Contains(now.Body.String(), "Hijacked") {
		t.Fatalf("account changed: before %s after %s", before.Body, now.Body)
	}
	// the endpoint is bound to the signed-in identity: there is no id to aim at another member
	if rec := e.do("PATCH", "/api/v1/me/profile/"+"someone-else", map[string]any{"phone": "01712345678"}, mc); rec.Code != 404 && rec.Code != 405 {
		t.Fatalf("no per-user profile route should exist, got %d", rec.Code)
	}
}
