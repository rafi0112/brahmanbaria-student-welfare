-- Site-wide settings that admins change from the panel, one row per key. The first one: up to which batch students
-- count as alumni (batches at or below it appear on the Alumni page instead of Students). Additive only.
CREATE TABLE IF NOT EXISTS site_settings (
  key         text PRIMARY KEY CHECK (key ~ '^[a-z][a-z0-9_.]{1,60}$'),
  value       jsonb NOT NULL,
  updated_by  uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
-- No policies: the browser's Supabase key cannot read or change settings; only the server's database connection can.
ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;
