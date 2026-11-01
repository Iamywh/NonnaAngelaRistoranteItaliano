-- Analytics Forecasting (Phase 6). Stores assumptions, NEVER projected output or ledger mutations.
BEGIN;
CREATE TABLE public.analytics_forecast_plans (
  forecast_start date PRIMARY KEY CHECK (extract(day FROM forecast_start) = 1),
  tax_basis text NOT NULL CHECK (tax_basis IN ('gross','net')),
  baseline_mode text NOT NULL CHECK (baseline_mode IN ('history','manual')),
  manual_covers integer CHECK (manual_covers IS NULL OR (manual_covers > 0 AND manual_covers <= 1000000)),
  manual_ticket numeric(12,2) CHECK (manual_ticket IS NULL OR (manual_ticket > 0 AND manual_ticket < 1000000)),
  monthly_capacity integer CHECK (monthly_capacity IS NULL OR (monthly_capacity > 0 AND monthly_capacity <= 1000000)),
  scenarios jsonb NOT NULL,
  notes text CHECK (notes IS NULL OR char_length(notes) <= 2000),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  updated_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (baseline_mode <> 'manual' OR (manual_covers IS NOT NULL AND manual_ticket IS NOT NULL)),
  CHECK (monthly_capacity IS NULL OR manual_covers IS NULL OR monthly_capacity >= manual_covers)
);
CREATE TABLE public.analytics_forecast_plan_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  forecast_start date NOT NULL,
  operation text NOT NULL CHECK (operation IN ('insert','update')),
  before_value jsonb,
  after_value jsonb NOT NULL,
  changed_by uuid NOT NULL REFERENCES auth.users(id),
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX analytics_forecast_audit_start_idx ON public.analytics_forecast_plan_audit(forecast_start,changed_at DESC);

ALTER TABLE public.analytics_forecast_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_forecast_plan_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.analytics_forecast_plans, public.analytics_forecast_plan_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.analytics_forecast_plans, public.analytics_forecast_plan_audit TO authenticated;
CREATE POLICY analytics_forecast_read ON public.analytics_forecast_plans
  FOR SELECT TO authenticated USING ((SELECT public.analytics_has_permission('analytics.read')));
CREATE POLICY analytics_forecast_audit_read ON public.analytics_forecast_plan_audit
  FOR SELECT TO authenticated USING ((SELECT public.analytics_has_permission('analytics.read')));

CREATE OR REPLACE FUNCTION public.analytics_save_forecast_plan(
  p_forecast_start date,
  p_tax_basis text,
  p_baseline_mode text,
  p_manual_covers integer,
  p_manual_ticket numeric,
  p_monthly_capacity integer,
  p_scenarios jsonb,
  p_notes text DEFAULT NULL
) RETURNS date
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_scenario text; v_assumptions jsonb; v_rate numeric;
  v_old jsonb; v_new jsonb;
BEGIN
  IF NOT public.analytics_has_permission('analytics.write') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  IF p_forecast_start IS NULL OR extract(day FROM p_forecast_start) <> 1 OR
    p_tax_basis IS NULL OR p_tax_basis NOT IN ('gross','net') OR
    p_baseline_mode IS NULL OR p_baseline_mode NOT IN ('history','manual') OR
    (p_baseline_mode = 'manual' AND (p_manual_covers IS NULL OR p_manual_ticket IS NULL)) OR
    (p_manual_covers IS NOT NULL AND (p_manual_covers <= 0 OR p_manual_covers > 1000000)) OR
    (p_manual_ticket IS NOT NULL AND (p_manual_ticket <= 0 OR
      p_manual_ticket >= 1000000 OR round(p_manual_ticket,2) <> p_manual_ticket)) OR
    (p_monthly_capacity IS NOT NULL AND (p_monthly_capacity <= 0 OR p_monthly_capacity > 1000000 OR
      (p_manual_covers IS NOT NULL AND p_monthly_capacity < p_manual_covers))) OR
    char_length(p_notes) > 2000 OR
    jsonb_typeof(p_scenarios) IS DISTINCT FROM 'object' OR
    (SELECT count(*) FROM jsonb_object_keys(p_scenarios)) <> 3 OR
    NOT (p_scenarios ?& ARRAY['conservative','base','optimistic']) THEN
    RAISE EXCEPTION 'Invalid forecast assumptions';
  END IF;
  FOREACH v_scenario IN ARRAY ARRAY['conservative','base','optimistic'] LOOP
    v_assumptions := p_scenarios->v_scenario;
    IF jsonb_typeof(v_assumptions) IS DISTINCT FROM 'object' OR
      (SELECT count(*) FROM jsonb_object_keys(v_assumptions)) <> 2 OR
      NOT (v_assumptions ?& ARRAY['covers_growth_pct','ticket_growth_pct']) OR
      jsonb_typeof(v_assumptions->'covers_growth_pct') IS DISTINCT FROM 'number' OR
      jsonb_typeof(v_assumptions->'ticket_growth_pct') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'Invalid scenario: %',v_scenario;
    END IF;
    FOR v_rate IN SELECT (v_assumptions->>'covers_growth_pct')::numeric
      UNION ALL SELECT (v_assumptions->>'ticket_growth_pct')::numeric LOOP
      IF v_rate < -20 OR v_rate > 20 OR round(v_rate,2) <> v_rate THEN
        RAISE EXCEPTION 'Monthly growth outside allowed range';
      END IF;
    END LOOP;
  END LOOP;

  SELECT to_jsonb(p) INTO v_old FROM public.analytics_forecast_plans p
    WHERE p.forecast_start=p_forecast_start FOR UPDATE;

  INSERT INTO public.analytics_forecast_plans
    (forecast_start,tax_basis,baseline_mode,manual_covers,manual_ticket,
     monthly_capacity,scenarios,notes,created_by,updated_by)
  VALUES (p_forecast_start,p_tax_basis,p_baseline_mode,
    CASE WHEN p_baseline_mode='manual' THEN p_manual_covers ELSE NULL END,
    CASE WHEN p_baseline_mode='manual' THEN p_manual_ticket ELSE NULL END,
    p_monthly_capacity,p_scenarios,nullif(btrim(p_notes),''),
    auth.uid(),auth.uid())
  ON CONFLICT (forecast_start) DO UPDATE SET
    tax_basis=excluded.tax_basis,
    baseline_mode=excluded.baseline_mode,
    manual_covers=excluded.manual_covers,
    manual_ticket=excluded.manual_ticket,
    monthly_capacity=excluded.monthly_capacity,
    scenarios=excluded.scenarios,
    notes=excluded.notes,
    updated_by=auth.uid(),updated_at=now();
  SELECT to_jsonb(p) INTO v_new FROM public.analytics_forecast_plans p
    WHERE p.forecast_start=p_forecast_start;
  INSERT INTO public.analytics_forecast_plan_audit
    (forecast_start,operation,before_value,after_value,changed_by)
  VALUES (p_forecast_start,CASE WHEN v_old IS NULL THEN 'insert' ELSE 'update' END,
    v_old,v_new,auth.uid());
  RETURN p_forecast_start;
END;
$$;
REVOKE ALL ON FUNCTION public.analytics_save_forecast_plan(date,text,text,integer,numeric,integer,jsonb,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.analytics_save_forecast_plan(date,text,text,integer,numeric,integer,jsonb,text)
  TO authenticated;
COMMIT;
