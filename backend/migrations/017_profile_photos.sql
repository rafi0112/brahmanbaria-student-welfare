-- Profile photos, uploaded by the member or by an admin. Stored as a re-encoded square JPEG (at most 1 MB) and served only
-- through the API, which applies the same viewer rules as other personal details. Additive only.
CREATE TABLE IF NOT EXISTS profile_photos (
  user_id      uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  data         bytea NOT NULL CHECK (octet_length(data) BETWEEN 1 AND 1048576),
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png')),
  updated_at   timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE profile_photos ENABLE ROW LEVEL SECURITY;
