package main

import (
	"testing"
	"time"
)

func TestDashboardChartsCountRealRows(t *testing.T) {
	b := func(n int) *int { return &n }
	students := []importedView{
		{Student: Student{Department: "Finance", Upazila: "kasba", Batch: b(16)}},
		{Student: Student{Department: "Finance", Upazila: "kasba", Batch: b(15)}},
		{Student: Student{Department: "History", Upazila: "nasirnagar"}},
	}
	now := time.Date(2026, 10, 23, 0, 0, 0, 0, time.UTC)
	members := []MemberRow{{Profile: Profile{CreatedAt: "2026-10-02T10:00:00Z", Gender: "female"}}, {Profile: Profile{CreatedAt: "2025-01-02T10:00:00Z"}}}
	c := dashboardCharts(students, members, now)
	dept := c["byDepartment"].([]chartBar)
	if c["students"] != 3 || len(dept) != 2 || dept[0] != (chartBar{"Finance", 2}) {
		t.Fatalf("departments: %+v", c)
	}
	batch := c["byBatch"].([]chartBar)
	if len(batch) != 2 || batch[0].Key != "15" {
		t.Fatalf("batches are sorted and skip empty ones: %+v", batch)
	}
	months := c["signups"].([]chartBar)
	if len(months) != 12 || months[0].Key != "2025-11" || months[11] != (chartBar{"2026-10", 1}) {
		t.Fatalf("twelve months, the old sign-up outside the window: %+v", months)
	}
	if g := c["gender"].([]chartBar); len(g) != 2 {
		t.Fatalf("gender: %+v", g)
	}
}
