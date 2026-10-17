-- Accounts, member profiles, sessions and one-time email tokens.
CREATE TABLE users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email          text NOT NULL UNIQUE,
  password_hash  text NOT NULL,
  role           text NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
  email_verified_at timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE profiles (
  user_id          uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  name             text NOT NULL,
  batch            integer NOT NULL CHECK (batch BETWEEN 1 AND 60),
  department       text NOT NULL,
  upazila          text NOT NULL,
  union_name       text NOT NULL,
  phone            text NOT NULL DEFAULT '',
  blood_group      text NOT NULL DEFAULT '',
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  show_in_directory boolean NOT NULL DEFAULT true,
  show_phone       text NOT NULL DEFAULT 'hidden'  CHECK (show_phone IN ('public', 'members', 'hidden')),
  show_email       text NOT NULL DEFAULT 'members' CHECK (show_email IN ('public', 'members', 'hidden')),
  show_blood       text NOT NULL DEFAULT 'members' CHECK (show_blood IN ('public', 'members', 'hidden')),
  reviewed_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX profiles_status_idx ON profiles (status, created_at);

CREATE TABLE sessions (
  token_hash  text PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

CREATE TABLE email_tokens (
  token_hash  text PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose     text NOT NULL CHECK (purpose IN ('verify', 'reset')),
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX email_tokens_user_idx ON email_tokens (user_id, purpose);
