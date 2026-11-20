package main

import (
	"context"
	"strings"
	"testing"
)

// "Batches so far" is the newest batch among current students and alumni, so it grows by itself each year.
func TestStatsLatestBatch(t *testing.T) {
	e := authApp(t)
	var out struct {
		Batches     int `json:"batches"`
		LatestBatch int `json:"latestBatch"`
	}
	rec := e.do("GET", "/api/v1/stats", nil, nil)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"latestBatch"`) {
		t.Fatalf("stats: %d %s", rec.Code, rec.Body)
	}
	decodeBody(t, rec, &out)
	want := 0
	for _, s := range e.app.directoryStudents(context.Background()) {
		if s.Batch != nil && *s.Batch > want {
			want = *s.Batch
		}
	}
	for _, a := range e.app.shownAlumni(context.Background()) {
		if a.Batch != nil && *a.Batch > want {
			want = *a.Batch
		}
	}
	if out.LatestBatch != want || (want > 0 && out.LatestBatch < out.Batches) {
		t.Fatalf("latest batch %d, want %d (distinct batches %d)", out.LatestBatch, want, out.Batches)
	}
}
