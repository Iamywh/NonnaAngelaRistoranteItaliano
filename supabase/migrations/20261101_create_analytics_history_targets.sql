-- Nonna Angela Analytics — Historical monthly totals & monthly targets (Phase 5)
-- No reservation, daily entry, expense, or inventory data is changed.
BEGIN;

CREATE TABLE public.analytics_monthly_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 month_start date NOT NULL UNIQUE CHECK (extract(day FROM month_start) = 1),
 revenue_total numeric(12,2) NOT NULL CHECK (revenue_total >= 0),
 covers integer CHECK (covers IS NULL OR covers >= 0),
 tax_basis text NOT NULL CHECK (tax_basis IN ('gross','net')),
 data_quality text NOT NULL CHECK (data_quality IN ('verified','estimated')),
 source_note text NOT NULL CHECK (char_length(btrim(source_note)) BETWEEN 3 AND 500),
 notes text CHECK (notes IS NULL OR char_length(notes) <= 1500),
 created_by uuid NOT NULL REFERENCES auth.users(id),
 updated_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.analytics_monthly_targets (
 month_start date PRIMARY KEY CHECK (extract(day FROM month_start) = 1),
 revenue_target numeric(12,2) CHECK (revenue_target IS NULL OR revenue_target > 0),
 covers_target integer CHECK (covers_target IS NULL OR covers_target > 0),
 ticket_target numeric(12,2) CHECK (ticket_target IS NULL OR ticket_target > 0),
 expense_ceiling numeric(12,2) CHECK (expense_ceiling IS NULL OR expense_ceiling > 0),
 food_cost_ceiling_pct numeric(5,2) CHECK (food_cost_ceiling_pct IS NULL OR food_cost_ceiling_pct BETWEEN 0 AND 100),
 beverage_cost_ceiling_pct numeric(5,2) CHECK (beverage_cost_ceiling_pct IS NULL OR beverage_cost_ceiling_pct BETWEEN 0 AND 100),
 revenue_basis text NOT NULL CHECK (revenue_basis IN ('gross','net')),
 expense_basis text NOT NULL CHECK (expense_basis IN ('gross','net')),
 notes text CHECK (notes IS NULL OR char_length(notes) <= 1500),
 created_by uuid NOT NULL REFERENCES auth.users(id),
 updated_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (num_nonnulls(revenue_target,covers_target,ticket_target,expense_ceiling,food_cost_ceiling_pct,beverage_cost_ceiling_pct) > 0)
);

CREATE TABLE public.analytics_monthly_plan_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 entity_type text NOT NULL CHECK (entity_type IN ('history','target')),
 month_start date NOT NULL,
 action text NOT NULL CHECK (action IN ('insert','update')),
 before_value jsonb,
 after_value jsonb NOT NULL,
 changed_by uuid NOT NULL REFERENCES auth.users(id),
 changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX analytics_monthly_plan_audit_month_idx
 ON public.analytics_monthly_plan_audit(month_start, changed_at DESC);

ALTER TABLE public.analytics_monthly_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_monthly_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_monthly_plan_audit ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.analytics_monthly_history, public.analytics_monthly_targets,
 public.analytics_monthly_plan_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.analytics_monthly_history, public.analytics_monthly_targets,
 public.analytics_monthly_plan_audit TO authenticated;

CREATE POLICY analytics_monthly_history_read ON public.analytics_monthly_history
 FOR SELECT TO authenticated USING ((SELECT public.analytics_has_permission('analytics.read')));
CREATE POLICY analytics_monthly_targets_read ON public.analytics_monthly_targets
 FOR SELECT TO authenticated USING ((SELECT public.analytics_has_permission('analytics.read')));
CREATE POLICY analytics_monthly_plan_audit_read ON public.analytics_monthly_plan_audit
 FOR SELECT TO authenticated USING ((SELECT public.analytics_has_permission('analytics.read')));

-- Imports 1-60 months in one database transaction. Existing months are never
-- silently overwritten. Caller must explicitly select replace=true.
CREATE OR REPLACE FUNCTION public.analytics_import_monthly_history(
 p_rows jsonb, p_replace boolean DEFAULT false
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 v_row jsonb; v_month date; v_month_string text; v_revenue numeric; v_covers integer;
 v_basis text; v_quality text; v_source text; v_notes text; v_id uuid;
 v_before jsonb; v_after jsonb; v_count integer := 0;
BEGIN
 IF NOT public.analytics_has_permission('analytics.write') THEN RAISE EXCEPTION 'Access denied'; END IF;
 IF p_replace IS NULL OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR
   jsonb_array_length(p_rows) NOT BETWEEN 1 AND 60 THEN
   RAISE EXCEPTION 'Expected 1-60 rows and explicit replacement preference';
 END IF;
 IF (SELECT count(*) FROM (
    SELECT DISTINCT item->>'month' m FROM jsonb_array_elements(p_rows) item
 ) d) <> jsonb_array_length(p_rows) THEN
   RAISE EXCEPTION 'Duplicate months inside import';
 END IF;

 FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
   v_month_string := v_row->>'month';
   IF v_month_string IS NULL OR v_month_string !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
     RAISE EXCEPTION 'Invalid month format YYYY-MM: %', v_month_string;
   END IF;
   v_month := (v_month_string || '-01')::date;
   v_revenue := (v_row->>'revenue')::numeric;
   v_covers := NULLIF(v_row->>'covers','')::integer;
   v_basis := v_row->>'tax_basis';
   v_quality := v_row->>'data_quality';
   v_source := btrim(coalesce(v_row->>'source_note',''));
   v_notes := nullif(btrim(coalesce(v_row->>'notes','')),'');
   IF v_revenue IS NULL OR v_revenue < 0 OR v_revenue >= 10000000000
      OR v_revenue::text = 'NaN' OR round(v_revenue,2) <> v_revenue
      OR (v_covers IS NOT NULL AND v_covers < 0)
      OR v_basis IS NULL OR v_basis NOT IN ('gross','net')
      OR v_quality IS NULL OR v_quality NOT IN ('verified','estimated')
      OR char_length(v_source) NOT BETWEEN 3 AND 500
      OR char_length(v_notes) > 1500 THEN
     RAISE EXCEPTION 'Invalid historical record for %', v_month_string;
   END IF;

   SELECT to_jsonb(h) INTO v_before
     FROM public.analytics_monthly_history h WHERE h.month_start=v_month FOR UPDATE;
   IF v_before IS NOT NULL AND NOT p_replace THEN
     RAISE EXCEPTION 'Month % already exists: enable explicit replacement', v_month_string;
   END IF;
   INSERT INTO public.analytics_monthly_history
     (month_start,revenue_total,covers,tax_basis,data_quality,source_note,notes,created_by,updated_by)
   VALUES (v_month,v_revenue,v_covers,v_basis,v_quality,v_source,v_notes,auth.uid(),auth.uid())
   ON CONFLICT (month_start) DO UPDATE SET
     revenue_total=excluded.revenue_total,covers=excluded.covers,
     tax_basis=excluded.tax_basis,data_quality=excluded.data_quality,
     source_note=excluded.source_note,notes=excluded.notes,
     updated_by=auth.uid(),updated_at=now()
   RETURNING id INTO v_id;
   SELECT to_jsonb(h) INTO v_after FROM public.analytics_monthly_history h WHERE h.id=v_id;
   INSERT INTO public.analytics_monthly_plan_audit
     (entity_type,month_start,action,before_value,after_value,changed_by)
   VALUES ('history',v_month,CASE WHEN v_before IS NULL THEN 'insert' ELSE 'update' END,
           v_before,v_after,auth.uid());
   v_count := v_count + 1;
 END LOOP;
 RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.analytics_save_monthly_target(
 p_month_start date,
 p_revenue_target numeric, p_covers_target integer, p_ticket_target numeric,
 p_expense_ceiling numeric, p_food_cost_ceiling_pct numeric,
 p_beverage_cost_ceiling_pct numeric, p_revenue_basis text, p_expense_basis text,
 p_notes text DEFAULT NULL
) RETURNS date LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 v_old jsonb; v_new jsonb;
BEGIN
 IF NOT public.analytics_has_permission('analytics.write') THEN RAISE EXCEPTION 'Access denied'; END IF;
 IF p_month_start IS NULL OR extract(day FROM p_month_start) <> 1 OR
    p_revenue_basis IS NULL OR p_revenue_basis NOT IN ('gross','net') OR
    p_expense_basis IS NULL OR p_expense_basis NOT IN ('gross','net') OR
    num_nonnulls(p_revenue_target,p_covers_target,p_ticket_target,
      p_expense_ceiling,p_food_cost_ceiling_pct,p_beverage_cost_ceiling_pct)=0 OR
    (p_revenue_target IS NOT NULL AND
     (p_revenue_target <= 0 OR p_revenue_target >= 10000000000 OR round(p_revenue_target,2) <> p_revenue_target)) OR
    (p_covers_target IS NOT NULL AND p_covers_target <= 0) OR
    (p_ticket_target IS NOT NULL AND
     (p_ticket_target <= 0 OR p_ticket_target >= 10000000000 OR round(p_ticket_target,2) <> p_ticket_target)) OR
    (p_expense_ceiling IS NOT NULL AND
     (p_expense_ceiling <= 0 OR p_expense_ceiling >= 10000000000 OR round(p_expense_ceiling,2) <> p_expense_ceiling)) OR
    (p_food_cost_ceiling_pct IS NOT NULL AND
     (p_food_cost_ceiling_pct < 0 OR p_food_cost_ceiling_pct > 100 OR round(p_food_cost_ceiling_pct,2) <> p_food_cost_ceiling_pct)) OR
    (p_beverage_cost_ceiling_pct IS NOT NULL AND
     (p_beverage_cost_ceiling_pct < 0 OR p_beverage_cost_ceiling_pct > 100 OR round(p_beverage_cost_ceiling_pct,2) <> p_beverage_cost_ceiling_pct)) OR
    char_length(p_notes) > 1500 THEN
   RAISE EXCEPTION 'Invalid monthly target';
 END IF;
 SELECT to_jsonb(t) INTO v_old FROM public.analytics_monthly_targets t
 WHERE t.month_start=p_month_start FOR UPDATE;

 INSERT INTO public.analytics_monthly_targets
  (month_start,revenue_target,covers_target,ticket_target,expense_ceiling,
   food_cost_ceiling_pct,beverage_cost_ceiling_pct,revenue_basis,expense_basis,
   notes,created_by,updated_by)
 VALUES
  (p_month_start,p_revenue_target,p_covers_target,p_ticket_target,p_expense_ceiling,
   p_food_cost_ceiling_pct,p_beverage_cost_ceiling_pct,p_revenue_basis,p_expense_basis,
   nullif(btrim(p_notes),''),auth.uid(),auth.uid())
 ON CONFLICT (month_start) DO UPDATE SET
  revenue_target=excluded.revenue_target,covers_target=excluded.covers_target,
  ticket_target=excluded.ticket_target,expense_ceiling=excluded.expense_ceiling,
  food_cost_ceiling_pct=excluded.food_cost_ceiling_pct,
  beverage_cost_ceiling_pct=excluded.beverage_cost_ceiling_pct,
  revenue_basis=excluded.revenue_basis,expense_basis=excluded.expense_basis,
  notes=excluded.notes,updated_by=auth.uid(),updated_at=now();

 SELECT to_jsonb(t) INTO v_new FROM public.analytics_monthly_targets t
 WHERE t.month_start=p_month_start;
 INSERT INTO public.analytics_monthly_plan_audit
  (entity_type,month_start,action,before_value,after_value,changed_by)
 VALUES ('target',p_month_start,CASE WHEN v_old IS NULL THEN 'insert' ELSE 'update' END,
         v_old,v_new,auth.uid());
 RETURN p_month_start;
END;
$$;

REVOKE ALL ON FUNCTION public.analytics_import_monthly_history(jsonb,boolean) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.analytics_save_monthly_target(date,numeric,integer,numeric,numeric,numeric,numeric,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.analytics_import_monthly_history(jsonb,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_save_monthly_target(date,numeric,integer,numeric,numeric,numeric,numeric,text,text,text) TO authenticated;
COMMIT;
