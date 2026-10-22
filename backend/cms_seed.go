package main

import (
	"context"
	_ "embed"
	"encoding/json"
	"fmt"
	"strings"
)

//go:embed seed/gallery.json
var gallerySeedJSON []byte

const seedMarker = "cms.seed.legacy"

// seedLegacyContent copies the bundled posts, heritage places and gallery pictures into the editorial tables once,
// so existing public content stays visible and becomes editable. It runs only if it never ran before: content
// that an admin later archives or edits is never brought back or overwritten by a restart.
func seedLegacyContent(ctx context.Context, s AuthStore, local *Store) error {
	done, err := s.HasAuditAction(ctx, seedMarker)
	if err != nil || done {
		return err
	}
	publish := func(e Entry) error {
		_, err := s.SetEntryStatus(ctx, "", e.ID, "publish")
		return err
	}
	for i, p := range local.Posts {
		data, _ := json.Marshal(BlogData{TitleBn: p.TitleBn, TitleEn: p.TitleEn, ExcerptBn: p.ExcerptBn, ExcerptEn: p.ExcerptEn,
			BodyBn: strings.Join(p.BodyBn, "\n\n"), BodyEn: strings.Join(p.BodyEn, "\n\n"), Category: p.Category, Author: p.Author,
			Image: p.Image, Date: p.Date, ReadMin: p.ReadMin, Sample: p.Sample})
		order := i
		e, err := s.CreateEntry(ctx, "", EntryInput{Kind: KindBlog, Slug: p.Slug, Title: firstNonEmpty(p.TitleEn, p.TitleBn), SortOrder: &order, Data: data})
		if err != nil {
			return fmt.Errorf("seed post %s: %w", p.Slug, err)
		}
		if err := publish(e); err != nil {
			return err
		}
	}
	for i, p := range local.Places {
		data, _ := json.Marshal(PlaceData{NameBn: p.NameBn, NameEn: p.NameEn, Category: p.Category, Upazila: p.Upazila, Lat: p.Lat, Lng: p.Lng,
			Images: p.Images, Summary: p.Summary, Details: p.Details, Facts: p.Facts, Verified: p.Verified, Sources: p.Sources, LastVerified: p.LastVerified})
		order := i
		e, err := s.CreateEntry(ctx, "", EntryInput{Kind: KindPlace, Slug: p.Slug, Title: firstNonEmpty(p.NameEn, p.NameBn), SortOrder: &order, Data: data})
		if err != nil {
			return fmt.Errorf("seed place %s: %w", p.Slug, err)
		}
		if err := publish(e); err != nil {
			return err
		}
	}
	var pics []struct{ ID, Alt, Author, License, Source string }
	if err := json.Unmarshal(gallerySeedJSON, &pics); err != nil {
		return err
	}
	for i, g := range pics {
		data, _ := json.Marshal(ImageData{Image: g.ID, CaptionEn: g.Alt, Alt: g.Alt, Credit: g.Author, License: g.License, Source: g.Source})
		order := i
		e, err := s.CreateEntry(ctx, "", EntryInput{Kind: KindImage, Title: firstNonEmpty(g.Alt, g.ID), SortOrder: &order, Data: data})
		if err != nil {
			return fmt.Errorf("seed image %s: %w", g.ID, err)
		}
		if err := publish(e); err != nil {
			return err
		}
	}
	return s.Audit(ctx, "", seedMarker, "content", "", map[string]any{"posts": len(local.Posts), "places": len(local.Places), "images": len(pics)})
}
