package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"
)

type fakeInviter struct {
	mu    sync.Mutex
	calls []string
	err   error
}

func (f *fakeInviter) Invite(_ context.Context, email, redirectTo string) (string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls = append(f.calls, email+"|"+redirectTo)
	if f.err != nil {
		return "", f.err
	}
	return "auth-user-secret-id", nil
}

func inviteEnv(t *testing.T) (*env2, *fakeInviter, *http.Cookie) {
	t.Helper()
	e := authApp(t)
	if len(e.app.Store.Students) < 4 {
		t.Skip("needs the directory data")
	}
	f := &fakeInviter{}
	e.app.Auth.Inviter = f
	return e, f, e.admin(t)
}

func setEmail(e *env2, ck *http.Cookie, id, email string) *httptest.ResponseRecorder {
	return e.do("PATCH", "/api/v1/admin/imported-students/"+id+"/email", map[string]string{"email": email}, ck)
}

func sendInviteReq(e *env2, ck *http.Cookie, id string) *httptest.ResponseRecorder {
	return e.do("POST", "/api/v1/admin/imported-students/"+id+"/invite", map[string]string{}, ck)
}

func TestInviteNeedsConfigurationAndAValidEmail(t *testing.T) {
	e, _, admin := inviteEnv(t)
	id := e.app.Store.Students[0].ID
	e.app.Auth.Inviter = nil
	if rec := sendInviteReq(e, admin, id); rec.Code != 422 || !strings.Contains(rec.Body.String(), "no_email") {
		t.Fatalf("no email saved: %d %s", rec.Code, rec.Body)
	}
	for _, bad := range []string{"", "not-an-email", "a@b", strings.Repeat("x", 130) + "@example.org"} {
		if rec := setEmail(e, admin, id, bad); rec.Code != 422 {
			t.Errorf("%q should be refused: %d", bad, rec.Code)
		}
	}
	if rec := setEmail(e, admin, id, "Person.One@Example.org"); rec.Code != 200 || !strings.Contains(rec.Body.String(), "person.one@example.org") {
		t.Fatalf("save email: %d %s", rec.Code, rec.Body)
	}
	if rec := sendInviteReq(e, admin, id); rec.Code != 503 || !strings.Contains(rec.Body.String(), "invite_not_configured") {
		t.Fatalf("without the admin key nothing may be sent or claimed: %d %s", rec.Code, rec.Body)
	}
	if rec := setEmail(e, admin, "does-not-exist", "x@example.org"); rec.Code != 404 {
		t.Fatalf("unknown record: %d", rec.Code)
	}
}

func TestInviteSendCooldownDuplicatesAndSecrecy(t *testing.T) {
	e, f, admin := inviteEnv(t)
	a, b := e.app.Store.Students[0].ID, e.app.Store.Students[1].ID
	setEmail(e, admin, a, "one@example.org")
	if rec := setEmail(e, admin, b, "ONE@example.org"); rec.Code != 409 || !strings.Contains(rec.Body.String(), "email_taken") {
		t.Fatalf("one address, one record: %d %s", rec.Code, rec.Body)
	}
	rec := sendInviteReq(e, admin, a)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"status":"sent"`) || !strings.Contains(rec.Body.String(), "accepted_by_provider") {
		t.Fatalf("send: %d %s", rec.Code, rec.Body)
	}
	if strings.Contains(rec.Body.String(), "auth-user-secret-id") {
		t.Fatal("the Auth user id must not be sent to the browser")
	}
	if len(f.calls) != 1 || !strings.HasPrefix(f.calls[0], "one@example.org|") || !strings.HasSuffix(f.calls[0], "/activate") {
		t.Fatalf("provider call: %v", f.calls)
	}
	// repeated clicks do not send again inside the cooldown
	if rec := sendInviteReq(e, admin, a); rec.Code != 429 || !strings.Contains(rec.Body.String(), "cooldown") || len(f.calls) != 1 {
		t.Fatalf("cooldown: %d %s calls=%d", rec.Code, rec.Body, len(f.calls))
	}
	// admin only
	member := e.member(t, "plain@example.org")
	for _, ck := range []*http.Cookie{nil, member} {
		if r := sendInviteReq(e, ck, a); r.Code != 401 && r.Code != 403 {
			t.Fatalf("non-admin invite: %d", r.Code)
		}
		if r := setEmail(e, ck, a, "x@example.org"); r.Code != 401 && r.Code != 403 {
			t.Fatalf("non-admin email: %d", r.Code)
		}
	}
	// an address that already belongs to a registered account is never invited
	if rec := setEmail(e, admin, b, "plain@example.org"); rec.Code != 409 || !strings.Contains(rec.Body.String(), "email_in_use") {
		t.Fatalf("registered address: %d %s", rec.Code, rec.Body)
	}
	// changing the address resets the status; the old send no longer counts as sent to the new address
	setEmail(e, admin, a, "two@example.org")
	inv, _ := e.mem.InviteFor(context.Background(), a)
	if inv.Status != "saved" {
		t.Fatalf("a changed address must reset the status: %+v", inv)
	}
}

func TestInviteProviderOutcomesAreReportedHonestly(t *testing.T) {
	e, f, admin := inviteEnv(t)
	id := e.app.Store.Students[0].ID
	setEmail(e, admin, id, "outcome@example.org")

	f.err = ErrInviteExists
	if rec := sendInviteReq(e, admin, id); rec.Code != 409 || !strings.Contains(rec.Body.String(), "account_exists") {
		t.Fatalf("existing auth account: %d %s", rec.Code, rec.Body)
	}
	if inv, _ := e.mem.InviteFor(context.Background(), id); inv.Status != "saved" || inv.SendCount != 0 {
		t.Fatalf("an existing account must not be recorded as invited: %+v", inv)
	}
	f.err = ErrInviteRateLimited
	if rec := sendInviteReq(e, admin, id); rec.Code != 429 || !strings.Contains(rec.Body.String(), "provider_rate_limited") {
		t.Fatalf("provider limit: %d %s", rec.Code, rec.Body)
	}
	f.err = ErrInviteNotAllowed
	if rec := sendInviteReq(e, admin, id); rec.Code != 503 {
		t.Fatalf("refused key: %d", rec.Code)
	}
	f.err = context.DeadlineExceeded
	if rec := sendInviteReq(e, admin, id); rec.Code != 502 || !strings.Contains(rec.Body.String(), "invite_failed") {
		t.Fatalf("provider error: %d %s", rec.Code, rec.Body)
	}
	inv, _ := e.mem.InviteFor(context.Background(), id)
	if inv.Status != "failed" || inv.SendCount != 0 || inv.LastError == "" {
		t.Fatalf("failure recorded: %+v", inv)
	}
	// a failed attempt may be retried right away (the cooldown only protects people who were actually emailed)
	f.err = nil
	if rec := sendInviteReq(e, admin, id); rec.Code != 200 {
		t.Fatalf("retry after failure: %d %s", rec.Code, rec.Body)
	}
	if inv, _ = e.mem.InviteFor(context.Background(), id); inv.Status != "sent" || inv.SendCount != 1 {
		t.Fatalf("after retry: %+v", inv)
	}
}

func TestInviteLimitsAndControlledBatch(t *testing.T) {
	e, f, admin := inviteEnv(t)
	e.app.Auth.Invite.PerHour = 2
	ids := []string{}
	for i := 0; i < 4; i++ {
		id := e.app.Store.Students[i].ID
		ids = append(ids, id)
		setEmail(e, admin, id, "batch"+string(rune('a'+i))+"@example.org")
	}
	rec := e.do("POST", "/api/v1/admin/invitations/send", map[string]string{}, admin)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"sent":2`) || !strings.Contains(rec.Body.String(), `"stopped":"limit_hour"`) || len(f.calls) != 2 {
		t.Fatalf("batch must stop at the hourly limit: %d %s calls=%d", rec.Code, rec.Body, len(f.calls))
	}
	// a single send over the limit is refused with the limit reported, and nothing is called
	var left string
	for _, id := range ids {
		if inv, _ := e.mem.InviteFor(context.Background(), id); inv.Status == "saved" {
			left = id
		}
	}
	if rec := sendInviteReq(e, admin, left); rec.Code != 429 || !strings.Contains(rec.Body.String(), "limit_hour") || len(f.calls) != 2 {
		t.Fatalf("over the limit: %d %s", rec.Code, rec.Body)
	}
	st := e.do("GET", "/api/v1/admin/invitations/status", nil, admin)
	if !strings.Contains(st.Body.String(), `"perHour":2`) || !strings.Contains(st.Body.String(), `"usedHour":2`) || !strings.Contains(st.Body.String(), `"configured":true`) {
		t.Fatalf("status: %s", st.Body)
	}
	// a provider failure stops a batch instead of hammering the provider
	e.app.Auth.Invite.PerHour = 50
	f.err = context.DeadlineExceeded
	rec = e.do("POST", "/api/v1/admin/invitations/send", map[string]string{}, admin)
	if !strings.Contains(rec.Body.String(), `"failed":1`) || !strings.Contains(rec.Body.String(), `"stopped":"invite_failed"`) {
		t.Fatalf("failure should stop the batch: %s", rec.Body)
	}
}

func TestInvitedPersonSeesPrefilledProfileOnlyWhenVerifiedAndCompletesOnce(t *testing.T) {
	e, _, admin := inviteEnv(t)
	rec := e.app.Store.Students[0]
	setEmail(e, admin, rec.ID, "invited@example.org")
	if r := sendInviteReq(e, admin, rec.ID); r.Code != 200 {
		t.Fatalf("send: %d", r.Code)
	}
	ctx := context.Background()
	hash, _ := hashPassword("Their#Own9Words")
	login := func(verified bool, email string) *http.Cookie {
		if _, err := e.mem.CreateUser(ctx, NewUser{Email: email, PasswordHash: hash, Role: RoleMember, Verified: verified}); err != nil {
			t.Fatal(err)
		}
		lr := e.do("POST", "/api/v1/auth/login", map[string]string{"email": email, "password": "Their#Own9Words"}, nil)
		if c := sessionCookie(lr); c != nil {
			return c
		}
		return nil
	}
	// an address that is not confirmed gets nothing, even if it matches
	if c := login(false, "invited@example.org"); c != nil {
		if r := e.do("GET", "/api/v1/me/invitation", nil, c); strings.Contains(r.Body.String(), rec.Name) {
			t.Fatal("profile details must not be released to an unverified address")
		}
	}
	u, _ := e.mem.UserByEmail(ctx, "invited@example.org")
	_ = e.mem.SetEmailVerified(ctx, u.ID) // what Supabase's confirmation does
	lr := e.do("POST", "/api/v1/auth/login", map[string]string{"email": "invited@example.org", "password": "Their#Own9Words"}, nil)
	c := sessionCookie(lr)
	if c == nil {
		t.Fatalf("login: %d %s", lr.Code, lr.Body)
	}
	r := e.do("GET", "/api/v1/me/invitation", nil, c)
	if r.Code != 200 || !strings.Contains(r.Body.String(), `"invited":true`) || !strings.Contains(r.Body.String(), rec.Name) || !strings.Contains(r.Body.String(), rec.Department) {
		t.Fatalf("prefill: %d %s", r.Code, r.Body)
	}
	if e.do("GET", "/api/v1/me/invitation", nil, nil).Code != 401 {
		t.Fatal("must require sign-in")
	}
	// submitting the completed profile creates exactly one pending profile and completes the invitation
	body := map[string]any{"name": rec.Name, "batch": *rec.Batch, "department": rec.Department, "session": "2020-21", "phone": "01712345678", "upazila": "kasba", "union": "Kuti"}
	if r := e.do("POST", "/api/v1/me/profile", body, c); r.Code != 201 {
		t.Fatalf("complete profile: %d %s", r.Code, r.Body)
	}
	inv, _ := e.mem.InviteFor(ctx, rec.ID)
	p, _ := e.mem.ProfileByUser(ctx, u.ID)
	if inv.Status != "completed" || p == nil || p.Status != StatusPending {
		t.Fatalf("after completion: %+v %+v", inv, p)
	}
	if _, total, _ := e.mem.ListMembersAdmin(ctx, MemberQuery{Status: StatusPending, Page: 1, Limit: 10}); total != 1 {
		t.Fatalf("exactly one pending request expected: %d", total)
	}
	if again := e.do("GET", "/api/v1/me/invitation", nil, c); strings.Contains(again.Body.String(), `"invited":true`) {
		t.Fatal("a completed invitation must not offer the prefill again")
	}
	// the directory record cannot be invited again once its person has activated
	if r := sendInviteReq(e, admin, rec.ID); r.Code != 409 || !strings.Contains(r.Body.String(), "already_completed") {
		t.Fatalf("resend after completion: %d %s", r.Code, r.Body)
	}
	if r := setEmail(e, admin, rec.ID, "other@example.org"); r.Code != 200 { // a verified person can be moved to a new address
		t.Fatalf("email change after completion: %d", r.Code)
	}
}

func TestInviteDerivedExpiry(t *testing.T) {
	e, _, admin := inviteEnv(t)
	id := e.app.Store.Students[0].ID
	setEmail(e, admin, id, "late@example.org")
	sendInviteReq(e, admin, id)
	e.mem.invites[id].LastSentAt = time.Now().Add(-48 * time.Hour).UTC().Format(time.RFC3339)
	list := e.do("GET", "/api/v1/admin/imported-students?q="+strings.Split(e.app.Store.Students[0].Name, " ")[0], nil, admin)
	if !strings.Contains(list.Body.String(), `"expired":true`) {
		t.Fatalf("an old unaccepted invitation should be flagged as probably expired: %s", list.Body)
	}
	if strings.Contains(list.Body.String(), "auth-user-secret-id") {
		t.Fatal("auth id leaked into the list")
	}
}

func inviteStoreSuite(t *testing.T, s AuthStore) {
	ctx := context.Background()
	admin, err := s.CreateUser(ctx, NewUser{Email: "inv-admin@example.com", PasswordHash: "h", Role: RoleAdmin, Verified: true})
	if err != nil {
		t.Fatal(err)
	}
	u, err := s.CreateUser(ctx, NewUser{Email: "inv-user@example.com", PasswordHash: "h", Role: RoleMember, Verified: true})
	if err != nil {
		t.Fatal(err)
	}
	if err := s.SetInviteEmail(ctx, "d-1", "Invite.One@example.org"); err != nil {
		t.Fatal(err)
	}
	if err := s.SetInviteEmail(ctx, "d-2", "invite.one@EXAMPLE.org"); err != ErrEmailTaken {
		t.Fatalf("an address belongs to one record: %v", err)
	}
	if got, err := s.InviteByEmail(ctx, "INVITE.ONE@example.org"); err != nil || got.ImportedID != "d-1" || got.Status != "saved" {
		t.Fatalf("by email: %+v %v", got, err)
	}
	if err := s.RecordInvite(ctx, "d-1", true, "auth-1", ""); err != nil {
		t.Fatal(err)
	}
	if err := s.RecordInvite(ctx, "d-1", false, "", "provider error"); err != nil {
		t.Fatal(err)
	}
	inv, _ := s.InviteFor(ctx, "d-1")
	if inv.Status != "failed" || inv.SendCount != 1 || inv.LastError != "provider error" || inv.LastSentAt == "" {
		t.Fatalf("recorded: %+v", inv)
	}
	if n, err := s.InviteEvents(ctx, time.Now().Add(-time.Hour)); err != nil || n < 2 {
		t.Fatalf("events: %d %v", n, err)
	}
	if n, _ := s.InviteEvents(ctx, time.Now().Add(time.Hour)); n != 0 {
		t.Fatalf("future window should be empty: %d", n)
	}
	if err := s.SetInviteEmail(ctx, "d-1", "changed@example.org"); err != nil {
		t.Fatal(err)
	}
	if inv, _ = s.InviteFor(ctx, "d-1"); inv.Status != "saved" || inv.LastError != "" {
		t.Fatalf("a changed address resets the state: %+v", inv)
	}
	if err := s.CompleteInvite(ctx, "d-1", u.ID); err != nil {
		t.Fatal(err)
	}
	cur, _ := s.InviteFor(ctx, "d-1")
	if err := s.SetInviteEmail(ctx, "d-1", cur.Email); err != ErrInviteCompleted {
		t.Fatalf("saving the activated address again changes nothing: %v", err)
	}
	if all, _ := s.Invites(ctx); all["d-1"].Status != "completed" || all["d-1"].CompletedAt == "" || all["d-1"].CompletedUser != u.ID {
		t.Fatalf("list: %+v", all)
	}
	// deleting an address frees it for another record; an activated person's address cannot be deleted
	if err := s.SetInviteEmail(ctx, "d-3", "free@example.org"); err != nil {
		t.Fatal(err)
	}
	if err := s.DeleteInviteEmail(ctx, "d-3"); err != nil {
		t.Fatal(err)
	}
	if err := s.DeleteInviteEmail(ctx, "d-3"); err != ErrNotFound {
		t.Fatalf("second delete: %v", err)
	}
	if err := s.SetInviteEmail(ctx, "d-4", "free@example.org"); err != nil {
		t.Fatalf("a deleted address can be used again: %v", err)
	}
	if err := s.DeleteInviteEmail(ctx, "d-1"); err != ErrInviteCompleted {
		t.Fatalf("an activated person keeps their address: %v", err)
	}
	// moving an activated person to a new address resets the invitation and remembers the earlier account
	if err := s.SetInviteEmail(ctx, "d-1", "later@example.org"); err != nil {
		t.Fatalf("move: %v", err)
	}
	if mv, _ := s.InviteFor(ctx, "d-1"); mv.Status != "saved" || mv.ReplacesUser != u.ID || mv.CompletedUser != "" || mv.CompletedAt != "" {
		t.Fatalf("moved: %+v", mv)
	}
	if err := s.DeleteInviteEmail(ctx, "d-1"); err != ErrInviteCompleted {
		t.Fatalf("a pending move keeps its record: %v", err)
	}
	if err := s.ClearReplaced(ctx, "d-1"); err != nil {
		t.Fatal(err)
	}
	_ = admin
}

func TestMemInviteStoreSuite(t *testing.T) { inviteStoreSuite(t, newMemStore()) }

func TestSupabaseAdminClientAgainstAFakeAuthServer(t *testing.T) {
	var got struct{ path, query, key, auth, body string }
	status, reply := 200, `{"id":"11111111-1111-1111-1111-111111111111","email":"x@example.org"}`
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b := make([]byte, 512)
		n, _ := r.Body.Read(b)
		got.path, got.query, got.key, got.auth, got.body = r.URL.Path, r.URL.RawQuery, r.Header.Get("apikey"), r.Header.Get("Authorization"), string(b[:n])
		w.WriteHeader(status)
		_, _ = w.Write([]byte(reply))
	}))
	defer srv.Close()
	adm := newSupabaseAdmin(srv.URL+"/rest/v1", " service-key ")
	if adm == nil || newSupabaseAdmin(srv.URL, "") != nil || newSupabaseAdmin("", "k") != nil {
		t.Fatal("the client exists only when both the project URL and the key are set")
	}
	id, err := adm.Invite(context.Background(), "x@example.org", "https://site.example/activate")
	if err != nil || id != "11111111-1111-1111-1111-111111111111" {
		t.Fatalf("success: %q %v", id, err)
	}
	if got.path != "/auth/v1/invite" || !strings.Contains(got.query, "redirect_to=https%3A%2F%2Fsite.example%2Factivate") || got.key != "service-key" || got.auth != "Bearer service-key" {
		t.Fatalf("request: %+v", got)
	}
	if got.body != `{"email":"x@example.org"}` {
		t.Fatalf("only the address may be sent, got %q", got.body)
	}
	for _, c := range []struct {
		status int
		body   string
		want   error
	}{
		{422, `{"error_code":"email_exists","msg":"A user with this email address has already been registered"}`, ErrInviteExists},
		{429, `{"error_code":"over_email_send_rate_limit","msg":"email rate limit exceeded"}`, ErrInviteRateLimited},
		{401, `{"msg":"invalid key"}`, ErrInviteNotAllowed},
	} {
		status, reply = c.status, c.body
		if _, err := adm.Invite(context.Background(), "x@example.org", ""); err != c.want {
			t.Errorf("status %d: got %v want %v", c.status, err, c.want)
		}
	}
	status, reply = 500, `{"msg":"boom"}`
	if _, err := adm.Invite(context.Background(), "x@example.org", ""); err == nil || strings.Contains(err.Error(), "service-key") {
		t.Fatalf("server error must be an error without secrets: %v", err)
	}
}

func TestAdminKeyKindsHeadersAndSelection(t *testing.T) {
	var gotKey, gotAuth string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotKey, gotAuth = r.Header.Get("apikey"), r.Header.Get("Authorization")
		w.WriteHeader(200)
		_, _ = w.Write([]byte(`{"users":[]}`))
	}))
	defer srv.Close()
	secret := newSupabaseAdmin(srv.URL, "sb_secret_abc123")
	if secret.Kind() != "secret" || secret.Check(context.Background()) != nil || gotKey != "sb_secret_abc123" || gotAuth != "" {
		t.Fatalf("a secret key travels only in apikey (it is not a JWT): kind=%s key=%q auth=%q", secret.Kind(), gotKey, gotAuth)
	}
	legacy := newSupabaseAdmin(srv.URL, "aaa.bbb.ccc")
	if legacy.Kind() != "legacy-jwt" || legacy.Check(context.Background()) != nil || gotKey != "aaa.bbb.ccc" || gotAuth != "Bearer aaa.bbb.ccc" {
		t.Fatalf("a legacy JWT key needs both headers: kind=%s auth=%q", legacy.Kind(), gotAuth)
	}
	for _, c := range []struct{ secret, legacy, want, source string }{
		{"sb_secret_new", "a.b.c", "sb_secret_new", "SUPABASE_SECRET_KEY"},
		{"", "a.b.c", "a.b.c", "SUPABASE_SERVICE_ROLE_KEY"},
		{" \"sb_secret_q\" ", "", "sb_secret_q", "SUPABASE_SECRET_KEY"},
		{"sb_publishable_oops", "", "", ""}, // a publishable key is public and has no admin rights: never used
		{"", "", "", ""},
	} {
		if k, src := pickAdminKey(c.secret, c.legacy); k != c.want || src != c.source {
			t.Errorf("pickAdminKey(%q,%q) = %q,%q", c.secret, c.legacy, k, src)
		}
	}
}

func TestInviteFailureClassesAreDistinct(t *testing.T) {
	status, reply := 500, `{"error_code":"unexpected_failure","msg":"Error sending invite email"}`
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(status); _, _ = w.Write([]byte(reply)) }))
	defer srv.Close()
	adm := newSupabaseAdmin(srv.URL, "sb_secret_x")
	for _, c := range []struct {
		status int
		body   string
		want   error
	}{
		{500, `{"error_code":"unexpected_failure","msg":"Error sending invite email"}`, ErrInviteSMTP},
		{400, `{"error_code":"email_address_invalid","msg":"Email address \"x\" is invalid"}`, ErrInviteBadAddress},
		{422, `{"error_code":"validation_failed","msg":"Unable to validate email address: invalid format"}`, ErrInviteBadAddress},
		{429, `{"error_code":"over_email_send_rate_limit","msg":"email rate limit exceeded"}`, ErrInviteRateLimited},
		{401, `{"msg":"Invalid API key"}`, ErrInviteNotAllowed},
		{422, `{"error_code":"email_exists","msg":"A user with this email address has already been registered"}`, ErrInviteExists},
	} {
		status, reply = c.status, c.body
		if _, err := adm.Invite(context.Background(), "x@example.org", ""); err != c.want {
			t.Errorf("%d %s: got %v want %v", c.status, c.body, err, c.want)
		}
	}
}

func TestInviteReportsARefusedKeyAndMapsEachFailureForTheAdmin(t *testing.T) {
	e, _, admin := inviteEnv(t)
	id := e.app.Store.Students[0].ID
	setEmail(e, admin, id, "keycheck@example.org")
	status := 401
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(status)
		_, _ = w.Write([]byte(`{"msg":"Invalid API key"}`))
	}))
	defer srv.Close()
	e.app.Auth.Inviter = newSupabaseAdmin(srv.URL, "sb_secret_wrong")
	setKeyState("checking", "secret")
	defer setKeyState("missing", "")
	rec := sendInviteReq(e, admin, id)
	if rec.Code != 503 || !strings.Contains(rec.Body.String(), "invite_key_invalid") || strings.Contains(rec.Body.String(), "sb_secret") {
		t.Fatalf("a refused key must be reported as such, without the key: %d %s", rec.Code, rec.Body)
	}
	if inv, _ := e.mem.InviteFor(context.Background(), id); inv.Status != "saved" || inv.SendCount != 0 {
		t.Fatalf("nothing may be recorded as sent: %+v", inv)
	}
	if st := e.do("GET", "/api/v1/admin/invitations/status", nil, admin); !strings.Contains(st.Body.String(), `"keyStatus":"invalid"`) || !strings.Contains(st.Body.String(), `"configured":false`) {
		t.Fatalf("status must say the key is invalid: %s", st.Body)
	}
	// once the key is accepted, the failure classes of the invitation call reach the admin as distinct answers
	status = 200
	setKeyState("checking", "secret")
	inviteReply, inviteStatus := `{"error_code":"unexpected_failure","msg":"Error sending invite email"}`, 500
	srv2 := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/invite") {
			w.WriteHeader(inviteStatus)
			_, _ = w.Write([]byte(inviteReply))
			return
		}
		w.WriteHeader(200)
		_, _ = w.Write([]byte(`{"users":[]}`))
	}))
	defer srv2.Close()
	e.app.Auth.Inviter = newSupabaseAdmin(srv2.URL, "sb_secret_ok")
	if rec := sendInviteReq(e, admin, id); rec.Code != 502 || !strings.Contains(rec.Body.String(), "smtp_failed") {
		t.Fatalf("SMTP failure: %d %s", rec.Code, rec.Body)
	}
	inviteStatus, inviteReply = 400, `{"error_code":"email_address_invalid","msg":"Email address is invalid"}`
	if rec := sendInviteReq(e, admin, id); rec.Code != 422 || !strings.Contains(rec.Body.String(), "invalid_recipient") {
		t.Fatalf("invalid recipient: %d %s", rec.Code, rec.Body)
	}
	inviteStatus, inviteReply = 429, `{"error_code":"over_email_send_rate_limit","msg":"rate"}`
	if rec := sendInviteReq(e, admin, id); rec.Code != 429 || !strings.Contains(rec.Body.String(), "provider_rate_limited") {
		t.Fatalf("rate limit: %d %s", rec.Code, rec.Body)
	}
	inviteStatus, inviteReply = 200, `{"id":"22222222-2222-2222-2222-222222222222"}`
	if rec := sendInviteReq(e, admin, id); rec.Code != 200 || !strings.Contains(rec.Body.String(), `"status":"sent"`) {
		t.Fatalf("success: %d %s", rec.Code, rec.Body)
	}
}

func TestAdminCanRemoveASavedEmailExceptAfterActivation(t *testing.T) {
	e, f, admin := inviteEnv(t)
	a, b := e.app.Store.Students[0].ID, e.app.Store.Students[1].ID
	setEmail(e, admin, a, "remove.me@example.org")
	member := e.member(t, "plain2@example.org")
	del := func(ck *http.Cookie, id string) *httptest.ResponseRecorder {
		return e.do("DELETE", "/api/v1/admin/imported-students/"+id+"/email", nil, ck)
	}
	for _, ck := range []*http.Cookie{nil, member} {
		if r := del(ck, a); r.Code != 401 && r.Code != 403 {
			t.Fatalf("only admins may delete: %d", r.Code)
		}
	}
	if r := del(admin, b); r.Code != 404 {
		t.Fatalf("nothing saved: %d", r.Code)
	}
	// an address that was already invited can still be removed; nothing is sent and the old address is forgotten
	sendInviteReq(e, admin, a)
	if r := del(admin, a); r.Code != 200 {
		t.Fatalf("delete: %d %s", r.Code, r.Body)
	}
	if _, err := e.mem.InviteFor(context.Background(), a); err != ErrNotFound {
		t.Fatal("the address should be gone")
	}
	if r := sendInviteReq(e, admin, a); r.Code != 422 || len(f.calls) != 1 {
		t.Fatalf("without an address nothing can be sent: %d calls=%d", r.Code, len(f.calls))
	}
	// the address is free for another record
	if r := setEmail(e, admin, b, "remove.me@example.org"); r.Code != 200 {
		t.Fatalf("reuse: %d %s", r.Code, r.Body)
	}
	// once the person has activated, it is final
	_ = e.mem.CompleteInvite(context.Background(), b, "")
	if r := del(admin, b); r.Code != 409 || !strings.Contains(r.Body.String(), "already_completed") {
		t.Fatalf("activated: %d %s", r.Code, r.Body)
	}
}

func TestApplyInviteTemplateComparesBeforeChangingAnything(t *testing.T) {
	var patched map[string]string
	current := map[string]string{"mailer_subjects_invite": "You have been invited", "mailer_templates_invite_content": "<h2>You have been invited</h2>"}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer sbp_test" || r.URL.Path != "/v1/projects/abcd/config/auth" {
			w.WriteHeader(401)
			return
		}
		if r.Method == http.MethodPatch {
			patched = map[string]string{}
			b := make([]byte, 1<<16)
			n, _ := r.Body.Read(b)
			_ = json.Unmarshal(b[:n], &patched)
			current = patched
			w.WriteHeader(200)
			return
		}
		w.WriteHeader(200)
		_ = json.NewEncoder(w).Encode(current)
	}))
	defer srv.Close()
	m := &mgmt{base: srv.URL, token: "sbp_test", client: srv.Client()}
	html := "<!DOCTYPE html><html>{{ .ConfirmationURL }}</html>"
	rep, err := applyInviteTemplate(context.Background(), m, "abcd", html, defaultInviteSubject, false)
	if err != nil || patched != nil || !strings.Contains(rep, "different: run again with --apply") {
		t.Fatalf("a preview must change nothing: %v %v %q", err, patched, rep)
	}
	rep, err = applyInviteTemplate(context.Background(), m, "abcd", html, defaultInviteSubject, true)
	if err != nil || patched["mailer_templates_invite_content"] != html || patched["mailer_subjects_invite"] != defaultInviteSubject || !strings.Contains(rep, "published") {
		t.Fatalf("apply: %v %v", err, patched)
	}
	if len(patched) != 2 {
		t.Fatalf("only the invite subject and body may be touched: %v", patched)
	}
	if rep, _ = applyInviteTemplate(context.Background(), m, "abcd", html, defaultInviteSubject, true); !strings.Contains(rep, "already up to date") {
		t.Fatalf("idempotent: %q", rep)
	}
	if _, err = applyInviteTemplate(context.Background(), &mgmt{base: srv.URL, token: "bad", client: srv.Client()}, "abcd", html, defaultInviteSubject, true); err == nil || strings.Contains(err.Error(), "bad") && !strings.Contains(err.Error(), "refused") {
		t.Fatalf("a refused token must be explained without echoing it: %v", err)
	}
	if projectRef("https://abcd.supabase.co/rest/v1") != "abcd" || projectRef("http://localhost:54321") != "" {
		t.Fatal("project ref parsing")
	}
}

func TestConfirmSignupTemplateTouchesOnlyItsOwnFields(t *testing.T) {
	var patched map[string]string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPatch {
			patched = map[string]string{}
			b := make([]byte, 1<<16)
			n, _ := r.Body.Read(b)
			_ = json.Unmarshal(b[:n], &patched)
			w.WriteHeader(200)
			return
		}
		w.WriteHeader(200)
		_ = json.NewEncoder(w).Encode(map[string]string{"mailer_subjects_confirmation": "Confirm Your Signup", "mailer_templates_invite_content": "keep me"})
	}))
	defer srv.Close()
	m := &mgmt{base: srv.URL, token: "sbp_test", client: srv.Client()}
	kind := authTemplates["confirm"]
	html := "<!DOCTYPE html><html>{{ .ConfirmationURL }}</html>"
	rep, err := applyAuthTemplate(context.Background(), m, "abcd", kind, html, kind.subject, true)
	if err != nil || len(patched) != 2 || patched["mailer_templates_confirmation_content"] != html || patched["mailer_subjects_confirmation"] != defaultConfirmSubject || !strings.Contains(rep, "Confirm signup") {
		t.Fatalf("confirm publish: %v %v %q", err, patched, rep)
	}
	if k := authTemplates["recovery"]; k.subjectKey != "mailer_subjects_recovery" || k.contentKey != "mailer_templates_recovery_content" || k.subject != defaultRecoverySubject {
		t.Fatalf("recovery template keys: %+v", k)
	}
	photo := ""
	for name, file := range map[string]string{"confirm": authTemplates["confirm"].file, "invite": authTemplates["invite"].file, "recovery": authTemplates["recovery"].file} {
		raw, err := os.ReadFile(file)
		if err != nil {
			t.Fatalf("%s template: %v", name, err)
		}
		s := string(raw)
		if !strings.Contains(s, "{{ .ConfirmationURL }}") || strings.Contains(s, "Jela") || strings.Contains(s, "{{ .Token }}") || strings.Contains(s, "{{ .Email }}") {
			t.Fatalf("%s template must carry the link and only the link variable, under the BSWA name", name)
		}
		// every email shows the same public photograph of the university
		i := strings.Index(s, `class="hero-image" src="`)
		if i < 0 {
			t.Fatalf("%s template has no university photograph", name)
		}
		src := s[i+len(`class="hero-image" src="`):]
		src = src[:strings.Index(src, `"`)]
		if photo == "" {
			photo = src
		} else if src != photo || !strings.HasPrefix(src, "https://") {
			t.Fatalf("%s template uses another photograph: %s", name, src)
		}
	}
}
