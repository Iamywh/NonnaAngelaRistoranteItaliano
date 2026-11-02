-- Fase 8: month-end reconciliation and immutable managerial close.
-- Additive migration: does not alter reservations or existing financial records.
-- A close is a snapshot of verified NET figures, NOT statutory profit/tax filing.
BEGIN;
CREATE TABLE public.analytics_monthly_closures (
  month_start date PRIMARY KEY CHECK (EXTRACT(DAY FROM month_start)=1),
  revenue_source text NOT NULL CHECK(revenue_source IN ('history','daily')),
  revenue_net numeric(12,2) NOT NULL,
  covers integer,
  food_consumption_net numeric(12,2) NOT NULL,
  beverage_consumption_net numeric(12,2) NOT NULL,
  other_expenses_net numeric(12,2) NOT NULL,
  operating_result_net numeric(12,2) NOT NULL,
  source_fingerprint text NOT NULL,
  source_snapshot jsonb NOT NULL,
  confirmations jsonb NOT NULL,
  evidence_note text NOT NULL CHECK(char_length(btrim(evidence_note)) BETWEEN 10 AND 1500),
  closed_by uuid NOT NULL REFERENCES auth.users(id),
  closed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.analytics_monthly_closures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.analytics_monthly_closures FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.analytics_monthly_closures TO authenticated;
CREATE POLICY analytics_closures_read ON public.analytics_monthly_closures
 FOR SELECT TO authenticated USING ((SELECT public.analytics_has_permission('analytics.read')));

-- Returns a fresh, server-calculated reconciliation and a fingerprint of the
-- source rows. Financial amounts are never supplied by the browser.
CREATE OR REPLACE FUNCTION public.analytics_evaluate_month_close(
 p_month_start date, p_revenue_source text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 v_end date;
 v_now_month date;
 v_days integer;
 v_daily_count integer;
 v_finalized_count integer;
 v_missing_services integer;
 v_bad_sales_basis integer;
 v_services_count integer;
 v_revenue numeric;
 v_covers integer;
 v_history public.analytics_monthly_history%ROWTYPE;
 v_expenses_count integer;
 v_gross_expenses integer;
 v_duplicate_categories text;
 v_other numeric := 0;
 v_food numeric := 0;
 v_beverage numeric := 0;
 v_kind text;
 v_category text;
 v_inv public.analytics_monthly_inventory%ROWTYPE;
 v_purchase_sum numeric;
 v_purchase_count integer;
 v_purchase_kinds integer;
 v_purchase_gross integer;
 v_consumption numeric;
 v_issues text[] := ARRAY[]::text[];
 v_warnings text[] := ARRAY[]::text[];
 v_source jsonb;
 v_fingerprint text;
 v_days_rows jsonb;
 v_services_rows jsonb;
 v_expenses_rows jsonb;
 v_inventory_rows jsonb;
 v_history_row jsonb;
BEGIN
 IF NOT public.analytics_has_permission('analytics.read') THEN
   RAISE EXCEPTION 'Access denied';
 END IF;
 IF p_month_start IS NULL OR EXTRACT(DAY FROM p_month_start) <> 1 OR
    p_revenue_source IS NULL OR p_revenue_source NOT IN ('history','daily') THEN
    RAISE EXCEPTION 'Invalid month or revenue source';
 END IF;
 v_end := (p_month_start + INTERVAL '1 month')::date;
 v_now_month := date_trunc('month', now() AT TIME ZONE 'Atlantic/Canary')::date;
 v_days := (v_end - p_month_start);
 IF p_month_start >= v_now_month THEN
   v_issues := array_append(v_issues, 'El mes debe haber terminado antes del cierre.');
 END IF;

 SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY d.business_date),'[]'::jsonb),
        count(*)::integer,
        (count(*) FILTER(WHERE d.status='finalized'))::integer
 INTO v_days_rows, v_daily_count, v_finalized_count
 FROM public.analytics_daily_entries d
 WHERE d.business_date >= p_month_start AND d.business_date < v_end;

 SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY d.business_date,s.service_type),'[]'::jsonb),
        count(*)::integer,
        (count(*) FILTER (WHERE s.tax_basis <> 'net' AND
          (s.food_revenue_amount + s.beverage_revenue_amount) <> 0))::integer,
        COALESCE(sum(s.food_revenue_amount+s.beverage_revenue_amount),0),
        COALESCE(sum(s.covers),0)::integer
 INTO v_services_rows,v_services_count,v_bad_sales_basis,v_revenue,v_covers
 FROM public.analytics_service_entries s
 JOIN public.analytics_daily_entries d ON d.id=s.daily_entry_id
 WHERE d.business_date >= p_month_start AND d.business_date < v_end;

 SELECT count(*)::integer INTO v_missing_services
 FROM public.analytics_daily_entries d
 WHERE d.business_date >= p_month_start AND d.business_date < v_end
   AND (
     (SELECT count(*) FROM public.analytics_service_entries s
      WHERE s.daily_entry_id=d.id AND s.service_type IN ('lunch','dinner'))<>2
     OR EXISTS(
       SELECT 1 FROM public.analytics_service_entries s WHERE s.daily_entry_id=d.id
       AND ((s.service_type='lunch' AND d.lunch_status='closed') OR
            (s.service_type='dinner' AND d.dinner_status='closed'))
       AND (s.food_revenue_amount<>0 OR s.beverage_revenue_amount<>0 OR s.covers<>0)
     )
   );

 SELECT * INTO v_history FROM public.analytics_monthly_history
   WHERE month_start=p_month_start;
 SELECT to_jsonb(h) INTO v_history_row FROM public.analytics_monthly_history h
   WHERE h.month_start=p_month_start;

 IF p_revenue_source='daily' THEN
   IF v_daily_count <> v_days OR v_finalized_count <> v_days OR v_missing_services>0
      OR v_services_count<>v_days*2 THEN
     v_issues := array_append(v_issues,
       'Registro diario incompleto: registra y finaliza todos los días, incluidos cierres, con ambos servicios.');
   END IF;
   IF v_bad_sales_basis>0 THEN
     v_issues := array_append(v_issues,
       'Hay ventas con base bruta. El cierre exige ventas NETAS verificadas.');
   END IF;
   IF v_history.month_start IS NOT NULL THEN
     v_warnings := array_append(v_warnings,
       'Existe Histórico del mismo mes: NO se suma al Registro diario.');
   END IF;
 ELSE
   IF v_history.month_start IS NULL OR v_history.data_quality <> 'verified' OR
      v_history.tax_basis <> 'net' THEN
     v_issues := array_append(v_issues,
       'Histórico debe tener un total mensual VERIFICADO y NETO de IGIC.');
   ELSE
     v_revenue := v_history.revenue_total;
     v_covers := v_history.covers;
   END IF;
   IF v_daily_count > 0 THEN
     v_warnings := array_append(v_warnings,
       'Hay ventas diarias del mismo mes: se usa solo Histórico. Comprueba cualquier discrepancia.');
   END IF;
 END IF;

 SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.period_date,e.category,e.period_kind),'[]'::jsonb),
        count(*)::integer,
        (count(*) FILTER(WHERE e.tax_basis<>'net'))::integer,
        COALESCE(sum(e.amount) FILTER(WHERE e.category NOT IN ('food_purchases','beverage_purchases')),0)
 INTO v_expenses_rows,v_expenses_count,v_gross_expenses,v_other
 FROM public.analytics_expenses e
 WHERE e.period_date>=p_month_start AND e.period_date<v_end;

 IF v_expenses_count=0 THEN
   v_issues := array_append(v_issues,
     'Gastos está vacío. Registra los gastos y revisa los totales del mes.');
 END IF;
 IF v_gross_expenses>0 THEN
   v_issues := array_append(v_issues,
     'Hay gastos BRUTOS: conviértelos a base NETA usando documentos contables, sin inferir IGIC.');
 END IF;
 SELECT string_agg(category,', ' ORDER BY category) INTO v_duplicate_categories
 FROM (
   SELECT category FROM public.analytics_expenses e
   WHERE e.period_date>=p_month_start AND e.period_date<v_end
   GROUP BY category HAVING count(DISTINCT period_kind)>1
 ) x;
 IF v_duplicate_categories IS NOT NULL THEN
   v_issues := array_append(v_issues,
     'Posibles gastos duplicados entre registros diarios y mensuales: '||v_duplicate_categories);
 END IF;

 SELECT COALESCE(jsonb_agg(to_jsonb(i) ORDER BY i.stock_type),'[]'::jsonb)
 INTO v_inventory_rows FROM public.analytics_monthly_inventory i
 WHERE i.month_start=p_month_start;

 FOREACH v_kind IN ARRAY ARRAY['food','beverage'] LOOP
   v_category := CASE WHEN v_kind='food' THEN 'food_purchases'
     ELSE 'beverage_purchases' END;
   SELECT * INTO v_inv FROM public.analytics_monthly_inventory
      WHERE month_start=p_month_start AND stock_type=v_kind;
   SELECT COALESCE(sum(e.amount),0),count(*)::integer,
     count(DISTINCT e.period_kind)::integer,
     count(*) FILTER (WHERE e.tax_basis<>'net')::integer
   INTO v_purchase_sum,v_purchase_count,v_purchase_kinds,v_purchase_gross
   FROM public.analytics_expenses e
   WHERE e.period_date>=p_month_start AND e.period_date<v_end AND e.category=v_category;
   IF v_inv.id IS NULL OR v_inv.opening_value IS NULL OR v_inv.closing_value IS NULL
     OR v_inv.valuation_basis <> 'net'
     OR v_inv.purchases_reconciled IS DISTINCT FROM true
     OR v_inv.reconciled_purchase_total IS DISTINCT FROM v_purchase_sum
     OR v_inv.reconciled_purchase_count IS DISTINCT FROM v_purchase_count
     OR v_purchase_kinds>1 OR v_purchase_gross>0 THEN
     v_issues := array_append(v_issues,
       'Inventario '||v_kind||' incompleto, bruto o compras sin reconciliar.');
   ELSE
     v_consumption := v_inv.opening_value + v_purchase_sum +
       v_inv.external_adjustment - v_inv.closing_value;
     IF v_consumption < 0 THEN
       v_issues := array_append(v_issues,
         'Consumo '||v_kind||' negativo: revisa existencias y movimientos.');
     ELSIF v_kind='food' THEN
       v_food:=v_consumption;
     ELSE
       v_beverage:=v_consumption;
     END IF;
   END IF;
 END LOOP;

 v_source := jsonb_build_object(
   'month_start',p_month_start,'revenue_source',p_revenue_source,
   'daily',v_days_rows,'services',v_services_rows,
   'history',v_history_row,'expenses',v_expenses_rows,'inventory',v_inventory_rows);
 v_fingerprint := md5(v_source::text);
 RETURN jsonb_build_object(
   'ready',coalesce(array_length(v_issues,1),0)=0,
   'issues',to_jsonb(v_issues),'warnings',to_jsonb(v_warnings),
   'fingerprint',v_fingerprint,'source',p_revenue_source,
   'source_snapshot',v_source,
   'figures',jsonb_build_object(
     'revenue_net',v_revenue,'covers',v_covers,
     'food_consumption_net',v_food,'beverage_consumption_net',v_beverage,
     'other_expenses_net',v_other,
     'operating_result_net',CASE WHEN coalesce(array_length(v_issues,1),0)=0
       THEN v_revenue-v_food-v_beverage-v_other ELSE NULL END),
   'coverage',jsonb_build_object(
     'days_expected',v_days,'daily_days',v_daily_count,
     'daily_finalized',v_finalized_count,'expense_records',v_expenses_count)
 );
END;
$$;

-- Close is one-way: existing source data may later change, but the original
-- snapshot is never silently overwritten. The UI detects fingerprint drift.
CREATE OR REPLACE FUNCTION public.analytics_finalize_month_close(
 p_month_start date,p_revenue_source text,p_confirmations jsonb,p_evidence_note text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_report jsonb; v_fig jsonb; v_closure public.analytics_monthly_closures%ROWTYPE;
BEGIN
 IF NOT public.analytics_has_permission('analytics.write') THEN
   RAISE EXCEPTION 'Access denied';
 END IF;
 IF p_month_start IS NULL OR EXTRACT(DAY FROM p_month_start)<>1 OR
    p_revenue_source NOT IN ('history','daily') OR
    p_confirmations IS NULL OR jsonb_typeof(p_confirmations) IS DISTINCT FROM 'object' OR
    p_confirmations->>'sales' IS DISTINCT FROM 'true' OR
    p_confirmations->>'expenses' IS DISTINCT FROM 'true' OR
    p_confirmations->>'inventory' IS DISTINCT FROM 'true' OR
    p_confirmations->>'igic' IS DISTINCT FROM 'true' OR
    p_confirmations->>'scope' IS DISTINCT FROM 'true' OR
    p_evidence_note IS NULL OR char_length(btrim(p_evidence_note)) NOT BETWEEN 10 AND 1500 THEN
   RAISE EXCEPTION 'Closing requires all confirmations and a detailed evidence note';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtext('nonna_month_close'),hashtext(p_month_start::text));
 IF EXISTS(SELECT 1 FROM public.analytics_monthly_closures WHERE month_start=p_month_start) THEN
   RAISE EXCEPTION 'Month already closed. No silent replacement permitted';
 END IF;
 v_report:=public.analytics_evaluate_month_close(p_month_start,p_revenue_source);
 IF (v_report->>'ready')::boolean IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'Cannot close month: %',v_report->'issues';
 END IF;
 v_fig:=v_report->'figures';
 INSERT INTO public.analytics_monthly_closures
   (month_start,revenue_source,revenue_net,covers,food_consumption_net,
    beverage_consumption_net,other_expenses_net,operating_result_net,
    source_fingerprint,source_snapshot,confirmations,evidence_note,closed_by)
 VALUES (p_month_start,p_revenue_source,
   (v_fig->>'revenue_net')::numeric,(v_fig->>'covers')::integer,
   (v_fig->>'food_consumption_net')::numeric,(v_fig->>'beverage_consumption_net')::numeric,
   (v_fig->>'other_expenses_net')::numeric,(v_fig->>'operating_result_net')::numeric,
   v_report->>'fingerprint',v_report->'source_snapshot',p_confirmations,
   btrim(p_evidence_note),auth.uid())
 RETURNING * INTO v_closure;
 RETURN jsonb_build_object('month_start',v_closure.month_start,
   'fingerprint',v_closure.source_fingerprint,'operating_result_net',v_closure.operating_result_net,
   'closed_at',v_closure.closed_at);
END;
$$;

REVOKE ALL ON FUNCTION public.analytics_evaluate_month_close(date,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.analytics_finalize_month_close(date,text,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.analytics_evaluate_month_close(date,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_finalize_month_close(date,text,jsonb,text) TO authenticated;
COMMIT;
