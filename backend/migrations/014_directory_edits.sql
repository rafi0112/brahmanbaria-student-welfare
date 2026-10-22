-- Admins can complete missing details of the bundled directory records (which are read-only files) and mark a saved email as
-- confirmed by them when they verify the record. Additive only.
CREATE TABLE IF NOT EXISTS imported_edits (
  imported_id text PRIMARY KEY CHECK (char_length(imported_id) BETWEEN 1 AND 64),
  name        text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
  batch       integer CHECK (batch IS NULL OR batch BETWEEN 1 AND 99),
  department  text NOT NULL DEFAULT '' CHECK (char_length(department) <= 120),
  session     text NOT NULL DEFAULT '' CHECK (char_length(session) <= 20),
  upazila     text NOT NULL DEFAULT '' CHECK (char_length(upazila) <= 60),
  updated_by  uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE imported_edits ENABLE ROW LEVEL SECURITY;
ALTER TABLE directory_invites ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;
