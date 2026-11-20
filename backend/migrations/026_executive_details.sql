-- A committee seat's identity details and message, shown in the member's pop-up on the Committee page:
-- {"department", "batch", "session", "upazila", "message"}. Empty fields fall back to the linked member's profile.
-- Additive only.
ALTER TABLE executives ADD COLUMN IF NOT EXISTS details jsonb NOT NULL DEFAULT '{}'::jsonb;
