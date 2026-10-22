-- Executive committee management. Additive only: no existing table is altered, nothing is dropped or rewritten.
-- A committee is a term (draft -> published -> archived). Executives are assignments inside a committee; they may
-- link to a registered member (users.id) or stand alone for people who have no account. Removing an assignment only
-- sets removed_at, so accounts, profiles and history are never touched.

CREATE TABLE IF NOT EXISTS committees (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 100),
  term         text NOT NULL DEFAULT '' CHECK (char_length(term) <= 80),
  starts_on    date,
  ends_on      date,
  status       text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  published_at timestamptz,
  archived_at  timestamptz,
  created_by   uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_by   uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT committees_dates_ordered CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on)
);

-- At most one published panel at any time.
CREATE UNIQUE INDEX IF NOT EXISTS committees_one_published ON committees ((true)) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS committees_status_idx ON committees (status, created_at DESC);

CREATE TABLE IF NOT EXISTS executives (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  committee_id  uuid NOT NULL REFERENCES committees (id) ON DELETE RESTRICT,
  user_id       uuid REFERENCES users (id) ON DELETE SET NULL,
  name          text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
  designation   text NOT NULL CHECK (char_length(designation) BETWEEN 2 AND 80),
  bio           text NOT NULL DEFAULT '' CHECK (char_length(bio) <= 500),
  -- object name inside the Supabase Storage bucket "executive-photos"; never image bytes
  photo_path    text NOT NULL DEFAULT '' CHECK (photo_path = '' OR photo_path ~ '^[0-9a-f-]{36}\.(jpg|png)$'),
  display_order integer NOT NULL DEFAULT 0,
  removed_at    timestamptz,
  created_by    uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_by    uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- A member can hold one active seat per committee.
CREATE UNIQUE INDEX IF NOT EXISTS executives_one_active_seat ON executives (committee_id, user_id)
  WHERE user_id IS NOT NULL AND removed_at IS NULL;
CREATE INDEX IF NOT EXISTS executives_panel_idx ON executives (committee_id, display_order) WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS executives_user_idx ON executives (user_id) WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS committee_audit (
  id           bigserial PRIMARY KEY,
  committee_id uuid,
  executive_id uuid,
  actor_id     uuid,
  action       text NOT NULL,
  detail       jsonb NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS committee_audit_committee_idx ON committee_audit (committee_id, created_at);

-- Private like every other table: only the Go service (which bypasses RLS) can read or write them.
ALTER TABLE committees ENABLE ROW LEVEL SECURITY;
ALTER TABLE executives ENABLE ROW LEVEL SECURITY;
ALTER TABLE committee_audit ENABLE ROW LEVEL SECURITY;
