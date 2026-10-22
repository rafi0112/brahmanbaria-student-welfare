package main

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"
)

// cmsStoreSuite runs the editorial, audit and member-admin rules against every store implementation.
func cmsStoreSuite(t *testing.T, s AuthStore) {
	ctx := context.Background()
	admin, err := s.CreateUser(ctx, NewUser{Email: "cms-admin@example.com", PasswordHash: "h", Role: RoleAdmin, Verified: true})
	if err != nil {
		t.Fatal(err)
	}
	data := func(m map[string]any) json.RawMessage { b, _ := json.Marshal(m); return b }

	// --- entries: create, slug rules, status flow
	a, err := s.CreateEntry(ctx, admin.ID, EntryInput{Kind: KindBlog, Slug: "first-post", Title: "First post", Data: data(map[string]any{"category": "community", "author": "Ann"})})
	if err != nil || a.Status != StatusDraft || a.Slug != "first-post" {
		t.Fatalf("create: %+v %v", a, err)
	}
	if _, err := s.CreateEntry(ctx, admin.ID, EntryInput{Kind: KindBlog, Slug: "first-post", Title: "Dup", Data: data(nil)}); err != ErrSlugTaken {
		t.Fatalf("duplicate slug: %v", err)
	}
	if _, err := s.CreateEntry(ctx, admin.ID, EntryInput{Kind: KindPlace, Slug: "first-post", Title: "Same slug other kind", Data: data(nil)}); err != nil {
		t.Fatalf("slugs are per kind: %v", err)
	}
	b, _ := s.CreateEntry(ctx, admin.ID, EntryInput{Kind: KindBlog, Slug: "second-post", Title: "Second post about rivers", Data: data(map[string]any{"category": "heritage", "author": "Bob"})})
	if _, err := s.UpdateEntry(ctx, admin.ID, b.ID, EntryInput{Kind: KindBlog, Slug: "first-post", Title: "x", Data: data(nil)}); err != ErrSlugTaken {
		t.Fatalf("update onto a used slug: %v", err)
	}
	if got, err := s.UpdateEntry(ctx, admin.ID, b.ID, EntryInput{Kind: KindBlog, Slug: "second-post", Title: "Second post about rivers (edited)", Featured: true, Data: data(map[string]any{"category": "heritage", "author": "Bob"})}); err != nil || !got.Featured {
		t.Fatalf("update: %+v %v", got, err)
	}
	if _, err := s.GetEntry(ctx, KindBlog, "first-post", true); err != ErrNotFound {
		t.Fatalf("drafts are not public: %v", err)
	}
	if g, err := s.GetEntry(ctx, KindBlog, "first-post", false); err != nil || g.ID != a.ID {
		t.Fatalf("admin get by slug: %+v %v", g, err)
	}
	if g, err := s.GetEntry(ctx, KindBlog, a.ID, false); err != nil || g.Slug != "first-post" {
		t.Fatalf("admin get by id: %+v %v", g, err)
	}
	if _, err := s.SetEntryStatus(ctx, admin.ID, a.ID, "restore"); err != ErrBadState {
		t.Fatalf("restore needs an archived entry: %v", err)
	}
	if p, err := s.SetEntryStatus(ctx, admin.ID, a.ID, "publish"); err != nil || p.Status != StatusPublished || p.PublishedAt == "" {
		t.Fatalf("publish: %+v %v", p, err)
	}
	if _, err := s.SetEntryStatus(ctx, admin.ID, a.ID, "publish"); err != ErrBadState {
		t.Fatalf("publishing twice: %v", err)
	}
	if g, err := s.GetEntry(ctx, KindBlog, "first-post", true); err != nil || g.ID != a.ID {
		t.Fatalf("published entries are public: %+v %v", g, err)
	}
	if _, err := s.SetEntryStatus(ctx, admin.ID, "00000000-0000-0000-0000-00000000dead", "publish"); err != ErrNotFound {
		t.Fatalf("unknown id: %v", err)
	}

	// --- listing: default hides archived, filters, search, public, paging
	list := func(q EntryQuery) []Entry {
		t.Helper()
		q.Kind = KindBlog
		rows, _, err := s.ListEntries(ctx, q)
		if err != nil {
			t.Fatal(err)
		}
		return rows
	}
	if rows := list(EntryQuery{}); len(rows) != 2 {
		t.Fatalf("default list: %+v", rows)
	}
	if rows := list(EntryQuery{Public: true}); len(rows) != 1 || rows[0].ID != a.ID {
		t.Fatalf("public list must be published only: %+v", rows)
	}
	if rows := list(EntryQuery{Status: StatusDraft}); len(rows) != 1 || rows[0].ID != b.ID {
		t.Fatalf("status filter: %+v", rows)
	}
	if rows := list(EntryQuery{Q: "RIVERS"}); len(rows) != 1 || rows[0].ID != b.ID {
		t.Fatalf("search is case-insensitive: %+v", rows)
	}
	if rows := list(EntryQuery{Category: "heritage"}); len(rows) != 1 {
		t.Fatalf("category filter: %+v", rows)
	}
	if rows := list(EntryQuery{Author: "Ann"}); len(rows) != 1 || rows[0].ID != a.ID {
		t.Fatalf("author filter: %+v", rows)
	}
	if rows := list(EntryQuery{Featured: "yes"}); len(rows) != 1 || rows[0].ID != b.ID {
		t.Fatalf("featured filter: %+v", rows)
	}
	if rows := list(EntryQuery{From: "2999-01-01"}); len(rows) != 0 {
		t.Fatalf("date filter: %+v", rows)
	}
	if rows, total, _ := s.ListEntries(ctx, EntryQuery{Kind: KindBlog, Limit: 1, Page: 2, Status: "all", Sort: "title"}); len(rows) != 1 || total != 2 {
		t.Fatalf("paging: %+v %d", rows, total)
	}
	if _, err := s.SetEntryStatus(ctx, admin.ID, a.ID, "archive"); err != nil {
		t.Fatal(err)
	}
	if rows := list(EntryQuery{}); len(rows) != 1 {
		t.Fatalf("archived entries leave the default list: %+v", rows)
	}
	if rows := list(EntryQuery{Status: StatusArchived}); len(rows) != 1 || rows[0].ID != a.ID {
		t.Fatalf("archive filter finds them: %+v", rows)
	}
	if rows := list(EntryQuery{Public: true}); len(rows) != 0 {
		t.Fatalf("archived entries are not public: %+v", rows)
	}
	if r, err := s.SetEntryStatus(ctx, admin.ID, a.ID, "restore"); err != nil || r.Status != StatusDraft {
		t.Fatalf("restore: %+v %v", r, err)
	}

	// --- reorder
	c, _ := s.CreateEntry(ctx, admin.ID, EntryInput{Kind: KindBlog, Slug: "third-post", Title: "Third", Data: data(nil)})
	if err := s.ReorderEntries(ctx, admin.ID, KindBlog, []string{c.ID, a.ID, b.ID}); err != nil {
		t.Fatal(err)
	}
	if rows := list(EntryQuery{Sort: "order"}); len(rows) != 3 || rows[0].ID != c.ID || rows[2].ID != b.ID {
		t.Fatalf("order: %+v", rows)
	}
	if err := s.ReorderEntries(ctx, admin.ID, KindBlog, []string{c.ID, c.ID}); err != ErrReorderMismatch {
		t.Fatalf("repeated id: %v", err)
	}
	if err := s.ReorderEntries(ctx, admin.ID, KindPlace, []string{c.ID}); err != ErrReorderMismatch {
		t.Fatalf("wrong kind: %v", err)
	}

	// --- albums and images
	al, err := s.CreateEntry(ctx, admin.ID, EntryInput{Kind: KindAlbum, Slug: "events", Title: "Events", Data: data(nil)})
	if err != nil {
		t.Fatal(err)
	}
	img, err := s.CreateEntry(ctx, admin.ID, EntryInput{Kind: KindImage, Title: "Pic", ParentID: al.ID, Data: data(map[string]any{"image": "titas-sunset"})})
	if err != nil || img.ParentID != al.ID {
		t.Fatalf("image in album: %+v %v", img, err)
	}
	if _, err := s.CreateEntry(ctx, admin.ID, EntryInput{Kind: KindImage, Title: "Orphan", ParentID: "00000000-0000-0000-0000-00000000dead", Data: data(nil)}); err != ErrParentInvalid {
		t.Fatalf("unknown album: %v", err)
	}
	if _, err := s.CreateEntry(ctx, admin.ID, EntryInput{Kind: KindImage, Title: "Wrong parent", ParentID: a.ID, Data: data(nil)}); err != ErrParentInvalid {
		t.Fatalf("a blog post is not an album: %v", err)
	}
	if rows, _, _ := s.ListEntries(ctx, EntryQuery{Kind: KindImage, Parent: al.ID}); len(rows) != 1 {
		t.Fatalf("album filter: %+v", rows)
	}
	if rows, _, _ := s.ListEntries(ctx, EntryQuery{Kind: KindImage, Parent: "none"}); len(rows) != 0 {
		t.Fatalf("no-album filter: %+v", rows)
	}
	counts, err := s.CountEntries(ctx)
	if err != nil || counts[KindBlog][StatusDraft] != 3 || counts[KindAlbum][StatusDraft] != 1 || counts[KindImage][StatusDraft] != 1 {
		t.Fatalf("counts: %+v %v", counts, err)
	}

	// --- audit trail
	if err := s.Audit(ctx, admin.ID, "test.marker", "test", "1", map[string]any{"k": "v"}); err != nil {
		t.Fatal(err)
	}
	if ok, err := s.HasAuditAction(ctx, "test.marker"); err != nil || !ok {
		t.Fatalf("has audit: %v %v", ok, err)
	}
	if ok, _ := s.HasAuditAction(ctx, "never.happened"); ok {
		t.Fatal("unknown action reported as present")
	}
	act, err := s.RecentActivity(ctx, 100)
	if err != nil || len(act) < 8 {
		t.Fatalf("activity: %d %v", len(act), err)
	}
	seen := map[string]bool{}
	for _, x := range act {
		seen[x.Action] = true
		if x.Action == "blog.publish" && !strings.Contains(x.Actor, "cms-admin@example.com") {
			t.Fatalf("activity must name the actor: %+v", x)
		}
	}
	for _, want := range []string{"blog.create", "blog.update", "blog.publish", "blog.archive", "blog.restore", "blog.reorder", "album.create", "test.marker"} {
		if !seen[want] {
			t.Fatalf("activity is missing %s: %v", want, seen)
		}
	}

	// --- members as admins see them
	mk := func(email, name string, batch int, phone, blood string) User {
		u, err := s.CreateUser(ctx, NewUser{Email: email, PasswordHash: "h", Role: RoleMember, Verified: batch%2 == 0,
			Profile: &Profile{Name: name, Batch: batch, Department: "Finance", Upazila: "kasba", Union: "Kuti"}})
		if err != nil {
			t.Fatal(err)
		}
		if phone != "" || blood != "" {
			if err := s.UpdateProfile(ctx, u.ID, ProfilePatch{Phone: &phone, BloodGroup: &blood}); err != nil {
				t.Fatal(err)
			}
		}
		return u
	}
	count := func(q MemberQuery) int {
		_, n, err := s.ListMembersAdmin(ctx, q)
		if err != nil {
			t.Fatal(err)
		}
		return n
	}
	// the store may already hold other members (the Postgres run shares tables with the committee suite)
	baseIncomplete, baseUnverified := count(MemberQuery{Complete: "no"}), count(MemberQuery{Verified: "no"})
	baseBatch17, basePending := count(MemberQuery{Batch: 17}), count(MemberQuery{Status: StatusPending, Department: "Finance"})
	m1 := mk("cms-m1@example.com", "Mina Akter", 18, "01712345678", "O+")
	m2 := mk("cms-m2@example.com", "Rafi Hasan", 17, "", "")
	if rows, total, err := s.ListMembersAdmin(ctx, MemberQuery{Q: "mina"}); err != nil || total != 1 || rows[0].ID != m1.ID || !rows[0].Complete || rows[0].Email != "cms-m1@example.com" {
		t.Fatalf("member search: %+v %d %v", rows, total, err)
	}
	if n := count(MemberQuery{Complete: "no"}); n != baseIncomplete+1 {
		t.Fatalf("completeness filter: %d", n)
	}
	if n := count(MemberQuery{Verified: "no"}); n != baseUnverified+1 {
		t.Fatalf("verified filter: %d", n)
	}
	if n := count(MemberQuery{Batch: 17}); n != baseBatch17+1 {
		t.Fatalf("batch filter: %d", n)
	}
	if n := count(MemberQuery{Status: StatusPending, Department: "Finance"}); n != basePending+2 {
		t.Fatalf("status+department filter: %d", n)
	}
	name, phone := "Mina A. Akter", "01898765432"
	if row, err := s.UpdateMemberAdmin(ctx, admin.ID, m1.ID, MemberPatch{Name: &name, Phone: &phone}); err != nil || row.Name != name || row.Phone != phone || row.Role != RoleMember {
		t.Fatalf("update member: %+v %v", row, err)
	}
	if _, err := s.UpdateMemberAdmin(ctx, admin.ID, "00000000-0000-0000-0000-00000000dead", MemberPatch{Name: &name}); err != ErrNotFound {
		t.Fatalf("update unknown member: %v", err)
	}
	if err := s.ReviewMember(ctx, admin.ID, m1.ID, StatusApproved); err != nil {
		t.Fatal(err)
	}
	if dir, _ := s.ApprovedDirectory(ctx); len(dir) != 1 {
		t.Fatalf("approved member should be listed: %+v", dir)
	}
	if err := s.SetAccountDisabled(ctx, admin.ID, admin.ID, true); err != ErrSelfDisable {
		t.Fatalf("self deactivation: %v", err)
	}
	if err := s.SetAccountDisabled(ctx, m1.ID, admin.ID, true); err != ErrAdminProtected {
		t.Fatalf("admins cannot be deactivated: %v", err)
	}
	if err := s.CreateSession(ctx, m1.ID, "cms-sess", futureTime()); err != nil {
		t.Fatal(err)
	}
	if err := s.SetAccountDisabled(ctx, admin.ID, m1.ID, true); err != nil {
		t.Fatal(err)
	}
	if u, _ := s.UserByID(ctx, m1.ID); !u.Disabled {
		t.Fatal("account should be disabled")
	}
	if _, err := s.SessionUser(ctx, "cms-sess"); err != ErrNotFound {
		t.Fatalf("deactivation must end sessions: %v", err)
	}
	if dir, _ := s.ApprovedDirectory(ctx); len(dir) != 0 {
		t.Fatalf("a deactivated member leaves the directory: %+v", dir)
	}
	if u, err := s.UserByID(ctx, m1.ID); err != nil || u.Email != "cms-m1@example.com" {
		t.Fatalf("deactivation must not delete the account: %+v %v", u, err)
	}
	if p, err := s.ProfileByUser(ctx, m1.ID); err != nil || p.Name != name {
		t.Fatalf("deactivation must keep the profile: %+v %v", p, err)
	}
	if err := s.SetAccountDisabled(ctx, admin.ID, m1.ID, false); err != nil {
		t.Fatal(err)
	}
	if u, _ := s.UserByID(ctx, m1.ID); u.Disabled {
		t.Fatal("account should be active again")
	}
	_ = m2

	// --- role history
	if _, err := s.SetRole(ctx, admin.ID, m1.ID, RoleAdmin); err != nil {
		// m1 is unverified when the batch is odd; here batch 18 is verified
		t.Fatal(err)
	}
	if h, err := s.RoleHistory(ctx, m1.ID, 10); err != nil || len(h) != 1 || h[0].To != RoleAdmin || h[0].From != RoleMember || h[0].Target != "cms-m1@example.com" {
		t.Fatalf("role history: %+v %v", h, err)
	}
	if h, _ := s.RoleHistory(ctx, "", 10); len(h) < 1 {
		t.Fatalf("role history without a target: %+v", h)
	}
}

func TestMemCMSStoreSuite(t *testing.T) { cmsStoreSuite(t, newMemStore()) }

func futureTime() time.Time { return time.Now().Add(time.Hour) }
