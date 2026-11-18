package main

import (
	"reflect"
	"testing"
)

// Reordering some pictures (one page, one album) moves them among the places they held; the rest keep theirs.
func TestReorderSlotsKeepsTheRestOfTheList(t *testing.T) {
	cases := []struct{ in, want []int }{
		{[]int{7, 3, 5}, []int{3, 5, 7}},
		{[]int{1, 2, 3}, []int{1, 2, 3}},
		{[]int{4, 4, 4}, []int{4, 5, 6}}, // places that clash are numbered on from the first
		{[]int{}, []int{}},
	}
	for _, c := range cases {
		if got := reorderSlots(c.in); !reflect.DeepEqual(got, c.want) && !(len(got) == 0 && len(c.want) == 0) {
			t.Errorf("reorderSlots(%v) = %v, want %v", c.in, got, c.want)
		}
	}
}

func TestPictureYearUsesTheFirstKnownDate(t *testing.T) {
	if y := pictureYear("2024-03-01", "2026-01-01T00:00:00Z"); y != "2024" {
		t.Fatalf("event date first: %q", y)
	}
	if y := pictureYear("", "2025-05-05T10:00:00Z", "2023-01-01"); y != "2025" {
		t.Fatalf("published date next: %q", y)
	}
	if y := pictureYear("", "", "x"); y != "" {
		t.Fatalf("no date: %q", y)
	}
}

// Reordering a part of the gallery through the API leaves the other pictures where they were.
func TestReorderingPartOfTheGalleryLeavesTheRest(t *testing.T) {
	e := cmsApp(t)
	ids := make([]string, 4)
	for i := range ids {
		rec := adminJSON(e, "POST", "/api/v1/admin/content/image", map[string]any{"data": map[string]any{"image": "titas-evening", "alt": "Photo"}})
		var out Entry
		decodeBody(t, rec, &out)
		if rec.Code != 201 {
			t.Fatalf("create: %d %s", rec.Code, rec.Body)
		}
		ids[i] = out.ID
	}
	order := func() []string {
		var out struct{ Items []Entry }
		decodeBody(t, adminJSON(e, "GET", "/api/v1/admin/content/image?sort=order&status=all", nil), &out)
		got := []string{}
		for _, it := range out.Items {
			got = append(got, it.ID)
		}
		return got
	}
	// the whole list first, then only the middle two swapped
	if rec := adminJSON(e, "POST", "/api/v1/admin/content/image/reorder", map[string]any{"ids": ids}); rec.Code != 200 {
		t.Fatalf("reorder: %d %s", rec.Code, rec.Body)
	}
	if rec := adminJSON(e, "POST", "/api/v1/admin/content/image/reorder", map[string]any{"ids": []string{ids[2], ids[1]}}); rec.Code != 200 {
		t.Fatalf("reorder part: %d", rec.Code)
	}
	if got, want := order(), []string{ids[0], ids[2], ids[1], ids[3]}; !reflect.DeepEqual(got, want) {
		t.Fatalf("order = %v, want %v", got, want)
	}
}
