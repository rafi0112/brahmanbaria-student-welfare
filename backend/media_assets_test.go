package main

import (
	"context"
	"encoding/json"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// The picture registry (migration 023) against real PostgreSQL, without touching anything real: every table and function is
// created as a TEMP object on one connection (gone when it closes), `is_admin()` and Storage's object list are stand-ins,
// and nothing is committed anywhere. Opt in with LIVE_TEMP_TABLES=1 (it reads DATABASE_URL from backend/.env).
func TestMediaRegistryInTempObjects(t *testing.T) {
	if os.Getenv("LIVE_TEMP_TABLES") != "1" {
		t.Skip("set LIVE_TEMP_TABLES=1 to run against PostgreSQL temp objects")
	}
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		url = dotEnvValue(".env", "DATABASE_URL")
	}
	if url == "" {
		t.Skip("DATABASE_URL is not set")
	}
	raw, err := migrationFS.ReadFile("migrations/023_media_assets.sql")
	if err != nil {
		t.Fatal(err)
	}
	sql := string(raw)
	sql = strings.ReplaceAll(sql, "CREATE TABLE IF NOT EXISTS ", "CREATE TEMP TABLE ")
	sql = strings.ReplaceAll(sql, "CREATE INDEX IF NOT EXISTS ", "CREATE INDEX ")
	sql = strings.ReplaceAll(sql, "CREATE OR REPLACE FUNCTION public.", "CREATE OR REPLACE FUNCTION pg_temp.")
	sql = strings.ReplaceAll(sql, "EXECUTE FUNCTION public.", "EXECUTE FUNCTION pg_temp.")
	sql = strings.ReplaceAll(sql, "DROP TRIGGER IF EXISTS content_media_changed ON content_media;", "")
	sql = strings.ReplaceAll(sql, "public.is_admin()", "pg_temp.is_admin()")
	sql = strings.ReplaceAll(sql, "storage.objects", "fake_objects")
	// the grants only make sense for the real functions
	if i := strings.Index(sql, "REVOKE ALL ON FUNCTION"); i > 0 {
		sql = sql[:i]
	}
	if strings.Contains(sql, "public.") && !strings.Contains(sql, "SET search_path = public") {
		t.Fatal("a public. object is still referenced")
	}

	cfg, err := pgxpool.ParseConfig(normalizeDatabaseURL(url))
	if err != nil {
		t.Fatal(err)
	}
	cfg.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol
	cfg.MaxConns, cfg.MinConns = 1, 1
	cfg.AfterConnect = func(ctx context.Context, c *pgx.Conn) error {
		for _, s := range []string{
			`CREATE TEMP TABLE fake_objects (bucket_id text, name text, metadata jsonb)`,
			`CREATE TEMP TABLE cms_entries (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind text NOT NULL, data jsonb NOT NULL DEFAULT '{}')`,
			`CREATE TEMP TABLE site_settings (key text PRIMARY KEY, value jsonb NOT NULL)`,
			`CREATE TEMP TABLE fake_admin (uid text)`, // who is signed in; a row means an admin
			`CREATE FUNCTION pg_temp.is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT EXISTS (SELECT 1 FROM fake_admin) $$`,
			`CREATE FUNCTION pg_temp.fake_uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (SELECT uid::uuid FROM fake_admin LIMIT 1) $$`,
		} {
			if _, err := c.Exec(ctx, s); err != nil {
				return err
			}
		}
		// auth.uid() is not available outside Supabase: the registry only records who reserved a picture
		_, err := c.Exec(ctx, strings.ReplaceAll(sql, "auth.uid()", "pg_temp.fake_uid()"))
		return err
	}
	pool, err := pgxpool.NewWithConfig(context.Background(), cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	ctx := context.Background()

	call := func(q string, args ...any) (map[string]any, error) {
		var raw []byte
		if err := pool.QueryRow(ctx, q, args...).Scan(&raw); err != nil {
			return nil, err
		}
		out := map[string]any{}
		return out, json.Unmarshal(raw, &out)
	}
	reserve := func(sha string) map[string]any {
		t.Helper()
		r, err := call(`SELECT pg_temp.reserve_media_asset($1, 'image/jpeg', 120000, 1280, 853)::text`, sha)
		if err != nil {
			t.Fatal(err)
		}
		return r
	}
	count := func(q string) int {
		var n int
		if err := pool.QueryRow(ctx, q).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}
	sha := strings.Repeat("ab12", 16)

	// not signed in as an admin: nothing works
	if _, err := call(`SELECT pg_temp.reserve_media_asset($1, 'image/jpeg', 1, 1, 1)::text`, sha); err == nil || !strings.Contains(err.Error(), "not allowed") {
		t.Fatalf("a non-admin must be refused, got %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO fake_admin VALUES ('11111111-1111-4111-8111-111111111111')`); err != nil {
		t.Fatal(err)
	}
	// bad arguments are refused
	for name, q := range map[string]string{
		"hash":  `SELECT pg_temp.reserve_media_asset('xyz', 'image/jpeg', 1, 1, 1)::text`,
		"type":  `SELECT pg_temp.reserve_media_asset('` + sha + `', 'image/svg+xml', 1, 1, 1)::text`,
		"size":  `SELECT pg_temp.reserve_media_asset('` + sha + `', 'image/jpeg', 99999999, 1, 1)::text`,
		"width": `SELECT pg_temp.reserve_media_asset('` + sha + `', 'image/jpeg', 100, 0, 1)::text`,
	} {
		if _, err := call(q); err == nil {
			t.Errorf("a bad %s must be refused", name)
		}
	}

	// a new picture: this caller uploads it, under the name made from its hash (the same name the server makes)
	a := reserve(sha)
	if a["mustUpload"] != true || a["status"] != "uploading" {
		t.Fatalf("new picture: %v", a)
	}
	path := a["path"].(string)
	if path != "ab12ab12-ab12-ab12-ab12-ab12ab12ab12.jpg" {
		t.Fatalf("path: %s", path)
	}
	// a second admin asking while the first is uploading must wait, not upload
	if b := reserve(sha); b["mustUpload"] != false || b["status"] != "uploading" || b["assetId"] != a["assetId"] {
		t.Fatalf("second caller while uploading: %v", b)
	}
	// finishing without the file in Storage is a failure, never "ready"
	if f, _ := call(`SELECT pg_temp.finish_media_asset($1::uuid, true)::text`, a["assetId"]); f["status"] != "failed" {
		t.Fatalf("no object in storage: %v", f)
	}
	// after a failure the next caller uploads again
	if c := reserve(sha); c["mustUpload"] != true {
		t.Fatalf("after failure: %v", c)
	}
	// the file arrives with a size that differs from what was declared: not ready
	pool.Exec(ctx, `INSERT INTO fake_objects VALUES ('site-media', $1, '{"size": 5}')`, path)
	if f, _ := call(`SELECT pg_temp.finish_media_asset($1::uuid, true)::text`, a["assetId"]); f["status"] != "failed" {
		t.Fatalf("size mismatch: %v", f)
	}
	pool.Exec(ctx, `UPDATE media_assets SET status = 'uploading'`)
	pool.Exec(ctx, `UPDATE fake_objects SET metadata = '{"size": 120000}'`)
	if f, _ := call(`SELECT pg_temp.finish_media_asset($1::uuid, true)::text`, a["assetId"]); f["status"] != "ready" {
		t.Fatalf("finish: %v", f)
	}

	// the same picture again, from anywhere, later: already stored, nothing to upload, still exactly one asset
	for i := 0; i < 3; i++ {
		d := reserve(sha)
		if d["status"] != "ready" || d["mustUpload"] != false || d["assetId"] != a["assetId"] || d["path"] != path {
			t.Fatalf("repeat %d: %v", i, d)
		}
	}
	if n := count(`SELECT count(*) FROM media_assets`); n != 1 {
		t.Fatalf("one picture must be one asset, got %d", n)
	}
	// an abandoned upload (nobody finished it for 2 minutes) is taken over
	sha2 := strings.Repeat("cd34", 16)
	e := reserve(sha2)
	pool.Exec(ctx, `UPDATE media_assets SET updated_at = now() - interval '3 minutes' WHERE sha256 = $1`, sha2)
	if g := reserve(sha2); g["mustUpload"] != true || g["assetId"] != e["assetId"] {
		t.Fatalf("abandoned upload: %v", g)
	}

	// one picture shown by Gallery, Blog and Heritage
	for _, ref := range [][2]string{{"image", "g-1"}, {"blog", "b-1"}, {"heritage", "h-1"}} {
		if _, err := pool.Exec(ctx, `SELECT pg_temp.add_media_ref($1::uuid, $2, $3, 0)`, a["assetId"], ref[0], ref[1]); err != nil {
			t.Fatal(err)
		}
	}
	pool.Exec(ctx, `SELECT pg_temp.add_media_ref($1::uuid, 'image', 'g-1', 4)`, a["assetId"]) // again: the order changes, no second reference
	if n := count(`SELECT count(*) FROM content_media`); n != 3 {
		t.Fatalf("references: %d", n)
	}
	if _, err := pool.Exec(ctx, `SELECT pg_temp.add_media_ref($1::uuid, 'image', 'g-9', 0)`, e["assetId"]); err == nil {
		t.Error("a reference to a picture that is not ready must be refused")
	}
	if n := count(`SELECT count(*) FROM media_assets WHERE unreferenced_since IS NULL`); n != 1 {
		t.Fatalf("a used picture is not unused: %d", n)
	}
	// Gallery lets go: the picture stays for Blog and Heritage
	if _, err := pool.Exec(ctx, `SELECT pg_temp.remove_media_ref('image', 'g-1')`); err != nil {
		t.Fatal(err)
	}
	if n := count(`SELECT count(*) FROM content_media`); n != 2 {
		t.Fatalf("after the gallery let go: %d", n)
	}
	if n := count(`SELECT count(*) FROM media_assets WHERE sha256 = '` + sha + `' AND unreferenced_since IS NULL`); n != 1 {
		t.Fatal("a picture that Blog and Heritage still show must not become unused")
	}
	// the others let go: now it is unused (the grace period starts)
	pool.Exec(ctx, `SELECT pg_temp.remove_media_ref('blog', 'b-1')`)
	pool.Exec(ctx, `SELECT pg_temp.remove_media_ref('heritage', 'h-1')`)
	if n := count(`SELECT count(*) FROM media_assets WHERE sha256 = '` + sha + `' AND unreferenced_since IS NOT NULL`); n != 1 {
		t.Fatal("no references left: the picture is unused")
	}
	// restored during the grace period: used again
	pool.Exec(ctx, `SELECT pg_temp.add_media_ref($1::uuid, 'blog', 'b-2', 0)`, a["assetId"])
	if n := count(`SELECT count(*) FROM media_assets WHERE sha256 = '` + sha + `' AND unreferenced_since IS NULL`); n != 1 {
		t.Fatal("a restored reference must make the picture used again")
	}
	// a picture that is still referenced cannot be deleted from the registry by accident
	if _, err := pool.Exec(ctx, `DELETE FROM media_assets WHERE sha256 = $1`, sha); err == nil {
		t.Fatal("deleting a referenced asset must be refused")
	}
	stats, err := call(`SELECT pg_temp.media_stats()::text`)
	if err != nil || stats["assets"].(float64) != 1 || stats["bytes"].(float64) != 120000 || stats["references"].(float64) != 1 {
		t.Fatalf("stats: %v %v", stats, err)
	}

	// ---- housekeeping (media_pg.go) on the same temp objects
	pg := &pgStore{db: pool}
	// the content shows the picture without anyone having recorded it: sync records it, and it counts as used
	pool.Exec(ctx, `INSERT INTO cms_entries (kind, data) VALUES ('blog', jsonb_build_object('image', $1::text))`, path)
	pool.Exec(ctx, `INSERT INTO site_settings VALUES ('site.images', jsonb_build_object('hero', jsonb_build_array($1::text)))`, path)
	pool.Exec(ctx, `DELETE FROM content_media`) // nothing recorded at all
	pool.Exec(ctx, `UPDATE media_assets SET unreferenced_since = now() - interval '60 days'`)
	cands, err := pg.MediaCandidates(ctx, 14*24*time.Hour, 10)
	if err != nil {
		t.Fatal(err)
	}
	for _, c := range cands {
		if c.Path == path {
			t.Fatal("a picture that an entry and a setting mention must never be a removal candidate, recorded or not")
		}
	}
	if n, err := pg.MediaSyncRefs(ctx); err != nil || n != 2 {
		t.Fatalf("sync: %d %v", n, err)
	}
	pool.Exec(ctx, `DELETE FROM cms_entries`) // the post is deleted: its reference goes at the next sync, the setting still shows it
	if n, _ := pg.MediaSyncRefs(ctx); n != 1 {
		t.Fatalf("sync after the post was deleted: %d", n)
	}
	// the setting lets go too: the picture is unused, but the grace period decides
	pool.Exec(ctx, `DELETE FROM site_settings`)
	pg.MediaSyncRefs(ctx)
	pool.Exec(ctx, `UPDATE media_assets SET unreferenced_since = now() - interval '3 days'`)
	if c, _ := pg.MediaCandidates(ctx, 14*24*time.Hour, 10); len(c) != 0 {
		t.Fatalf("unused for 3 days is inside the 14 day grace period: %v", c)
	}
	pool.Exec(ctx, `UPDATE media_assets SET unreferenced_since = now() - interval '20 days'`)
	c, _ := pg.MediaCandidates(ctx, 14*24*time.Hour, 10)
	if len(c) != 1 || c[0].Path != path || c[0].Size != 120000 {
		t.Fatalf("candidates after the grace period: %v", c)
	}
	// an upload still running is never a candidate
	if n := count(`SELECT count(*) FROM media_assets WHERE status = 'uploading'`); n < 1 {
		t.Fatal("expected the abandoned upload to still be there")
	}
	// a reference shows up between listing and removal (the picture was restored): nothing is deleted
	pool.Exec(ctx, `INSERT INTO cms_entries (kind, data) VALUES ('event', jsonb_build_object('image', $1::text))`, path)
	deleted := 0
	gone, err := pg.MediaPurge(ctx, c[0].ID, 14*24*time.Hour, func(context.Context, MediaCandidate) error { deleted++; return nil })
	if err != nil || gone || deleted != 0 {
		t.Fatalf("restored during the grace period must survive: gone=%v deleted=%d err=%v", gone, deleted, err)
	}
	pool.Exec(ctx, `DELETE FROM cms_entries`)
	// the Storage delete fails: the registry row stays
	gone, err = pg.MediaPurge(ctx, c[0].ID, 14*24*time.Hour, func(context.Context, MediaCandidate) error { return context.DeadlineExceeded })
	if err == nil || gone || count(`SELECT count(*) FROM media_assets WHERE sha256 = '`+sha+`'`) != 1 {
		t.Fatalf("a failed storage delete must keep the registry row: gone=%v err=%v", gone, err)
	}
	// finally it really is unused: the file is removed first, then the row
	var removedPath string
	gone, err = pg.MediaPurge(ctx, c[0].ID, 14*24*time.Hour, func(_ context.Context, m MediaCandidate) error { removedPath = m.Path; return nil })
	if err != nil || !gone || removedPath != path || count(`SELECT count(*) FROM media_assets WHERE sha256 = '`+sha+`'`) != 0 {
		t.Fatalf("purge: gone=%v removed=%q err=%v", gone, removedPath, err)
	}
	// and the same picture can be stored again afterwards
	if r := reserve(sha); r["mustUpload"] != true {
		t.Fatalf("after the cleanup the picture is new again: %v", r)
	}
}
