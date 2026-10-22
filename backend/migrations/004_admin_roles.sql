-- Database-backed roles. Additive only: no data is dropped, truncated or rewritten.
-- Existing rows already satisfy the new constraint (there are no admins yet, and the check only constrains admins).

-- An admin must have a confirmed email address.
ALTER TABLE users ADD CONSTRAINT users_admin_requires_verified_email
  CHECK (role <> 'admin' OR email_verified_at IS NOT NULL);

CREATE INDEX IF NOT EXISTS users_role_idx ON users (role);

-- The last active (verified) admin can never be demoted, unverified or deleted, not even by hand-written SQL.
CREATE OR REPLACE FUNCTION prevent_last_admin_loss() RETURNS trigger AS $$
BEGIN
  IF OLD.role = 'admin' AND (TG_OP = 'DELETE' OR NEW.role <> 'admin' OR NEW.email_verified_at IS NULL) THEN
    IF NOT EXISTS (SELECT 1 FROM users WHERE role = 'admin' AND email_verified_at IS NOT NULL AND id <> OLD.id) THEN
      RAISE EXCEPTION 'cannot remove the last active admin' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_keep_one_admin ON users;
CREATE TRIGGER users_keep_one_admin BEFORE UPDATE OR DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION prevent_last_admin_loss();

-- Who changed whose role, and when.
CREATE TABLE IF NOT EXISTS role_changes (
  id          bigserial PRIMARY KEY,
  target_id   uuid NOT NULL,
  actor_id    uuid,
  old_role    text NOT NULL,
  new_role    text NOT NULL,
  source      text NOT NULL DEFAULT 'admin_ui' CHECK (source IN ('admin_ui', 'bootstrap')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS role_changes_target_idx ON role_changes (target_id, created_at);
-- Private like every other table: only the Go service (which bypasses RLS) can read it.
ALTER TABLE role_changes ENABLE ROW LEVEL SECURITY;
