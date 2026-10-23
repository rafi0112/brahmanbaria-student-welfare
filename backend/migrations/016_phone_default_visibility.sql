-- A new member's phone number is visible to approved members by default (it was hidden). Only the column default changes:
-- existing rows keep whatever their owners have, so nobody is exposed retroactively. Additive only.
ALTER TABLE profiles ALTER COLUMN show_phone SET DEFAULT 'members';
