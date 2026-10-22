-- Activation invitations for people in the member directory. The directory records themselves are not changed; this table holds
-- the email address an admin saved for a record and the real outcome of inviting it. Additive only.
--
-- status: saved (an address is stored, nothing sent) | sent (Supabase Auth accepted the invitation request: this is NOT proof of
-- delivery) | failed (Supabase refused or errored) | completed (the person activated the account and submitted their profile).
-- "expired" is not stored: it is derived from last_sent_at and the configured link lifetime.
CREATE TABLE IF NOT EXISTS directory_invites (
  imported_id    text PRIMARY KEY CHECK (char_length(imported_id) BETWEEN 1 AND 64),
  email          text NOT NULL CHECK (char_length(email) BETWEEN 3 AND 120),
  status         text NOT NULL DEFAULT 'saved' CHECK (status IN ('saved', 'sent', 'failed', 'completed')),
  auth_user_id   text NOT NULL DEFAULT '',
  invited_by     uuid REFERENCES users (id) ON DELETE SET NULL,
  last_sent_at   timestamptz,
  send_count     integer NOT NULL DEFAULT 0,
  last_error     text NOT NULL DEFAULT '' CHECK (char_length(last_error) <= 200),
  completed_user uuid REFERENCES users (id) ON DELETE SET NULL,
  completed_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
-- one address belongs to one directory record, so a person cannot be invited twice under two records
CREATE UNIQUE INDEX IF NOT EXISTS directory_invites_email_idx ON directory_invites (lower(email));

-- Every attempt that reached the provider, used for the hourly and daily limits. No addresses or tokens are stored here.
CREATE TABLE IF NOT EXISTS invite_log (
  id          bigserial PRIMARY KEY,
  imported_id text NOT NULL,
  outcome     text NOT NULL CHECK (outcome IN ('sent', 'failed')),
  at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invite_log_at_idx ON invite_log (at);

ALTER TABLE directory_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE invite_log ENABLE ROW LEVEL SECURITY;
