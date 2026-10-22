package main

import (
	"context"
	"embed"
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed migrations/*.sql
var migrationFS embed.FS

type pgStore struct{ db *pgxpool.Pool }

// openPostgres connects and applies pending migrations.
// Simple-protocol mode keeps it compatible with Supabase's transaction pooler (port 6543).
func openPostgres(ctx context.Context, url string) (*pgStore, error) {
	cfg, err := pgxpool.ParseConfig(normalizeDatabaseURL(url))
	if err != nil {
		return nil, err
	}
	cfg.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol
	cfg.MaxConns = 8
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	s := &pgStore{db: pool}
	if err := s.migrate(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	return s, nil
}

func (s *pgStore) migrate(ctx context.Context) error {
	conn, err := s.db.Acquire(ctx)
	if err != nil {
		return err
	}
	defer conn.Release()
	if _, err := conn.Exec(ctx, `SELECT pg_advisory_lock(727274)`); err != nil {
		return err
	}
	defer conn.Exec(context.Background(), `SELECT pg_advisory_unlock(727274)`) //nolint:errcheck
	if _, err := conn.Exec(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`); err != nil {
		return err
	}
	entries, err := migrationFS.ReadDir("migrations")
	if err != nil {
		return err
	}
	names := []string{}
	for _, e := range entries {
		names = append(names, e.Name())
	}
	sort.Strings(names)
	for _, name := range names {
		var done bool
		if err := conn.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version = $1)`, name).Scan(&done); err != nil {
			return err
		}
		if done {
			continue
		}
		sql, err := migrationFS.ReadFile("migrations/" + name)
		if err != nil {
			return err
		}
		tx, err := conn.Begin(ctx)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, string(sql)); err != nil {
			_ = tx.Rollback(ctx)
			return fmt.Errorf("migration %s: %w", name, err)
		}
		if _, err := tx.Exec(ctx, `INSERT INTO schema_migrations (version) VALUES ($1)`, name); err != nil {
			_ = tx.Rollback(ctx)
			return err
		}
		if err := tx.Commit(ctx); err != nil {
			return err
		}
	}
	return nil
}

func (s *pgStore) Close()                         { s.db.Close() }
func (s *pgStore) Ping(ctx context.Context) error { return s.db.Ping(ctx) }

func isUnique(err error) bool {
	var pe *pgconn.PgError
	return errors.As(err, &pe) && pe.Code == "23505"
}

func (s *pgStore) CreateUser(ctx context.Context, n NewUser) (User, error) {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return User{}, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	var u User
	var verified *time.Time
	err = tx.QueryRow(ctx, `INSERT INTO users (email, password_hash, role, email_verified_at)
		VALUES ($1, $2, $3, CASE WHEN $4::boolean THEN now() END)
		RETURNING id::text, email, password_hash, role, email_verified_at`,
		n.Email, n.PasswordHash, n.Role, n.Verified).Scan(&u.ID, &u.Email, &u.PasswordHash, &u.Role, &verified)
	if err != nil {
		if isUnique(err) {
			return User{}, ErrEmailTaken
		}
		return User{}, err
	}
	u.EmailVerified = verified != nil
	if p := n.Profile; p != nil {
		if _, err := tx.Exec(ctx, `INSERT INTO profiles (user_id, name, batch, department, upazila, union_name)
			VALUES ($1, $2, $3, $4, $5, $6)`, u.ID, p.Name, p.Batch, p.Department, p.Upazila, p.Union); err != nil {
			return User{}, err
		}
	}
	return u, tx.Commit(ctx)
}

const userCols = `id::text, email, password_hash, role, email_verified_at`

func scanUser(row pgx.Row) (User, error) {
	var u User
	var v *time.Time
	if err := row.Scan(&u.ID, &u.Email, &u.PasswordHash, &u.Role, &v); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return User{}, ErrNotFound
		}
		return User{}, err
	}
	u.EmailVerified = v != nil
	return u, nil
}

func (s *pgStore) UserByEmail(ctx context.Context, email string) (User, error) {
	return scanUser(s.db.QueryRow(ctx, `SELECT `+userCols+` FROM users WHERE email = $1`, email))
}

func (s *pgStore) UserByID(ctx context.Context, id string) (User, error) {
	return scanUser(s.db.QueryRow(ctx, `SELECT `+userCols+` FROM users WHERE id = $1::uuid`, id))
}

func (s *pgStore) EnsureExternalUser(ctx context.Context, id, email string, verified bool) (User, error) {
	var u User
	var verifiedAt *time.Time
	err := s.db.QueryRow(ctx, `INSERT INTO users (id, email, password_hash, role, email_verified_at)
		VALUES ($1::uuid, $2, '', $3, CASE WHEN $4::boolean THEN now() END)
		ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, updated_at = now(),
			email_verified_at = COALESCE(users.email_verified_at, EXCLUDED.email_verified_at)
		RETURNING id::text, email, password_hash, role, email_verified_at`, id, email, RoleMember, verified).
		Scan(&u.ID, &u.Email, &u.PasswordHash, &u.Role, &verifiedAt)
	if err != nil {
		if isUnique(err) {
			return User{}, ErrEmailTaken
		}
		return User{}, err
	}
	u.EmailVerified = verifiedAt != nil
	return u, nil
}

func (s *pgStore) SetEmailVerified(ctx context.Context, id string) error {
	_, err := s.db.Exec(ctx, `UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()), updated_at = now() WHERE id = $1::uuid`, id)
	return err
}

func (s *pgStore) SetPassword(ctx context.Context, id, hash string) error {
	_, err := s.db.Exec(ctx, `UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1::uuid`, id, hash)
	return err
}

func (s *pgStore) SaveToken(ctx context.Context, userID, purpose, digest string, expires time.Time) error {
	_, err := s.db.Exec(ctx, `INSERT INTO email_tokens (token_hash, user_id, purpose, expires_at) VALUES ($1, $2::uuid, $3, $4)`,
		digest, userID, purpose, expires)
	return err
}

func (s *pgStore) ConsumeToken(ctx context.Context, purpose, digest string) (string, error) {
	var id string
	err := s.db.QueryRow(ctx, `UPDATE email_tokens SET used_at = now()
		WHERE token_hash = $1 AND purpose = $2 AND used_at IS NULL AND expires_at > now()
		RETURNING user_id::text`, digest, purpose).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	return id, err
}

func (s *pgStore) CreateSession(ctx context.Context, userID, digest string, expires time.Time) error {
	_, err := s.db.Exec(ctx, `INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2::uuid, $3)`, digest, userID, expires)
	return err
}

func (s *pgStore) SessionUser(ctx context.Context, digest string) (User, error) {
	return scanUser(s.db.QueryRow(ctx, `SELECT u.id::text, u.email, u.password_hash, u.role, u.email_verified_at
		FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > now()`, digest))
}

func (s *pgStore) DeleteSession(ctx context.Context, digest string) error {
	_, err := s.db.Exec(ctx, `DELETE FROM sessions WHERE token_hash = $1`, digest)
	return err
}

func (s *pgStore) DeleteUserSessions(ctx context.Context, userID string) error {
	_, err := s.db.Exec(ctx, `DELETE FROM sessions WHERE user_id = $1::uuid`, userID)
	return err
}

const profCols = `user_id::text, name, batch, department, upazila, union_name, phone, blood_group, status,
	show_in_directory, show_phone, show_email, show_blood, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`

func scanProfile(row pgx.Row, p *Profile) error {
	return row.Scan(&p.UserID, &p.Name, &p.Batch, &p.Department, &p.Upazila, &p.Union, &p.Phone, &p.BloodGroup, &p.Status,
		&p.ShowInDirectory, &p.ShowPhone, &p.ShowEmail, &p.ShowBlood, &p.CreatedAt)
}

func (s *pgStore) ProfileByUser(ctx context.Context, id string) (*Profile, error) {
	var p Profile
	if err := scanProfile(s.db.QueryRow(ctx, `SELECT `+profCols+` FROM profiles WHERE user_id = $1::uuid`, id), &p); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &p, nil
}

func (s *pgStore) UpdateProfile(ctx context.Context, id string, c ProfilePatch) error {
	tag, err := s.db.Exec(ctx, `UPDATE profiles SET
		phone = COALESCE($2, phone), blood_group = COALESCE($3, blood_group), show_in_directory = COALESCE($4, show_in_directory),
		show_phone = COALESCE($5, show_phone), show_email = COALESCE($6, show_email), show_blood = COALESCE($7, show_blood)
		WHERE user_id = $1::uuid`, id, c.Phone, c.BloodGroup, c.ShowInDirectory, c.ShowPhone, c.ShowEmail, c.ShowBlood)
	if err == nil && tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return err
}

func (s *pgStore) UpsertProfile(ctx context.Context, id string, p Profile) error {
	_, err := s.db.Exec(ctx, `INSERT INTO profiles
		(user_id, name, batch, department, upazila, union_name, phone, blood_group, status,
		 show_in_directory, show_phone, show_email, show_blood)
		VALUES ($1::uuid, $2, $3, $4, $5, $6, COALESCE($7, ''), COALESCE($8, ''),
			'pending', true, 'hidden', 'members', 'members')
		ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name, batch = EXCLUDED.batch,
			department = EXCLUDED.department, upazila = EXCLUDED.upazila, union_name = EXCLUDED.union_name,
			status = CASE WHEN profiles.status = 'rejected' THEN 'pending' ELSE profiles.status END`,
		id, p.Name, p.Batch, p.Department, p.Upazila, p.Union, p.Phone, p.BloodGroup)
	return err
}

func (s *pgStore) ListMembers(ctx context.Context, status string) ([]MemberRow, error) {
	rows, err := s.db.Query(ctx, `SELECT p.user_id::text, p.name, p.batch, p.department, p.upazila, p.union_name, p.phone, p.blood_group, p.status,
		p.show_in_directory, p.show_phone, p.show_email, p.show_blood, to_char(p.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		u.email, u.email_verified_at IS NOT NULL
		FROM profiles p JOIN users u ON u.id = p.user_id
		WHERE ($1 = '' OR p.status = $1) ORDER BY p.created_at`, status)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []MemberRow{}
	for rows.Next() {
		var m MemberRow
		if err := rows.Scan(&m.UserID, &m.Name, &m.Batch, &m.Department, &m.Upazila, &m.Union, &m.Phone, &m.BloodGroup, &m.Status,
			&m.ShowInDirectory, &m.ShowPhone, &m.ShowEmail, &m.ShowBlood, &m.CreatedAt, &m.Email, &m.EmailVerified); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func (s *pgStore) ReviewProfile(ctx context.Context, id, status string) error {
	tag, err := s.db.Exec(ctx, `UPDATE profiles SET status = $2, reviewed_at = now() WHERE user_id = $1::uuid`, id, status)
	if err == nil && tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return err
}

func (s *pgStore) ApprovedDirectory(ctx context.Context) ([]Student, error) {
	rows, err := s.db.Query(ctx, `SELECT user_id::text, name, batch, department, upazila FROM profiles
		WHERE status = 'approved' AND show_in_directory ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Student{}
	for rows.Next() {
		var st Student
		var b int
		var id string
		if err := rows.Scan(&id, &st.Name, &b, &st.Department, &st.Upazila); err != nil {
			return nil, err
		}
		st.ID, st.Batch = "m-"+id, &b
		out = append(out, st)
	}
	return out, rows.Err()
}

var uuidRx = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

const adminLockKey = 727275 // serialises role changes so two admins cannot demote each other at the same time

func (s *pgStore) ListUsers(ctx context.Context, q, role string, limit, offset int) ([]UserRow, int, error) {
	const where = `FROM users u LEFT JOIN profiles p ON p.user_id = u.id
		WHERE ($1 = '' OR position(lower($1) in lower(u.email)) > 0 OR position(lower($1) in lower(COALESCE(p.name, ''))) > 0)
		  AND ($2 = '' OR u.role = $2)`
	var total int
	if err := s.db.QueryRow(ctx, `SELECT count(*) `+where, q, role).Scan(&total); err != nil {
		return nil, 0, err
	}
	rows, err := s.db.Query(ctx, `SELECT u.id::text, u.email, COALESCE(p.name, ''), u.role, u.email_verified_at IS NOT NULL,
		COALESCE(p.status, ''), to_char(u.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') `+where+`
		ORDER BY u.created_at DESC, u.email LIMIT $3 OFFSET $4`, q, role, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := []UserRow{}
	for rows.Next() {
		var r UserRow
		if err := rows.Scan(&r.ID, &r.Email, &r.Name, &r.Role, &r.EmailVerified, &r.MemberStatus, &r.CreatedAt); err != nil {
			return nil, 0, err
		}
		out = append(out, r)
	}
	return out, total, rows.Err()
}

func (s *pgStore) SetRole(ctx context.Context, actorID, targetID, role string) (User, error) {
	if role != RoleMember && role != RoleAdmin {
		return User{}, ErrInvalidRole
	}
	if !uuidRx.MatchString(targetID) || !uuidRx.MatchString(actorID) {
		return User{}, ErrNotFound
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return User{}, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock($1)`, adminLockKey); err != nil {
		return User{}, err
	}
	t, err := scanUser(tx.QueryRow(ctx, `SELECT `+userCols+` FROM users WHERE id = $1::uuid FOR UPDATE`, targetID))
	if err != nil {
		return User{}, err
	}
	if t.Role == role {
		return t, nil
	}
	if role == RoleAdmin && !t.EmailVerified {
		return User{}, ErrTargetUnverified
	}
	if role == RoleMember {
		var others int
		if err := tx.QueryRow(ctx, `SELECT count(*) FROM users WHERE role = 'admin' AND email_verified_at IS NOT NULL AND id <> $1::uuid`, targetID).Scan(&others); err != nil {
			return User{}, err
		}
		if others < 1 {
			return User{}, ErrLastAdmin
		}
	}
	a, err := scanUser(tx.QueryRow(ctx, `SELECT `+userCols+` FROM users WHERE id = $1::uuid`, actorID))
	if err != nil || a.Role != RoleAdmin || !a.EmailVerified {
		return User{}, ErrForbidden
	}
	if _, err := tx.Exec(ctx, `UPDATE users SET role = $2, updated_at = now() WHERE id = $1::uuid`, targetID, role); err != nil {
		if isLastAdminTrigger(err) {
			return User{}, ErrLastAdmin
		}
		return User{}, err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO role_changes (target_id, actor_id, old_role, new_role, source) VALUES ($1::uuid, $2::uuid, $3, $4, 'admin_ui')`,
		targetID, actorID, t.Role, role); err != nil {
		return User{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return User{}, err
	}
	t.Role = role
	return t, nil
}

func isLastAdminTrigger(err error) bool {
	var pe *pgconn.PgError
	return errors.As(err, &pe) && pe.Code == "P0001" && strings.Contains(pe.Message, "last active admin")
}

// PromoteVerifiedByEmail reads the account from Supabase Auth (auth.users), so "verified" means the email was
// confirmed there, and never trusts anything a client sent. Idempotent; it only ever adds an admin.
func (s *pgStore) PromoteVerifiedByEmail(ctx context.Context, email string, apply bool) (User, bool, error) {
	email = normEmail(email)
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return User{}, false, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock($1)`, adminLockKey); err != nil {
		return User{}, false, err
	}
	var id string
	var confirmed time.Time
	err = tx.QueryRow(ctx, `SELECT id::text, email_confirmed_at FROM auth.users
		WHERE lower(email) = $1 AND email_confirmed_at IS NOT NULL AND deleted_at IS NULL
		  AND (banned_until IS NULL OR banned_until < now()) LIMIT 1`, email).Scan(&id, &confirmed)
	if errors.Is(err, pgx.ErrNoRows) {
		var exists bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = $1)`, email).Scan(&exists); err != nil {
			return User{}, false, err
		}
		if exists {
			return User{}, false, ErrTargetUnverified
		}
		return User{}, false, ErrNotFound
	}
	if err != nil {
		return User{}, false, err
	}
	var cur string
	err = tx.QueryRow(ctx, `SELECT role FROM users WHERE id = $1::uuid`, id).Scan(&cur)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return User{}, false, err
	}
	if cur == RoleAdmin {
		return User{ID: id, Email: email, Role: RoleAdmin, EmailVerified: true}, false, nil
	}
	if !apply {
		return User{ID: id, Email: email, Role: RoleMember, EmailVerified: true}, true, nil
	}
	old := cur
	if old == "" {
		old = RoleMember
	}
	if _, err := tx.Exec(ctx, `INSERT INTO users (id, email, password_hash, role, email_verified_at)
		VALUES ($1::uuid, $2, '', 'admin', $3)
		ON CONFLICT (id) DO UPDATE SET role = 'admin', email = EXCLUDED.email,
			email_verified_at = COALESCE(users.email_verified_at, EXCLUDED.email_verified_at), updated_at = now()`, id, email, confirmed); err != nil {
		return User{}, false, err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO role_changes (target_id, actor_id, old_role, new_role, source) VALUES ($1::uuid, NULL, $2, 'admin', 'bootstrap')`, id, old); err != nil {
		return User{}, false, err
	}
	if err := tx.Commit(ctx); err != nil {
		return User{}, false, err
	}
	return User{ID: id, Email: email, Role: RoleAdmin, EmailVerified: true}, true, nil
}

func (s *pgStore) Counts(ctx context.Context) (map[string]int, error) {
	rows, err := s.db.Query(ctx, `SELECT status, count(*) FROM profiles GROUP BY status`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	c := map[string]int{StatusPending: 0, StatusApproved: 0, StatusRejected: 0}
	for rows.Next() {
		var k string
		var n int
		if err := rows.Scan(&k, &n); err != nil {
			return nil, err
		}
		c[k] = n
	}
	return c, rows.Err()
}
