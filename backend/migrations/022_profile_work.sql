-- What a graduate does now: the profession and the current workplace. Asked at registration from people whose batch
-- already counts as alumni, and shown on the Alumni page. Additive only: two new columns, no existing row changes.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS occupation text NOT NULL DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS workplace text NOT NULL DEFAULT '';
