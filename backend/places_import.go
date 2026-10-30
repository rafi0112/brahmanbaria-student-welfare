package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
	"time"
)

// placeUpdate is one heritage place in seed/places-update.json (text and photos supplied by the committee).
type placeUpdate struct {
	Slug     string   `json:"slug"`
	NameBn   string   `json:"nameBn"`
	NameEn   string   `json:"nameEn"`
	Category string   `json:"category"`
	Upazila  string   `json:"upazila"`
	Address  string   `json:"address"`
	Images   []string `json:"images"`
	Summary  string   `json:"summary"`
	Details  string   `json:"details"`
	Facts    []Fact   `json:"facts"`
}

// importPlaces adds new heritage places and refreshes existing ones from a file: `go run . import-places [--file=] [--apply]`.
// Without --apply it only prints what would change. Existing places keep their name, coordinates, sources and facts;
// their text, category and upazila come from the file, its photos go first and the old ones follow. New places are
// published. Nothing is ever deleted.
func importPlaces(s AuthStore, args []string) error {
	if s == nil {
		return fmt.Errorf("DATABASE_URL is not set")
	}
	file, apply := "seed/places-update.json", false
	for _, a := range args {
		switch {
		case a == "--apply":
			apply = true
		case strings.HasPrefix(a, "--file="):
			file = strings.TrimPrefix(a, "--file=")
		default:
			return fmt.Errorf("unknown flag %q", a)
		}
	}
	raw, err := os.ReadFile(file)
	if err != nil {
		return err
	}
	var items []placeUpdate
	if err := json.Unmarshal(raw, &items); err != nil {
		return fmt.Errorf("%s: %w", file, err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	created, updated := 0, 0
	for i, p := range items {
		cur, err := s.GetEntry(ctx, KindPlace, p.Slug, false)
		exists := err == nil
		if err != nil && !errors.Is(err, ErrNotFound) {
			return fmt.Errorf("%s: %w", p.Slug, err)
		}
		d := PlaceData{NameBn: p.NameBn, NameEn: p.NameEn, Category: p.Category, Upazila: p.Upazila, Address: p.Address,
			Images: p.Images, Summary: p.Summary, Details: p.Details, Facts: p.Facts}
		if exists {
			var old PlaceData
			_ = json.Unmarshal(cur.Data, &old)
			d.NameBn, d.NameEn = firstNonEmpty(old.NameBn, p.NameBn), firstNonEmpty(old.NameEn, p.NameEn)
			d.Lat, d.Lng, d.MapLink, d.Period, d.Visitor = old.Lat, old.Lng, old.MapLink, old.Period, old.Visitor
			d.Verified, d.Sources, d.LastVerified = old.Verified, old.Sources, old.LastVerified
			d.Address = firstNonEmpty(p.Address, old.Address)
			d.Images = mergeStrings(p.Images, old.Images)
			d.Facts = mergeFacts(old.Facts, p.Facts)
		}
		data, _ := json.Marshal(d)
		// the same checks and clean-up as the admin editor
		in, errs := parsePlace(data, &entryBody{Slug: p.Slug})
		if len(errs) > 0 {
			return fmt.Errorf("%s: %v", p.Slug, errs)
		}
		action := "create"
		if exists {
			action = "update"
		}
		fmt.Printf("%-7s %-30s %-14s %-11s %d photo(s)\n", action, p.Slug, d.Category, firstNonEmpty(d.Upazila, "-"), len(d.Images))
		if !apply {
			continue
		}
		if exists {
			in.Featured, in.SortOrder = cur.Featured, &cur.SortOrder
			if _, err := s.UpdateEntry(ctx, "", cur.ID, in); err != nil {
				return fmt.Errorf("update %s: %w", p.Slug, err)
			}
			updated++
			continue
		}
		order := 100 + i
		in.SortOrder = &order
		e, err := s.CreateEntry(ctx, "", in)
		if err != nil {
			return fmt.Errorf("create %s: %w", p.Slug, err)
		}
		if _, err := s.SetEntryStatus(ctx, "", e.ID, "publish"); err != nil {
			return fmt.Errorf("publish %s: %w", p.Slug, err)
		}
		created++
	}
	if !apply {
		fmt.Printf("\npreview only: %d place(s); run with --apply to write them\n", len(items))
		return nil
	}
	fmt.Printf("\ndone: %d created, %d updated\n", created, updated)
	return s.Audit(ctx, "", "places.import", "content", "", map[string]any{"created": created, "updated": updated, "file": file})
}

func mergeStrings(first, then []string) []string {
	out, seen := []string{}, map[string]bool{}
	for _, v := range append(append([]string{}, first...), then...) {
		if v != "" && !seen[v] {
			seen[v] = true
			out = append(out, v)
		}
	}
	if len(out) > 12 {
		out = out[:12]
	}
	return out
}

// mergeFacts keeps the existing facts and adds the new ones whose label is not there yet.
func mergeFacts(old, add []Fact) []Fact {
	out := append([]Fact{}, old...)
	for _, f := range add {
		dup := false
		for _, o := range old {
			if strings.EqualFold(o.Label, f.Label) {
				dup = true
			}
		}
		if !dup {
			out = append(out, f)
		}
	}
	return out
}

// importEvents adds events from a file (`go run . import-events --file= [--apply]`) and publishes them. Events whose slug
// already exists are left as they are, so a second run changes nothing and admin edits are never overwritten.
func importEvents(s AuthStore, args []string) error {
	if s == nil {
		return fmt.Errorf("DATABASE_URL is not set")
	}
	file, apply := "", false
	for _, a := range args {
		switch {
		case a == "--apply":
			apply = true
		case strings.HasPrefix(a, "--file="):
			file = strings.TrimPrefix(a, "--file=")
		default:
			return fmt.Errorf("unknown flag %q", a)
		}
	}
	if file == "" {
		return fmt.Errorf("--file= is required")
	}
	raw, err := os.ReadFile(file)
	if err != nil {
		return err
	}
	var items []struct {
		Slug string          `json:"slug"`
		Data json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(raw, &items); err != nil {
		return fmt.Errorf("%s: %w", file, err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	for _, it := range items {
		in, errs := parseEvent(it.Data, &entryBody{Slug: it.Slug})
		if len(errs) > 0 {
			return fmt.Errorf("%s: %v", it.Slug, errs)
		}
		if _, err := s.GetEntry(ctx, KindEvent, it.Slug, false); err == nil {
			fmt.Printf("keep    %s (already there)\n", it.Slug)
			continue
		} else if !errors.Is(err, ErrNotFound) {
			return err
		}
		fmt.Printf("create  %s\n", it.Slug)
		if !apply {
			continue
		}
		e, err := s.CreateEntry(ctx, "", in)
		if err != nil {
			return fmt.Errorf("create %s: %w", it.Slug, err)
		}
		if _, err := s.SetEntryStatus(ctx, "", e.ID, "publish"); err != nil {
			return fmt.Errorf("publish %s: %w", it.Slug, err)
		}
	}
	if !apply {
		fmt.Println("\npreview only; run with --apply to write them")
	}
	return nil
}
