-- Phase 7: private break-even assumptions only. Never changes bookings or financial ledger.
-- ALL money is NET of IGIC. Results are a simulation, not accounting profit.
BEGIN;

CREATE TABLE public.analytics_break_even_plans (
  month_start date PRIMARY KEY CHECK (extract(day FROM month_start) = 1),
  open_days integer NOT NULL CHECK (open_days BETWEEN 1 AND 31),
  lunch_days integer NOT NULL CHECK (lunch_days BETWEEN 0 AND open_days),
  dinner_days integer NOT NULL CHECK (dinner_days BETWEEN 0 AND open_days),
  ticket_net numeric(12,2) NOT NULL CHECK (ticket_net > 0 AND ticket_net <= 10000),
  fixed_monthly_net numeric(12,2) NOT NULL CHECK (fixed_monthly_net BETWEEN 0 AND 10000000),
  variable_pct numeric(5,2) NOT NULL CHECK (variable_pct BETWEEN 0 AND 100),
  planned_covers integer NOT NULL CHECK (planned_covers BETWEEN 0 AND 1000000),
  lunch_share_pct integer NOT NULL CHECK (lunch_share_pct BETWEEN 0 AND 100),
  lunch_capacity integer CHECK (lunch_capacity IS NULL OR lunch_capacity BETWEEN 1 AND 1000),
  dinner_capacity integer CHECK (dinner_capacity IS NULL OR dinner_capacity BETWEEN 1 AND 1000),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 2000),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  updated_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (lunch_days + dinner_days > 0),
  CHECK ((lunch_days > 0 OR lunch_share_pct = 0) AND
    (dinner_days > 0 OR lunch_share_pct = 100))
);

CREATE TABLE public.analytics_break_even_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  month_start date NOT NULL,
  action text NOT NULL CHECK (action IN ('insert','update')),
  before_value jsonb,
  after_value jsonb NOT NULL,
  changed_by uuid NOT NULL REFERENCES auth.users(id),
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX analytics_break_even_audit_month_idx ON public.analytics_break_even_audit(month_start,changed_at DESC);
ALTER TABLE public.analytics_break_even_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_break_even_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.analytics_break_even_plans, public.analytics_break_even_audit
  FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.analytics_break_even_plans, public.analytics_break_even_audit TO authenticated;

CREATE POLICY analytics_break_even_read ON public.analytics_break_even_plans
  FOR SELECT TO authenticated USING ((SELECT public.analytics_has_permission('analytics.read')));
CREATE POLICY analytics_break_even_audit_read ON public.analytics_break_even_audit
  FOR SELECT TO authenticated USING ((SELECT public.analytics_has_permission('analytics.read')));

CREATE OR REPLACE FUNCTION public.analytics_save_break_even_plan(
  p_month_start date, p_open_days integer, p_lunch_days integer, p_dinner_days integer,
  p_ticket_net numeric, p_fixed_monthly_net numeric, p_variable_pct numeric,
  p_planned_covers integer, p_lunch_share_pct integer,
  p_lunch_capacity integer, p_dinner_capacity integer, p_notes text DEFAULT NULL
)
RETURNS date LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_before jsonb; v_after jsonb;
BEGIN
  IF NOT public.analytics_has_permission('analytics.write') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  IF p_month_start IS NULL OR extract(day FROM p_month_start) <> 1
    OR p_open_days IS NULL OR p_open_days NOT BETWEEN 1 AND 31
    OR p_lunch_days IS NULL OR p_lunch_days NOT BETWEEN 0 AND p_open_days
    OR p_dinner_days IS NULL OR p_dinner_days NOT BETWEEN 0 AND p_open_days
    OR p_lunch_days + p_dinner_days = 0
    OR p_ticket_net IS NULL OR p_ticket_net <= 0 OR p_ticket_net > 10000
      OR round(p_ticket_net,2) <> p_ticket_net
    OR p_fixed_monthly_net IS NULL OR p_fixed_monthly_net < 0
      OR p_fixed_monthly_net > 10000000 OR round(p_fixed_monthly_net,2) <> p_fixed_monthly_net
    OR p_variable_pct IS NULL OR p_variable_pct NOT BETWEEN 0 AND 100
      OR round(p_variable_pct,2) <> p_variable_pct
    OR p_planned_covers IS NULL OR p_planned_covers NOT BETWEEN 0 AND 1000000
    OR p_lunch_share_pct IS NULL OR p_lunch_share_pct NOT BETWEEN 0 AND 100
    OR (p_lunch_days = 0 AND p_lunch_share_pct <> 0)
    OR (p_dinner_days = 0 AND p_lunch_share_pct <> 100)
    OR (p_lunch_capacity IS NOT NULL AND p_lunch_capacity NOT BETWEEN 1 AND 1000)
    OR (p_dinner_capacity IS NOT NULL AND p_dinner_capacity NOT BETWEEN 1 AND 1000)
    OR char_length(p_notes) > 2000
  THEN
    RAISE EXCEPTION 'Invalid break-even assumptions';
  END IF;
  SELECT to_jsonb(b) INTO v_before FROM public.analytics_break_even_plans b
   WHERE b.month_start=p_month_start FOR UPDATE;
  INSERT INTO public.analytics_break_even_plans
    (month_start,open_days,lunch_days,dinner_days,ticket_net,fixed_monthly_net,
     variable_pct,planned_covers,lunch_share_pct,lunch_capacity,dinner_capacity,
     notes,created_by,updated_by)
  VALUES (p_month_start,p_open_days,p_lunch_days,p_dinner_days,p_ticket_net,
    p_fixed_monthly_net,p_variable_pct,p_planned_covers,p_lunch_share_pct,
    p_lunch_capacity,p_dinner_capacity,nullif(btrim(p_notes),''),auth.uid(),auth.uid())
  ON CONFLICT (month_start) DO UPDATE SET
    open_days=excluded.open_days,lunch_days=excluded.lunch_days,
    dinner_days=excluded.dinner_days,ticket_net=excluded.ticket_net,
    fixed_monthly_net=excluded.fixed_monthly_net,variable_pct=excluded.variable_pct,
    planned_covers=excluded.planned_covers,lunch_share_pct=excluded.lunch_share_pct,
    lunch_capacity=excluded.lunch_capacity,dinner_capacity=excluded.dinner_capacity,
    notes=excluded.notes,updated_by=auth.uid(),updated_at=now();

  SELECT to_jsonb(b) INTO v_after FROM public.analytics_break_even_plans b
    WHERE b.month_start=p_month_start;
  INSERT INTO public.analytics_break_even_audit
    (month_start,action,before_value,after_value,changed_by)
  VALUES (p_month_start,CASE WHEN v_before IS NULL THEN 'insert' ELSE 'update' END,
    v_before,v_after,auth.uid());
  RETURN p_month_start;
END;
$$;
REVOKE ALL ON FUNCTION public.analytics_save_break_even_plan(
  date,integer,integer,integer,numeric,numeric,numeric,integer,integer,integer,integer,text
) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.analytics_save_break_even_plan(
  date,integer,integer,integer,numeric,numeric,numeric,integer,integer,integer,integer,text
) TO authenticated;
COMMIT;
