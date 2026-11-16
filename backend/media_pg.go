package main

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

// "Is this picture still shown anywhere?" is answered from the content itself, not only from content_media: an entry or a
// site setting that mentions the file name counts, so a reference that was never recorded can not make a used picture look unused.
const mediaMentioned = `(EXISTS (SELECT 1 FROM cms_entries e WHERE position(a.storage_path IN e.data::text) > 0)
	OR EXISTS (SELECT 1 FROM site_settings s WHERE position(a.storage_path IN s.value::text) > 0))`

func (s *pgStore) MediaStats(ctx context.Context) (MediaStats, error) {
	var st MediaStats
	err := s.db.QueryRow(ctx, `SELECT
		count(*) FILTER (WHERE status = 'ready'),
		coalesce(sum(file_size) FILTER (WHERE status = 'ready'), 0),
		count(*) FILTER (WHERE status = 'ready' AND unreferenced_since IS NOT NULL),
		coalesce(sum(file_size) FILTER (WHERE status = 'ready' AND unreferenced_since IS NOT NULL), 0),
		(SELECT count(*) FROM content_media)
		FROM media_assets`).Scan(&st.Assets, &st.Bytes, &st.Unused, &st.UnusedBytes, &st.References)
	return st, err
}

// MediaSyncRefs makes content_media match what the content really shows. It owns only the rows of types "cms:<kind>" and
// "setting"; references added another way are left alone.
func (s *pgStore) MediaSyncRefs(ctx context.Context) (int, error) {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `INSERT INTO content_media (asset_id, content_type, content_id)
		SELECT a.id, 'cms:' || e.kind, e.id::text FROM media_assets a JOIN cms_entries e ON position(a.storage_path IN e.data::text) > 0 WHERE a.status = 'ready'
		UNION
		SELECT a.id, 'setting', st.key FROM media_assets a JOIN site_settings st ON position(a.storage_path IN st.value::text) > 0 WHERE a.status = 'ready'
		ON CONFLICT (asset_id, content_type, content_id) DO NOTHING`); err != nil {
		return 0, err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM content_media cm USING media_assets a WHERE a.id = cm.asset_id AND (
		(cm.content_type LIKE 'cms:%' AND NOT EXISTS (SELECT 1 FROM cms_entries e WHERE e.id::text = cm.content_id AND position(a.storage_path IN e.data::text) > 0))
		OR (cm.content_type = 'setting' AND NOT EXISTS (SELECT 1 FROM site_settings st WHERE st.key = cm.content_id AND position(a.storage_path IN st.value::text) > 0)))`); err != nil {
		return 0, err
	}
	var n int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM content_media`).Scan(&n); err != nil {
		return 0, err
	}
	return n, tx.Commit(ctx)
}

func (s *pgStore) MediaCandidates(ctx context.Context, grace time.Duration, limit int) ([]MediaCandidate, error) {
	rows, err := s.db.Query(ctx, `SELECT a.id::text, a.storage_path, a.bucket, a.file_size FROM media_assets a
		WHERE a.status = 'ready' AND a.unreferenced_since < now() - $1::interval
		  AND NOT EXISTS (SELECT 1 FROM content_media cm WHERE cm.asset_id = a.id) AND NOT `+mediaMentioned+`
		ORDER BY a.unreferenced_since LIMIT $2`, grace.String(), limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []MediaCandidate{}
	for rows.Next() {
		var c MediaCandidate
		if err := rows.Scan(&c.ID, &c.Path, &c.Bucket, &c.Size); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (s *pgStore) MediaPurge(ctx context.Context, id string, grace time.Duration, del func(context.Context, MediaCandidate) error) (bool, error) {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer tx.Rollback(ctx)
	var c MediaCandidate
	err = tx.QueryRow(ctx, `SELECT a.id::text, a.storage_path, a.bucket, a.file_size FROM media_assets a
		WHERE a.id = $1::uuid AND a.status = 'ready' AND a.unreferenced_since < now() - $2::interval
		  AND NOT EXISTS (SELECT 1 FROM content_media cm WHERE cm.asset_id = a.id) AND NOT `+mediaMentioned+`
		FOR UPDATE`, id, grace.String()).Scan(&c.ID, &c.Path, &c.Bucket, &c.Size)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil // used again, or no longer old enough, or already gone
	}
	if err != nil {
		return false, err
	}
	// the row stays locked while the file is removed: an admin uploading the same picture right now waits here and
	// then stores it again, instead of being told it is already there
	if err := del(ctx, c); err != nil {
		return false, err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM media_assets WHERE id = $1::uuid`, id); err != nil {
		return false, err
	}
	return true, tx.Commit(ctx)
}
