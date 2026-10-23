-- A short introduction shown above a committee on the public page. Additive only.
ALTER TABLE committees ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 1000);
