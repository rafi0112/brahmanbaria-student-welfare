package main

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

const contactCols = `c.id::text, c.name, c.email, c.subject, c.message, c.status, c.notify_status,
	to_char(c.created_at AT TIME ZONE 'UTC', ` + tsFmt + `), to_char(c.expires_at AT TIME ZONE 'UTC', ` + tsFmt + `),
	COALESCE(to_char(c.read_at AT TIME ZONE 'UTC', ` + tsFmt + `), ''), COALESCE(to_char(c.replied_at AT TIME ZONE 'UTC', ` + tsFmt + `), '')`

func scanContact(r rowScanner) (ContactMessage, error) {
	var m ContactMessage
	err := r.Scan(&m.ID, &m.Name, &m.Email, &m.Subject, &m.Message, &m.Status, &m.NotifyStatus, &m.CreatedAt, &m.ExpiresAt, &m.ReadAt, &m.RepliedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return m, ErrNotFound
	}
	return m, err
}

// an id that is not a uuid can never match a row; answer "not found" instead of a database error
func validUUID(id string) bool {
	if len(id) != 36 {
		return false
	}
	for i, r := range id {
		switch {
		case i == 8 || i == 13 || i == 18 || i == 23:
			if r != '-' {
				return false
			}
		case !(r >= '0' && r <= '9' || r >= 'a' && r <= 'f' || r >= 'A' && r <= 'F'):
			return false
		}
	}
	return true
}

func (s *pgStore) CreateContact(ctx context.Context, in ContactInput, expires time.Time) (ContactMessage, error) {
	row := s.db.QueryRow(ctx, `INSERT INTO contact_messages AS c (name, email, subject, message, expires_at) VALUES ($1, $2, $3, $4, $5)
		RETURNING `+contactCols, in.Name, in.Email, in.Subject, in.Message, expires.UTC())
	return scanContact(row)
}

func (s *pgStore) ListContacts(ctx context.Context, q ContactQuery) ([]ContactMessage, int, map[string]int, error) {
	where := []string{"c.expires_at > now()"}
	args := []any{}
	add := func(cond string, v any) { args = append(args, v); where = append(where, fmt.Sprintf(cond, len(args))) }
	switch q.Status {
	case "":
		where = append(where, "c.status <> 'archived'")
	case "all":
	default:
		add("c.status = $%d", q.Status)
	}
	if q.Q != "" {
		like := "%" + strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(q.Q) + "%"
		add("(c.name ILIKE $%d OR c.email ILIKE $%[1]d OR c.subject ILIKE $%[1]d)", like)
	}
	if q.From != "" {
		add("(c.created_at AT TIME ZONE 'UTC')::date >= $%d::date", q.From)
	}
	if q.To != "" {
		add("(c.created_at AT TIME ZONE 'UTC')::date <= $%d::date", q.To)
	}
	w := strings.Join(where, " AND ")
	var total int
	if err := s.db.QueryRow(ctx, `SELECT count(*) FROM contact_messages c WHERE `+w, args...).Scan(&total); err != nil {
		return nil, 0, nil, err
	}
	args = append(args, q.Limit, (q.Page-1)*q.Limit)
	rows, err := s.db.Query(ctx, `SELECT `+contactCols+` FROM contact_messages c WHERE `+w+fmt.Sprintf(` ORDER BY c.created_at DESC, c.id LIMIT $%d OFFSET $%d`, len(args)-1, len(args)), args...)
	if err != nil {
		return nil, 0, nil, err
	}
	defer rows.Close()
	out := []ContactMessage{}
	for rows.Next() {
		m, err := scanContact(rows)
		if err != nil {
			return nil, 0, nil, err
		}
		out = append(out, m)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, nil, err
	}
	counts := map[string]int{"new": 0, "read": 0, "replied": 0, "archived": 0}
	cr, err := s.db.Query(ctx, `SELECT status, count(*) FROM contact_messages WHERE expires_at > now() GROUP BY status`)
	if err != nil {
		return nil, 0, nil, err
	}
	defer cr.Close()
	for cr.Next() {
		var st string
		var n int
		if err := cr.Scan(&st, &n); err != nil {
			return nil, 0, nil, err
		}
		counts[st] = n
	}
	return out, total, counts, cr.Err()
}

func (s *pgStore) GetContact(ctx context.Context, id string) (ContactMessage, error) {
	if !validUUID(id) {
		return ContactMessage{}, ErrNotFound
	}
	m, err := scanContact(s.db.QueryRow(ctx, `SELECT `+contactCols+` FROM contact_messages c WHERE c.id = $1::uuid AND c.expires_at > now()`, id))
	if err != nil {
		return m, err
	}
	rows, err := s.db.Query(ctx, `SELECT r.id, COALESCE(NULLIF(p.name, ''), u.email, ''), r.body, r.status, r.error_note, to_char(r.created_at AT TIME ZONE 'UTC', `+tsFmt+`)
		FROM contact_replies r LEFT JOIN users u ON u.id = r.sent_by LEFT JOIN profiles p ON p.user_id = r.sent_by WHERE r.message_id = $1::uuid ORDER BY r.created_at, r.id`, id)
	if err != nil {
		return m, err
	}
	defer rows.Close()
	for rows.Next() {
		var r ContactReply
		if err := rows.Scan(&r.ID, &r.SentBy, &r.Body, &r.Status, &r.Error, &r.CreatedAt); err != nil {
			return m, err
		}
		m.Replies = append(m.Replies, r)
	}
	return m, rows.Err()
}

func (s *pgStore) SetContactStatus(ctx context.Context, id, status string) error {
	if !validUUID(id) {
		return ErrNotFound
	}
	var tag int64
	switch status {
	case "new":
		t, err := s.db.Exec(ctx, `UPDATE contact_messages SET status = 'new', read_at = NULL WHERE id = $1::uuid AND expires_at > now()`, id)
		if err != nil {
			return err
		}
		tag = t.RowsAffected()
	case "read":
		t, err := s.db.Exec(ctx, `UPDATE contact_messages SET status = CASE WHEN status = 'new' THEN 'read' ELSE status END, read_at = COALESCE(read_at, now()) WHERE id = $1::uuid AND expires_at > now()`, id)
		if err != nil {
			return err
		}
		tag = t.RowsAffected()
	case "archived":
		t, err := s.db.Exec(ctx, `UPDATE contact_messages SET status = 'archived' WHERE id = $1::uuid AND expires_at > now()`, id)
		if err != nil {
			return err
		}
		tag = t.RowsAffected()
	default:
		return fmt.Errorf("unsupported status %q", status)
	}
	if tag == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *pgStore) SetContactNotify(ctx context.Context, id, status string) error {
	if !validUUID(id) {
		return ErrNotFound
	}
	t, err := s.db.Exec(ctx, `UPDATE contact_messages SET notify_status = $2, notified_at = CASE WHEN $2 = 'sent' THEN now() ELSE notified_at END WHERE id = $1::uuid`, id, status)
	if err != nil {
		return err
	}
	if t.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *pgStore) AddContactReply(ctx context.Context, id, actorID, body, status, errNote string) error {
	if !validUUID(id) {
		return ErrNotFound
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	var one int
	if err := tx.QueryRow(ctx, `SELECT 1 FROM contact_messages WHERE id = $1::uuid AND expires_at > now() FOR UPDATE`, id).Scan(&one); errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	} else if err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO contact_replies (message_id, sent_by, body, status, error_note) VALUES ($1::uuid, NULLIF($2, '')::uuid, $3, $4, $5)`, id, actorID, body, status, errNote); err != nil {
		return err
	}
	if status == "sent" {
		if _, err := tx.Exec(ctx, `UPDATE contact_messages SET status = 'replied', replied_at = now() WHERE id = $1::uuid`, id); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func (s *pgStore) DeleteContact(ctx context.Context, id string) error {
	if !validUUID(id) {
		return ErrNotFound
	}
	t, err := s.db.Exec(ctx, `DELETE FROM contact_messages WHERE id = $1::uuid AND expires_at > now()`, id)
	if err != nil {
		return err
	}
	if t.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *pgStore) PurgeExpiredContacts(ctx context.Context) (int, error) {
	t, err := s.db.Exec(ctx, `DELETE FROM contact_messages WHERE expires_at <= now()`) // replies go with them (ON DELETE CASCADE)
	if err != nil {
		return 0, err
	}
	return int(t.RowsAffected()), nil
}
