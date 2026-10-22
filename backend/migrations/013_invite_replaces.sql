-- A verified person can move to a new email address: the admin saves the new address on the same directory record and invites it.
-- The member's earlier account is remembered here until the new account's membership request is approved, at which point the
-- earlier account is deactivated (never deleted). Additive only.
ALTER TABLE directory_invites ADD COLUMN IF NOT EXISTS replaces_user uuid REFERENCES users (id) ON DELETE SET NULL;
