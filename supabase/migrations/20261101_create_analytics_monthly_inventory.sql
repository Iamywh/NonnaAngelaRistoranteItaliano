-- Analytics monthly stock value ledger. Never alters reservations, daily sales or expenses.
-- Opening/closing stock are manually valued; signed external adjustment means
-- net stock movements outside purchases and consumption (e.g. transfer in/out).
-- Stock loss/waste already reflected in closing stock MUST NOT be added again.
BEGIN;

CREATE TABLE IF NOT EXISTS public.analytics_monthly_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month_start date NOT NULL,
  stock_type text NOT NULL CHECK (stock_type IN ('food', 'beverage')),
  opening_value numeric(12,2) CHECK (opening_value IS NULL OR opening_value >= 0),
  closing_value numeric(12,2) CHECK (closing_value IS NULL OR closing_value >= 0),
  external_adjustment numeric(12,2) NOT NULL DEFAULT 0,
  valuation_basis text NOT NULL CHECK (valuation_basis IN ('gross', 'net')),
  purchases_reconciled boolean NOT NULL DEFAULT false,
  notes text CHECK (notes IS NULL OR char_length(notes) <= 2000),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  updated_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT analytics_inventory_month_start CHECK (extract(day FROM month_start) = 1),
  CONSTRAINT analytics_inventory_unique_period_type UNIQUE (month_start, stock_type)
);

CREATE TABLE IF NOT EXISTS public.analytics_inventory_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  inventory_id uuid NOT NULL,
  operation text NOT NULL CHECK (operation IN ('insert', 'update')),
  before_value jsonb,
  after_value jsonb,
  changed_by uuid NOT NULL REFERENCES auth.users(id),
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS analytics_inventory_audit_item_idx
  ON public.analytics_inventory_audit(inventory_id, changed_at DESC);

ALTER TABLE public.analytics_monthly_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_inventory_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.analytics_monthly_inventory, public.analytics_inventory_audit
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.analytics_monthly_inventory, public.analytics_inventory_audit
  TO authenticated;

CREATE POLICY analytics_inventory_read ON public.analytics_monthly_inventory
  FOR SELECT TO authenticated
  USING ((SELECT public.analytics_has_permission('analytics.read')));
CREATE POLICY analytics_inventory_audit_read ON public.analytics_inventory_audit
  FOR SELECT TO authenticated
  USING ((SELECT public.analytics_has_permission('analytics.read')));

CREATE OR REPLACE FUNCTION public.analytics_save_monthly_inventory(
  p_month_start date,
  p_stock_type text,
  p_opening_value numeric,
  p_closing_value numeric,
  p_external_adjustment numeric,
  p_valuation_basis text,
  p_purchases_reconciled boolean,
  p_notes text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_old jsonb;
  v_new jsonb;
BEGIN
  IF NOT public.analytics_has_permission('analytics.write') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  IF p_month_start IS NULL
    OR extract(day FROM p_month_start) <> 1
    OR p_stock_type IS NULL OR p_stock_type NOT IN ('food','beverage')
    OR p_valuation_basis IS NULL OR p_valuation_basis NOT IN ('gross','net')
    OR p_purchases_reconciled IS NULL
    OR p_external_adjustment IS NULL
    OR round(p_external_adjustment, 2) <> p_external_adjustment
    OR abs(p_external_adjustment) >= 10000000000
    OR (p_opening_value IS NOT NULL AND (
      p_opening_value < 0 OR round(p_opening_value, 2) <> p_opening_value
      OR p_opening_value >= 10000000000))
    OR (p_closing_value IS NOT NULL AND (
      p_closing_value < 0 OR round(p_closing_value, 2) <> p_closing_value
      OR p_closing_value >= 10000000000))
    OR (p_notes IS NOT NULL AND char_length(p_notes) > 2000)
  THEN
    RAISE EXCEPTION 'Invalid stock valuation values';
  END IF;

  SELECT to_jsonb(i) INTO v_old
  FROM public.analytics_monthly_inventory i
  WHERE i.month_start = p_month_start AND i.stock_type = p_stock_type
  FOR UPDATE;

  INSERT INTO public.analytics_monthly_inventory (
    month_start, stock_type, opening_value, closing_value,
    external_adjustment, valuation_basis, purchases_reconciled, notes,
    created_by, updated_by
  )
  VALUES (
    p_month_start, p_stock_type, p_opening_value, p_closing_value,
    p_external_adjustment, p_valuation_basis, p_purchases_reconciled,
    nullif(btrim(p_notes), ''), auth.uid(), auth.uid()
  )
  ON CONFLICT (month_start, stock_type) DO UPDATE SET
    opening_value = EXCLUDED.opening_value,
    closing_value = EXCLUDED.closing_value,
    external_adjustment = EXCLUDED.external_adjustment,
    valuation_basis = EXCLUDED.valuation_basis,
    purchases_reconciled = EXCLUDED.purchases_reconciled,
    notes = EXCLUDED.notes,
    updated_by = auth.uid(),
    updated_at = now()
  RETURNING id INTO v_id;

  SELECT to_jsonb(i) INTO v_new FROM public.analytics_monthly_inventory i
  WHERE i.id = v_id;
  INSERT INTO public.analytics_inventory_audit (
    inventory_id, operation, before_value, after_value, changed_by
  ) VALUES (
    v_id, CASE WHEN v_old IS NULL THEN 'insert' ELSE 'update' END,
    v_old, v_new, auth.uid()
  );
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.analytics_save_monthly_inventory(
  date,text,numeric,numeric,numeric,text,boolean,text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.analytics_save_monthly_inventory(
  date,text,numeric,numeric,numeric,text,boolean,text
) TO authenticated;

COMMIT;
