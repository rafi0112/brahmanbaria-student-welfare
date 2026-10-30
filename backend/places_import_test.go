package main

import (
	"context"
	"encoding/json"
	"testing"
)

// The committee's place file: every entry passes the editor's checks, existing places keep their name, sources and
// facts with the new photos first, new places are published, and a second run changes nothing more.
func TestImportPlacesFile(t *testing.T) {
	s := newMemStore()
	ctx := context.Background()
	old, _ := json.Marshal(PlaceData{NameBn: "আড়িফাইল মসজিদ", NameEn: "Arifail Mosque", Category: "mosque", Upazila: "sarail",
		Images: []string{"arifail-01"}, Sources: []string{"https://example.org/src"}, Facts: []Fact{{Label: "Monument ID", Value: "X"}}})
	cur, err := s.CreateEntry(ctx, "", EntryInput{Kind: KindPlace, Slug: "arifail-mosque", Title: "Arifail Mosque", Data: old})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.SetEntryStatus(ctx, "", cur.ID, "publish"); err != nil {
		t.Fatal(err)
	}
	if err := importPlaces(s, []string{"--file=seed/places-update.json"}); err != nil { // preview writes nothing
		t.Fatal(err)
	}
	if _, n, _ := s.ListEntries(ctx, EntryQuery{Kind: KindPlace, Status: "all", Limit: 100, Page: 1}); n != 1 {
		t.Fatalf("preview wrote: %d places", n)
	}
	for run := 0; run < 2; run++ {
		if err := importPlaces(s, []string{"--file=seed/places-update.json", "--apply"}); err != nil {
			t.Fatal(err)
		}
	}
	items, n, _ := s.ListEntries(ctx, EntryQuery{Kind: KindPlace, Status: "all", Limit: 100, Page: 1})
	if n != 21 {
		t.Fatalf("places = %d, want 21", n)
	}
	for _, e := range items {
		if e.Status != "published" {
			t.Errorf("%s is %s", e.Slug, e.Status)
		}
	}
	e, _ := s.GetEntry(ctx, KindPlace, "arifail-mosque", false)
	var d PlaceData
	_ = json.Unmarshal(e.Data, &d)
	if d.Images[0] != "arifail-front" || d.Images[1] != "arifail-01" || len(d.Images) != 2 {
		t.Errorf("images = %v", d.Images)
	}
	if len(d.Sources) != 1 || len(d.Facts) != 1 || d.NameEn != "Arifail Mosque" || d.Details == "" {
		t.Errorf("existing data not kept: %+v", d)
	}
}

// Permanent delete: only archived entries, never an album that still holds pictures, and the entry is gone afterwards.
func TestDeleteEntryOnlyWhenArchived(t *testing.T) {
	s := newMemStore()
	ctx := context.Background()
	d, _ := json.Marshal(PlaceData{NameEn: "Test place", Category: "park"})
	e, err := s.CreateEntry(ctx, "", EntryInput{Kind: KindPlace, Slug: "test-place", Title: "Test place", Data: d})
	if err != nil {
		t.Fatal(err)
	}
	if err := s.DeleteEntry(ctx, "", e.ID); err != ErrBadState {
		t.Fatalf("deleting a draft: %v", err)
	}
	if _, err := s.SetEntryStatus(ctx, "", e.ID, "archive"); err != nil {
		t.Fatal(err)
	}
	if err := s.DeleteEntry(ctx, "", e.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.GetEntry(ctx, KindPlace, e.ID, false); err != ErrNotFound {
		t.Fatalf("still there: %v", err)
	}
	album, _ := s.CreateEntry(ctx, "", EntryInput{Kind: KindAlbum, Title: "Album", Data: json.RawMessage(`{"titleEn":"Album"}`)})
	if _, err := s.CreateEntry(ctx, "", EntryInput{Kind: KindImage, Title: "Pic", ParentID: album.ID, Data: json.RawMessage(`{"image":"titas-sunset"}`)}); err != nil {
		t.Fatal(err)
	}
	_, _ = s.SetEntryStatus(ctx, "", album.ID, "archive")
	if err := s.DeleteEntry(ctx, "", album.ID); err != ErrBadState {
		t.Fatalf("album with pictures: %v", err)
	}
}
