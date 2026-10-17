package main

import (
	"context"
	"os"
	"testing"
	"time"
)

// storeSuite runs the same behavioural checks against every AuthStore implementation.
func storeSuite(t *testing.T, s AuthStore) {
	ctx := context.Background()
	prof := &Profile{Name: "Suite User", Batch: 17, Department: "Finance", Upazila: "kasba", Union: "Kuti"}
	u, err := s.CreateUser(ctx, NewUser{Email: "suite@example.com", PasswordHash: "hash1", Role: RoleMember, Profile: prof})
	if err != nil || u.ID == "" || u.EmailVerified {
		t.Fatalf("create: %+v %v", u, err)
	}
	if _, err := s.CreateUser(ctx, NewUser{Email: "suite@example.com", PasswordHash: "x", Role: RoleMember}); err != ErrEmailTaken {
		t.Fatalf("duplicate email should give ErrEmailTaken, got %v", err)
	}
	if g, err := s.UserByEmail(ctx, "suite@example.com"); err != nil || g.ID != u.ID || g.PasswordHash != "hash1" {
		t.Fatalf("by email: %+v %v", g, err)
	}
	if _, err := s.UserByEmail(ctx, "nobody@example.com"); err != ErrNotFound {
		t.Fatalf("missing user should be ErrNotFound, got %v", err)
	}
	if err := s.SetEmailVerified(ctx, u.ID); err != nil {
		t.Fatal(err)
	}
	if g, _ := s.UserByID(ctx, u.ID); !g.EmailVerified {
		t.Fatal("verified flag not stored")
	}
	if err := s.SetPassword(ctx, u.ID, "hash2"); err != nil {
		t.Fatal(err)
	}
	if g, _ := s.UserByID(ctx, u.ID); g.PasswordHash != "hash2" {
		t.Fatal("password not updated")
	}

	// tokens: single use, expiry, purpose
	_ = s.SaveToken(ctx, u.ID, PurposeReset, "d-ok", time.Now().Add(time.Hour))
	if _, err := s.ConsumeToken(ctx, PurposeVerify, "d-ok"); err != ErrNotFound {
		t.Fatalf("wrong purpose must fail, got %v", err)
	}
	if id, err := s.ConsumeToken(ctx, PurposeReset, "d-ok"); err != nil || id != u.ID {
		t.Fatalf("consume: %q %v", id, err)
	}
	if _, err := s.ConsumeToken(ctx, PurposeReset, "d-ok"); err != ErrNotFound {
		t.Fatalf("second use must fail, got %v", err)
	}
	_ = s.SaveToken(ctx, u.ID, PurposeReset, "d-old", time.Now().Add(-time.Minute))
	if _, err := s.ConsumeToken(ctx, PurposeReset, "d-old"); err != ErrNotFound {
		t.Fatalf("expired token must fail, got %v", err)
	}

	// sessions
	_ = s.CreateSession(ctx, u.ID, "s1", time.Now().Add(time.Hour))
	_ = s.CreateSession(ctx, u.ID, "s2", time.Now().Add(time.Hour))
	_ = s.CreateSession(ctx, u.ID, "s-old", time.Now().Add(-time.Minute))
	if g, err := s.SessionUser(ctx, "s1"); err != nil || g.ID != u.ID {
		t.Fatalf("session user: %+v %v", g, err)
	}
	if _, err := s.SessionUser(ctx, "s-old"); err != ErrNotFound {
		t.Fatalf("expired session must fail, got %v", err)
	}
	_ = s.DeleteSession(ctx, "s1")
	if _, err := s.SessionUser(ctx, "s1"); err != ErrNotFound {
		t.Fatal("deleted session still valid")
	}
	_ = s.DeleteUserSessions(ctx, u.ID)
	if _, err := s.SessionUser(ctx, "s2"); err != ErrNotFound {
		t.Fatal("DeleteUserSessions did not clear sessions")
	}

	// profile
	p, err := s.ProfileByUser(ctx, u.ID)
	if err != nil || p.Status != StatusPending || !p.ShowInDirectory || p.Union != "Kuti" || p.Batch != 17 {
		t.Fatalf("profile defaults: %+v %v", p, err)
	}
	phone, show := "01712345678", false
	if err := s.UpdateProfile(ctx, u.ID, ProfilePatch{Phone: &phone, ShowInDirectory: &show}); err != nil {
		t.Fatal(err)
	}
	if p, _ := s.ProfileByUser(ctx, u.ID); p.Phone != phone || p.ShowInDirectory || p.ShowEmail != "members" {
		t.Fatalf("patch result: %+v", p)
	}
	if err := s.UpdateProfile(ctx, "00000000-0000-0000-0000-000000000000", ProfilePatch{Phone: &phone}); err != ErrNotFound {
		t.Fatalf("patch of a missing profile should be ErrNotFound, got %v", err)
	}

	// review + directory + counts
	if dir, _ := s.ApprovedDirectory(ctx); len(dir) != 0 {
		t.Fatal("pending member must not be in the directory")
	}
	if err := s.ReviewProfile(ctx, u.ID, StatusApproved); err != nil {
		t.Fatal(err)
	}
	if dir, _ := s.ApprovedDirectory(ctx); len(dir) != 0 {
		t.Fatal("member who opted out must not be in the directory")
	}
	yes := true
	_ = s.UpdateProfile(ctx, u.ID, ProfilePatch{ShowInDirectory: &yes})
	if dir, _ := s.ApprovedDirectory(ctx); len(dir) != 1 || dir[0].Name != "Suite User" || *dir[0].Batch != 17 {
		t.Fatalf("directory: %+v", dir)
	}
	if rows, _ := s.ListMembers(ctx, StatusApproved); len(rows) != 1 || rows[0].Email != "suite@example.com" || !rows[0].EmailVerified {
		t.Fatalf("list members: %+v", rows)
	}
	if rows, _ := s.ListMembers(ctx, ""); len(rows) != 1 {
		t.Fatalf("unfiltered list: %+v", rows)
	}
	if c, _ := s.Counts(ctx); c[StatusApproved] != 1 || c[StatusPending] != 0 {
		t.Fatalf("counts: %+v", c)
	}
	adm, err := s.CreateUser(ctx, NewUser{Email: "boss@example.com", PasswordHash: "h", Role: RoleAdmin, Verified: true})
	if err != nil || adm.Role != RoleAdmin || !adm.EmailVerified {
		t.Fatalf("admin create: %+v %v", adm, err)
	}
	if _, err := s.ProfileByUser(ctx, adm.ID); err != ErrNotFound {
		t.Fatalf("admins have no profile, got %v", err)
	}
	if err := s.Ping(ctx); err != nil {
		t.Fatal(err)
	}
}

func TestMemStoreSuite(t *testing.T) { storeSuite(t, newMemStore()) }

// TestPostgresStoreSuite needs a throwaway database: TEST_DATABASE_URL=postgres://... go test -run Postgres
// It drops and recreates the public schema, so never point it at real data.
func TestPostgresStoreSuite(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("set TEST_DATABASE_URL to run against Postgres")
	}
	ctx := context.Background()
	pg, err := openPostgres(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer pg.Close()
	if _, err := pg.db.Exec(ctx, `DROP SCHEMA public CASCADE; CREATE SCHEMA public`); err != nil {
		t.Fatal(err)
	}
	if err := pg.migrate(ctx); err != nil {
		t.Fatal(err)
	}
	if err := pg.migrate(ctx); err != nil { // idempotent
		t.Fatal(err)
	}
	storeSuite(t, pg)
}
