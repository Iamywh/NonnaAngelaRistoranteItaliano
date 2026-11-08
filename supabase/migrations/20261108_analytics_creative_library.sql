-- Phase 14C: private Creative Library for photos/videos and editorial references.
-- Requires Phase 14B (analytics_editorial_items/audit) and Analytics owner/admin roles.
-- No public URLs, no automatic publishing, no customer records or social tokens.
BEGIN;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES(
  'nonna-creative-library','nonna-creative-library',false,26214400,
  ARRAY['image/jpeg','image/png','image/webp','video/mp4','video/webm']::text[]
)
ON CONFLICT(id) DO UPDATE SET
  public=false,file_size_limit=EXCLUDED.file_size_limit,
  allowed_mime_types=EXCLUDED.allowed_mime_types;

CREATE FUNCTION public.analytics_creative_authorized()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
  SELECT auth.role()='authenticated' AND EXISTS(
    SELECT 1 FROM public.analytics_user_roles r
    WHERE r.user_id=auth.uid() AND r.is_active AND r.role IN ('owner','admin')
  );
$$;
REVOKE ALL ON FUNCTION public.analytics_creative_authorized()
  FROM PUBLIC,anon,authenticated;
-- Storage RLS evaluates this boolean helper as the signed-in database role.
-- Granting EXECUTE is safe: it returns only whether that caller is owner/admin.
GRANT EXECUTE ON FUNCTION public.analytics_creative_authorized() TO authenticated;

-- Supabase Storage authorization is server-side, independent from the UI.
-- Paths are random opaque UUID filenames in the media/ directory.
-- Only owner/admin can read, upload and delete private objects (deletion is
-- for failed-upload cleanup; the app archives registered assets instead).
CREATE POLICY creative_library_staff_select ON storage.objects
  FOR SELECT TO authenticated
  USING(bucket_id='nonna-creative-library' AND
    (SELECT public.analytics_creative_authorized()));
CREATE POLICY creative_library_staff_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK(
    bucket_id='nonna-creative-library' AND
    name ~ '^media/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|jpeg|png|webp|mp4|webm)$'
    AND (SELECT public.analytics_creative_authorized())
  );
CREATE POLICY creative_library_staff_delete ON storage.objects
  FOR DELETE TO authenticated
  USING(bucket_id='nonna-creative-library' AND
    (SELECT public.analytics_creative_authorized()));

CREATE TABLE public.analytics_creative_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_path text NOT NULL UNIQUE
    CHECK(storage_path ~ '^media/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|jpeg|png|webp|mp4|webm)$'),
  original_filename text NOT NULL CHECK(char_length(btrim(original_filename)) BETWEEN 1 AND 180),
  mime_type text NOT NULL CHECK(mime_type IN(
    'image/jpeg','image/png','image/webp','video/mp4','video/webm')),
  file_bytes integer NOT NULL CHECK(file_bytes BETWEEN 1 AND 26214400),
  title text NOT NULL CHECK(char_length(btrim(title)) BETWEEN 3 AND 120),
  category text NOT NULL CHECK(category IN(
    'platos','vinos','cocktails','local','eventos','equipo','otros')),
  rights_status text NOT NULL DEFAULT 'unverified'
    CHECK(rights_status IN ('unverified','cleared','restricted')),
  rights_note text NOT NULL DEFAULT '' CHECK(char_length(rights_note)<=500),
  credit text NOT NULL DEFAULT '' CHECK(char_length(credit)<=160),
  notes text NOT NULL DEFAULT '' CHECK(char_length(notes)<=750),
  tags text[] NOT NULL DEFAULT ARRAY[]::text[] CHECK(cardinality(tags)<=8),
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
  revision integer NOT NULL DEFAULT 1 CHECK(revision>=1),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  updated_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX creative_assets_idx ON public.analytics_creative_assets(created_at DESC);
CREATE INDEX creative_tags_idx ON public.analytics_creative_assets USING gin(tags);

CREATE TABLE public.analytics_creative_editorial_links(
  asset_id uuid NOT NULL REFERENCES public.analytics_creative_assets(id),
  editorial_id uuid NOT NULL REFERENCES public.analytics_editorial_items(id),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(asset_id,editorial_id)
);
CREATE INDEX creative_editorial_idx ON public.analytics_creative_editorial_links(editorial_id);

CREATE TABLE public.analytics_creative_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  asset_id uuid NOT NULL REFERENCES public.analytics_creative_assets(id),
  operation text NOT NULL CHECK(operation IN(
    'register','edit','archive','restore','link','unlink')),
  before_value jsonb,
  after_value jsonb NOT NULL,
  changed_by uuid NOT NULL REFERENCES auth.users(id),
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX creative_audit_idx ON public.analytics_creative_audit(asset_id,changed_at DESC);

ALTER TABLE public.analytics_creative_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_creative_editorial_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_creative_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.analytics_creative_assets,
  public.analytics_creative_editorial_links,public.analytics_creative_audit
  FROM PUBLIC,anon,authenticated;

-- A linked asset must be re-reviewed if its licence becomes restricted,
-- the asset is archived, or a link changes. Existing published content is
-- NOT edited; its status is flagged by the links read model for manual action.
CREATE FUNCTION public.analytics_creative_reset_editorial(p_editorial_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_old public.analytics_editorial_items%ROWTYPE;
        v_new public.analytics_editorial_items%ROWTYPE;
BEGIN
  IF NOT public.analytics_creative_authorized() THEN RAISE EXCEPTION 'Access denied'; END IF;
  SELECT * INTO v_old FROM public.analytics_editorial_items
    WHERE id=p_editorial_id FOR UPDATE;
  IF v_old.status IN ('approved','in_review') THEN
    UPDATE public.analytics_editorial_items SET
      status='draft',approved_by=NULL,approved_at=NULL,rights_checked=false,revision=revision+1,
      updated_by=auth.uid(),updated_at=now()
    WHERE id=p_editorial_id RETURNING * INTO v_new;
    INSERT INTO public.analytics_editorial_audit(
      item_id,operation,before_value,after_value,changed_by
    ) VALUES(p_editorial_id,'edit',to_jsonb(v_old),to_jsonb(v_new),auth.uid());
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.analytics_creative_reset_editorial(uuid)
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.analytics_creative_list(p_include_archived boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_total integer; v_assets jsonb;
BEGIN
  IF NOT public.analytics_creative_authorized() THEN RAISE EXCEPTION 'Access denied'; END IF;
  SELECT count(*)::integer INTO v_total FROM public.analytics_creative_assets a
    WHERE coalesce(p_include_archived,false) OR a.status='active';
  IF v_total>300 THEN RAISE EXCEPTION 'More than 300 assets: archive or add pagination'; END IF;
  SELECT coalesce(jsonb_agg(
    (to_jsonb(a)-'created_by'-'updated_by')||
    jsonb_build_object('linked_count',(
      SELECT count(*)::integer FROM public.analytics_creative_editorial_links l
      WHERE l.asset_id=a.id))
    ORDER BY a.created_at DESC
  ),'[]'::jsonb) INTO v_assets
  FROM public.analytics_creative_assets a
  WHERE coalesce(p_include_archived,false) OR a.status='active';
  RETURN jsonb_build_object('ok',true,'count',v_total,'assets',v_assets);
END;
$$;

CREATE FUNCTION public.analytics_creative_save(p_asset jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE
  v_title text; v_category text; v_rights text; v_credit text;
  v_rights_note text; v_notes text; v_filename text; v_path text;
  v_tags text[]; v_status text; v_id uuid; v_revision integer;
  v_old public.analytics_creative_assets%ROWTYPE;
  v_new public.analytics_creative_assets%ROWTYPE;
  v_mime text; v_size integer; v_link record;
BEGIN
  IF NOT public.analytics_creative_authorized() THEN RAISE EXCEPTION 'Access denied'; END IF;
  IF p_asset IS NULL OR jsonb_typeof(p_asset)<>'object' OR
    jsonb_typeof(p_asset->'tags') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid creative asset payload';
  END IF;
  v_title:=btrim(coalesce(p_asset->>'title',''));
  v_category:=p_asset->>'category';
  v_rights:=p_asset->>'rights_status';
  v_credit:=btrim(coalesce(p_asset->>'credit',''));
  v_rights_note:=btrim(coalesce(p_asset->>'rights_note',''));
  v_notes:=btrim(coalesce(p_asset->>'notes',''));
  v_status:=p_asset->>'status';
  v_tags:=ARRAY(
    SELECT lower(btrim(t.value)) FROM jsonb_array_elements_text(p_asset->'tags') AS t(value)
  );
  IF char_length(v_title) NOT BETWEEN 3 AND 120 OR
    v_category IS NULL OR v_category NOT IN (
      'platos','vinos','cocktails','local','eventos','equipo','otros') OR
    v_rights IS NULL OR v_rights NOT IN ('unverified','cleared','restricted') OR
    v_status IS NULL OR v_status NOT IN ('active','archived') OR
    char_length(v_credit)>160 OR char_length(v_rights_note)>500 OR
    char_length(v_notes)>750 OR cardinality(v_tags)>8 OR
    (v_rights='cleared' AND char_length(v_rights_note)<12) OR
    EXISTS(SELECT 1 FROM unnest(v_tags) t WHERE t='' OR char_length(t)>32) THEN
    RAISE EXCEPTION 'Invalid creative asset fields';
  END IF;

  IF nullif(p_asset->>'id','') IS NULL THEN
    IF nullif(p_asset->>'expected_revision','') IS NOT NULL THEN
      RAISE EXCEPTION 'Unexpected revision when registering';
    END IF;
    v_path:=p_asset->>'storage_path';
    v_filename:=btrim(coalesce(p_asset->>'original_filename',''));
    IF v_path IS NULL OR v_path !~
      '^media/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|jpeg|png|webp|mp4|webm)$'
      OR char_length(v_filename) NOT BETWEEN 1 AND 180 THEN
      RAISE EXCEPTION 'Invalid filename or storage path';
    END IF;
    SELECT lower(split_part(coalesce(o.metadata->>'mimetype',''),';',1)),
      (o.metadata->>'size')::integer
      INTO v_mime,v_size
      FROM storage.objects o
      WHERE o.bucket_id='nonna-creative-library' AND o.name=v_path;
    IF v_mime IS NULL OR v_mime NOT IN
      ('image/jpeg','image/png','image/webp','video/mp4','video/webm') OR
      v_size IS NULL OR v_size<1 OR v_size>26214400 THEN
      RAISE EXCEPTION 'File missing from private Storage or unsupported type/size';
    END IF;
    IF (v_mime LIKE 'image/%' AND v_path ~ '[.](mp4|webm)$') OR
       (v_mime LIKE 'video/%' AND v_path !~ '[.](mp4|webm)$') THEN
      RAISE EXCEPTION 'Mismatch between file extension and media type';
    END IF;
    INSERT INTO public.analytics_creative_assets(
      storage_path,original_filename,mime_type,file_bytes,
      title,category,rights_status,rights_note,credit,notes,tags,status,
      created_by,updated_by
    ) VALUES(
      v_path,v_filename,v_mime,v_size,
      v_title,v_category,v_rights,v_rights_note,v_credit,v_notes,v_tags,v_status,
      auth.uid(),auth.uid()
    ) RETURNING * INTO v_new;
    INSERT INTO public.analytics_creative_audit(
      asset_id,operation,before_value,after_value,changed_by
    ) VALUES(v_new.id,'register',NULL,to_jsonb(v_new),auth.uid());
  ELSE
    IF (p_asset->>'id') !~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR (p_asset->>'expected_revision') IS NULL OR
      (p_asset->>'expected_revision') !~ '^[1-9][0-9]{0,8}$' THEN
      RAISE EXCEPTION 'Asset ID and revision required';
    END IF;
    v_id:=(p_asset->>'id')::uuid;
    v_revision:=(p_asset->>'expected_revision')::integer;
    SELECT * INTO v_old FROM public.analytics_creative_assets
      WHERE id=v_id FOR UPDATE;
    IF v_old.id IS NULL THEN RAISE EXCEPTION 'Creative asset not found'; END IF;
    IF v_old.revision<>v_revision THEN
      RAISE EXCEPTION 'Asset changed in another session. Refresh before editing.';
    END IF;
    UPDATE public.analytics_creative_assets SET
      title=v_title,category=v_category,rights_status=v_rights,
      rights_note=v_rights_note,credit=v_credit,notes=v_notes,
      tags=v_tags,status=v_status,revision=revision+1,
      updated_by=auth.uid(),updated_at=now()
    WHERE id=v_id RETURNING * INTO v_new;
    INSERT INTO public.analytics_creative_audit(
      asset_id,operation,before_value,after_value,changed_by
    ) VALUES(v_new.id,CASE WHEN v_old.status<>v_status THEN
      CASE WHEN v_status='archived' THEN 'archive' ELSE 'restore' END
      ELSE 'edit' END,to_jsonb(v_old),to_jsonb(v_new),auth.uid());
    IF (v_old.rights_status='cleared' AND v_new.rights_status<>'cleared') OR
      (v_old.status='active' AND v_new.status='archived') THEN
      FOR v_link IN SELECT l.editorial_id
        FROM public.analytics_creative_editorial_links l
        WHERE l.asset_id=v_id LOOP
        PERFORM public.analytics_creative_reset_editorial(v_link.editorial_id);
      END LOOP;
    END IF;
  END IF;
  RETURN jsonb_build_object('ok',true,
    'asset',(to_jsonb(v_new)-'created_by'-'updated_by'));
END;
$$;

CREATE FUNCTION public.analytics_creative_link(
  p_editorial_id uuid,p_asset_id uuid,p_unlink boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_ed public.analytics_editorial_items%ROWTYPE;
        v_asset public.analytics_creative_assets%ROWTYPE;
        v_changed uuid; v_count integer;
BEGIN
  IF NOT public.analytics_creative_authorized() THEN RAISE EXCEPTION 'Access denied'; END IF;
  IF p_editorial_id IS NULL OR p_asset_id IS NULL THEN
    RAISE EXCEPTION 'Editorial item and asset are required';
  END IF;
  SELECT * INTO v_ed FROM public.analytics_editorial_items
    WHERE id=p_editorial_id FOR UPDATE;
  IF v_ed.id IS NULL OR v_ed.status IN ('published','cancelled') THEN
    RAISE EXCEPTION 'Published/cancelled items cannot change asset links';
  END IF;
  SELECT * INTO v_asset FROM public.analytics_creative_assets
    WHERE id=p_asset_id FOR SHARE;
  IF v_asset.id IS NULL THEN RAISE EXCEPTION 'Creative asset not found'; END IF;
  IF coalesce(p_unlink,false) THEN
    DELETE FROM public.analytics_creative_editorial_links
      WHERE asset_id=p_asset_id AND editorial_id=p_editorial_id
      RETURNING asset_id INTO v_changed;
  ELSE
    IF v_asset.status<>'active' OR v_asset.rights_status<>'cleared' THEN
      RAISE EXCEPTION 'Only active assets with verified usage rights can be linked';
    END IF;
    SELECT count(*)::integer INTO v_count FROM public.analytics_creative_editorial_links
      WHERE editorial_id=p_editorial_id;
    IF v_count>=8 AND NOT EXISTS(
      SELECT 1 FROM public.analytics_creative_editorial_links
        WHERE editorial_id=p_editorial_id AND asset_id=p_asset_id
    ) THEN RAISE EXCEPTION 'Maximum eight assets per editorial item'; END IF;
    INSERT INTO public.analytics_creative_editorial_links(
      asset_id,editorial_id,created_by
    ) VALUES(p_asset_id,p_editorial_id,auth.uid())
    ON CONFLICT DO NOTHING RETURNING asset_id INTO v_changed;
  END IF;
  IF v_changed IS NOT NULL THEN
    PERFORM public.analytics_creative_reset_editorial(p_editorial_id);
    INSERT INTO public.analytics_creative_audit(
      asset_id,operation,before_value,after_value,changed_by
    ) VALUES(
      p_asset_id,CASE WHEN p_unlink THEN 'unlink' ELSE 'link' END,
      jsonb_build_object('editorial_id',p_editorial_id,'linked',p_unlink),
      jsonb_build_object('editorial_id',p_editorial_id,'linked',NOT p_unlink),
      auth.uid()
    );
  END IF;
  RETURN jsonb_build_object(
    'ok',true,'changed',v_changed IS NOT NULL,
    'editorial_id',p_editorial_id,'asset_id',p_asset_id,
    'linked',NOT coalesce(p_unlink,false)
  );
END;
$$;

CREATE FUNCTION public.analytics_creative_month_links(
  p_start_date date,p_end_date date
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_results jsonb; v_count integer;
BEGIN
  IF NOT public.analytics_creative_authorized() THEN RAISE EXCEPTION 'Access denied'; END IF;
  IF p_start_date IS NULL OR p_end_date IS NULL OR
    p_end_date<p_start_date OR p_end_date>p_start_date+62 THEN
    RAISE EXCEPTION 'Invalid editorial date window';
  END IF;
  SELECT count(*)::integer INTO v_count
  FROM public.analytics_creative_editorial_links l
  JOIN public.analytics_editorial_items e ON e.id=l.editorial_id
  WHERE e.scheduled_date BETWEEN p_start_date AND p_end_date;
  IF v_count>2000 THEN RAISE EXCEPTION 'Too many linked assets'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'editorial_id',l.editorial_id,'asset_id',l.asset_id,
    'asset_title',a.title,'rights_status',a.rights_status,
    'asset_status',a.status
  ) ORDER BY e.scheduled_date,e.id,a.title),'[]'::jsonb) INTO v_results
  FROM public.analytics_creative_editorial_links l
  JOIN public.analytics_creative_assets a ON a.id=l.asset_id
  JOIN public.analytics_editorial_items e ON e.id=l.editorial_id
  WHERE e.scheduled_date BETWEEN p_start_date AND p_end_date;
  RETURN jsonb_build_object('ok',true,'count',v_count,'links',v_results);
END;
$$;

REVOKE ALL ON FUNCTION public.analytics_creative_list(boolean)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.analytics_creative_save(jsonb)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.analytics_creative_link(uuid,uuid,boolean)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.analytics_creative_month_links(date,date)
  FROM PUBLIC,anon,authenticated;

GRANT EXECUTE ON FUNCTION public.analytics_creative_list(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_creative_save(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_creative_link(uuid,uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_creative_month_links(date,date) TO authenticated;
COMMIT;
