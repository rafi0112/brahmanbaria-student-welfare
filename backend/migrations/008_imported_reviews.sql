-- Admin review of the imported directory. Imported records come from the bundled directory files, not from accounts, so their
-- verification lives here, keyed by the imported record's id. Additive only.
--
-- "verified" means an admin confirmed that this directory entry is a real person. It says nothing about an email address:
-- email confirmation stays with Supabase Auth. linked_user_id optionally ties the entry to the registered account of the same person.
CREATE TABLE IF NOT EXISTS imported_reviews (
  imported_id    text PRIMARY KEY CHECK (char_length(imported_id) BETWEEN 1 AND 64),
  verified_by    uuid REFERENCES users (id) ON DELETE SET NULL,
  verified_at    timestamptz NOT NULL DEFAULT now(),
  -- one account can be linked to at most one imported entry, so a person cannot appear twice
  linked_user_id uuid UNIQUE REFERENCES users (id) ON DELETE SET NULL
);

ALTER TABLE imported_reviews ENABLE ROW LEVEL SECURITY;
