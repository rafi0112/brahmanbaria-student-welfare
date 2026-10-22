-- Supabase Storage for executive committee photos. Idempotent and additive: it never drops, truncates or deletes
-- anything. Run it once, either with `go run . storage-setup` or by pasting it into Supabase > SQL Editor.
--
-- Result:
--   * bucket "executive-photos": public read (so photos show on the public site), 5 MB limit, JPEG/PNG only
--   * only signed-in verified admins may upload (the API forwards the admin's own token; no service key anywhere)
--   * no UPDATE or DELETE policy, so nobody can overwrite or delete a photo through the API

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('executive-photos', 'executive-photos', true, 5242880, ARRAY['image/jpeg', 'image/png'])
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

-- SECURITY DEFINER so the check can read public.users, which is private (row level security without policies).
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin' AND u.email_verified_at IS NOT NULL)
$$;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

DROP POLICY IF EXISTS "executive photos: admins upload" ON storage.objects;
CREATE POLICY "executive photos: admins upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'executive-photos' AND public.is_admin());
