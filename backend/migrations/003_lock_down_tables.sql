-- Supabase exposes every table in the public schema through its REST API using the public
-- (publishable) key. Only this Go service should read or write these tables, and it connects
-- with a role that bypasses row level security. Enabling RLS with no policies blocks the
-- public REST API completely, so password hashes, phone numbers and content stay private.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_documents ENABLE ROW LEVEL SECURITY;

-- The student and alumni lists are served by the API with pagination; they must not be
-- downloadable in one request straight from the database REST endpoint.
DROP POLICY IF EXISTS content_documents_public_read ON content_documents;
