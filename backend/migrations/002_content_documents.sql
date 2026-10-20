-- Canonical application content. JSON is retained as a migration seed only;
-- runtime reads come from this PostgreSQL repository.
CREATE TABLE IF NOT EXISTS content_documents (
  kind text PRIMARY KEY,
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE content_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS content_documents_public_read ON content_documents;
CREATE POLICY content_documents_public_read ON content_documents
  FOR SELECT USING (true);
