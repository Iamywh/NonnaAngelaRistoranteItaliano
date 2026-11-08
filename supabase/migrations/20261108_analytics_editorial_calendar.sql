-- Phase 14B — private editorial calendar for Nonna Angela.
-- No auto-publishing, no social-platform credentials, no customer data or messages.
-- Planned dates and times are ATLANTIC/CANARY local wall clock; no scheduled jobs.
-- Requires Phase 14A analytics_growth_campaigns (for optional campaign linkage).
BEGIN;

CREATE TABLE public.analytics_editorial_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES public.analytics_growth_campaigns(id) ON DELETE SET NULL,
  title text NOT NULL CHECK(char_length(btrim(title)) BETWEEN 3 AND 120),
  platform text NOT NULL CHECK(platform IN
    ('instagram','google_business','in_restaurant','other')),
  content_kind text NOT NULL CHECK(content_kind IN
    ('post','reel','story','carousel','event','promotion')),
  owner_role text NOT NULL CHECK(owner_role IN
    ('marketing','sala','cocina','gerencia')),
  language text NOT NULL CHECK(language IN ('es','it','en','fr','de')),
  scheduled_date date NOT NULL,
  scheduled_time time WITHOUT time zone,
  copy_text text NOT NULL DEFAULT '' CHECK(char_length(copy_text)<=5000),
  creative_brief text NOT NULL DEFAULT '' CHECK(char_length(creative_brief)<=1000),
  cta text NOT NULL DEFAULT '' CHECK(char_length(cta)<=160),
  hashtags text NOT NULL DEFAULT '' CHECK(char_length(hashtags)<=500),
  asset_ready boolean NOT NULL DEFAULT false,
  copy_ready boolean NOT NULL DEFAULT false,
  facts_checked boolean NOT NULL DEFAULT false,
  rights_checked boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft' CHECK(status IN
    ('draft','in_review','approved','published','cancelled')),
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  published_at timestamptz,
  published_url text CHECK(
    published_url IS NULL OR (
      char_length(published_url)<=500
      AND published_url ~ '^https://[^[:space:]]+$'
    )
  ),
  revision integer NOT NULL DEFAULT 1 CHECK(revision>=1),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  updated_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT editorial_approval_invariant CHECK(
    (status IN ('approved','published') AND approved_by IS NOT NULL AND approved_at IS NOT NULL)
    OR (status NOT IN ('approved','published') AND approved_by IS NULL AND approved_at IS NULL)
  ),
  CONSTRAINT editorial_published_invariant CHECK(
    (status='published' AND published_at IS NOT NULL)
    OR (status<>'published' AND published_at IS NULL)
  )
);
CREATE INDEX editorial_scheduled_idx
  ON public.analytics_editorial_items(scheduled_date,scheduled_time);
CREATE INDEX editorial_campaign_idx
  ON public.analytics_editorial_items(campaign_id);

CREATE TABLE public.analytics_editorial_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id uuid NOT NULL REFERENCES public.analytics_editorial_items(id),
  operation text NOT NULL CHECK(operation IN
    ('create','edit','submit','approve','publish','return_draft','cancel')),
  before_value jsonb,
  after_value jsonb NOT NULL,
  changed_by uuid NOT NULL REFERENCES auth.users(id),
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX editorial_audit_item_idx ON public.analytics_editorial_audit(item_id,changed_at DESC);

ALTER TABLE public.analytics_editorial_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_editorial_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.analytics_editorial_items,public.analytics_editorial_audit
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.analytics_editorial_authorized()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
  SELECT auth.role()='authenticated' AND EXISTS(
    SELECT 1 FROM public.analytics_user_roles u
    WHERE u.user_id=auth.uid() AND u.is_active AND u.role IN ('owner','admin')
  );
$$;
REVOKE ALL ON FUNCTION public.analytics_editorial_authorized()
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.analytics_editorial_list(
  p_start_date date,p_end_date date
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_count integer; v_items jsonb;
BEGIN
  IF NOT public.analytics_editorial_authorized() THEN RAISE EXCEPTION 'Access denied'; END IF;
  IF p_start_date IS NULL OR p_end_date IS NULL OR p_end_date<p_start_date OR
    p_end_date>p_start_date+62 THEN
    RAISE EXCEPTION 'Editorial calendar supports a maximum 63-day range';
  END IF;
  SELECT count(*)::integer INTO v_count FROM public.analytics_editorial_items e
    WHERE e.scheduled_date BETWEEN p_start_date AND p_end_date;
  IF v_count>250 THEN
    RAISE EXCEPTION 'Too many items (max 250). Narrow the date range.';
  END IF;
  SELECT coalesce(jsonb_agg(
    (to_jsonb(e) - 'created_by' - 'updated_by' - 'approved_by')
      || jsonb_build_object('campaign_name',c.name)
    ORDER BY e.scheduled_date,e.scheduled_time NULLS LAST,e.created_at
  ),'[]'::jsonb) INTO v_items
  FROM public.analytics_editorial_items e
  LEFT JOIN public.analytics_growth_campaigns c ON c.id=e.campaign_id
  WHERE e.scheduled_date BETWEEN p_start_date AND p_end_date;
  RETURN jsonb_build_object('ok',true,'count',v_count,'items',v_items);
END;
$$;

-- Draft authoring is separate from approval. Editing an approved/in-review item
-- always resets it to DRAFT and clears prior approval. Published/cancelled
-- items are immutable, so no silent mutation of an approved/public record.
CREATE FUNCTION public.analytics_editorial_save(p_item jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE
  v_old public.analytics_editorial_items%ROWTYPE;
  v_new public.analytics_editorial_items%ROWTYPE;
  v_id uuid; v_campaign uuid;
  v_title text; v_platform text; v_kind text; v_owner text; v_language text;
  v_date date; v_time time; v_time_text text; v_date_text text;
  v_copy text; v_brief text; v_cta text; v_tags text;
  v_asset boolean; v_copy_ready boolean; v_facts boolean; v_rights boolean;
  v_revision integer; v_bool_key text;
BEGIN
  IF NOT public.analytics_editorial_authorized() THEN RAISE EXCEPTION 'Access denied'; END IF;
  IF p_item IS NULL OR jsonb_typeof(p_item) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid editorial payload';
  END IF;
  v_title:=btrim(coalesce(p_item->>'title',''));
  v_platform:=p_item->>'platform';
  v_kind:=p_item->>'content_kind';
  v_owner:=p_item->>'owner_role';
  v_language:=p_item->>'language';
  v_copy:=coalesce(p_item->>'copy_text','');
  v_brief:=coalesce(p_item->>'creative_brief','');
  v_cta:=coalesce(p_item->>'cta','');
  v_tags:=coalesce(p_item->>'hashtags','');

  IF char_length(v_title) NOT BETWEEN 3 AND 120 OR
    v_platform IS NULL OR v_platform NOT IN
      ('instagram','google_business','in_restaurant','other') OR
    v_kind IS NULL OR v_kind NOT IN
      ('post','reel','story','carousel','event','promotion') OR
    v_owner IS NULL OR v_owner NOT IN
      ('marketing','sala','cocina','gerencia') OR
    v_language IS NULL OR v_language NOT IN ('es','it','en','fr','de') OR
    char_length(v_copy)>5000 OR char_length(v_brief)>1000 OR
    char_length(v_cta)>160 OR char_length(v_tags)>500 THEN
    RAISE EXCEPTION 'Invalid editorial fields';
  END IF;
  v_date_text:=p_item->>'scheduled_date';
  IF v_date_text IS NULL OR
    v_date_text !~ '^([0-9]{4})-(0[1-9]|1[0-2])-([0-2][0-9]|3[01])$' THEN
    RAISE EXCEPTION 'Date must be YYYY-MM-DD';
  END IF;
  BEGIN
    v_date:=to_date(v_date_text,'YYYY-MM-DD');
    IF to_char(v_date,'YYYY-MM-DD')<>v_date_text THEN
      RAISE EXCEPTION 'Nonexistent date';
    END IF;
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Invalid scheduled date'; END;
  v_time_text:=nullif(btrim(coalesce(p_item->>'scheduled_time','')),'');
  IF v_time_text IS NOT NULL THEN
    IF v_time_text !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
      RAISE EXCEPTION 'Time must be 24-hour HH:MM';
    END IF;
    v_time:=v_time_text::time;
  ELSE
    v_time:=NULL;
  END IF;
  v_campaign:=NULL;
  IF nullif(p_item->>'campaign_id','') IS NOT NULL THEN
    IF (p_item->>'campaign_id') !~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'Invalid campaign ID';
    END IF;
    v_campaign:=(p_item->>'campaign_id')::uuid;
    IF NOT EXISTS(SELECT 1 FROM public.analytics_growth_campaigns WHERE id=v_campaign) THEN
      RAISE EXCEPTION 'Campaign not found';
    END IF;
  END IF;
  FOREACH v_bool_key IN ARRAY ARRAY['asset_ready','copy_ready','facts_checked','rights_checked'] LOOP
    IF jsonb_typeof(p_item->v_bool_key) IS DISTINCT FROM 'boolean' THEN
      RAISE EXCEPTION 'Checklist field % must be boolean',v_bool_key;
    END IF;
  END LOOP;
  v_asset:=(p_item->>'asset_ready')::boolean;
  v_copy_ready:=(p_item->>'copy_ready')::boolean;
  v_facts:=(p_item->>'facts_checked')::boolean;
  v_rights:=(p_item->>'rights_checked')::boolean;

  IF nullif(p_item->>'id','') IS NULL THEN
    IF (p_item->>'expected_revision') IS NOT NULL THEN
      RAISE EXCEPTION 'Do not supply a revision for new items';
    END IF;
    INSERT INTO public.analytics_editorial_items(
      campaign_id,title,platform,content_kind,owner_role,language,
      scheduled_date,scheduled_time,copy_text,creative_brief,cta,hashtags,
      asset_ready,copy_ready,facts_checked,rights_checked,created_by,updated_by
    ) VALUES(
      v_campaign,v_title,v_platform,v_kind,v_owner,v_language,
      v_date,v_time,v_copy,v_brief,v_cta,v_tags,
      v_asset,v_copy_ready,v_facts,v_rights,auth.uid(),auth.uid()
    ) RETURNING * INTO v_new;
    INSERT INTO public.analytics_editorial_audit(item_id,operation,before_value,after_value,changed_by)
      VALUES(v_new.id,'create',NULL,to_jsonb(v_new),auth.uid());
  ELSE
    IF (p_item->>'id') !~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR
      (p_item->>'expected_revision') IS NULL OR
      (p_item->>'expected_revision') !~ '^[1-9][0-9]{0,8}$' THEN
      RAISE EXCEPTION 'Item ID and revision required';
    END IF;
    v_id:=(p_item->>'id')::uuid;
    v_revision:=(p_item->>'expected_revision')::integer;
    SELECT * INTO v_old FROM public.analytics_editorial_items WHERE id=v_id FOR UPDATE;
    IF v_old.id IS NULL THEN RAISE EXCEPTION 'Content item no longer exists'; END IF;
    IF v_old.revision<>v_revision THEN
      RAISE EXCEPTION 'Content changed elsewhere. Refresh before editing.';
    END IF;
    IF v_old.status IN ('published','cancelled') THEN
      RAISE EXCEPTION 'Published or cancelled content is immutable';
    END IF;
    UPDATE public.analytics_editorial_items SET
      campaign_id=v_campaign,title=v_title,platform=v_platform,
      content_kind=v_kind,owner_role=v_owner,language=v_language,
      scheduled_date=v_date,scheduled_time=v_time,copy_text=v_copy,
      creative_brief=v_brief,cta=v_cta,hashtags=v_tags,
      asset_ready=v_asset,copy_ready=v_copy_ready,
      facts_checked=v_facts,rights_checked=v_rights,
      status='draft',approved_at=NULL,approved_by=NULL,
      revision=revision+1,updated_by=auth.uid(),updated_at=now()
    WHERE id=v_id RETURNING * INTO v_new;
    INSERT INTO public.analytics_editorial_audit(item_id,operation,before_value,after_value,changed_by)
      VALUES(v_new.id,'edit',to_jsonb(v_old),to_jsonb(v_new),auth.uid());
  END IF;
  RETURN jsonb_build_object('ok',true,
    'item',(to_jsonb(v_new)-'created_by'-'updated_by'-'approved_by'));
END;
$$;

-- All transitions are explicit, concurrency-checked and audited.
-- 'publish' is a human attestation only: NO external posting action.
CREATE FUNCTION public.analytics_editorial_action(
  p_id uuid,p_expected_revision integer,p_action text,p_published_url text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE
  v_old public.analytics_editorial_items%ROWTYPE;
  v_new public.analytics_editorial_items%ROWTYPE;
  v_status text; v_url text;
BEGIN
  IF NOT public.analytics_editorial_authorized() THEN RAISE EXCEPTION 'Access denied'; END IF;
  IF p_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<1 OR
    p_action IS NULL OR p_action NOT IN
      ('submit','approve','publish','return_draft','cancel') THEN
    RAISE EXCEPTION 'Invalid workflow action';
  END IF;
  SELECT * INTO v_old FROM public.analytics_editorial_items WHERE id=p_id FOR UPDATE;
  IF v_old.id IS NULL THEN RAISE EXCEPTION 'Content item not found'; END IF;
  IF v_old.revision<>p_expected_revision THEN
    RAISE EXCEPTION 'Content changed elsewhere. Refresh before workflow action.';
  END IF;
  IF v_old.status IN ('published','cancelled') THEN
    RAISE EXCEPTION 'Published or cancelled content is immutable';
  END IF;
  v_url:=nullif(btrim(coalesce(p_published_url,'')),'');
  IF p_action<>'publish' AND v_url IS NOT NULL THEN
    RAISE EXCEPTION 'Publication link only accepted for the publish action';
  END IF;
  IF v_url IS NOT NULL AND (
    char_length(v_url)>500 OR v_url !~ '^https://[^[:space:]]+$'
  ) THEN RAISE EXCEPTION 'Published URL must be a valid HTTPS link'; END IF;

  IF p_action='submit' THEN
    IF v_old.status<>'draft' THEN
      RAISE EXCEPTION 'Only drafts can be submitted for review';
    END IF;
    IF char_length(btrim(v_old.copy_text))<20 OR NOT (
      v_old.asset_ready AND v_old.copy_ready AND
      v_old.facts_checked AND v_old.rights_checked
    ) THEN
      RAISE EXCEPTION 'Complete copy (20+ chars) and all four checks before review';
    END IF;
    v_status:='in_review';
  ELSIF p_action='approve' THEN
    IF v_old.status<>'in_review' THEN
      RAISE EXCEPTION 'Only reviewed content can be approved';
    END IF;
    IF char_length(btrim(v_old.copy_text))<20 OR NOT (
      v_old.asset_ready AND v_old.copy_ready AND
      v_old.facts_checked AND v_old.rights_checked
    ) THEN
      RAISE EXCEPTION 'Review checklist is incomplete';
    END IF;
    v_status:='approved';
  ELSIF p_action='publish' THEN
    IF v_old.status<>'approved' THEN
      RAISE EXCEPTION 'Only approved content can be marked published';
    END IF;
    v_status:='published';
  ELSIF p_action='return_draft' THEN
    IF v_old.status NOT IN ('in_review','approved') THEN
      RAISE EXCEPTION 'Only reviewed or approved content can return to draft';
    END IF;
    v_status:='draft';
  ELSE
    v_status:='cancelled';
  END IF;

  UPDATE public.analytics_editorial_items SET
    status=v_status,approved_by=CASE
      WHEN p_action='approve' THEN auth.uid()
      WHEN v_status IN ('draft','cancelled') THEN NULL
      ELSE approved_by END,
    approved_at=CASE
      WHEN p_action='approve' THEN now()
      WHEN v_status IN ('draft','cancelled') THEN NULL
      ELSE approved_at END,
    published_at=CASE WHEN p_action='publish' THEN now() ELSE NULL END,
    published_url=CASE WHEN p_action='publish' THEN v_url ELSE NULL END,
    revision=revision+1,updated_by=auth.uid(),updated_at=now()
  WHERE id=p_id RETURNING * INTO v_new;
  INSERT INTO public.analytics_editorial_audit(item_id,operation,before_value,after_value,changed_by)
    VALUES(v_new.id,p_action,to_jsonb(v_old),to_jsonb(v_new),auth.uid());
  RETURN jsonb_build_object('ok',true,
    'item',(to_jsonb(v_new)-'created_by'-'updated_by'-'approved_by'));
END;
$$;

REVOKE ALL ON FUNCTION public.analytics_editorial_list(date,date)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.analytics_editorial_save(jsonb)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.analytics_editorial_action(uuid,integer,text,text)
  FROM PUBLIC,anon,authenticated;

GRANT EXECUTE ON FUNCTION public.analytics_editorial_list(date,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_editorial_save(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_editorial_action(uuid,integer,text,text) TO authenticated;
COMMIT;
