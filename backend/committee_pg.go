package main

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

const (
	tsFmt = `'YYYY-MM-DD"T"HH24:MI:SS"Z"'`
	// c is the alias of committees in every query that uses committeeCols.
	committeeCols = `c.id::text, c.name, c.term, COALESCE(to_char(c.starts_on, 'YYYY-MM-DD'), ''), COALESCE(to_char(c.ends_on, 'YYYY-MM-DD'), ''), c.status,
		COALESCE(to_char(c.published_at AT TIME ZONE 'UTC', ` + tsFmt + `), ''), COALESCE(to_char(c.archived_at AT TIME ZONE 'UTC', ` + tsFmt + `), ''),
		to_char(c.created_at AT TIME ZONE 'UTC', ` + tsFmt + `),
		(SELECT count(*) FROM executives x WHERE x.committee_id = c.id AND x.removed_at IS NULL)`
	execCols = `x.id::text, x.committee_id::text, COALESCE(x.user_id::text, ''), x.name, x.designation, x.bio, x.photo_path, x.display_order`
)

type rowScanner interface{ Scan(dest ...any) error }

func scanCommittee(r rowScanner) (Committee, error) {
	var c Committee
	err := r.Scan(&c.ID, &c.Name, &c.Term, &c.StartsOn, &c.EndsOn, &c.Status, &c.PublishedAt, &c.ArchivedAt, &c.CreatedAt, &c.MemberCount)
	if errors.Is(err, pgx.ErrNoRows) {
		return c, ErrNotFound
	}
	return c, err
}

func scanExec(r rowScanner) (Executive, error) {
	var x Executive
	err := r.Scan(&x.ID, &x.CommitteeID, &x.UserID, &x.Name, &x.Designation, &x.Bio, &x.Photo, &x.Order)
	if errors.Is(err, pgx.ErrNoRows) {
		return x, ErrNotFound
	}
	return x, err
}

type execer interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}

func audit(ctx context.Context, q execer, committee, exec, actor, action string) error {
	_, err := q.Exec(ctx, `INSERT INTO committee_audit (committee_id, executive_id, actor_id, action)
		VALUES (NULLIF($1, '')::uuid, NULLIF($2, '')::uuid, NULLIF($3, '')::uuid, $4)`, committee, exec, actor, action)
	return err
}

func nullDate(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func okID(ids ...string) bool {
	for _, id := range ids {
		if !uuidRx.MatchString(id) {
			return false
		}
	}
	return true
}

func (s *pgStore) members(ctx context.Context, q interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}, committeeID string) ([]Executive, error) {
	rows, err := q.Query(ctx, `SELECT `+execCols+` FROM executives x WHERE x.committee_id = $1::uuid AND x.removed_at IS NULL
		ORDER BY x.display_order, x.created_at, x.id`, committeeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Executive{}
	for rows.Next() {
		x, err := scanExec(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, x)
	}
	return out, rows.Err()
}

func (s *pgStore) ListCommittees(ctx context.Context) ([]Committee, error) {
	rows, err := s.db.Query(ctx, `SELECT `+committeeCols+` FROM committees c ORDER BY c.created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Committee{}
	for rows.Next() {
		c, err := scanCommittee(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (s *pgStore) CommitteeDetail(ctx context.Context, id string) (Committee, []Executive, error) {
	if !okID(id) {
		return Committee{}, nil, ErrNotFound
	}
	c, err := scanCommittee(s.db.QueryRow(ctx, `SELECT `+committeeCols+` FROM committees c WHERE c.id = $1::uuid`, id))
	if err != nil {
		return Committee{}, nil, err
	}
	m, err := s.members(ctx, s.db, id)
	return c, m, err
}

func (s *pgStore) PublishedCommittee(ctx context.Context) (Committee, []Executive, error) {
	c, err := scanCommittee(s.db.QueryRow(ctx, `SELECT `+committeeCols+` FROM committees c WHERE c.status = 'published'`))
	if err != nil {
		return Committee{}, nil, err
	}
	m, err := s.members(ctx, s.db, c.ID)
	return c, m, err
}

func (s *pgStore) CreateCommittee(ctx context.Context, actorID string, in CommitteeInput) (Committee, error) {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return Committee{}, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	var id string
	if err := tx.QueryRow(ctx, `INSERT INTO committees (name, term, starts_on, ends_on, created_by, updated_by)
		VALUES ($1, $2, $3::date, $4::date, NULLIF($5, '')::uuid, NULLIF($5, '')::uuid) RETURNING id::text`,
		in.Name, in.Term, nullDate(in.StartsOn), nullDate(in.EndsOn), actorID).Scan(&id); err != nil {
		return Committee{}, err
	}
	if err := audit(ctx, tx, id, "", actorID, "committee.create"); err != nil {
		return Committee{}, err
	}
	c, err := scanCommittee(tx.QueryRow(ctx, `SELECT `+committeeCols+` FROM committees c WHERE c.id = $1::uuid`, id))
	if err != nil {
		return Committee{}, err
	}
	return c, tx.Commit(ctx)
}

// lockCommittee reads and locks a committee row for the rest of the transaction.
func lockCommittee(ctx context.Context, tx pgx.Tx, id string) (status string, err error) {
	if !okID(id) {
		return "", ErrNotFound
	}
	err = tx.QueryRow(ctx, `SELECT status FROM committees WHERE id = $1::uuid FOR UPDATE`, id).Scan(&status)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	return status, err
}

func (s *pgStore) UpdateCommittee(ctx context.Context, actorID, id string, in CommitteeInput) (Committee, error) {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return Committee{}, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	status, err := lockCommittee(ctx, tx, id)
	if err != nil {
		return Committee{}, err
	}
	if status == CommitteeArchived {
		return Committee{}, ErrCommitteeArchived
	}
	if _, err := tx.Exec(ctx, `UPDATE committees SET name = $2, term = $3, starts_on = $4::date, ends_on = $5::date,
		updated_by = NULLIF($6, '')::uuid, updated_at = now() WHERE id = $1::uuid`,
		id, in.Name, in.Term, nullDate(in.StartsOn), nullDate(in.EndsOn), actorID); err != nil {
		return Committee{}, err
	}
	if err := audit(ctx, tx, id, "", actorID, "committee.update"); err != nil {
		return Committee{}, err
	}
	c, err := scanCommittee(tx.QueryRow(ctx, `SELECT `+committeeCols+` FROM committees c WHERE c.id = $1::uuid`, id))
	if err != nil {
		return Committee{}, err
	}
	return c, tx.Commit(ctx)
}

func (s *pgStore) SetCommitteeStatus(ctx context.Context, actorID, id, action string) (Committee, error) {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return Committee{}, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock($1)`, committeeLockKey); err != nil {
		return Committee{}, err
	}
	status, err := lockCommittee(ctx, tx, id)
	if err != nil {
		return Committee{}, err
	}
	switch action {
	case "publish":
		if status != CommitteeDraft {
			return Committee{}, ErrBadState
		}
		var n int
		if err := tx.QueryRow(ctx, `SELECT count(*) FROM executives WHERE committee_id = $1::uuid AND removed_at IS NULL`, id).Scan(&n); err != nil {
			return Committee{}, err
		}
		if n == 0 {
			return Committee{}, ErrEmptyCommittee
		}
		rows, err := tx.Query(ctx, `UPDATE committees SET status = 'archived', archived_at = now(), updated_at = now()
			WHERE status = 'published' AND id <> $1::uuid RETURNING id::text`, id)
		if err != nil {
			return Committee{}, err
		}
		var replaced []string
		for rows.Next() {
			var rid string
			if err := rows.Scan(&rid); err != nil {
				rows.Close()
				return Committee{}, err
			}
			replaced = append(replaced, rid)
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return Committee{}, err
		}
		for _, rid := range replaced {
			if err := audit(ctx, tx, rid, "", actorID, "committee.archive"); err != nil {
				return Committee{}, err
			}
		}
		_, err = tx.Exec(ctx, `UPDATE committees SET status = 'published', published_at = now(), updated_by = NULLIF($2, '')::uuid, updated_at = now() WHERE id = $1::uuid`, id, actorID)
	case "unpublish":
		if status != CommitteePublished {
			return Committee{}, ErrBadState
		}
		_, err = tx.Exec(ctx, `UPDATE committees SET status = 'draft', updated_by = NULLIF($2, '')::uuid, updated_at = now() WHERE id = $1::uuid`, id, actorID)
	case "archive":
		if status == CommitteeArchived {
			return Committee{}, ErrBadState
		}
		_, err = tx.Exec(ctx, `UPDATE committees SET status = 'archived', archived_at = now(), updated_by = NULLIF($2, '')::uuid, updated_at = now() WHERE id = $1::uuid`, id, actorID)
	default:
		return Committee{}, ErrBadState
	}
	if err != nil {
		return Committee{}, err
	}
	if err := audit(ctx, tx, id, "", actorID, "committee."+action); err != nil {
		return Committee{}, err
	}
	c, err := scanCommittee(tx.QueryRow(ctx, `SELECT `+committeeCols+` FROM committees c WHERE c.id = $1::uuid`, id))
	if err != nil {
		return Committee{}, err
	}
	return c, tx.Commit(ctx)
}

const committeeLockKey = 727276

func (s *pgStore) AddExecutive(ctx context.Context, actorID, committeeID string, in ExecutiveInput) (Executive, error) {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return Executive{}, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	status, err := lockCommittee(ctx, tx, committeeID)
	if err != nil {
		return Executive{}, err
	}
	if status == CommitteeArchived {
		return Executive{}, ErrCommitteeArchived
	}
	name := in.Name
	if in.UserID != "" {
		if !okID(in.UserID) {
			return Executive{}, ErrUnknownMember
		}
		var profileName *string
		err := tx.QueryRow(ctx, `SELECT p.name FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id = $1::uuid`, in.UserID).Scan(&profileName)
		if errors.Is(err, pgx.ErrNoRows) {
			return Executive{}, ErrUnknownMember
		}
		if err != nil {
			return Executive{}, err
		}
		if name == "" && profileName != nil {
			name = *profileName
		}
		if name == "" {
			return Executive{}, ErrUnknownMember
		}
	}
	var id string
	err = tx.QueryRow(ctx, `INSERT INTO executives (committee_id, user_id, name, designation, bio, photo_path, display_order, created_by, updated_by)
		VALUES ($1::uuid, NULLIF($2, '')::uuid, $3, $4, $5, $6,
		  COALESCE($7::int, (SELECT COALESCE(MAX(display_order) + 1, 0) FROM executives WHERE committee_id = $1::uuid AND removed_at IS NULL)),
		  NULLIF($8, '')::uuid, NULLIF($8, '')::uuid) RETURNING id::text`,
		committeeID, in.UserID, name, in.Designation, in.Bio, in.Photo, in.Order, actorID).Scan(&id)
	if isUnique(err) {
		return Executive{}, ErrDuplicateExecutive
	}
	if err != nil {
		return Executive{}, err
	}
	if err := audit(ctx, tx, committeeID, id, actorID, "executive.add"); err != nil {
		return Executive{}, err
	}
	x, err := scanExec(tx.QueryRow(ctx, `SELECT `+execCols+` FROM executives x WHERE x.id = $1::uuid`, id))
	if err != nil {
		return Executive{}, err
	}
	return x, tx.Commit(ctx)
}

// lockExecutive finds an active seat and locks its committee, returning the committee id.
func lockExecutive(ctx context.Context, tx pgx.Tx, id string) (string, error) {
	if !okID(id) {
		return "", ErrNotFound
	}
	var committeeID string
	err := tx.QueryRow(ctx, `SELECT committee_id::text FROM executives WHERE id = $1::uuid AND removed_at IS NULL`, id).Scan(&committeeID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	if err != nil {
		return "", err
	}
	status, err := lockCommittee(ctx, tx, committeeID)
	if err != nil {
		return "", err
	}
	if status == CommitteeArchived {
		return "", ErrCommitteeArchived
	}
	return committeeID, nil
}

func (s *pgStore) UpdateExecutive(ctx context.Context, actorID, id string, p ExecutivePatch) (Executive, error) {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return Executive{}, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	committeeID, err := lockExecutive(ctx, tx, id)
	if err != nil {
		return Executive{}, err
	}
	if _, err := tx.Exec(ctx, `UPDATE executives SET
		name = COALESCE($2, name), designation = COALESCE($3, designation), bio = COALESCE($4, bio),
		photo_path = COALESCE($5, photo_path), display_order = COALESCE($6::int, display_order),
		updated_by = NULLIF($7, '')::uuid, updated_at = now() WHERE id = $1::uuid`,
		id, p.Name, p.Designation, p.Bio, p.Photo, p.Order, actorID); err != nil {
		return Executive{}, err
	}
	if err := audit(ctx, tx, committeeID, id, actorID, "executive.update"); err != nil {
		return Executive{}, err
	}
	x, err := scanExec(tx.QueryRow(ctx, `SELECT `+execCols+` FROM executives x WHERE x.id = $1::uuid`, id))
	if err != nil {
		return Executive{}, err
	}
	return x, tx.Commit(ctx)
}

func (s *pgStore) RemoveExecutive(ctx context.Context, actorID, id string) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	committeeID, err := lockExecutive(ctx, tx, id)
	if err != nil {
		return err
	}
	// Only the seat is marked removed: users, profiles and alumni records are not touched.
	if _, err := tx.Exec(ctx, `UPDATE executives SET removed_at = now(), updated_by = NULLIF($2, '')::uuid, updated_at = now() WHERE id = $1::uuid`, id, actorID); err != nil {
		return err
	}
	if err := audit(ctx, tx, committeeID, id, actorID, "executive.remove"); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *pgStore) ReorderExecutives(ctx context.Context, actorID, committeeID string, ids []string) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	status, err := lockCommittee(ctx, tx, committeeID)
	if err != nil {
		return err
	}
	if status == CommitteeArchived {
		return ErrCommitteeArchived
	}
	active, err := s.members(ctx, tx, committeeID)
	if err != nil {
		return err
	}
	if len(ids) != len(active) {
		return ErrReorderMismatch
	}
	want := map[string]bool{}
	for _, x := range active {
		want[x.ID] = true
	}
	for _, id := range ids {
		if !want[id] {
			return ErrReorderMismatch
		}
		delete(want, id) // a repeated id is no longer wanted the second time
	}
	for i, id := range ids {
		if _, err := tx.Exec(ctx, `UPDATE executives SET display_order = $2, updated_by = NULLIF($3, '')::uuid, updated_at = now() WHERE id = $1::uuid`, id, i+1, actorID); err != nil {
			return err
		}
	}
	if err := audit(ctx, tx, committeeID, "", actorID, "executive.reorder"); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
