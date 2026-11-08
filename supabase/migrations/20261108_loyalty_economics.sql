-- Phase 13C/2 — La Famiglia economic intelligence (NOT a named CRM).
-- Run after Phase 13C/1 loyalty cards migration on the same Supabase project.
-- Existing cards, visits, rewards, booking rows and terms remain UNCHANGED.
-- Unit costs are manual SCENARIO estimates for a reward type (label+threshold).
-- They are not purchase invoices, guaranteed historical costs, or incremental ROI.
BEGIN;

CREATE TABLE public.loyalty_reward_cost_assumptions (
  reward_label text NOT NULL CHECK(char_length(btrim(reward_label)) BETWEEN 5 AND 100),
  reward_threshold integer NOT NULL CHECK(reward_threshold BETWEEN 3 AND 12),
  estimated_unit_cost numeric(10,2) NOT NULL CHECK(estimated_unit_cost BETWEEN 0 AND 1000),
  updated_by uuid NOT NULL REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (reward_label,reward_threshold)
);

CREATE TABLE public.loyalty_reward_cost_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reward_label text NOT NULL,
  reward_threshold integer NOT NULL,
  old_cost numeric(10,2),
  new_cost numeric(10,2),
  changed_by uuid NOT NULL REFERENCES auth.users(id),
  changed_at timestamptz NOT NULL DEFAULT now(),
  CHECK (old_cost IS DISTINCT FROM new_cost)
);

ALTER TABLE public.loyalty_reward_cost_assumptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_reward_cost_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.loyalty_reward_cost_assumptions,public.loyalty_reward_cost_audit
  FROM PUBLIC,anon,authenticated;

-- All access is via owner/admin-only SECURITY DEFINER functions.
-- The old Phase 13C public token endpoints and staff visit/reward RPCs remain intact.
CREATE FUNCTION public.loyalty_admin_set_reward_cost(
  p_reward_label text,p_reward_threshold integer,p_estimated_unit_cost numeric
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_label text := btrim(coalesce(p_reward_label,''));
  v_old numeric;
  v_new numeric;
BEGIN
  IF NOT public.loyalty_staff_authorized() THEN RAISE EXCEPTION 'Access denied'; END IF;
  IF char_length(v_label) NOT BETWEEN 5 AND 100
    OR p_reward_threshold IS NULL OR p_reward_threshold NOT BETWEEN 3 AND 12
    OR (p_estimated_unit_cost IS NOT NULL AND (
      p_estimated_unit_cost < 0 OR p_estimated_unit_cost > 1000
      OR round(p_estimated_unit_cost,2)<>p_estimated_unit_cost
    )) THEN
    RAISE EXCEPTION 'Invalid estimated reward unit cost';
  END IF;
  -- Only existing reward offers can receive assumptions. All cards with
  -- the same offer will share an explicitly LABELED cost scenario.
  IF NOT EXISTS (
    SELECT 1 FROM public.loyalty_cards c
    WHERE c.reward_label=v_label AND c.reward_threshold=p_reward_threshold
  ) THEN RAISE EXCEPTION 'Unknown reward offer: no issued cards with these terms'; END IF;

  -- Serialize updates/clear on the same reward type to keep audit accurate.
  PERFORM pg_advisory_xact_lock(hashtext('loyalty_reward_cost'),hashtext(v_label||':'||p_reward_threshold::text));
  SELECT a.estimated_unit_cost INTO v_old
    FROM public.loyalty_reward_cost_assumptions a
    WHERE a.reward_label=v_label AND a.reward_threshold=p_reward_threshold
    FOR UPDATE;

  IF p_estimated_unit_cost IS NULL THEN
    DELETE FROM public.loyalty_reward_cost_assumptions
    WHERE reward_label=v_label AND reward_threshold=p_reward_threshold;
    v_new:=NULL;
  ELSE
    INSERT INTO public.loyalty_reward_cost_assumptions(
      reward_label,reward_threshold,estimated_unit_cost,updated_by
    ) VALUES(v_label,p_reward_threshold,p_estimated_unit_cost,auth.uid())
    ON CONFLICT(reward_label,reward_threshold) DO UPDATE SET
      estimated_unit_cost=excluded.estimated_unit_cost,
      updated_by=excluded.updated_by,
      updated_at=now();
    v_new:=p_estimated_unit_cost;
  END IF;
  IF v_old IS DISTINCT FROM v_new THEN
    INSERT INTO public.loyalty_reward_cost_audit(
      reward_label,reward_threshold,old_cost,new_cost,changed_by
    ) VALUES(v_label,p_reward_threshold,v_old,v_new,auth.uid());
  END IF;
  RETURN jsonb_build_object(
    'reward_label',v_label,'reward_threshold',p_reward_threshold,
    'estimated_unit_cost',v_new,'updated',v_old IS DISTINCT FROM v_new
  );
END;
$$;

CREATE FUNCTION public.loyalty_admin_economics(p_month_start date)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_month_end date;
  v_today date:=(now() AT TIME ZONE 'Atlantic/Canary')::date;
  v_result jsonb;
BEGIN
  IF NOT public.loyalty_staff_authorized() THEN RAISE EXCEPTION 'Access denied'; END IF;
  IF p_month_start IS NULL OR extract(day FROM p_month_start)<>1
     OR p_month_start<date '2000-01-01'
     OR p_month_start>(date_trunc('month',v_today)::date) THEN
    RAISE EXCEPTION 'Invalid analysis month';
  END IF;
  v_month_end:=(p_month_start+interval '1 month')::date;

  WITH
  progress AS MATERIALIZED (
    SELECT c.id,c.status,c.reward_label,c.reward_threshold,c.created_at,
      (SELECT count(*)::integer FROM public.loyalty_visits v WHERE v.card_id=c.id) AS total_visits,
      (SELECT count(*)::integer FROM public.loyalty_redemptions r WHERE r.card_id=c.id) AS total_redeemed
    FROM public.loyalty_cards c
  ),
  balances AS MATERIALIZED (
    SELECT p.*,greatest(0,(p.total_visits/p.reward_threshold)-p.total_redeemed)::integer
      AS available_rewards
    FROM progress p
  ),
  reward_types AS MATERIALIZED (
    SELECT b.reward_label,b.reward_threshold,
      count(*)::integer AS issued_cards,
      count(*) FILTER(WHERE b.status='active')::integer AS active_cards,
      coalesce(sum(b.available_rewards) FILTER(WHERE b.status='active'),0)::integer AS rewards_outstanding,
      coalesce(sum(b.total_visits),0)::integer AS verified_visits_all_time,
      (SELECT count(*)::integer FROM public.loyalty_redemptions r
        WHERE r.reward_label=b.reward_label
          AND r.reward_threshold=b.reward_threshold
          AND r.redeemed_on>=p_month_start AND r.redeemed_on<v_month_end) AS redeemed_month,
      a.estimated_unit_cost
    FROM balances b
    LEFT JOIN public.loyalty_reward_cost_assumptions a
      ON a.reward_label=b.reward_label AND a.reward_threshold=b.reward_threshold
    GROUP BY b.reward_label,b.reward_threshold,a.estimated_unit_cost
  ),
  totals AS (
    SELECT
      (SELECT count(*)::integer FROM public.loyalty_cards c
       WHERE (c.created_at AT TIME ZONE 'Atlantic/Canary')::date>=p_month_start
         AND (c.created_at AT TIME ZONE 'Atlantic/Canary')::date<v_month_end) AS issued_month,
      (SELECT count(*)::integer FROM public.loyalty_visits v
        WHERE v.visit_date>=p_month_start AND v.visit_date<v_month_end) AS stamps_month,
      (SELECT count(DISTINCT v.card_id)::integer FROM public.loyalty_visits v
        WHERE v.visit_date>=p_month_start AND v.visit_date<v_month_end) AS cards_visited_month,
      (SELECT count(DISTINCT v.card_id)::integer FROM public.loyalty_visits v
        WHERE v.visit_date>=p_month_start AND v.visit_date<v_month_end
        AND EXISTS (SELECT 1 FROM public.loyalty_visits prior
          WHERE prior.card_id=v.card_id AND prior.visit_date<p_month_start)) AS returning_cards_month,
      (SELECT count(*)::integer FROM public.loyalty_redemptions r
        WHERE r.redeemed_on>=p_month_start AND r.redeemed_on<v_month_end) AS redemptions_month,
      (SELECT count(*)::integer FROM balances) AS cards_total,
      (SELECT count(*)::integer FROM balances WHERE total_visits>=2) AS cards_with_2plus_visits,
      (SELECT coalesce(sum(rewards_outstanding),0)::integer FROM reward_types) AS rewards_outstanding,
      (SELECT count(*)::integer FROM reward_types WHERE estimated_unit_cost IS NULL)
         AS reward_types_without_cost,
      (SELECT coalesce(sum(redeemed_month*estimated_unit_cost),0)::numeric(14,2)
         FROM reward_types WHERE estimated_unit_cost IS NOT NULL)
         AS estimated_redemption_cost_known,
      (SELECT coalesce(sum(rewards_outstanding*estimated_unit_cost),0)::numeric(14,2)
         FROM reward_types WHERE estimated_unit_cost IS NOT NULL)
         AS estimated_outstanding_cost_known,
      (SELECT coalesce(sum(redeemed_month),0)::integer
         FROM reward_types WHERE estimated_unit_cost IS NULL)
         AS redemptions_missing_cost,
      (SELECT coalesce(sum(rewards_outstanding),0)::integer
         FROM reward_types WHERE estimated_unit_cost IS NULL)
         AS outstanding_missing_cost
  )
  SELECT jsonb_build_object(
    'month',to_char(p_month_start,'YYYY-MM'),
    'period_closed',(v_month_end<=v_today),
    'totals',to_jsonb(t),
    'reward_types',(
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'reward_label',r.reward_label,
        'reward_threshold',r.reward_threshold,
        'issued_cards',r.issued_cards,
        'active_cards',r.active_cards,
        'verified_visits_all_time',r.verified_visits_all_time,
        'redeemed_month',r.redeemed_month,
        'rewards_outstanding',r.rewards_outstanding,
        'estimated_unit_cost',r.estimated_unit_cost
      ) ORDER BY r.reward_label,r.reward_threshold),'[]'::jsonb)
      FROM reward_types r
    ),
    'visits_by_day',(
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'date',d.visit_date,'visits',d.visits
      ) ORDER BY d.visit_date),'[]'::jsonb)
      FROM (
        SELECT v.visit_date,count(*)::integer AS visits
        FROM public.loyalty_visits v
        WHERE v.visit_date>=p_month_start AND v.visit_date<v_month_end
        GROUP BY v.visit_date
      ) d
    ),
    'card_progress_distribution',(
      SELECT jsonb_build_object(
        'zero',(SELECT count(*)::integer FROM balances WHERE total_visits=0),
        'one',(SELECT count(*)::integer FROM balances WHERE total_visits=1),
        'two',(SELECT count(*)::integer FROM balances WHERE total_visits=2),
        'three_four',(SELECT count(*)::integer FROM balances WHERE total_visits BETWEEN 3 AND 4),
        'five_plus',(SELECT count(*)::integer FROM balances WHERE total_visits>=5)
      )
    ),
    'limitations',jsonb_build_object(
      'current_surviving_cards_only',true,
      'estimated_costs_not_actual',true,
      'no_revenue_attribution',true,
      'returning_cards_prior_month_verified',true,
      'assumptions_apply_to_old_redemptions',true
    )
  ) INTO v_result
  FROM totals t;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.loyalty_admin_set_reward_cost(text,integer,numeric)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.loyalty_admin_economics(date)
 FROM PUBLIC,anon,authenticated;

GRANT EXECUTE ON FUNCTION public.loyalty_admin_set_reward_cost(text,integer,numeric)
 TO authenticated;
GRANT EXECUTE ON FUNCTION public.loyalty_admin_economics(date)
 TO authenticated;

COMMIT;
