-- Phase 14A: marketing campaign planning + manually evidenced performance.
-- Isolated from reservations, customer identities, marketing senders, and sales ledger.
-- No automatic UTM attribution, ad-platform API, messages, booking linking, or ROI.
BEGIN;

CREATE TABLE public.analytics_growth_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 3 AND 100),
  channel text NOT NULL CHECK (channel IN
    ('instagram','google_ads','google_business','organic','offline','other')),
  objective text NOT NULL CHECK (objective IN
    ('bookings','visibility','weekday_demand','special_event')),
  target_service text NOT NULL CHECK (target_service IN ('lunch','dinner','both')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN
    ('draft','planned','running','finished','cancelled')),
  start_date date NOT NULL,
  end_date date NOT NULL,
  planned_budget numeric(12,2) NOT NULL DEFAULT 0 CHECK(planned_budget BETWEEN 0 AND 1000000),
  actual_spend numeric(12,2) CHECK(actual_spend BETWEEN 0 AND 1000000),
  impressions integer CHECK (impressions BETWEEN 0 AND 100000000),
  clicks integer CHECK (clicks BETWEEN 0 AND 100000000),
  inquiries integer CHECK (inquiries BETWEEN 0 AND 100000000),
  code_bookings integer CHECK (code_bookings BETWEEN 0 AND 100000000),
  tracking_code text UNIQUE CHECK (
    tracking_code IS NULL OR tracking_code ~ '^[A-Z0-9_-]{4,24}$'
  ),
  notes text NOT NULL DEFAULT '' CHECK(char_length(notes)<=500),
  revision integer NOT NULL DEFAULT 1 CHECK(revision>=1),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  updated_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT growth_campaign_period CHECK(
    end_date>=start_date AND end_date<=start_date+365
  )
);
CREATE INDEX analytics_growth_campaigns_range_idx
  ON public.analytics_growth_campaigns(start_date,end_date);

CREATE TABLE public.analytics_growth_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES public.analytics_growth_campaigns(id),
  operation text NOT NULL CHECK(operation IN ('insert','update')),
  before_value jsonb,
  after_value jsonb NOT NULL,
  changed_by uuid NOT NULL REFERENCES auth.users(id),
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX analytics_growth_audit_campaign_idx
  ON public.analytics_growth_audit(campaign_id,changed_at DESC);

ALTER TABLE public.analytics_growth_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_growth_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.analytics_growth_campaigns,public.analytics_growth_audit
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.analytics_growth_editor()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
  SELECT auth.role()='authenticated' AND EXISTS (
    SELECT 1 FROM public.analytics_user_roles r
      WHERE r.user_id=auth.uid() AND r.is_active AND r.role IN ('owner','admin')
  );
$$;
REVOKE ALL ON FUNCTION public.analytics_growth_editor()
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.analytics_growth_list(
  p_start_date date,p_end_date date
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_count integer; v_rows jsonb;
BEGIN
  IF NOT public.analytics_growth_editor() THEN RAISE EXCEPTION 'Access denied'; END IF;
  IF p_start_date IS NULL OR p_end_date IS NULL
    OR p_end_date<p_start_date OR p_end_date>p_start_date+366 THEN
    RAISE EXCEPTION 'Select a valid campaign window of at most 367 calendar days';
  END IF;
  SELECT count(*)::integer INTO v_count
    FROM public.analytics_growth_campaigns c
    WHERE c.start_date<=p_end_date AND c.end_date>=p_start_date;
  IF v_count>200 THEN
    RAISE EXCEPTION 'Too many campaigns: shorten the date filter (max 200)';
  END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.start_date DESC,c.created_at DESC),
    '[]'::jsonb) INTO v_rows
    FROM public.analytics_growth_campaigns c
    WHERE c.start_date<=p_end_date AND c.end_date>=p_start_date;
  RETURN jsonb_build_object('ok',true,'count',v_count,'campaigns',v_rows);
END;
$$;

CREATE FUNCTION public.analytics_growth_save(p_campaign jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE
  v_existing public.analytics_growth_campaigns%ROWTYPE;
  v_saved public.analytics_growth_campaigns%ROWTYPE;
  v_id uuid; v_name text; v_channel text; v_objective text;
  v_service text; v_status text; v_start date; v_end date;
  v_budget numeric; v_spend numeric;
  v_impressions integer; v_clicks integer; v_inquiries integer; v_bookings integer;
  v_tracking text; v_notes text;
  v_expected integer; v_key text; v_text text; v_amount numeric;
  v_metrics jsonb:= '{}'::jsonb;
BEGIN
  IF NOT public.analytics_growth_editor() THEN RAISE EXCEPTION 'Access denied'; END IF;
  IF p_campaign IS NULL OR jsonb_typeof(p_campaign) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid campaign payload';
  END IF;
  v_name:=btrim(coalesce(p_campaign->>'name',''));
  v_channel:=p_campaign->>'channel';
  v_objective:=p_campaign->>'objective';
  v_service:=p_campaign->>'target_service';
  v_status:=p_campaign->>'status';
  v_tracking:=nullif(upper(btrim(coalesce(p_campaign->>'tracking_code',''))),'');
  v_notes:=btrim(coalesce(p_campaign->>'notes',''));
  IF char_length(v_name) NOT BETWEEN 3 AND 100 OR
     v_channel IS NULL OR v_channel NOT IN (
       'instagram','google_ads','google_business','organic','offline','other') OR
     v_objective IS NULL OR v_objective NOT IN (
       'bookings','visibility','weekday_demand','special_event') OR
     v_service IS NULL OR v_service NOT IN ('lunch','dinner','both') OR
     v_status IS NULL OR v_status NOT IN ('draft','planned','running','finished','cancelled') OR
     char_length(v_notes)>500 OR
     (v_tracking IS NOT NULL AND v_tracking !~ '^[A-Z0-9_-]{4,24}$') THEN
    RAISE EXCEPTION 'Invalid campaign details';
  END IF;
  IF (p_campaign->>'start_date') IS NULL OR
     (p_campaign->>'end_date') IS NULL OR
     (p_campaign->>'start_date') !~ '^([0-9]{4})-(0[1-9]|1[0-2])-([0-2][0-9]|3[01])$' OR
     (p_campaign->>'end_date') !~ '^([0-9]{4})-(0[1-9]|1[0-2])-([0-2][0-9]|3[01])$' THEN
    RAISE EXCEPTION 'Invalid campaign date format';
  END IF;
  BEGIN
    v_start:=to_date(p_campaign->>'start_date','YYYY-MM-DD');
    v_end:=to_date(p_campaign->>'end_date','YYYY-MM-DD');
    IF to_char(v_start,'YYYY-MM-DD')<>p_campaign->>'start_date' OR
       to_char(v_end,'YYYY-MM-DD')<>p_campaign->>'end_date' OR
       v_end<v_start OR v_end>v_start+365 THEN
      RAISE EXCEPTION 'Invalid date range';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Campaign dates must be real and span at most 366 days';
  END;

  IF jsonb_typeof(p_campaign->'planned_budget') IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION 'Missing or invalid planned budget';
  END IF;
  v_budget:=(p_campaign->>'planned_budget')::numeric;
  IF v_budget<0 OR v_budget>1000000 OR round(v_budget,2)<>v_budget THEN
    RAISE EXCEPTION 'Planned budget must be between 0 and 1,000,000 EUR (2 decimals)';
  END IF;

  FOREACH v_key IN ARRAY ARRAY['actual_spend','impressions','clicks','inquiries','code_bookings'] LOOP
    IF (p_campaign->v_key) IS NULL OR jsonb_typeof(p_campaign->v_key)='null' THEN
      v_metrics:=v_metrics||jsonb_build_object(v_key,NULL);
    ELSE
      IF jsonb_typeof(p_campaign->v_key) IS DISTINCT FROM 'number' THEN
        RAISE EXCEPTION 'Invalid metric type: %',v_key;
      END IF;
      v_amount:=(p_campaign->>v_key)::numeric;
      IF v_key='actual_spend' THEN
        IF v_amount<0 OR v_amount>1000000 OR round(v_amount,2)<>v_amount THEN
          RAISE EXCEPTION 'Invalid actual_spend';
        END IF;
        v_metrics:=v_metrics||jsonb_build_object(v_key,v_amount);
      ELSE
        IF v_amount<0 OR v_amount>100000000 OR trunc(v_amount)<>v_amount THEN
          RAISE EXCEPTION 'Invalid count: %',v_key;
        END IF;
        v_metrics:=v_metrics||jsonb_build_object(v_key,v_amount::integer);
      END IF;
    END IF;
  END LOOP;
  v_spend:=(v_metrics->>'actual_spend')::numeric;
  v_impressions:=(v_metrics->>'impressions')::integer;
  v_clicks:=(v_metrics->>'clicks')::integer;
  v_inquiries:=(v_metrics->>'inquiries')::integer;
  v_bookings:=(v_metrics->>'code_bookings')::integer;
  IF coalesce(v_bookings,0)>0 AND v_tracking IS NULL THEN
    RAISE EXCEPTION 'Do not declare campaign-code bookings without a tracking code';
  END IF;

  IF nullif(p_campaign->>'id','') IS NULL THEN
    IF (p_campaign->>'expected_revision') IS NOT NULL THEN
      RAISE EXCEPTION 'Unexpected revision when creating a campaign';
    END IF;
    INSERT INTO public.analytics_growth_campaigns (
      name,channel,objective,target_service,status,start_date,end_date,
      planned_budget,actual_spend,impressions,clicks,inquiries,code_bookings,
      tracking_code,notes,created_by,updated_by
    ) VALUES(
      v_name,v_channel,v_objective,v_service,v_status,v_start,v_end,
      v_budget,v_spend,v_impressions,v_clicks,v_inquiries,v_bookings,
      v_tracking,v_notes,auth.uid(),auth.uid()
    ) RETURNING * INTO v_saved;
    INSERT INTO public.analytics_growth_audit(campaign_id,operation,before_value,after_value,changed_by)
      VALUES(v_saved.id,'insert',NULL,to_jsonb(v_saved),auth.uid());
  ELSE
    IF (p_campaign->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR
       (p_campaign->>'expected_revision') IS NULL OR
       (p_campaign->>'expected_revision') !~ '^[1-9][0-9]{0,8}$' THEN
      RAISE EXCEPTION 'Invalid ID or missing record revision';
    END IF;
    v_id:=(p_campaign->>'id')::uuid;
    v_expected:=(p_campaign->>'expected_revision')::integer;
    SELECT * INTO v_existing FROM public.analytics_growth_campaigns WHERE id=v_id FOR UPDATE;
    IF v_existing.id IS NULL THEN RAISE EXCEPTION 'Campaign no longer exists'; END IF;
    IF v_existing.revision<>v_expected THEN
      RAISE EXCEPTION 'Campaign was changed by another session. Reload before editing.';
    END IF;
    UPDATE public.analytics_growth_campaigns SET
      name=v_name,channel=v_channel,objective=v_objective,
      target_service=v_service,status=v_status,
      start_date=v_start,end_date=v_end,
      planned_budget=v_budget,actual_spend=v_spend,
      impressions=v_impressions,clicks=v_clicks,
      inquiries=v_inquiries,code_bookings=v_bookings,
      tracking_code=v_tracking,notes=v_notes,
      revision=revision+1,updated_by=auth.uid(),updated_at=now()
    WHERE id=v_id RETURNING * INTO v_saved;
    INSERT INTO public.analytics_growth_audit(campaign_id,operation,before_value,after_value,changed_by)
      VALUES(v_saved.id,'update',to_jsonb(v_existing),to_jsonb(v_saved),auth.uid());
  END IF;
  RETURN jsonb_build_object('ok',true,'campaign',to_jsonb(v_saved));
END;
$$;

REVOKE ALL ON FUNCTION public.analytics_growth_list(date,date)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.analytics_growth_save(jsonb)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_growth_list(date,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_growth_save(jsonb) TO authenticated;
COMMIT;
