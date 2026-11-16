package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// the housekeeping endpoints: dry run by default, nothing removed without apply=1, and only what the store confirms

type fakeMedia struct {
	AuthStore
	list   []MediaCandidate
	purged []string
	keep   map[string]bool // candidates that are used again by the time they are re-checked
}

func (f *fakeMedia) MediaStats(context.Context) (MediaStats, error) {
	return MediaStats{Assets: 3, Bytes: 900, Unused: 1, UnusedBytes: 300}, nil
}
func (f *fakeMedia) MediaSyncRefs(context.Context) (int, error) { return 2, nil }
func (f *fakeMedia) MediaCandidates(context.Context, time.Duration, int) ([]MediaCandidate, error) {
	return f.list, nil
}
func (f *fakeMedia) MediaPurge(ctx context.Context, id string, _ time.Duration, del func(context.Context, MediaCandidate) error) (bool, error) {
	for _, c := range f.list {
		if c.ID == id {
			if f.keep[id] {
				return false, nil
			}
			if err := del(ctx, c); err != nil {
				return false, err
			}
			f.purged = append(f.purged, id)
			return true, nil
		}
	}
	return false, nil
}

type fakeDeleter struct{ deleted []string }

func (d *fakeDeleter) Invite(context.Context, string, string) (string, error) { return "", nil }
func (d *fakeDeleter) DeleteObject(_ context.Context, bucket, name string) error {
	d.deleted = append(d.deleted, bucket+"/"+name)
	return nil
}

func TestMediaCleanupIsADryRunUnlessAskedAndOnlyRemovesWhatStaysUnused(t *testing.T) {
	e := cmsApp(t)
	// without a registry (the in-memory store) the endpoints say so
	if rec := adminJSON(e, "GET", "/api/v1/admin/media/stats", nil); rec.Code != http.StatusNotImplemented {
		t.Fatalf("no registry: %d", rec.Code)
	}
	fm := &fakeMedia{AuthStore: e.app.Auth.Store, list: []MediaCandidate{
		{ID: "a", Path: "aaaa.jpg", Bucket: "site-media", Size: 100}, {ID: "b", Path: "bbbb.jpg", Bucket: "site-media", Size: 200},
	}, keep: map[string]bool{"b": true}}
	e.app.Auth.Store = fm
	del := &fakeDeleter{}
	e.app.Auth.Inviter = del

	rec := adminJSON(e, "GET", "/api/v1/admin/media/stats", nil)
	var st MediaStats
	if rec.Code != 200 || json.Unmarshal(rec.Body.Bytes(), &st) != nil || st.Assets != 3 || st.Unused != 1 {
		t.Fatalf("stats: %d %s", rec.Code, rec.Body.String())
	}
	// dry run: lists the candidates and removes nothing
	rec = adminJSON(e, "POST", "/api/v1/admin/media/cleanup", nil)
	if rec.Code != 200 || len(del.deleted) != 0 || len(fm.purged) != 0 {
		t.Fatalf("dry run: %d deleted=%v purged=%v", rec.Code, del.deleted, fm.purged)
	}
	var out struct {
		Apply      bool             `json:"apply"`
		GraceDays  int              `json:"graceDays"`
		Candidates []MediaCandidate `json:"candidates"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	if out.Apply || out.GraceDays != 14 || len(out.Candidates) != 2 {
		t.Fatalf("dry run answer: %s", rec.Body.String())
	}
	// apply: "b" was used again before it was re-checked, so only "a" goes
	rec = adminJSON(e, "POST", "/api/v1/admin/media/cleanup?apply=1", nil)
	if rec.Code != 200 || len(del.deleted) != 1 || del.deleted[0] != "site-media/aaaa.jpg" {
		t.Fatalf("apply: %d deleted=%v %s", rec.Code, del.deleted, rec.Body.String())
	}
	// no storage key configured: nothing is removed
	e.app.Auth.Inviter = nil
	if rec := adminJSON(e, "POST", "/api/v1/admin/media/cleanup?apply=1", nil); rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("no key: %d", rec.Code)
	}
	_ = httptest.NewRecorder
}

func TestStorageDeleteGoesThroughTheStorageAPI(t *testing.T) {
	var method, path, key string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		method, path, key = r.Method, r.URL.Path, r.Header.Get("apikey")
		w.WriteHeader(200)
	}))
	defer srv.Close()
	adm := newSupabaseAdmin(srv.URL, "sb_secret_x")
	if err := adm.DeleteObject(context.Background(), "site-media", "aaaa.jpg"); err != nil {
		t.Fatal(err)
	}
	if method != http.MethodDelete || path != "/storage/v1/object/site-media/aaaa.jpg" || key != "sb_secret_x" {
		t.Fatalf("%s %s", method, path)
	}
}
