-- Phase 12B/2: atomic, preview-first imports of NEW daily ledger / expense totals.
-- No UPSERT, no overwrite of existing/finalized days, no month-close bypass.
-- CSV/XLSX parsing happens in the browser; the database revalidates all amounts.
BEGIN;

CREATE TABLE public.analytics_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_kind text NOT NULL CHECK(import_kind IN ('daily','expenses')),
  row_count integer NOT NULL CHECK(row_count BETWEEN 1 AND 60),
  imported_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.analytics_import_rows (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  batch_id uuid NOT NULL REFERENCES public.analytics_import_batches(id),
  record_key text NOT NULL,
  record_id uuid NOT NULL,
  snapshot jsonb NOT NULL,
  UNIQUE(batch_id,record_key)
);
CREATE INDEX analytics_import_rows_record_idx ON public.analytics_import_rows(record_key);

ALTER TABLE public.analytics_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_import_rows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.analytics_import_batches,public.analytics_import_rows
 FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.analytics_import_batches,public.analytics_import_rows TO authenticated;
CREATE POLICY analytics_import_batches_read ON public.analytics_import_batches
 FOR SELECT TO authenticated USING ((SELECT public.analytics_has_permission('analytics.read')));
CREATE POLICY analytics_import_rows_read ON public.analytics_import_rows
 FOR SELECT TO authenticated USING ((SELECT public.analytics_has_permission('analytics.read')));

CREATE FUNCTION public.analytics_import_register_batch(
  p_kind text,p_rows jsonb,p_preview boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE
  v_row jsonb; v_service jsonb; v_services jsonb;
  v_idx integer:=0; v_count integer; v_count_ready integer:=0;
  v_seen text[]:='{}'; v_key text; v_note text;
  v_date date; v_today date:=(now() AT TIME ZONE 'Atlantic/Canary')::date;
  v_month date; v_status text; v_exists boolean; v_closed boolean;
  v_results jsonb:='[]'::jsonb; v_id uuid; v_batch_id uuid;
  v_kind text; v_category text; v_basis text; v_status_service text;
  v_amount numeric; v_igic numeric; v_food numeric; v_beverage numeric; v_covers numeric;
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated'
    OR NOT public.analytics_has_permission('analytics.write') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('daily','expenses')
    OR p_preview IS NULL OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid import request';
  END IF;
  v_count:=jsonb_array_length(p_rows);
  IF v_count NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'Import supports between 1 and 60 rows';
  END IF;

  IF NOT p_preview THEN
    INSERT INTO public.analytics_import_batches(import_kind,row_count,imported_by)
    VALUES(p_kind,v_count,auth.uid()) RETURNING id INTO v_batch_id;
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    v_idx:=v_idx+1;
    IF jsonb_typeof(v_row) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Row %: expected object',v_idx;
    END IF;
    v_note:=coalesce(v_row->>'notes','');
    IF char_length(v_note)>2000 THEN RAISE EXCEPTION 'Row %: note too long',v_idx; END IF;
    IF v_row->>'date' IS NULL OR v_row->>'date' !~ '^([0-9]{4})-(0[1-9]|1[0-2])-([0-2][0-9]|3[01])$' THEN
      RAISE EXCEPTION 'Row %: date must be ISO YYYY-MM-DD',v_idx;
    END IF;
    BEGIN
      v_date:=to_date(v_row->>'date','YYYY-MM-DD');
      IF to_char(v_date,'YYYY-MM-DD')<>v_row->>'date' THEN
        RAISE EXCEPTION 'Nonexistent ISO date';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Row %: invalid date',v_idx;
    END;
    IF v_date>v_today THEN RAISE EXCEPTION 'Row %: future date',v_idx; END IF;
    v_month:=date_trunc('month',v_date)::date;

    IF p_kind='daily' THEN
      v_key:=v_date::text;
      FOR v_kind IN SELECT unnest(ARRAY['lunch','dinner']) LOOP
        v_service:=v_row->v_kind;
        IF jsonb_typeof(v_service) IS DISTINCT FROM 'object' OR
          (v_service->>'status') IS NULL OR v_service->>'status' NOT IN ('open','closed') OR
          (v_service->>'basis') IS NULL OR v_service->>'basis' NOT IN ('gross','net') OR
          jsonb_typeof(v_service->'covers') IS DISTINCT FROM 'number' OR
          jsonb_typeof(v_service->'food') IS DISTINCT FROM 'number' OR
          jsonb_typeof(v_service->'beverage') IS DISTINCT FROM 'number' THEN
          RAISE EXCEPTION 'Row %: invalid service %',v_idx,v_kind;
        END IF;
        v_covers:=(v_service->>'covers')::numeric;
        v_food:=(v_service->>'food')::numeric;
        v_beverage:=(v_service->>'beverage')::numeric;
        IF v_covers<0 OR v_covers>99999 OR trunc(v_covers)<>v_covers OR
          v_food<0 OR v_food>999999999.99 OR round(v_food,2)<>v_food OR
          v_beverage<0 OR v_beverage>999999999.99 OR round(v_beverage,2)<>v_beverage THEN
          RAISE EXCEPTION 'Row %: invalid amounts/covers for %',v_idx,v_kind;
        END IF;
        IF v_service->>'status'='closed' AND (v_covers<>0 OR v_food<>0 OR v_beverage<>0) THEN
          RAISE EXCEPTION 'Row %: closed service must have zero figures',v_idx;
        END IF;
      END LOOP;
      SELECT EXISTS(SELECT 1 FROM public.analytics_daily_entries
        WHERE business_date=v_date) INTO v_exists;
    ELSE
      v_kind:=v_row->>'kind';
      v_category:=v_row->>'category';
      v_basis:=v_row->>'basis';
      IF v_kind IS NULL OR v_kind NOT IN ('daily','monthly') OR
        v_category IS NULL OR v_category NOT IN
          ('food_purchases','beverage_purchases','payroll','rent',
           'utilities','marketing','cleaning_supplies','packaging',
           'maintenance','professional_services','bank_fees','other') OR
        v_basis IS NULL OR v_basis NOT IN ('gross','net') OR
        jsonb_typeof(v_row->'amount') IS DISTINCT FROM 'number' OR
        (v_kind='monthly' AND extract(day FROM v_date)<>1) THEN
        RAISE EXCEPTION 'Row %: invalid expense fields',v_idx;
      END IF;
      v_amount:=(v_row->>'amount')::numeric;
      IF v_amount<=0 OR v_amount>999999999.99 OR round(v_amount,2)<>v_amount THEN
        RAISE EXCEPTION 'Row %: invalid expense amount',v_idx;
      END IF;
      IF (v_row->>'igic') IS NOT NULL THEN
        IF jsonb_typeof(v_row->'igic') IS DISTINCT FROM 'number' THEN
          RAISE EXCEPTION 'Row %: invalid IGIC',v_idx;
        END IF;
        v_igic:=(v_row->>'igic')::numeric;
        IF v_igic<0 OR v_igic>999999999.99 OR round(v_igic,2)<>v_igic OR
          (v_basis='gross' AND v_igic>v_amount) THEN
          RAISE EXCEPTION 'Row %: invalid known IGIC',v_idx;
        END IF;
      ELSE
        v_igic:=NULL;
      END IF;
      v_key:=v_kind||'|'||v_date::text||'|'||v_category;
      SELECT EXISTS(SELECT 1 FROM public.analytics_expenses
        WHERE period_kind=v_kind AND period_date=v_date AND category=v_category)
        INTO v_exists;
    END IF;

    IF v_key=ANY(v_seen) THEN RAISE EXCEPTION 'Row %: duplicate key %',v_idx,v_key; END IF;
    v_seen:=array_append(v_seen,v_key);

    -- The same lock is used by month-close finalization.
    IF NOT p_preview THEN
      PERFORM pg_advisory_xact_lock(hashtext('nonna_month_close'),hashtext(v_month::text));
      -- Re-evaluate existing rows in the same transaction before inserting.
      IF p_kind='daily' THEN
        SELECT EXISTS(SELECT 1 FROM public.analytics_daily_entries
          WHERE business_date=v_date) INTO v_exists;
      ELSE
        SELECT EXISTS(SELECT 1 FROM public.analytics_expenses
          WHERE period_kind=v_kind AND period_date=v_date AND category=v_category) INTO v_exists;
      END IF;
    END IF;
    SELECT EXISTS(SELECT 1 FROM public.analytics_monthly_closures
      WHERE month_start=v_month) INTO v_closed;
    v_status:=CASE WHEN v_closed THEN 'closed_month'
      WHEN v_exists THEN 'exists' ELSE 'ready' END;
    v_results:=v_results||jsonb_build_array(
      jsonb_build_object('line',v_idx+1,'key',v_key,'status',v_status));
    IF v_status='ready' THEN v_count_ready:=v_count_ready+1; END IF;

    IF NOT p_preview THEN
      IF v_status<>'ready' THEN
        RAISE EXCEPTION 'Import cancelled at row % (%): %',v_idx,v_key,v_status;
      END IF;
      IF p_kind='daily' THEN
        INSERT INTO public.analytics_daily_entries
          (business_date,lunch_status,dinner_status,notes,status,created_by,updated_by)
        VALUES (v_date,v_row->'lunch'->>'status',v_row->'dinner'->>'status',
          nullif(btrim(v_note),''),'draft',auth.uid(),auth.uid())
        RETURNING id INTO v_id;
        FOR v_kind IN SELECT unnest(ARRAY['lunch','dinner']) LOOP
          v_service:=v_row->v_kind;
          INSERT INTO public.analytics_service_entries
            (daily_entry_id,service_type,covers,food_revenue_amount,
             beverage_revenue_amount,tax_basis,tax_details)
          VALUES(v_id,v_kind,(v_service->>'covers')::integer,
             (v_service->>'food')::numeric,(v_service->>'beverage')::numeric,
             v_service->>'basis',CASE WHEN v_service->>'status'='closed'
              THEN '{"status":"not_applicable"}'::jsonb
              ELSE '{"status":"unverified"}'::jsonb END);
        END LOOP;
      ELSE
        INSERT INTO public.analytics_expenses
          (period_kind,period_date,category,amount,tax_basis,igic_amount,
           notes,created_by,updated_by)
        VALUES(v_kind,v_date,v_category,v_amount,v_basis,v_igic,
          nullif(btrim(v_note),''),auth.uid(),auth.uid())
        RETURNING id INTO v_id;
        INSERT INTO public.analytics_expense_audit
          (expense_id,operation,before_value,after_value,changed_by)
        VALUES(v_id,'insert',NULL,
          (SELECT to_jsonb(e) FROM public.analytics_expenses e WHERE e.id=v_id),auth.uid());
      END IF;
      INSERT INTO public.analytics_import_rows(batch_id,record_key,record_id,snapshot)
      VALUES(v_batch_id,v_key,v_id,v_row);
    END IF;
  END LOOP;
  RETURN jsonb_build_object(
    'ok',true,'preview',p_preview,'row_count',v_count,
    'ready_count',v_count_ready,'entries',v_results,'batch_id',v_batch_id);
END;
$$;
REVOKE ALL ON FUNCTION public.analytics_import_register_batch(text,jsonb,boolean)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_import_register_batch(text,jsonb,boolean)
 TO authenticated;
COMMIT;
