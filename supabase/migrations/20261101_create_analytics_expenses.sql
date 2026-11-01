-- Analytics Gastos v1. Independent of reservations and daily revenue.
-- Apply to the correct Nonna Angela Supabase project BEFORE merging frontend.
-- Expense amounts are as-entered; tax conversions and COGS are NOT inferred.
BEGIN;

CREATE TABLE IF NOT EXISTS public.analytics_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_kind text NOT NULL CHECK (period_kind IN ('daily', 'monthly')),
  period_date date NOT NULL,
  category text NOT NULL CHECK (category IN (
    'food_purchases', 'beverage_purchases', 'payroll', 'rent',
    'utilities', 'marketing', 'cleaning_supplies', 'packaging',
    'maintenance', 'professional_services', 'bank_fees', 'other'
  )),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  tax_basis text NOT NULL CHECK (tax_basis IN ('gross', 'net')),
  igic_amount numeric(12,2) CHECK (igic_amount IS NULL OR igic_amount >= 0),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 2000),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  updated_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT analytics_expenses_month_start CHECK (
    period_kind <> 'monthly' OR extract(day FROM period_date) = 1
  ),
  CONSTRAINT analytics_expenses_unique_period_category UNIQUE (period_kind, period_date, category),
  CONSTRAINT analytics_expenses_igic_bounds CHECK (
    igic_amount IS NULL OR tax_basis = 'net' OR igic_amount <= amount
  )
);
CREATE INDEX IF NOT EXISTS analytics_expenses_period_idx
  ON public.analytics_expenses(period_kind, period_date);

CREATE TABLE IF NOT EXISTS public.analytics_expense_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  expense_id uuid NOT NULL,
  operation text NOT NULL CHECK (operation IN ('insert', 'update', 'delete')),
  before_value jsonb,
  after_value jsonb,
  changed_by uuid NOT NULL REFERENCES auth.users(id),
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS analytics_expense_audit_expense_idx
  ON public.analytics_expense_audit(expense_id, changed_at DESC);

ALTER TABLE public.analytics_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_expense_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.analytics_expenses, public.analytics_expense_audit
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.analytics_expenses, public.analytics_expense_audit TO authenticated;

DROP POLICY IF EXISTS analytics_expenses_read ON public.analytics_expenses;
CREATE POLICY analytics_expenses_read ON public.analytics_expenses
FOR SELECT TO authenticated
USING ((SELECT public.analytics_has_permission('analytics.read')));

DROP POLICY IF EXISTS analytics_expense_audit_read ON public.analytics_expense_audit;
CREATE POLICY analytics_expense_audit_read ON public.analytics_expense_audit
FOR SELECT TO authenticated
USING ((SELECT public.analytics_has_permission('analytics.read')));

-- All writes flow through audited SECURITY DEFINER functions only.
-- Direct INSERT/UPDATE/DELETE remains revoked from authenticated clients.
CREATE OR REPLACE FUNCTION public.analytics_upsert_expense(
  p_period_kind text,
  p_period_date date,
  p_category text,
  p_amount numeric,
  p_tax_basis text,
  p_igic_amount numeric DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old jsonb;
  v_new jsonb;
  v_id uuid;
BEGIN
  IF NOT public.analytics_has_permission('analytics.write') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  IF p_period_kind IS NULL OR p_period_kind NOT IN ('daily','monthly')
    OR p_period_date IS NULL OR p_category IS NULL
    OR p_category NOT IN (
      'food_purchases', 'beverage_purchases', 'payroll', 'rent',
      'utilities', 'marketing', 'cleaning_supplies', 'packaging',
      'maintenance', 'professional_services', 'bank_fees', 'other'
    )
    OR p_amount IS NULL OR p_amount <= 0
    OR round(p_amount, 2) <> p_amount
    OR p_tax_basis IS NULL OR p_tax_basis NOT IN ('gross','net')
    OR (p_igic_amount IS NOT NULL AND (
      p_igic_amount < 0 OR round(p_igic_amount,2) <> p_igic_amount
      OR (p_tax_basis = 'gross' AND p_igic_amount > p_amount)
    ))
    OR (p_notes IS NOT NULL AND char_length(p_notes) > 2000)
    OR (p_period_kind = 'monthly' AND extract(day FROM p_period_date) <> 1)
  THEN
    RAISE EXCEPTION 'Invalid expense values';
  END IF;

  SELECT to_jsonb(e) INTO v_old FROM public.analytics_expenses e
  WHERE e.period_kind = p_period_kind
    AND e.period_date = p_period_date
    AND e.category = p_category
  FOR UPDATE;

  INSERT INTO public.analytics_expenses (
    period_kind, period_date, category, amount, tax_basis, igic_amount,
    notes, created_by, updated_by
  ) VALUES (
    p_period_kind, p_period_date, p_category, p_amount, p_tax_basis,
    p_igic_amount, nullif(btrim(p_notes),''),
    auth.uid(), auth.uid()
  )
  ON CONFLICT (period_kind, period_date, category) DO UPDATE SET
    amount = EXCLUDED.amount,
    tax_basis = EXCLUDED.tax_basis,
    igic_amount = EXCLUDED.igic_amount,
    notes = EXCLUDED.notes,
    updated_by = auth.uid(),
    updated_at = now()
  RETURNING id INTO v_id;

  SELECT to_jsonb(e) INTO v_new FROM public.analytics_expenses e WHERE e.id = v_id;
  INSERT INTO public.analytics_expense_audit (
    expense_id, operation, before_value, after_value, changed_by
  ) VALUES (v_id, CASE WHEN v_old IS NULL THEN 'insert' ELSE 'update' END,
            v_old, v_new, auth.uid());
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.analytics_delete_expense(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old jsonb;
BEGIN
  IF NOT public.analytics_has_permission('analytics.write') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  SELECT to_jsonb(e) INTO v_old FROM public.analytics_expenses e
  WHERE e.id = p_id FOR UPDATE;
  IF v_old IS NULL THEN
    RETURN false;
  END IF;
  DELETE FROM public.analytics_expenses WHERE id = p_id;
  INSERT INTO public.analytics_expense_audit (
    expense_id, operation, before_value, after_value, changed_by
  ) VALUES (p_id, 'delete', v_old, NULL, auth.uid());
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.analytics_upsert_expense(text,date,text,numeric,text,numeric,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.analytics_delete_expense(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.analytics_upsert_expense(text,date,text,numeric,text,numeric,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_delete_expense(uuid) TO authenticated;

COMMIT;
