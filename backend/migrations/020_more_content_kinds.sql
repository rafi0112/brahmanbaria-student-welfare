-- Events, FAQ questions, departments and upazilas become editorial entries too, so every piece of site data lives in the
-- database and admins edit it from the panel. Only the allowed kinds of the existing table widen; no row changes.
ALTER TABLE cms_entries DROP CONSTRAINT IF EXISTS cms_entries_kind_check;
ALTER TABLE cms_entries ADD CONSTRAINT cms_entries_kind_check CHECK (kind IN ('blog', 'place', 'album', 'image', 'event', 'faq', 'department', 'upazila'));
