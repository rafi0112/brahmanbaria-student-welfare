-- Every record of the original student and alumni directory (from the Google Form exports and batch PDFs), kept in the
-- database so the files are no longer the source. Public columns are what the site shows; "private" holds the contact
-- columns (phone, email, blood group, addresses, Facebook, photo link, note) for admins only; "sources" keeps every original
-- form row the record was built from. Additive only: nothing else is changed.
CREATE TABLE IF NOT EXISTS directory_records (
  id           text PRIMARY KEY,
  kind         text NOT NULL CHECK (kind IN ('student', 'alumni')),
  name         text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  batch        int CHECK (batch IS NULL OR batch BETWEEN 1 AND 60),
  department   text NOT NULL DEFAULT '',
  session      text NOT NULL DEFAULT '',
  upazila      text NOT NULL DEFAULT '',
  occupation   text NOT NULL DEFAULT '',
  workplace    text NOT NULL DEFAULT '',
  designation  text NOT NULL DEFAULT '',
  private      jsonb NOT NULL DEFAULT '{}'::jsonb,
  sources      jsonb NOT NULL DEFAULT '[]'::jsonb,
  imported_at  timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS directory_records_kind_idx ON directory_records (kind, name);
-- No policies: the browser's Supabase key cannot read this table; only the server's database connection can.
ALTER TABLE directory_records ENABLE ROW LEVEL SECURITY;
