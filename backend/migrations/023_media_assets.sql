-- A shared registry of stored pictures, so one picture is one Storage file however many places use it. Additive only:
-- nothing is dropped, truncated or rewritten, and existing content keeps working without any change.
--
--   media_assets   one row per stored picture: its SHA-256 (unique), the Storage path (unique), type, size, pixels, status
--   content_media  which piece of content shows which picture (many places can show one picture)
--
-- The tables are private (row level security, no policies). Admins reach them only through the SECURITY DEFINER functions
-- below, which check public.is_admin() (storage/executive_photos.sql) and validate every argument.

CREATE TABLE IF NOT EXISTS media_assets (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sha256             text NOT NULL UNIQUE CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  storage_path       text NOT NULL UNIQUE,
  bucket             text NOT NULL DEFAULT 'site-media',
  mime_type          text NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png')),
  file_size          integer NOT NULL CHECK (file_size > 0 AND file_size <= 5242880),
  width              integer NOT NULL CHECK (width BETWEEN 1 AND 12000),
  height             integer NOT NULL CHECK (height BETWEEN 1 AND 12000),
  status             text NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading', 'ready', 'failed')),
  created_by         uuid,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  unreferenced_since timestamptz DEFAULT now() -- set whenever the last reference goes away; the cleanup grace period counts from here
);
CREATE INDEX IF NOT EXISTS media_assets_orphans_idx ON media_assets (unreferenced_since) WHERE unreferenced_since IS NOT NULL;

CREATE TABLE IF NOT EXISTS content_media (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id      uuid NOT NULL REFERENCES media_assets(id) ON DELETE RESTRICT,
  content_type  text NOT NULL CHECK (content_type <> ''),
  content_id    text NOT NULL CHECK (content_id <> ''),
  display_order integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id, content_type, content_id)
);
CREATE INDEX IF NOT EXISTS content_media_content_idx ON content_media (content_type, content_id);

ALTER TABLE media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_media ENABLE ROW LEVEL SECURITY;

-- keeps unreferenced_since honest: cleared when a reference appears (a restore during the grace period), set when the last one goes
CREATE OR REPLACE FUNCTION public.media_ref_changed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE media_assets SET unreferenced_since = NULL WHERE id = NEW.asset_id;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM content_media WHERE asset_id = OLD.asset_id) THEN
      UPDATE media_assets SET unreferenced_since = now() WHERE id = OLD.asset_id;
    END IF;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS content_media_changed ON content_media;
CREATE TRIGGER content_media_changed AFTER INSERT OR DELETE ON content_media FOR EACH ROW EXECUTE FUNCTION public.media_ref_changed();

-- Atomically claims a picture. Returns { assetId, path, status, mustUpload }:
--   status 'ready'                        the picture is stored: use path, upload nothing
--   mustUpload true                       this caller must upload the file to `path` (new picture, an earlier attempt that
--                                         failed, or one that was abandoned for more than 2 minutes)
--   status 'uploading', mustUpload false  another admin is uploading the very same picture right now: wait and ask again
-- The unique SHA-256 makes two simultaneous callers get one row; the other waits on the index and then sees it.
CREATE OR REPLACE FUNCTION public.reserve_media_asset(p_sha256 text, p_mime text, p_size integer, p_width integer, p_height integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a media_assets;
  v_ext text;
  v_path text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501'; END IF;
  IF p_sha256 IS NULL OR p_sha256 !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'bad hash' USING ERRCODE = '22023'; END IF;
  IF p_mime = 'image/jpeg' THEN v_ext := '.jpg'; ELSIF p_mime = 'image/png' THEN v_ext := '.png'; ELSE RAISE EXCEPTION 'bad type' USING ERRCODE = '22023'; END IF;
  IF p_size IS NULL OR p_size < 1 OR p_size > 5242880 OR p_width NOT BETWEEN 1 AND 12000 OR p_height NOT BETWEEN 1 AND 12000 THEN
    RAISE EXCEPTION 'bad size' USING ERRCODE = '22023';
  END IF;
  -- the same file name shape the server gives (a UUID made of the first 128 bits of the hash), so uploads from either side agree
  v_path := substr(p_sha256, 1, 8) || '-' || substr(p_sha256, 9, 4) || '-' || substr(p_sha256, 13, 4) || '-' || substr(p_sha256, 17, 4) || '-' || substr(p_sha256, 21, 12) || v_ext;

  -- two tries: the row can vanish between the insert and the lock when the cleanup removes an unused picture at that moment
  FOR i IN 1..2 LOOP
    INSERT INTO media_assets (sha256, storage_path, mime_type, file_size, width, height, status, created_by)
    VALUES (p_sha256, v_path, p_mime, p_size, p_width, p_height, 'uploading', auth.uid())
    ON CONFLICT (sha256) DO NOTHING
    RETURNING * INTO a;
    IF FOUND THEN
      RETURN jsonb_build_object('assetId', a.id, 'path', a.storage_path, 'status', 'uploading', 'mustUpload', true);
    END IF;
    SELECT * INTO a FROM media_assets WHERE sha256 = p_sha256 FOR UPDATE;
    EXIT WHEN FOUND;
  END LOOP;
  IF a.id IS NULL THEN RAISE EXCEPTION 'try again' USING ERRCODE = '40001'; END IF;
  IF a.status = 'ready' THEN
    RETURN jsonb_build_object('assetId', a.id, 'path', a.storage_path, 'status', 'ready', 'mustUpload', false);
  END IF;
  IF a.status = 'failed' OR a.updated_at < now() - interval '2 minutes' THEN
    UPDATE media_assets SET status = 'uploading', updated_at = now(), created_by = auth.uid() WHERE id = a.id;
    RETURN jsonb_build_object('assetId', a.id, 'path', a.storage_path, 'status', 'uploading', 'mustUpload', true);
  END IF;
  RETURN jsonb_build_object('assetId', a.id, 'path', a.storage_path, 'status', 'uploading', 'mustUpload', false);
END $$;

-- Marks an upload finished. 'ready' only when Storage really holds the object (and, when Storage reports it, with the size
-- the caller declared); otherwise 'failed', so the next caller uploads again. It never deletes anything.
CREATE OR REPLACE FUNCTION public.finish_media_asset(p_asset uuid, p_ok boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a media_assets;
  o_size bigint;
  found boolean;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501'; END IF;
  SELECT * INTO a FROM media_assets WHERE id = p_asset FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown asset' USING ERRCODE = '22023'; END IF;
  IF a.status = 'ready' THEN
    RETURN jsonb_build_object('assetId', a.id, 'path', a.storage_path, 'status', 'ready');
  END IF;
  IF p_ok THEN
    SELECT true, nullif(o.metadata ->> 'size', '')::bigint INTO found, o_size
      FROM storage.objects o WHERE o.bucket_id = a.bucket AND o.name = a.storage_path;
  END IF;
  IF p_ok AND found IS TRUE AND (o_size IS NULL OR o_size = a.file_size) THEN
    UPDATE media_assets SET status = 'ready', updated_at = now() WHERE id = a.id;
    RETURN jsonb_build_object('assetId', a.id, 'path', a.storage_path, 'status', 'ready');
  END IF;
  UPDATE media_assets SET status = 'failed', updated_at = now() WHERE id = a.id;
  RETURN jsonb_build_object('assetId', a.id, 'path', a.storage_path, 'status', 'failed');
END $$;

-- A piece of content now shows this picture (only a ready one). Adding it again just updates the order.
CREATE OR REPLACE FUNCTION public.add_media_ref(p_asset uuid, p_type text, p_content text, p_order integer DEFAULT 0)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM media_assets WHERE id = p_asset AND status = 'ready') THEN RAISE EXCEPTION 'asset not ready' USING ERRCODE = '22023'; END IF;
  INSERT INTO content_media (asset_id, content_type, content_id, display_order) VALUES (p_asset, p_type, p_content, coalesce(p_order, 0))
  ON CONFLICT (asset_id, content_type, content_id) DO UPDATE SET display_order = EXCLUDED.display_order;
END $$;

-- A piece of content no longer shows this picture (or, without p_asset, any picture). Only the reference goes: the file stays
-- while anything else uses it, and an unused one is removed later by the cleanup, after a grace period.
CREATE OR REPLACE FUNCTION public.remove_media_ref(p_type text, p_content text, p_asset uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501'; END IF;
  DELETE FROM content_media WHERE content_type = p_type AND content_id = p_content AND (p_asset IS NULL OR asset_id = p_asset);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- How many pictures there are, how many bytes they use, and how many are unused (for the admin dashboard).
CREATE OR REPLACE FUNCTION public.media_stats()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501'; END IF;
  RETURN (SELECT jsonb_build_object(
    'assets', count(*) FILTER (WHERE status = 'ready'),
    'bytes', coalesce(sum(file_size) FILTER (WHERE status = 'ready'), 0),
    'unused', count(*) FILTER (WHERE status = 'ready' AND unreferenced_since IS NOT NULL),
    'unusedBytes', coalesce(sum(file_size) FILTER (WHERE status = 'ready' AND unreferenced_since IS NOT NULL), 0),
    'references', (SELECT count(*) FROM content_media)) FROM media_assets);
END $$;

REVOKE ALL ON FUNCTION public.reserve_media_asset(text, text, integer, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finish_media_asset(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_media_ref(uuid, text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_media_ref(text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.media_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_media_asset(text, text, integer, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finish_media_asset(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_media_ref(uuid, text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_media_ref(text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.media_stats() TO authenticated;
