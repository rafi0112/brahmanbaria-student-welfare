package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

const (
	entryCols = `e.id::text, e.kind, COALESCE(e.slug, ''), e.title, e.status, e.featured, e.sort_order, COALESCE(e.parent_id::text, ''), e.data,
		COALESCE(to_char(e.published_at AT TIME ZONE 'UTC', ` + tsFmt + `), ''), to_char(e.created_at AT TIME ZONE 'UTC', ` + tsFmt + `),
		to_char(e.updated_at AT TIME ZONE 'UTC', ` + tsFmt + `), COALESCE(e.created_by::text, ''), COALESCE(e.updated_by::text, ''), COALESCE(NULLIF(p.name, ''), u.email, '')`
	entryFrom = ` FROM cms_entries e LEFT JOIN users u ON u.id = e.created_by LEFT JOIN profiles p ON p.user_id = e.created_by`
)

func scanEntry(r rowScanner) (Entry, error) {
	var e Entry
	var data []byte
	err := r.Scan(&e.ID, &e.Kind, &e.Slug, &e.Title, &e.Status, &e.Featured, &e.SortOrder, &e.ParentID, &data,
		&e.PublishedAt, &e.CreatedAt, &e.UpdatedAt, &e.CreatedBy, &e.UpdatedBy, &e.AuthorName)
	if errors.Is(err, pgx.ErrNoRows) {
		return e, ErrNotFound
	}
	e.Data = json.RawMessage(data)
	if len(e.Data) == 0 {
		e.Data = json.RawMessage("{}")
	}
	return e, err
}

func auditAdmin(ctx context.Context, q execer, actor, action, entity, entityID string, detail map[string]any) error {
	if actor == "" && !strings.HasPrefix(action, "cms.") {
		return nil // system work (such as the one-time content import) is summarised by its marker, not logged item by item
	}
	if detail == nil {
		detail = map[string]any{}
	}
	b, err := json.Marshal(detail)
	if err != nil {
		return err
	}
	_, err = q.Exec(ctx, `INSERT INTO admin_audit (actor_id, action, entity, entity_id, detail) VALUES (NULLIF($1, '')::uuid, $2, $3, $4, $5::jsonb)`,
		actor, action, entity, entityID, string(b))
	return err
}

func (s *pgStore) Audit(ctx context.Context, actorID, action, entity, entityID string, detail map[string]any) error {
	return auditAdmin(ctx, s.db, actorID, action, entity, entityID, detail)
}

func (s *pgStore) HasAuditAction(ctx context.Context, action string) (bool, error) {
	var n int
	err := s.db.QueryRow(ctx, `SELECT count(*) FROM admin_audit WHERE action = $1`, action).Scan(&n)
	return n > 0, err
}

func (s *pgStore) RecentActivity(ctx context.Context, limit int) ([]Activity, error) {
	if limit < 1 || limit > 200 {
		limit = 20
	}
	rows, err := s.db.Query(ctx, `
		SELECT to_char(x.at AT TIME ZONE 'UTC', `+tsFmt+`), COALESCE(NULLIF(p.name, ''), u.email, ''), x.action, x.entity, x.entity_id, x.detail
		FROM (
		  SELECT a.created_at AS at, a.actor_id, a.action, a.entity, a.entity_id, a.detail FROM admin_audit a
		  UNION ALL
		  SELECT c.created_at, c.actor_id, c.action, 'committee', COALESCE(c.executive_id, c.committee_id)::text, c.detail FROM committee_audit c
		  UNION ALL
		  SELECT r.created_at, r.actor_id, 'role.' || r.new_role, 'user', r.target_id::text,
		         jsonb_build_object('from', r.old_role, 'to', r.new_role, 'source', r.source) FROM role_changes r
		) x
		LEFT JOIN users u ON u.id = x.actor_id LEFT JOIN profiles p ON p.user_id = x.actor_id
		ORDER BY x.at DESC LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Activity{}
	for rows.Next() {
		var a Activity
		var detail []byte
		if err := rows.Scan(&a.At, &a.Actor, &a.Action, &a.Entity, &a.EntityID, &detail); err != nil {
			return nil, err
		}
		_ = json.Unmarshal(detail, &a.Detail)
		out = append(out, a)
	}
	return out, rows.Err()
}

func (s *pgStore) RoleHistory(ctx context.Context, targetID string, limit int) ([]RoleChangeRow, error) {
	if limit < 1 || limit > 200 {
		limit = 50
	}
	if targetID != "" && !okID(targetID) {
		return []RoleChangeRow{}, nil
	}
	rows, err := s.db.Query(ctx, `SELECT to_char(r.created_at AT TIME ZONE 'UTC', `+tsFmt+`), COALESCE(t.email, ''), COALESCE(a.email, ''), r.old_role, r.new_role, r.source
		FROM role_changes r LEFT JOIN users t ON t.id = r.target_id LEFT JOIN users a ON a.id = r.actor_id
		WHERE ($1 = '' OR r.target_id::text = $1) ORDER BY r.created_at DESC, r.id DESC LIMIT $2`, targetID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []RoleChangeRow{}
	for rows.Next() {
		var r RoleChangeRow
		if err := rows.Scan(&r.At, &r.Target, &r.Actor, &r.From, &r.To, &r.Source); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// ---------------------------------------------------------------- entries

type condBuilder struct {
	conds []string
	args  []any
}

// add appends a condition; every ? becomes the same new positional parameter.
func (b *condBuilder) add(cond string, v any) {
	b.args = append(b.args, v)
	b.conds = append(b.conds, strings.ReplaceAll(cond, "?", fmt.Sprintf("$%d", len(b.args))))
}

func (b *condBuilder) raw(cond string) { b.conds = append(b.conds, cond) }

func (b *condBuilder) where() string {
	if len(b.conds) == 0 {
		return ""
	}
	return " WHERE " + strings.Join(b.conds, " AND ")
}

func (s *pgStore) ListEntries(ctx context.Context, q EntryQuery) ([]Entry, int, error) {
	q.norm()
	b := &condBuilder{}
	b.add("e.kind = ?", q.Kind)
	switch {
	case q.Public:
		b.raw("e.status = 'published'")
	case q.Status == "":
		b.raw("e.status <> 'archived'")
	case q.Status != "all":
		b.add("e.status = ?", q.Status)
	}
	if q.Q != "" {
		b.add("position(lower(?) in lower(e.title || ' ' || e.data::text)) > 0", q.Q)
	}
	switch q.Parent {
	case "":
	case "none":
		b.raw("e.parent_id IS NULL")
	default:
		if !okID(q.Parent) {
			return []Entry{}, 0, nil
		}
		b.add("e.parent_id = ?::uuid", q.Parent)
	}
	if q.Featured == "yes" {
		b.raw("e.featured")
	} else if q.Featured == "no" {
		b.raw("NOT e.featured")
	}
	if q.Category != "" {
		b.add("e.data->>'category' = ?", q.Category)
	}
	if q.Author != "" {
		b.add("e.data->>'author' = ?", q.Author)
	}
	if q.Upazila != "" {
		b.add("e.data->>'upazila' = ?", q.Upazila)
	}
	if validDate(q.From) && q.From != "" {
		b.add("COALESCE(e.published_at, e.created_at)::date >= ?::date", q.From)
	}
	if validDate(q.To) && q.To != "" {
		b.add("COALESCE(e.published_at, e.created_at)::date <= ?::date", q.To)
	}
	order := "e.updated_at DESC"
	switch q.Sort {
	case "published":
		order = "e.published_at DESC NULLS LAST, e.created_at DESC"
	case "order":
		order = "e.sort_order, e.created_at"
	case "title":
		order = "lower(e.title)"
	}
	var total int
	if err := s.db.QueryRow(ctx, `SELECT count(*) FROM cms_entries e`+b.where(), b.args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	args := append(append([]any{}, b.args...), q.Limit, (q.Page-1)*q.Limit)
	rows, err := s.db.Query(ctx, `SELECT `+entryCols+entryFrom+b.where()+` ORDER BY `+order+`, e.id LIMIT $`+fmt.Sprint(len(args)-1)+` OFFSET $`+fmt.Sprint(len(args)), args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := []Entry{}
	for rows.Next() {
		e, err := scanEntry(rows)
		if err != nil {
			return nil, 0, err
		}
		out = append(out, e)
	}
	return out, total, rows.Err()
}

func (s *pgStore) GetEntry(ctx context.Context, kind, idOrSlug string, publicOnly bool) (Entry, error) {
	sql := `SELECT ` + entryCols + entryFrom + ` WHERE e.kind = $1 AND (e.id::text = $2 OR e.slug = $2)`
	if publicOnly {
		sql += ` AND e.status = 'published'`
	}
	return scanEntry(s.db.QueryRow(ctx, sql, kind, idOrSlug))
}

func nullStr(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func isFKViolation(err error) bool {
	var pe *pgconn.PgError
	return errors.As(err, &pe) && pe.Code == "23503"
}

func (s *pgStore) checkParent(ctx context.Context, tx pgx.Tx, kind, parent string) error {
	if parent == "" {
		return nil
	}
	if kind != KindImage || !okID(parent) {
		return ErrParentInvalid
	}
	var pk string
	err := tx.QueryRow(ctx, `SELECT kind FROM cms_entries WHERE id = $1::uuid`, parent).Scan(&pk)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && pk != KindAlbum) {
		return ErrParentInvalid
	}
	return err
}

func (s *pgStore) CreateEntry(ctx context.Context, actorID string, in EntryInput) (Entry, error) {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return Entry{}, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	if err := s.checkParent(ctx, tx, in.Kind, in.ParentID); err != nil {
		return Entry{}, err
	}
	var id string
	err = tx.QueryRow(ctx, `INSERT INTO cms_entries (kind, slug, title, featured, sort_order, parent_id, data, created_by, updated_by)
		VALUES ($1, $2, $3, $4,
		  COALESCE($5::int, (SELECT COALESCE(MAX(sort_order) + 1, 0) FROM cms_entries WHERE kind = $1)),
		  NULLIF($6, '')::uuid, $7::jsonb, NULLIF($8, '')::uuid, NULLIF($8, '')::uuid) RETURNING id::text`,
		in.Kind, nullStr(in.Slug), in.Title, in.Featured, in.SortOrder, in.ParentID, string(in.Data), actorID).Scan(&id)
	if isUnique(err) {
		return Entry{}, ErrSlugTaken
	}
	if isFKViolation(err) {
		return Entry{}, ErrParentInvalid
	}
	if err != nil {
		return Entry{}, err
	}
	if err := auditAdmin(ctx, tx, actorID, in.Kind+".create", in.Kind, id, map[string]any{"title": in.Title}); err != nil {
		return Entry{}, err
	}
	e, err := scanEntry(tx.QueryRow(ctx, `SELECT `+entryCols+entryFrom+` WHERE e.id = $1::uuid`, id))
	if err != nil {
		return Entry{}, err
	}
	return e, tx.Commit(ctx)
}

func (s *pgStore) UpdateEntry(ctx context.Context, actorID, id string, in EntryInput) (Entry, error) {
	if !okID(id) {
		return Entry{}, ErrNotFound
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return Entry{}, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	var kind, stamp string
	if err := tx.QueryRow(ctx, `SELECT kind, to_char(updated_at AT TIME ZONE 'UTC', `+tsFmt+`) FROM cms_entries WHERE id = $1::uuid FOR UPDATE`, id).Scan(&kind, &stamp); errors.Is(err, pgx.ErrNoRows) {
		return Entry{}, ErrNotFound
	} else if err != nil {
		return Entry{}, err
	}
	if in.ExpectedUpdatedAt != "" && in.ExpectedUpdatedAt != stamp {
		return Entry{}, ErrStale
	}
	if err := s.checkParent(ctx, tx, kind, in.ParentID); err != nil {
		return Entry{}, err
	}
	_, err = tx.Exec(ctx, `UPDATE cms_entries SET slug = $2, title = $3, featured = $4, sort_order = COALESCE($5::int, sort_order),
		parent_id = NULLIF($6, '')::uuid, data = $7::jsonb, updated_by = NULLIF($8, '')::uuid, updated_at = now() WHERE id = $1::uuid`,
		id, nullStr(in.Slug), in.Title, in.Featured, in.SortOrder, in.ParentID, string(in.Data), actorID)
	if isUnique(err) {
		return Entry{}, ErrSlugTaken
	}
	if err != nil {
		return Entry{}, err
	}
	if err := auditAdmin(ctx, tx, actorID, kind+".update", kind, id, map[string]any{"title": in.Title}); err != nil {
		return Entry{}, err
	}
	e, err := scanEntry(tx.QueryRow(ctx, `SELECT `+entryCols+entryFrom+` WHERE e.id = $1::uuid`, id))
	if err != nil {
		return Entry{}, err
	}
	return e, tx.Commit(ctx)
}

func (s *pgStore) SetEntryStatus(ctx context.Context, actorID, id, action string) (Entry, error) {
	if !okID(id) {
		return Entry{}, ErrNotFound
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return Entry{}, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	var kind, status, title string
	if err := tx.QueryRow(ctx, `SELECT kind, status, title FROM cms_entries WHERE id = $1::uuid FOR UPDATE`, id).Scan(&kind, &status, &title); errors.Is(err, pgx.ErrNoRows) {
		return Entry{}, ErrNotFound
	} else if err != nil {
		return Entry{}, err
	}
	next := ""
	switch {
	case action == "publish" && status != StatusPublished:
		next = StatusPublished
	case action == "unpublish" && status == StatusPublished:
		next = StatusDraft
	case action == "archive" && status != StatusArchived:
		next = StatusArchived
	case action == "restore" && status == StatusArchived:
		next = StatusDraft
	default:
		return Entry{}, ErrBadState
	}
	if _, err := tx.Exec(ctx, `UPDATE cms_entries SET status = $2, updated_by = NULLIF($3, '')::uuid, updated_at = now(),
		published_at = CASE WHEN $2 = 'published' THEN COALESCE(published_at, now()) ELSE published_at END WHERE id = $1::uuid`, id, next, actorID); err != nil {
		return Entry{}, err
	}
	if err := auditAdmin(ctx, tx, actorID, kind+"."+action, kind, id, map[string]any{"title": title}); err != nil {
		return Entry{}, err
	}
	e, err := scanEntry(tx.QueryRow(ctx, `SELECT `+entryCols+entryFrom+` WHERE e.id = $1::uuid`, id))
	if err != nil {
		return Entry{}, err
	}
	return e, tx.Commit(ctx)
}

func (s *pgStore) ReorderEntries(ctx context.Context, actorID, kind string, ids []string) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	seen := map[string]bool{}
	for _, id := range ids {
		if !okID(id) || seen[id] {
			return ErrReorderMismatch
		}
		seen[id] = true
		var n int
		if err := tx.QueryRow(ctx, `SELECT count(*) FROM cms_entries WHERE id = $1::uuid AND kind = $2`, id, kind).Scan(&n); err != nil {
			return err
		}
		if n != 1 {
			return ErrReorderMismatch
		}
	}
	for i, id := range ids {
		if _, err := tx.Exec(ctx, `UPDATE cms_entries SET sort_order = $2, updated_by = NULLIF($3, '')::uuid, updated_at = now() WHERE id = $1::uuid`, id, i+1, actorID); err != nil {
			return err
		}
	}
	if err := auditAdmin(ctx, tx, actorID, kind+".reorder", kind, "", map[string]any{"count": len(ids)}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *pgStore) CountEntries(ctx context.Context) (map[string]map[string]int, error) {
	rows, err := s.db.Query(ctx, `SELECT kind, status, count(*) FROM cms_entries GROUP BY kind, status`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]map[string]int{}
	for rows.Next() {
		var k, st string
		var n int
		if err := rows.Scan(&k, &st, &n); err != nil {
			return nil, err
		}
		if out[k] == nil {
			out[k] = map[string]int{}
		}
		out[k][st] = n
	}
	return out, rows.Err()
}

// ---------------------------------------------------------------- members as admins see them

const completeSQL = `(p.name <> '' AND p.batch > 0 AND p.department <> '' AND p.upazila <> '' AND p.union_name <> '' AND p.session <> '')`
const memberCols = `u.id::text, u.email, p.name, p.batch, p.department, p.upazila, p.union_name, p.phone, p.blood_group, p.status, p.show_in_directory, u.role,
	u.email_verified_at IS NOT NULL, u.disabled_at IS NOT NULL, ` + completeSQL + `, to_char(p.created_at AT TIME ZONE 'UTC', ` + tsFmt + `), p.session, p.gender,
	COALESCE(to_char(p.reviewed_at AT TIME ZONE 'UTC', ` + tsFmt + `), ''), COALESCE(NULLIF(rp.name, ''), ru.email, ''), p.review_note`
const memberFrom = ` FROM users u JOIN profiles p ON p.user_id = u.id LEFT JOIN profiles rp ON rp.user_id = p.reviewed_by LEFT JOIN users ru ON ru.id = p.reviewed_by`

func scanMember(r rowScanner) (MemberAdminRow, error) {
	var m MemberAdminRow
	err := r.Scan(&m.ID, &m.Email, &m.Name, &m.Batch, &m.Department, &m.Upazila, &m.Union, &m.Phone, &m.BloodGroup, &m.Status, &m.ShowInDirectory,
		&m.Role, &m.EmailVerified, &m.Disabled, &m.Complete, &m.CreatedAt, &m.Session, &m.Gender, &m.ReviewedAt, &m.ReviewedBy, &m.ReviewNote)
	if errors.Is(err, pgx.ErrNoRows) {
		return m, ErrNotFound
	}
	m.Missing = missingProfileFields(m.Name, m.Batch, m.Department, m.Upazila, m.Union, m.Session)
	return m, err
}

func (s *pgStore) ListMembersAdmin(ctx context.Context, q MemberQuery) ([]MemberAdminRow, int, error) {
	if q.Page < 1 {
		q.Page = 1
	}
	if q.Limit < 1 || q.Limit > 100 {
		q.Limit = 20
	}
	b := &condBuilder{}
	if q.Q != "" {
		b.add("(position(lower(?) in lower(u.email)) > 0 OR position(lower(?) in lower(p.name)) > 0)", q.Q)
	}
	if q.Status != "" {
		b.add("p.status = ?", q.Status)
	}
	if q.Department != "" {
		b.add("p.department = ?", q.Department)
	}
	if q.Batch > 0 {
		b.add("p.batch = ?::int", q.Batch)
	}
	if q.BatchAbove > 0 {
		b.add("p.batch > ?::int", q.BatchAbove)
	}
	if q.BatchUpTo > 0 {
		b.add("p.batch <= ?::int", q.BatchUpTo)
	}
	yn := func(v, cond string) {
		switch v {
		case "yes":
			b.raw(cond)
		case "no":
			b.raw("NOT (" + cond + ")")
		}
	}
	yn(q.Verified, "u.email_verified_at IS NOT NULL")
	yn(q.Complete, completeSQL)
	switch q.View {
	case "verified":
		b.raw("(p.status = 'approved' AND u.email_verified_at IS NOT NULL)")
	case "review": // pending, or approved without a confirmed email, or required details missing; rejected members are not queued
		b.raw("(p.status <> 'rejected' AND (p.status = 'pending' OR u.email_verified_at IS NULL OR NOT " + completeSQL + "))")
	}
	yn(q.Disabled, "u.disabled_at IS NOT NULL")
	order := map[string]string{"": "p.created_at DESC", "newest": "p.created_at DESC", "oldest": "p.created_at", "name": "lower(p.name)", "batch": "p.batch DESC, lower(p.name)",
		"status": "p.status, lower(p.name)"}[q.Sort]
	if order == "" {
		order = "p.created_at DESC"
	}
	var total int
	if err := s.db.QueryRow(ctx, `SELECT count(*)`+memberFrom+b.where(), b.args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	args := append(append([]any{}, b.args...), q.Limit, (q.Page-1)*q.Limit)
	rows, err := s.db.Query(ctx, `SELECT `+memberCols+memberFrom+b.where()+` ORDER BY `+order+`, u.id LIMIT $`+fmt.Sprint(len(args)-1)+` OFFSET $`+fmt.Sprint(len(args)), args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := []MemberAdminRow{}
	for rows.Next() {
		m, err := scanMember(rows)
		if err != nil {
			return nil, 0, err
		}
		out = append(out, m)
	}
	return out, total, rows.Err()
}

func (s *pgStore) MemberAdmin(ctx context.Context, userID string) (MemberAdminRow, error) {
	if !okID(userID) {
		return MemberAdminRow{}, ErrNotFound
	}
	return scanMember(s.db.QueryRow(ctx, `SELECT `+memberCols+memberFrom+` WHERE u.id = $1::uuid`, userID))
}

func (s *pgStore) UpdateMemberAdmin(ctx context.Context, actorID, userID string, p MemberPatch) (MemberAdminRow, error) {
	if !okID(userID) {
		return MemberAdminRow{}, ErrNotFound
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return MemberAdminRow{}, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	tag, err := tx.Exec(ctx, `UPDATE profiles SET name = COALESCE($2, name), batch = COALESCE($3::int, batch), department = COALESCE($4, department),
		upazila = COALESCE($5, upazila), union_name = COALESCE($6, union_name), phone = COALESCE($7, phone), blood_group = COALESCE($8, blood_group),
		show_in_directory = COALESCE($9::boolean, show_in_directory), session = COALESCE($10, session), gender = COALESCE($11, gender) WHERE user_id = $1::uuid`,
		userID, p.Name, p.Batch, p.Department, p.Upazila, p.Union, p.Phone, p.BloodGroup, p.ShowInDirectory, p.Session, p.Gender)
	if err != nil {
		return MemberAdminRow{}, err
	}
	if tag.RowsAffected() == 0 {
		return MemberAdminRow{}, ErrNotFound
	}
	if err := auditAdmin(ctx, tx, actorID, "member.update", "user", userID, nil); err != nil {
		return MemberAdminRow{}, err
	}
	m, err := scanMember(tx.QueryRow(ctx, `SELECT `+memberCols+memberFrom+` WHERE u.id = $1::uuid`, userID))
	if err != nil {
		return MemberAdminRow{}, err
	}
	return m, tx.Commit(ctx)
}

func (s *pgStore) ReviewMember(ctx context.Context, actorID, userID, status string, note ...string) error {
	if !okID(userID) {
		return ErrNotFound
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	why := ""
	if len(note) > 0 {
		why = note[0]
	}
	tag, err := tx.Exec(ctx, `UPDATE profiles SET status = $2, reviewed_at = now(), reviewed_by = NULLIF($3, '')::uuid, review_note = $4 WHERE user_id = $1::uuid`, userID, status, actorID, why)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	detail := map[string]any{}
	if why != "" {
		detail["reason"] = why
	}
	if err := auditAdmin(ctx, tx, actorID, "member."+status, "user", userID, detail); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// MemberHistory lists the recorded decisions and edits for one member, newest first (from the admin audit trail).
func (s *pgStore) MemberHistory(ctx context.Context, userID string) ([]Activity, error) {
	if !okID(userID) {
		return nil, ErrNotFound
	}
	rows, err := s.db.Query(ctx, `SELECT to_char(x.created_at AT TIME ZONE 'UTC', `+tsFmt+`), COALESCE(NULLIF(p.name, ''), u.email, ''), x.action, x.entity, x.entity_id, x.detail
		FROM admin_audit x LEFT JOIN users u ON u.id = x.actor_id LEFT JOIN profiles p ON p.user_id = x.actor_id
		WHERE x.entity = 'user' AND x.entity_id = $1 AND x.action LIKE 'member.%' ORDER BY x.created_at DESC, x.id DESC LIMIT 50`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Activity{}
	for rows.Next() {
		var a Activity
		var detail []byte
		if err := rows.Scan(&a.At, &a.Actor, &a.Action, &a.Entity, &a.EntityID, &detail); err != nil {
			return nil, err
		}
		_ = json.Unmarshal(detail, &a.Detail)
		out = append(out, a)
	}
	return out, rows.Err()
}

func (s *pgStore) SetAccountDisabled(ctx context.Context, actorID, userID string, disabled bool) error {
	if !okID(userID) {
		return ErrNotFound
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	var role string
	if err := tx.QueryRow(ctx, `SELECT role FROM users WHERE id = $1::uuid FOR UPDATE`, userID).Scan(&role); errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	} else if err != nil {
		return err
	}
	if disabled {
		if actorID == userID {
			return ErrSelfDisable
		}
		if role == RoleAdmin {
			return ErrAdminProtected
		}
	}
	if _, err := tx.Exec(ctx, `UPDATE users SET disabled_at = CASE WHEN $2::boolean THEN now() END, updated_at = now() WHERE id = $1::uuid`, userID, disabled); err != nil {
		return err
	}
	if disabled {
		if _, err := tx.Exec(ctx, `DELETE FROM sessions WHERE user_id = $1::uuid`, userID); err != nil {
			return err
		}
	}
	action := "member.activate"
	if disabled {
		action = "member.deactivate"
	}
	if err := auditAdmin(ctx, tx, actorID, action, "user", userID, nil); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *pgStore) RemoveMember(ctx context.Context, actorID, userID string, external func(context.Context) error) error {
	if !okID(userID) {
		return ErrNotFound
	}
	if actorID == userID {
		return ErrSelfDisable
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	var role, email, name string
	err = tx.QueryRow(ctx, `SELECT u.role, u.email, COALESCE(p.name, '') FROM users u LEFT JOIN profiles p ON p.user_id = u.id
		WHERE u.id = $1::uuid FOR UPDATE OF u`, userID).Scan(&role, &email, &name)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	} else if err != nil {
		return err
	}
	if role == RoleAdmin {
		return ErrAdminProtected
	}
	if err := auditAdmin(ctx, tx, actorID, "member.remove", "user", userID, map[string]any{"title": name, "email": email}); err != nil {
		return err
	}
	// profile, photo, sessions and a pending change go with the account (ON DELETE CASCADE); other links are cleared
	if _, err := tx.Exec(ctx, `DELETE FROM users WHERE id = $1::uuid`, userID); err != nil {
		return err
	}
	if external != nil {
		if err := external(ctx); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func (s *pgStore) DeleteEntry(ctx context.Context, actorID, id string) error {
	if !okID(id) {
		return ErrNotFound
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	var kind, status, title string
	if err := tx.QueryRow(ctx, `SELECT kind, status, title FROM cms_entries WHERE id = $1::uuid FOR UPDATE`, id).Scan(&kind, &status, &title); errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	} else if err != nil {
		return err
	}
	var children int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM cms_entries WHERE parent_id = $1::uuid`, id).Scan(&children); err != nil {
		return err
	}
	if status != StatusArchived || children > 0 {
		return ErrBadState
	}
	if _, err := tx.Exec(ctx, `DELETE FROM cms_entries WHERE id = $1::uuid`, id); err != nil {
		return err
	}
	if err := auditAdmin(ctx, tx, actorID, kind+".delete", kind, id, map[string]any{"title": title}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
