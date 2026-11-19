-- A member's writing can be approved and published in one step: its state is then 'published'. Additive only.
ALTER TABLE blog_submissions DROP CONSTRAINT IF EXISTS blog_submissions_status_check;
ALTER TABLE blog_submissions ADD CONSTRAINT blog_submissions_status_check CHECK (status IN ('new', 'read', 'accepted', 'published', 'declined'));
