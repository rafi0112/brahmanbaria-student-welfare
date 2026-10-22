package main

import (
	"errors"
	"net"
	"bytes"
	"context"
	"encoding/json"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// committeeStoreSuite runs the same rules against every store implementation.
func committeeStoreSuite(t *testing.T, s AuthStore) {
	ctx := context.Background()
	mk := func(email, name string) User {
		u, err := s.CreateUser(ctx, NewUser{Email: email, PasswordHash: "h", Role: RoleMember, Verified: true,
			Profile: &Profile{Name: name, Batch: 17, Department: "Finance", Upazila: "kasba", Union: "Kuti"}})
		if err != nil {
			t.Fatal(err)
		}
		return u
	}
	admin, err := s.CreateUser(ctx, NewUser{Email: "committee-admin@example.com", PasswordHash: "h", Role: RoleAdmin, Verified: true})
	if err != nil {
		t.Fatal(err)
	}
	a1, a2 := mk("committee-a1@example.com", "Alpha One"), mk("committee-a2@example.com", "Beta Two")

	c1, err := s.CreateCommittee(ctx, admin.ID, CommitteeInput{Name: "Committee 2026", Term: "2026-27", StartsOn: "2026-01-01", EndsOn: "2026-12-31"})
	if err != nil || c1.Status != CommitteeDraft || c1.StartsOn != "2026-01-01" {
		t.Fatalf("create: %+v %v", c1, err)
	}
	if _, _, err := s.PublishedCommittee(ctx); err != ErrNotFound {
		t.Fatalf("nothing is published yet: %v", err)
	}
	if _, err := s.SetCommitteeStatus(ctx, admin.ID, c1.ID, "publish"); err != ErrEmptyCommittee {
		t.Fatalf("an empty committee must not publish: %v", err)
	}

	// a registered member keeps their identity; the name defaults to their profile
	x1, err := s.AddExecutive(ctx, admin.ID, c1.ID, ExecutiveInput{UserID: a1.ID, Designation: "President"})
	if err != nil || x1.Name != "Alpha One" || x1.UserID != a1.ID {
		t.Fatalf("add member: %+v %v", x1, err)
	}
	if _, err := s.AddExecutive(ctx, admin.ID, c1.ID, ExecutiveInput{UserID: a1.ID, Designation: "Secretary"}); err != ErrDuplicateExecutive {
		t.Fatalf("one seat per member: %v", err)
	}
	if _, err := s.AddExecutive(ctx, admin.ID, c1.ID, ExecutiveInput{UserID: "00000000-0000-0000-0000-00000000dead", Designation: "X1"}); err != ErrUnknownMember {
		t.Fatalf("unknown member: %v", err)
	}
	x2, err := s.AddExecutive(ctx, admin.ID, c1.ID, ExecutiveInput{Name: "Guest Person", Designation: "Advisor"})
	if err != nil || x2.UserID != "" {
		t.Fatalf("standalone: %+v %v", x2, err)
	}
	x3, err := s.AddExecutive(ctx, admin.ID, c1.ID, ExecutiveInput{UserID: a2.ID, Designation: "Treasurer"})
	if err != nil || !(x1.Order < x2.Order && x2.Order < x3.Order) {
		t.Fatalf("seats are appended in order: %+v %+v %+v %v", x1, x2, x3, err)
	}

	// reorder: must list everyone exactly once
	if err := s.ReorderExecutives(ctx, admin.ID, c1.ID, []string{x3.ID, x1.ID}); err != ErrReorderMismatch {
		t.Fatalf("short list: %v", err)
	}
	if err := s.ReorderExecutives(ctx, admin.ID, c1.ID, []string{x3.ID, x3.ID, x1.ID}); err != ErrReorderMismatch {
		t.Fatalf("repeated id: %v", err)
	}
	if err := s.ReorderExecutives(ctx, admin.ID, c1.ID, []string{x3.ID, x1.ID, x2.ID}); err != nil {
		t.Fatal(err)
	}
	if _, xs, _ := s.CommitteeDetail(ctx, c1.ID); len(xs) != 3 || xs[0].ID != x3.ID || xs[2].ID != x2.ID {
		t.Fatalf("order not applied: %+v", xs)
	}

	// publish, and a second committee replaces it atomically
	if p, err := s.SetCommitteeStatus(ctx, admin.ID, c1.ID, "publish"); err != nil || p.Status != CommitteePublished {
		t.Fatalf("publish: %+v %v", p, err)
	}
	if _, err := s.SetCommitteeStatus(ctx, admin.ID, c1.ID, "publish"); err != ErrBadState {
		t.Fatalf("publishing twice: %v", err)
	}
	c2, _ := s.CreateCommittee(ctx, admin.ID, CommitteeInput{Name: "Committee 2027"})
	if _, err := s.AddExecutive(ctx, admin.ID, c2.ID, ExecutiveInput{UserID: a1.ID, Designation: "President"}); err != nil {
		t.Fatalf("the same member may sit in a different committee: %v", err)
	}
	if _, err := s.SetCommitteeStatus(ctx, admin.ID, c2.ID, "publish"); err != nil {
		t.Fatal(err)
	}
	if got, _, _ := s.PublishedCommittee(ctx); got.ID != c2.ID {
		t.Fatalf("the new panel should be the published one: %+v", got)
	}
	if old, _, _ := s.CommitteeDetail(ctx, c1.ID); old.Status != CommitteeArchived {
		t.Fatalf("the replaced panel should be archived: %+v", old)
	}

	// archived terms are frozen but readable
	if _, err := s.AddExecutive(ctx, admin.ID, c1.ID, ExecutiveInput{Name: "Late Add", Designation: "Member"}); err != ErrCommitteeArchived {
		t.Fatalf("archived add: %v", err)
	}
	if _, err := s.UpdateCommittee(ctx, admin.ID, c1.ID, CommitteeInput{Name: "Renamed"}); err != ErrCommitteeArchived {
		t.Fatalf("archived edit: %v", err)
	}
	if err := s.RemoveExecutive(ctx, admin.ID, x1.ID); err != ErrCommitteeArchived {
		t.Fatalf("archived remove: %v", err)
	}
	if _, xs, _ := s.CommitteeDetail(ctx, c1.ID); len(xs) != 3 {
		t.Fatalf("history must stay intact: %+v", xs)
	}

	// removal frees the seat but never touches the account or profile
	c3, _ := s.CreateCommittee(ctx, admin.ID, CommitteeInput{Name: "Draft"})
	y, err := s.AddExecutive(ctx, admin.ID, c3.ID, ExecutiveInput{UserID: a2.ID, Designation: "Member"})
	if err != nil {
		t.Fatal(err)
	}
	if err := s.RemoveExecutive(ctx, admin.ID, y.ID); err != nil {
		t.Fatal(err)
	}
	if err := s.RemoveExecutive(ctx, admin.ID, y.ID); err != ErrNotFound {
		t.Fatalf("removing twice: %v", err)
	}
	if u, err := s.UserByID(ctx, a2.ID); err != nil || u.Email != "committee-a2@example.com" {
		t.Fatalf("the account must survive removal: %+v %v", u, err)
	}
	if p, err := s.ProfileByUser(ctx, a2.ID); err != nil || p.Name != "Beta Two" {
		t.Fatalf("the profile must survive removal: %+v %v", p, err)
	}
	if _, err := s.AddExecutive(ctx, admin.ID, c3.ID, ExecutiveInput{UserID: a2.ID, Designation: "Member Again"}); err != nil {
		t.Fatalf("a removed member can be added back: %v", err)
	}

	// editing a seat
	nm, ph := "Alpha Renamed", "11111111-1111-4111-8111-111111111111.png"
	if got, err := s.UpdateExecutive(ctx, admin.ID, x3.ID, ExecutivePatch{}); err == nil && got.ID != "" {
		_ = got // x3 sits in an archived committee: must be refused
		t.Fatal("editing a seat of an archived committee must fail")
	}
	z, _ := s.AddExecutive(ctx, admin.ID, c3.ID, ExecutiveInput{Name: "Edit Me", Designation: "Member"})
	if got, err := s.UpdateExecutive(ctx, admin.ID, z.ID, ExecutivePatch{Name: &nm, Photo: &ph}); err != nil || got.Name != nm || got.Photo != ph || got.Designation != "Member" {
		t.Fatalf("patch: %+v %v", got, err)
	}
	if list, err := s.ListCommittees(ctx); err != nil || len(list) < 3 {
		t.Fatalf("list: %+v %v", list, err)
	}
	if _, err := s.SetCommitteeStatus(ctx, admin.ID, c2.ID, "unpublish"); err != nil {
		t.Fatal(err)
	}
	if _, _, err := s.PublishedCommittee(ctx); err != ErrNotFound {
		t.Fatalf("unpublished panel must disappear: %v", err)
	}
}

func TestMemCommitteeStoreSuite(t *testing.T) { committeeStoreSuite(t, newMemStore()) }

// TestPostgresStoresInTempTables runs the committee and CMS suites against the real PostgreSQL schema but on TEMPORARY
// copies of the tables that exist only on one connection and vanish when it closes. The temp tables shadow the real
// ones (they come first in the search path), and every new connection re-creates them, so no real row is read
// or written. Opt in with LIVE_TEMP_TABLES=1 (it reads DATABASE_URL from backend/.env).
func TestPostgresStoresInTempTables(t *testing.T) {
	if os.Getenv("LIVE_TEMP_TABLES") != "1" {
		t.Skip("set LIVE_TEMP_TABLES=1 to run against PostgreSQL temp tables")
	}
	loadDotEnv(".env")
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		t.Skip("DATABASE_URL is not set")
	}
	mig1, _ := migrationFS.ReadFile("migrations/001_auth.sql")
	mig4, _ := migrationFS.ReadFile("migrations/004_admin_roles.sql")
	mig5, _ := migrationFS.ReadFile("migrations/005_executive_committee.sql")
	mig6, _ := migrationFS.ReadFile("migrations/006_cms_members_audit.sql")
	mig7, _ := migrationFS.ReadFile("migrations/007_contact_inbox.sql")
	mig8, _ := migrationFS.ReadFile("migrations/008_imported_reviews.sql")
	mig9, _ := migrationFS.ReadFile("migrations/009_imported_members.sql")
	mig10, _ := migrationFS.ReadFile("migrations/010_member_fields.sql")
	// only the table of 004 is needed here; its function and trigger would be created outside the temp schema
	const roleChanges = `CREATE TEMP TABLE role_changes (id bigserial PRIMARY KEY, target_id uuid NOT NULL, actor_id uuid, old_role text NOT NULL, new_role text NOT NULL,
		source text NOT NULL DEFAULT 'admin_ui', created_at timestamptz NOT NULL DEFAULT now())`
	temp := func(sql string) string {
		sql = strings.ReplaceAll(sql, "CREATE TABLE IF NOT EXISTS ", "CREATE TEMP TABLE ")
		sql = strings.ReplaceAll(sql, "CREATE TABLE ", "CREATE TEMP TABLE ")
		return sql
	}
	cfg, err := pgxpool.ParseConfig(normalizeDatabaseURL(url))
	if err != nil {
		t.Fatal(err)
	}
	cfg.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol
	cfg.MaxConns, cfg.MinConns = 1, 1
	cfg.AfterConnect = func(ctx context.Context, c *pgx.Conn) error {
		// only the pieces of 001 the suite needs (users, profiles), then 004's role rules and 005
		for _, sql := range []string{temp(string(mig1))} {
			if _, err := c.Exec(ctx, sql); err != nil {
				return err
			}
		}
		for _, sql := range []string{temp(string(mig5)), roleChanges, temp(string(mig6)), temp(string(mig7)), temp(string(mig8)), temp(string(mig9)), string(mig10)} {
			if _, err := c.Exec(ctx, sql); err != nil {
				return err
			}
		}
		_ = mig4 // the last-admin trigger is exercised by the auth suite, not needed here
		var n int
		if err := c.QueryRow(ctx, `SELECT count(*) FROM pg_class WHERE relnamespace = pg_my_temp_schema() AND relname IN ('users', 'profiles', 'sessions', 'committees', 'executives', 'committee_audit', 'role_changes', 'cms_entries', 'admin_audit', 'contact_messages', 'contact_replies', 'imported_reviews', 'imported_members')`).Scan(&n); err != nil {
			return err
		}
		if n != 13 {
			t.Fatalf("expected 13 temp tables on this connection, found %d; refusing to continue", n)
		}
		return nil
	}
	pool, err := pgxpool.NewWithConfig(context.Background(), cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	pg := &pgStore{db: pool}
	committeeStoreSuite(t, pg)
	cmsStoreSuite(t, pg)
	contactStoreSuite(t, pg)
	importedStoreSuite(t, pg)
	manualStoreSuite(t, pg)
	memberViewsSuite(t, pg)
}

// ---------------------------------------------------------------- HTTP layer

type fakeImages struct {
	mu         sync.Mutex
	puts       []string
	token      string
	fail       bool
	lastBucket string
}

func (f *fakeImages) Put(_ context.Context, token, bucket, name, ct string, data []byte) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.fail {
		return io.ErrUnexpectedEOF
	}
	f.token, f.lastBucket = token, bucket
	f.puts = append(f.puts, name+"|"+ct+"|"+string(data[:4]))
	return nil
}

func committeeApp(t *testing.T) (*env2, *fakeImages) {
	e := supaApp(t)
	e.makeAdmin(t, "admin-token", emailAdmin)
	img := &fakeImages{}
	e.app.Auth.Images, e.app.Auth.PhotoBase = img, "https://files.example/photos/"
	return e, img
}

func jreq(e *env2, method, path, tok string, body any) *httptest.ResponseRecorder {
	if tok == "" {
		return e.do(method, path, body, nil)
	}
	return e.do(method, path, body, nil, bearer(tok)...)
}

func decodeBody(t *testing.T, rec *httptest.ResponseRecorder, v any) {
	t.Helper()
	if err := json.Unmarshal(rec.Body.Bytes(), v); err != nil {
		t.Fatalf("bad json %q: %v", rec.Body.String(), err)
	}
}

func TestCommitteeEndpointsRequireAnAdmin(t *testing.T) {
	e, _ := committeeApp(t)
	e.touch("member-token")
	calls := []struct{ method, path string }{
		{"GET", "/api/v1/admin/committees"}, {"POST", "/api/v1/admin/committees"}, {"GET", "/api/v1/admin/committees/x"},
		{"PATCH", "/api/v1/admin/committees/x"}, {"POST", "/api/v1/admin/committees/x/publish"},
		{"POST", "/api/v1/admin/committees/x/members"}, {"POST", "/api/v1/admin/committees/x/reorder"},
		{"PATCH", "/api/v1/admin/executives/x"}, {"POST", "/api/v1/admin/executives/x/remove"}, {"POST", "/api/v1/admin/executive-photo"},
	}
	for _, c := range calls {
		if rec := jreq(e, c.method, c.path, "", map[string]any{}); rec.Code != 401 {
			t.Errorf("%s %s without a token: %d", c.method, c.path, rec.Code)
		}
		if rec := jreq(e, c.method, c.path, "member-token", map[string]any{}); rec.Code != 403 {
			t.Errorf("%s %s as a member: %d", c.method, c.path, rec.Code)
		}
	}
	if rec := jreq(e, "GET", "/api/v1/admin/committees", "unconfirmed-token", nil); rec.Code != 403 {
		t.Errorf("unverified account: %d", rec.Code)
	}
}

func TestCommitteeValidation(t *testing.T) {
	e, _ := committeeApp(t)
	for name, body := range map[string]map[string]any{
		"short name":  {"name": "A"},
		"bad date":    {"name": "Panel", "startsOn": "2026-13-45"},
		"end < start": {"name": "Panel", "startsOn": "2026-05-01", "endsOn": "2026-01-01"},
		"long term":   {"name": "Panel", "term": strings.Repeat("x", 81)},
	} {
		if rec := jreq(e, "POST", "/api/v1/admin/committees", "admin-token", body); rec.Code != 422 {
			t.Errorf("%s: %d %s", name, rec.Code, rec.Body)
		}
	}
	var c Committee
	rec := jreq(e, "POST", "/api/v1/admin/committees", "admin-token", map[string]any{"name": "Panel 1"})
	decodeBody(t, rec, &c)
	if rec.Code != 201 || c.Status != CommitteeDraft {
		t.Fatalf("create: %d %s", rec.Code, rec.Body)
	}
	for name, body := range map[string]map[string]any{
		"no name":         {"designation": "President"},
		"no designation":  {"name": "Someone"},
		"long bio":        {"name": "Someone", "designation": "President", "bio": strings.Repeat("b", 501)},
		"photo path":      {"name": "Someone", "designation": "President", "photo": "../../etc/passwd"},
		"negative order":  {"name": "Someone", "designation": "President", "order": -1},
		"unknown account": {"userId": "00000000-0000-0000-0000-00000000dead", "designation": "President"},
	} {
		want := 422
		if rec := jreq(e, "POST", "/api/v1/admin/committees/"+c.ID+"/members", "admin-token", body); rec.Code != want {
			t.Errorf("%s: %d %s", name, rec.Code, rec.Body)
		}
	}
}

func TestCommitteePublishingAndPublicPrivacy(t *testing.T) {
	e, _ := committeeApp(t)
	// a registered member with a profile
	if rec := e.do("POST", "/api/v1/me/profile", myProfile, nil, bearer("member-token")...); rec.Code != 201 {
		t.Fatalf("profile: %d %s", rec.Code, rec.Body)
	}
	var c1, c2 Committee
	decodeBody(t, jreq(e, "POST", "/api/v1/admin/committees", "admin-token", map[string]any{"name": "Panel One", "term": "2026"}), &c1)
	decodeBody(t, jreq(e, "POST", "/api/v1/admin/committees", "admin-token", map[string]any{"name": "Panel Two", "term": "2027"}), &c2)

	// nothing public while only drafts exist
	rec := jreq(e, "GET", "/api/v1/executive-committee", "", nil)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"committee":null`) || !strings.Contains(rec.Body.String(), `"members":[]`) {
		t.Fatalf("empty public panel: %d %s", rec.Code, rec.Body)
	}
	if rec := jreq(e, "POST", "/api/v1/admin/committees/"+c1.ID+"/publish", "admin-token", nil); rec.Code != 409 || !strings.Contains(rec.Body.String(), "empty_committee") {
		t.Fatalf("publish empty: %d %s", rec.Code, rec.Body)
	}

	add := func(id string, body map[string]any) Executive {
		var x Executive
		rec := jreq(e, "POST", "/api/v1/admin/committees/"+id+"/members", "admin-token", body)
		decodeBody(t, rec, &x)
		if rec.Code != 201 {
			t.Fatalf("add: %d %s", rec.Code, rec.Body)
		}
		return x
	}
	photo := "22222222-2222-4222-8222-222222222222.jpg"
	m := add(c1.ID, map[string]any{"userId": idMember, "designation": "President", "bio": "Hello", "photo": photo})
	add(c1.ID, map[string]any{"name": "Guest Person", "designation": "Advisor"})
	add(c2.ID, map[string]any{"name": "Next Year", "designation": "President"})
	if m.Name != "Member One" || m.PhotoURL != "https://files.example/photos/"+photo {
		t.Fatalf("member seat: %+v", m)
	}
	if rec := jreq(e, "POST", "/api/v1/admin/committees/"+c1.ID+"/members", "admin-token", map[string]any{"userId": idMember, "designation": "Secretary"}); rec.Code != 409 || !strings.Contains(rec.Body.String(), "duplicate_executive") {
		t.Fatalf("duplicate seat: %d %s", rec.Code, rec.Body)
	}

	if rec := jreq(e, "POST", "/api/v1/admin/committees/"+c1.ID+"/publish", "admin-token", nil); rec.Code != 200 {
		t.Fatalf("publish: %d %s", rec.Code, rec.Body)
	}
	rec = jreq(e, "GET", "/api/v1/executive-committee", "", nil)
	body := rec.Body.String()
	if !strings.Contains(body, "Member One") || !strings.Contains(body, "Guest Person") || !strings.Contains(body, "Panel One") {
		t.Fatalf("public panel: %s", body)
	}
	if strings.Contains(body, "Next Year") || strings.Contains(body, "Panel Two") {
		t.Fatalf("a draft leaked into the public panel: %s", body)
	}
	for _, secret := range []string{idMember, "userId", "member@example.com", photo + "\"", "status"} {
		if strings.Contains(body, secret) && secret != photo+"\"" {
			t.Fatalf("public panel exposes %q: %s", secret, body)
		}
	}
	if strings.Contains(body, `"photo"`) {
		t.Fatalf("public panel exposes the storage path field: %s", body)
	}

	// publishing the next panel archives the current one; archived panels are read-only and not public
	if rec := jreq(e, "POST", "/api/v1/admin/committees/"+c2.ID+"/publish", "admin-token", nil); rec.Code != 200 {
		t.Fatalf("publish second: %d %s", rec.Code, rec.Body)
	}
	body = jreq(e, "GET", "/api/v1/executive-committee", "", nil).Body.String()
	if !strings.Contains(body, "Next Year") || strings.Contains(body, "Guest Person") {
		t.Fatalf("public panel after replacement: %s", body)
	}
	if rec := jreq(e, "POST", "/api/v1/admin/committees/"+c1.ID+"/members", "admin-token", map[string]any{"name": "Late", "designation": "Member"}); rec.Code != 409 || !strings.Contains(rec.Body.String(), "committee_archived") {
		t.Fatalf("archived add: %d %s", rec.Code, rec.Body)
	}
	var list struct{ Items []Committee }
	decodeBody(t, jreq(e, "GET", "/api/v1/admin/committees", "admin-token", nil), &list)
	if len(list.Items) != 2 {
		t.Fatalf("admins see history: %+v", list)
	}
	if rec := jreq(e, "POST", "/api/v1/admin/committees/"+c2.ID+"/unpublish", "admin-token", nil); rec.Code != 200 {
		t.Fatalf("unpublish: %d", rec.Code)
	}
	if body := jreq(e, "GET", "/api/v1/executive-committee", "", nil).Body.String(); !strings.Contains(body, `"committee":null`) {
		t.Fatalf("unpublished panel is still public: %s", body)
	}
	if rec := jreq(e, "POST", "/api/v1/admin/committees/"+c2.ID+"/explode", "admin-token", nil); rec.Code != 404 {
		t.Fatalf("unknown action: %d", rec.Code)
	}
	log := e.mem.CommitteeAuditLog()
	if len(log) < 8 || log[0].Action != "committee.create" || log[0].Actor != idAdmin {
		t.Fatalf("changes must be audited with the acting admin: %+v", log)
	}
}

func TestRemovingAnExecutiveKeepsTheMemberAccount(t *testing.T) {
	e, _ := committeeApp(t)
	e.do("POST", "/api/v1/me/profile", myProfile, nil, bearer("member-token")...)
	var c Committee
	decodeBody(t, jreq(e, "POST", "/api/v1/admin/committees", "admin-token", map[string]any{"name": "Panel One"}), &c)
	var x Executive
	decodeBody(t, jreq(e, "POST", "/api/v1/admin/committees/"+c.ID+"/members", "admin-token", map[string]any{"userId": idMember, "designation": "President"}), &x)
	if rec := jreq(e, "POST", "/api/v1/admin/executives/"+x.ID+"/remove", "admin-token", nil); rec.Code != 200 {
		t.Fatalf("remove: %d %s", rec.Code, rec.Body)
	}
	if u, err := e.mem.UserByID(context.Background(), idMember); err != nil || u.Email != "member@example.com" {
		t.Fatalf("account deleted by removal: %+v %v", u, err)
	}
	if p, err := e.mem.ProfileByUser(context.Background(), idMember); err != nil || p.Name != "Member One" {
		t.Fatalf("profile deleted by removal: %+v %v", p, err)
	}
	var d struct{ Members []Executive }
	decodeBody(t, jreq(e, "GET", "/api/v1/admin/committees/"+c.ID, "admin-token", nil), &d)
	if len(d.Members) != 0 {
		t.Fatalf("removed seat still listed: %+v", d)
	}
	if rec := jreq(e, "POST", "/api/v1/admin/executives/"+x.ID+"/remove", "admin-token", nil); rec.Code != 404 {
		t.Fatalf("remove twice: %d", rec.Code)
	}
}

func TestReorderEndpoint(t *testing.T) {
	e, _ := committeeApp(t)
	var c Committee
	decodeBody(t, jreq(e, "POST", "/api/v1/admin/committees", "admin-token", map[string]any{"name": "Panel One"}), &c)
	ids := []string{}
	for _, n := range []string{"First Person", "Second Person", "Third Person"} {
		var x Executive
		decodeBody(t, jreq(e, "POST", "/api/v1/admin/committees/"+c.ID+"/members", "admin-token", map[string]any{"name": n, "designation": "Member"}), &x)
		ids = append(ids, x.ID)
	}
	if rec := jreq(e, "POST", "/api/v1/admin/committees/"+c.ID+"/reorder", "admin-token", map[string]any{"ids": ids[:2]}); rec.Code != 422 {
		t.Fatalf("partial order: %d", rec.Code)
	}
	if rec := jreq(e, "POST", "/api/v1/admin/committees/"+c.ID+"/reorder", "admin-token", map[string]any{"ids": []string{ids[2], ids[0], ids[1]}}); rec.Code != 200 {
		t.Fatalf("reorder: %d %s", rec.Code, rec.Body)
	}
	var d struct{ Members []Executive }
	decodeBody(t, jreq(e, "GET", "/api/v1/admin/committees/"+c.ID, "admin-token", nil), &d)
	if len(d.Members) != 3 || d.Members[0].ID != ids[2] || d.Members[1].ID != ids[0] {
		t.Fatalf("order not applied: %+v", d.Members)
	}
}

// ---------------------------------------------------------------- photos

func pngBytes(w, h int) []byte {
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for x := 0; x < w; x++ {
		img.Set(x, x%h, color.RGBA{200, 30, 30, 255})
	}
	var b bytes.Buffer
	_ = png.Encode(&b, img)
	return b.Bytes()
}

func jpegBytes(w, h int, trailer string) []byte {
	var b bytes.Buffer
	_ = jpeg.Encode(&b, image.NewRGBA(image.Rect(0, 0, w, h)), nil)
	b.WriteString(trailer) // stands in for hidden data / metadata that must not survive
	return b.Bytes()
}

func uploadReq(e *env2, tok string, fields map[string]string, file []byte) *httptest.ResponseRecorder {
	return uploadReqTo(e, "/api/v1/admin/executive-photo", tok, fields, file)
}

func uploadReqTo(e *env2, path, tok string, fields map[string]string, file []byte) *httptest.ResponseRecorder {
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	for k, v := range fields {
		_ = mw.WriteField(k, v)
	}
	if file != nil {
		fw, _ := mw.CreateFormFile("file", "photo.png") // the name is deliberately untrusted
		_, _ = fw.Write(file)
	}
	_ = mw.Close()
	req := httptest.NewRequest("POST", path, &buf)
	req.RemoteAddr = "9.9.9.9:1000"
	req.Header.Set("Content-Type", mw.FormDataContentType())
	if tok != "" {
		req.Header.Set("Authorization", "Bearer "+tok)
	}
	rec := httptest.NewRecorder()
	e.app.Routes().ServeHTTP(rec, req)
	return rec
}

func TestPhotoUploadValidatesContentAndStoresSafely(t *testing.T) {
	e, img := committeeApp(t)

	rec := uploadReq(e, "admin-token", nil, pngBytes(200, 200))
	var up struct{ Path, URL string }
	decodeBody(t, rec, &up)
	if rec.Code != 201 || !photoRx.MatchString(up.Path) || up.URL != "https://files.example/photos/"+up.Path || !strings.HasSuffix(up.Path, ".png") {
		t.Fatalf("png upload: %d %s", rec.Code, rec.Body)
	}
	if img.token != "admin-token" {
		t.Fatalf("the admin's own token must be forwarded to storage, got %q", img.token)
	}

	// JPEG: re-encoded, so trailing hidden data does not reach storage
	rec = uploadReq(e, "admin-token", nil, jpegBytes(120, 120, "SECRET-GPS-EXIF-TRAILER"))
	if rec.Code != 201 || !strings.HasSuffix(up.Path, ".png") || !strings.Contains(img.puts[len(img.puts)-1], "image/jpeg") {
		t.Fatalf("jpeg upload: %d %s %v", rec.Code, rec.Body, img.puts)
	}

	for name, tc := range map[string]struct {
		file []byte
		code int
		err  string
	}{
		"text posing as png": {[]byte("<html>not an image</html>" + strings.Repeat("x", 200)), 422, "photo_invalid"},
		"svg":                {[]byte(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><script>alert(1)</script></svg>`), 422, "photo_invalid"},
		"gif":                {[]byte("GIF89a\x01\x00\x01\x00\x00\x00\x00;"), 422, "photo_invalid"},
		"too small":          {pngBytes(10, 10), 422, "photo_dimensions"},
		"too big":            {append(pngBytes(100, 100), bytes.Repeat([]byte{0}, 6<<20)...), 413, "photo_too_big"},
	} {
		before := len(img.puts)
		rec := uploadReq(e, "admin-token", nil, tc.file)
		if rec.Code != tc.code || !strings.Contains(rec.Body.String(), tc.err) {
			t.Errorf("%s: %d %s", name, rec.Code, rec.Body)
		}
		if len(img.puts) != before {
			t.Errorf("%s: invalid data reached storage", name)
		}
	}
	if rec := uploadReq(e, "admin-token", nil, nil); rec.Code != 422 || !strings.Contains(rec.Body.String(), "no_photo") {
		t.Errorf("no file: %d %s", rec.Code, rec.Body)
	}
	e.touch("member-token")
	if rec := uploadReq(e, "member-token", nil, pngBytes(200, 200)); rec.Code != 403 {
		t.Errorf("member upload: %d", rec.Code)
	}
	if rec := uploadReq(e, "", nil, pngBytes(200, 200)); rec.Code != 401 {
		t.Errorf("anonymous upload: %d", rec.Code)
	}
	img.fail = true
	if rec := uploadReq(e, "admin-token", nil, pngBytes(200, 200)); rec.Code != 502 || !strings.Contains(rec.Body.String(), "storage_failed") {
		t.Errorf("storage outage: %d %s", rec.Code, rec.Body)
	}
	e.app.Auth.Images = nil
	if rec := uploadReq(e, "admin-token", nil, pngBytes(200, 200)); rec.Code != 503 || !strings.Contains(rec.Body.String(), "storage_off") {
		t.Errorf("storage not configured: %d %s", rec.Code, rec.Body)
	}
}

func TestDriveLinkParsing(t *testing.T) {
	id := "1AbCdEfGhIjKlMnOpQrStUvWxYz_-0123"
	for _, ok := range []string{
		"https://drive.google.com/file/d/" + id + "/view?usp=sharing",
		"https://drive.google.com/open?id=" + id,
		"https://drive.google.com/uc?export=view&id=" + id,
		"https://drive.google.com/thumbnail?id=" + id,
	} {
		if got, err := driveFileID(ok); err != nil || got != id {
			t.Errorf("%s: %q %v", ok, got, err)
		}
	}
	for _, bad := range []string{
		"", "not a url", "http://drive.google.com/file/d/" + id, "https://evil.example/file/d/" + id,
		"https://drive.google.com.evil.example/file/d/" + id, "https://drive.google.com/drive/folders/" + id,
		"https://drive.google.com/file/d/short/view", "https://drive.google.com/open?id=../../x", "https://127.0.0.1/file/d/" + id,
	} {
		if _, err := driveFileID(bad); err == nil {
			t.Errorf("should be rejected: %q", bad)
		}
	}
}

func TestDriveLinkPhoto(t *testing.T) {
	e, img := committeeApp(t)
	id := "1AbCdEfGhIjKlMnOpQrStUvWxYz_-0123"
	var hits []string
	drive := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits = append(hits, r.URL.Path+"?"+r.URL.RawQuery)
		switch r.URL.Query().Get("id") {
		case id:
			w.Header().Set("Content-Type", "image/png")
			_, _ = w.Write(pngBytes(300, 300))
		case "PRIVATEPRIVATEPRIVATE1":
			http.Redirect(w, r, "https://accounts.google.com/signin", http.StatusFound) // private files bounce to sign-in
		case "HTMLHTMLHTMLHTMLHTMLH1":
			w.Header().Set("Content-Type", "text/html")
			_, _ = w.Write([]byte("<html>sign in</html>"))
		case "BROKENBROKENBROKENBR1":
			w.Header().Set("Content-Type", "image/png")
			_, _ = w.Write([]byte("definitely not a png"))
		default:
			http.NotFound(w, r)
		}
	}))
	defer drive.Close()
	e.app.Auth.DriveBase = drive.URL
	e.app.Auth.DriveAllowHost = func(h string) bool { return strings.HasPrefix(drive.URL, "http://"+h) }

	link := "https://drive.google.com/file/d/" + id + "/view?usp=sharing"
	rec := uploadReq(e, "admin-token", map[string]string{"driveUrl": link}, nil)
	var up struct{ Path string }
	decodeBody(t, rec, &up)
	if rec.Code != 201 || !photoRx.MatchString(up.Path) || len(img.puts) != 1 || !strings.Contains(img.puts[0], "image/png") {
		t.Fatalf("drive photo: %d %s %v", rec.Code, rec.Body, img.puts)
	}
	if len(hits) != 1 || !strings.Contains(hits[0], "id="+id) {
		t.Fatalf("only the file id may be sent to Drive: %v", hits)
	}

	for name, tc := range map[string]struct {
		link string
		code int
		err  string
	}{
		"private (redirects to sign-in)": {"https://drive.google.com/file/d/PRIVATEPRIVATEPRIVATE1/view", 422, "drive_not_public"},
		"html page":                      {"https://drive.google.com/file/d/HTMLHTMLHTMLHTMLHTMLH1/view", 422, "drive_not_public"},
		"missing file":                   {"https://drive.google.com/file/d/MISSINGMISSINGMISSING1/view", 422, "drive_not_public"},
		"corrupt image":                  {"https://drive.google.com/file/d/BROKENBROKENBROKENBR1/view", 422, "photo_invalid"},
		"plain http link":                {"http://example.com/photo.png", 422, "image_link"},
		"internal address":               {"https://127.0.0.1/photo.png", 422, "image_link"},
		"folder link":                    {"https://drive.google.com/drive/folders/" + id, 422, "drive_link"},
	} {
		before := len(img.puts)
		rec := uploadReq(e, "admin-token", map[string]string{"driveUrl": tc.link}, nil)
		if rec.Code != tc.code || !strings.Contains(rec.Body.String(), tc.err) {
			t.Errorf("%s: %d %s", name, rec.Code, rec.Body)
		}
		if len(img.puts) != before {
			t.Errorf("%s: stored something", name)
		}
	}
}

func TestAnyImageLinkIsFetchedSafely(t *testing.T) {
	png := pngBytes(200, 200)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/ok.png":
			w.Header().Set("Content-Type", "image/png")
			w.Write(png)
		case "/redir":
			http.Redirect(w, r, "/ok.png", http.StatusFound)
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()
	ctx := context.Background()
	// a normal public image link works (private hosts are only reachable here because the test opts in)
	for _, path := range []string{"/ok.png", "/redir"} {
		if data, err := fetchImageURL(ctx, srv.URL+path, true); err != nil || len(data) == 0 {
			t.Fatalf("%s: %v", path, err)
		}
	}
	if _, err := fetchImageURL(ctx, srv.URL+"/missing", true); !errors.Is(err, ErrImageUnreachable) {
		t.Errorf("404 should be unreachable, got %v", err)
	}
	// production behaviour: internal addresses, plain http, credentials and odd ports are all refused
	for _, bad := range []string{srv.URL + "/ok.png", "http://example.com/a.png", "https://user:pw@example.com/a.png", "https://127.0.0.1/a.png",
		"https://[::1]/a.png", "https://169.254.169.254/latest/meta-data/", "https://10.0.0.5/a.png", "https://192.168.1.1/a.png", "ftp://example.com/a.png", "", "not a url"} {
		if _, err := fetchImageURL(ctx, bad, false); err == nil {
			t.Errorf("should be refused: %q", bad)
		}
	}
	if !blockedIP(net.ParseIP("100.64.1.1")) || blockedIP(net.ParseIP("8.8.8.8")) {
		t.Error("blockedIP classification wrong")
	}
}
