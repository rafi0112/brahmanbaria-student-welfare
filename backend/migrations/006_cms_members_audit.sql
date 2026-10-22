-- Admin content management, account status and a general audit trail. Additive only: nothing is dropped,
-- truncated or rewritten, and no existing column changes meaning.

-- A deactivated account can no longer use the API, but is never deleted (its profile and history stay linked).
ALTER TABLE users ADD COLUMN IF NOT EXISTS disabled_at timestamptz;

-- Blog posts, heritage places, gallery albums and gallery images share one editorial table:
-- common workflow columns are real columns (status, slug, order, publication time, authorship),
-- type-specific fields live in `data` (the same JSON-document approach as content_documents).
-- Gallery images point at their album with a real foreign key.
CREATE TABLE IF NOT EXISTS cms_entries (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind         text NOT NULL CHECK (kind IN ('blog', 'place', 'album', 'image')),
  slug         text CHECK (slug IS NULL OR slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title        text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  status       text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  featured     boolean NOT NULL DEFAULT false,
  sort_order   integer NOT NULL DEFAULT 0,
  parent_id    uuid REFERENCES cms_entries (id) ON DELETE SET NULL,
  data         jsonb NOT NULL DEFAULT '{}',
  published_at timestamptz,
  created_by   uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_by   uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS cms_entries_slug_idx ON cms_entries (kind, slug) WHERE slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS cms_entries_list_idx ON cms_entries (kind, status, sort_order, created_at DESC);
CREATE INDEX IF NOT EXISTS cms_entries_parent_idx ON cms_entries (parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS cms_entries_updated_idx ON cms_entries (updated_at DESC);

-- Who did what, for everything admins change that is not already covered by role_changes / committee_audit.
CREATE TABLE IF NOT EXISTS admin_audit (
  id         bigserial PRIMARY KEY,
  actor_id   uuid REFERENCES users (id) ON DELETE SET NULL,
  action     text NOT NULL,
  entity     text NOT NULL,
  entity_id  text NOT NULL DEFAULT '',
  detail     jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_audit_time_idx ON admin_audit (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_action_idx ON admin_audit (action);

-- Private like every other table: only the Go service (which bypasses RLS) reads or writes them,
-- and it returns published rows only on public routes.
ALTER TABLE cms_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_audit ENABLE ROW LEVEL SECURITY;
