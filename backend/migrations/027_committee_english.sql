-- A committee's name, term and introduction in English too (the existing columns hold the main, usually Bangla, text;
-- an empty English one shows the main one). Seats keep their English designation, introduction and message in
-- executives.details. Additive only.
ALTER TABLE committees ADD COLUMN IF NOT EXISTS name_en text NOT NULL DEFAULT '';
ALTER TABLE committees ADD COLUMN IF NOT EXISTS term_en text NOT NULL DEFAULT '';
ALTER TABLE committees ADD COLUMN IF NOT EXISTS description_en text NOT NULL DEFAULT '';
