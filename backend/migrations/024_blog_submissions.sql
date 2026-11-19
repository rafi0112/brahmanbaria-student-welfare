-- Writing that signed-in members send for the blog: a title, the text and up to six pictures. Admins read them in the
-- panel and may turn one into a blog draft. Pictures are kept here (re-encoded JPEGs, at most about 1 MB each) so members
-- need no storage rights. Additive only.
CREATE TABLE IF NOT EXISTS blog_submissions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES users (id) ON DELETE SET NULL,
  author_name text NOT NULL CHECK (char_length(author_name) BETWEEN 1 AND 120),
  email       text NOT NULL DEFAULT '',
  title       text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 160),
  body        text NOT NULL CHECK (char_length(body) BETWEEN 20 AND 20000),
  status      text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read', 'accepted', 'declined')),
  post_id     uuid,           -- the blog draft made from it, if any
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS blog_submissions_list_idx ON blog_submissions (status, created_at DESC);
CREATE INDEX IF NOT EXISTS blog_submissions_user_idx ON blog_submissions (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS blog_submission_photos (
  submission_id uuid NOT NULL REFERENCES blog_submissions (id) ON DELETE CASCADE,
  idx           smallint NOT NULL CHECK (idx BETWEEN 0 AND 5),
  content_type  text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png')),
  data          bytea NOT NULL CHECK (octet_length(data) <= 2097152),
  PRIMARY KEY (submission_id, idx)
);

-- Private: only the Go API (which bypasses RLS) may read these tables.
ALTER TABLE blog_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_submission_photos ENABLE ROW LEVEL SECURITY;
