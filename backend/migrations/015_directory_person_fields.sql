-- Directory records carry the same person details as a member profile: union, gender and blood group (and, for edited bundled
-- records, a phone number). Additive only.
ALTER TABLE imported_members ADD COLUMN IF NOT EXISTS union_name  text NOT NULL DEFAULT '' CHECK (char_length(union_name) <= 60);
ALTER TABLE imported_members ADD COLUMN IF NOT EXISTS gender      text NOT NULL DEFAULT '' CHECK (gender IN ('', 'female', 'male', 'other'));
ALTER TABLE imported_members ADD COLUMN IF NOT EXISTS blood_group text NOT NULL DEFAULT '' CHECK (blood_group = '' OR blood_group ~ '^(A|B|AB|O)[+-]$');
ALTER TABLE imported_edits   ADD COLUMN IF NOT EXISTS union_name  text NOT NULL DEFAULT '' CHECK (char_length(union_name) <= 60);
ALTER TABLE imported_edits   ADD COLUMN IF NOT EXISTS gender      text NOT NULL DEFAULT '' CHECK (gender IN ('', 'female', 'male', 'other'));
ALTER TABLE imported_edits   ADD COLUMN IF NOT EXISTS blood_group text NOT NULL DEFAULT '' CHECK (blood_group = '' OR blood_group ~ '^(A|B|AB|O)[+-]$');
ALTER TABLE imported_edits   ADD COLUMN IF NOT EXISTS phone       text NOT NULL DEFAULT '' CHECK (phone = '' OR phone ~ '^01[0-9]{9}$');
