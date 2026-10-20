package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
)

func (s *pgStore) loadContent(ctx context.Context, local *Store) (*Store, error) {
	seed := map[string]any{
		"events": local.Events, "committee": local.Committee, "faqs": local.FAQs,
		"students": local.Students, "alumni": local.Alumni, "upazilas": local.Upazilas,
		"places": local.Places, "posts": local.Posts, "depts": local.Depts,
		"blood": local.Blood, "sample": local.Sample,
	}
	for kind, value := range seed {
		payload, err := json.Marshal(value)
		if err != nil {
			return nil, fmt.Errorf("encode %s: %w", kind, err)
		}
		if _, err := s.db.Exec(ctx, `INSERT INTO content_documents (kind, payload)
			VALUES ($1, $2::jsonb) ON CONFLICT (kind) DO NOTHING`, kind, string(payload)); err != nil {
			return nil, fmt.Errorf("seed %s: %w", kind, err)
		}
	}

	out := &Store{Blood: map[string]int{}}
	rows, err := s.db.Query(ctx, `SELECT kind, payload FROM content_documents`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var kind string
		var payload []byte
		if err := rows.Scan(&kind, &payload); err != nil {
			return nil, err
		}
		var target any
		switch kind {
		case "events":
			target = &out.Events
		case "committee":
			target = &out.Committee
		case "faqs":
			target = &out.FAQs
		case "students":
			target = &out.Students
		case "alumni":
			target = &out.Alumni
		case "upazilas":
			target = &out.Upazilas
		case "places":
			target = &out.Places
		case "posts":
			target = &out.Posts
		case "depts":
			target = &out.Depts
		case "blood":
			target = &out.Blood
		case "sample":
			target = &out.Sample
		default:
			continue
		}
		if err := json.Unmarshal(payload, target); err != nil {
			return nil, fmt.Errorf("decode %s: %w", kind, err)
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	rebuildStoreDerived(out)
	return out, nil
}

func (s *pgStore) Content(ctx context.Context, local *Store) (*Store, error) {
	var exists bool
	if err := s.db.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM content_documents LIMIT 1)`).Scan(&exists); err != nil {
		return nil, err
	}
	if !exists && local == nil {
		return nil, errors.New("content repository is empty and no seed is available")
	}
	return s.loadContent(ctx, localOrEmpty(local))
}

func localOrEmpty(local *Store) *Store {
	if local != nil {
		return local
	}
	return &Store{Blood: map[string]int{}}
}

func (s *pgStore) ContentDocument(ctx context.Context, kind string) ([]byte, error) {
	var payload []byte
	if err := s.db.QueryRow(ctx, `SELECT payload FROM content_documents WHERE kind = $1`, kind).Scan(&payload); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return payload, nil
}
