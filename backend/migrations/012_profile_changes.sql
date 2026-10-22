-- A member whose membership is already approved cannot edit their academic details directly. They submit a change request instead;
-- it waits here until an admin approves it (the details are then applied) or rejects it (nothing changes). The member stays approved
-- and verified the whole time. One open request per member. Additive only.
CREATE TABLE IF NOT EXISTS profile_changes (
  user_id      uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  name         text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
  batch        integer NOT NULL CHECK (batch BETWEEN 1 AND 60),
  department   text NOT NULL,
  session      text NOT NULL CHECK (char_length(session) <= 20),
  upazila      text NOT NULL,
  union_name   text NOT NULL,
  gender       text NOT NULL DEFAULT '' CHECK (gender IN ('', 'female', 'male', 'other')),
  submitted_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE profile_changes ENABLE ROW LEVEL SECURITY;
