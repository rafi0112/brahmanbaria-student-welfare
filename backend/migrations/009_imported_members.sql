-- Directory records added by hand from the admin panel. They are directory entries, not accounts: no row in users is created,
-- and no email is confirmed. The bundled directory files stay read-only; this table holds only what admins add. Additive only.
CREATE TABLE IF NOT EXISTS imported_members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
  batch       integer CHECK (batch IS NULL OR batch BETWEEN 1 AND 99),
  department  text NOT NULL DEFAULT '' CHECK (char_length(department) <= 120),
  session     text NOT NULL DEFAULT '' CHECK (char_length(session) <= 20),
  upazila     text NOT NULL DEFAULT '' CHECK (char_length(upazila) <= 60),
  phone       text NOT NULL DEFAULT '' CHECK (phone = '' OR phone ~ '^01[0-9]{9}$'),
  note        text NOT NULL DEFAULT '' CHECK (char_length(note) <= 300),
  created_by  uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS imported_members_name_idx ON imported_members (lower(name));

ALTER TABLE imported_members ENABLE ROW LEVEL SECURITY;
