-- Member profile fields collected at registration, and the trail of the membership decision. Additive only.
--   session  : academic session such as 2020-21 (required at registration; existing profiles stay empty until someone fills it in)
--   gender   : optional and explicitly provided by the member or an authorised editor; never inferred. '' means unspecified.
--   reviewed_by / review_note : who made the latest membership decision and, for a rejection, why. reviewed_at already exists.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS session text NOT NULL DEFAULT '' CHECK (char_length(session) <= 20);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gender text NOT NULL DEFAULT '' CHECK (gender IN ('', 'female', 'male', 'other'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES users (id) ON DELETE SET NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS review_note text NOT NULL DEFAULT '' CHECK (char_length(review_note) <= 300);
