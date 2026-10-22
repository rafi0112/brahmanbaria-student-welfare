-- Contact inbox: messages sent through the public Contact form, kept for a fixed 30 days, plus the replies admins send.
-- Additive only. Nothing existing is dropped, truncated or rewritten.

CREATE TABLE IF NOT EXISTS contact_messages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  email         text NOT NULL CHECK (char_length(email) BETWEEN 3 AND 120),
  subject       text NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 120),
  message       text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 2000),
  status        text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read', 'replied', 'archived')),
  -- whether the notification email to the configured mailbox went out: pending, sent, failed, or skipped (no recipient configured)
  notify_status text NOT NULL DEFAULT 'pending' CHECK (notify_status IN ('pending', 'sent', 'failed', 'skipped')),
  notified_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- fixed at submission: reading, replying or archiving never extends the 30-day retention
  expires_at    timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  read_at       timestamptz,
  replied_at    timestamptz
);
CREATE INDEX IF NOT EXISTS contact_messages_expires_idx ON contact_messages (expires_at);
CREATE INDEX IF NOT EXISTS contact_messages_list_idx ON contact_messages (status, created_at DESC);

-- Replies live and die with their message (ON DELETE CASCADE), so the purge removes them too.
CREATE TABLE IF NOT EXISTS contact_replies (
  id          bigserial PRIMARY KEY,
  message_id  uuid NOT NULL REFERENCES contact_messages (id) ON DELETE CASCADE,
  sent_by     uuid REFERENCES users (id) ON DELETE SET NULL,
  body        text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 5000),
  status      text NOT NULL CHECK (status IN ('sent', 'failed')),
  error_note  text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contact_replies_message_idx ON contact_replies (message_id, created_at);

-- Private: only the Go API (which bypasses RLS) may read these tables. With RLS on and no policies the public REST API sees nothing.
ALTER TABLE contact_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_replies ENABLE ROW LEVEL SECURITY;
