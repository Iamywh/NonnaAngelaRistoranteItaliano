import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {prepareLoyaltyEconomics} from '../src/lib/loyaltyEconomics.mjs'

const sql=readFileSync(new URL('../supabase/migrations/20261108_loyalty_economics.sql',import.meta.url),'utf8')
const ui=readFileSync(new URL('../src/pages/admin/LoyaltyEconomics.jsx',import.meta.url),'utf8')
const analytics=readFileSync(new URL('../src/pages/admin/Analytics.jsx',import.meta.url),'utf8')

const fixture=()=>({
  month:'2026-11',period_closed:false,
  totals:{
    issued_month:2,stamps_month:4,cards_visited_month:2,returning_cards_month:1,
    redemptions_month:1,cards_total:3,cards_with_2plus_visits:3,
    rewards_outstanding:1,reward_types_without_cost:1,
    redemptions_missing_cost:0,outstanding_missing_cost:1,
    estimated_redemption_cost_known:2.5,estimated_outstanding_cost_known:0
  },
  reward_types:[
    {reward_label:'Tiramisú de la casa',reward_threshold:5,issued_cards:2,active_cards:2,
      verified_visits_all_time:8,redeemed_month:1,rewards_outstanding:0,estimated_unit_cost:2.5},
    {reward_label:'Cannolo siciliano',reward_threshold:3,issued_cards:1,active_cards:1,
      verified_visits_all_time:3,redeemed_month:0,rewards_outstanding:1,estimated_unit_cost:null}
  ],
  visits_by_day:[
    {date:'2026-11-02',visits:2},{date:'2026-11-03',visits:2}
  ],
  card_progress_distribution:{zero:0,one:0,two:0,three_four:2,five_plus:1}
})
test('Valid aggregates distinguish returning card share from true customer retention',()=>{
  const result=prepareLoyaltyEconomics(fixture())
  assert.equal(result.repeatedAmongVisitingPercent,50)
  assert.equal(result.twoPlusAmongExistingPercent,100)
  assert.equal(result.financialDataIsEstimate,true)
})
test('Missing cost assumptions make monetary totals PARTIAL, not actual cost or ROI',()=>{
  const result=prepareLoyaltyEconomics(fixture())
  assert.equal(result.estimatedRedemptionCostKnown,2.5)
  assert.equal(result.redemptionsEstimatePartial,false)
  assert.equal(result.estimatedOutstandingCostKnown,0)
  assert.equal(result.outstandingEstimatePartial,true)
})
test('Zero-card month remains valid with unknown shares and zero scenario costs',()=>{
  const x=fixture()
  x.totals={...x.totals,issued_month:0,stamps_month:0,cards_visited_month:0,
    returning_cards_month:0,redemptions_month:0,cards_total:0,cards_with_2plus_visits:0,
    rewards_outstanding:0,reward_types_without_cost:0,
    redemptions_missing_cost:0,outstanding_missing_cost:0,
    estimated_redemption_cost_known:0,estimated_outstanding_cost_known:0}
  x.reward_types=[];x.visits_by_day=[]
  x.card_progress_distribution={zero:0,one:0,two:0,three_four:0,five_plus:0}
  const result=prepareLoyaltyEconomics(x)
  assert.equal(result.repeatedAmongVisitingPercent,null)
  assert.equal(result.twoPlusAmongExistingPercent,null)
})
test('Refuses inconsistent unique card/reward/day aggregation before financial display',()=>{
  const a=fixture();a.totals.returning_cards_month=3
  assert.throws(()=>prepareLoyaltyEconomics(a),/incoherentes/)
  const b=fixture();b.totals.stamps_month=3
  assert.throws(()=>prepareLoyaltyEconomics(b),/coinciden/)
  const c=fixture();c.reward_types[1].rewards_outstanding=2
  assert.throws(()=>prepareLoyaltyEconomics(c),/desgloses/)
  const d=fixture();d.card_progress_distribution.one=1
  assert.throws(()=>prepareLoyaltyEconomics(d),/distribución/)
  const e=fixture();e.reward_types[0].estimated_unit_cost=3000
  assert.throws(()=>prepareLoyaltyEconomics(e),/unitario/)
  const f=fixture();f.visits_by_day[1].date=f.visits_by_day[0].date
  assert.throws(()=>prepareLoyaltyEconomics(f),/duplicada/)
  const g=fixture();g.reward_types[0].redeemed_month=2
  assert.throws(()=>prepareLoyaltyEconomics(g),/desgloses/)
})
test('Cost scenario RPCs use Analytics owner/admin permission, not manager client password',()=>{
  for(const name of ['loyalty_admin_set_reward_cost','loyalty_admin_economics']){
    assert.ok(sql.includes('CREATE FUNCTION public.'+name+'('))
    assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.'+name+'('))
    assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.'+name+'('))
  }
  assert.equal((sql.match(/IF NOT public[.]loyalty_staff_authorized[(][)] THEN RAISE EXCEPTION 'Access denied'/g)||[]).length,2)
  assert.ok(sql.includes('SECURITY DEFINER SET search_path ='))
  assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.loyalty_admin_economics(date)\n TO authenticated'))
  assert.doesNotMatch(sql,/\bGRANT (?:SELECT|INSERT|UPDATE|DELETE) ON public[.]loyalty_reward_cost/i)
})
test('Cost assumptions are precisely scoped to existing reward offers and recorded in audit',()=>{
  assert.ok(sql.includes('CREATE TABLE public.loyalty_reward_cost_assumptions'))
  assert.ok(sql.includes('CREATE TABLE public.loyalty_reward_cost_audit'))
  assert.ok(sql.includes('BETWEEN 0 AND 1000'))
  assert.ok(sql.includes('public.loyalty_cards c'))
  assert.ok(sql.includes("WHERE c.reward_label=v_label AND c.reward_threshold=p_reward_threshold"))
  assert.ok(sql.includes("pg_advisory_xact_lock(hashtext('loyalty_reward_cost')"))
  assert.ok(sql.includes('old_cost,new_cost,changed_by'))
  assert.ok(sql.includes('v_old IS DISTINCT FROM v_new'))
  assert.ok(sql.includes('ON CONFLICT(reward_label,reward_threshold) DO UPDATE'))
  assert.ok(sql.includes('DELETE FROM public.loyalty_reward_cost_assumptions'))
})
test('Economic metrics are aggregated and never return card IDs or identifiable customers',()=>{
  for(const bad of ['public.reservations','customer_name','customer_phone','customer_email',
    'loyalty_public_card','loyalty_public_delete','ALTER TABLE public.reservations']){
    assert.ok(!sql.includes(bad),'Unexpected access to '+bad)
  }
  assert.ok(sql.includes('AS returning_cards_month'))
  assert.ok(sql.includes('count(DISTINCT v.card_id)'))
  assert.ok(sql.includes('prior.visit_date<p_month_start'))
  assert.ok(sql.includes("'estimated_costs_not_actual',true"))
  assert.ok(sql.includes("'assumptions_apply_to_old_redemptions',true"))
  assert.ok(sql.includes('AND v.visit_date<v_month_end'))
  assert.ok(sql.includes('AND r.redeemed_on<v_month_end'))
})
test('Migration dollar delimiters balanced and new tables have RLS with direct grants revoked',()=>{
  assert.equal((sql.match(/^CREATE FUNCTION public[.]loyalty_admin_/gm)||[]).length,2)
  assert.equal((sql.match(/^AS [$][$]$/gm)||[]).length,2)
  assert.equal((sql.match(/^[$][$];$/gm)||[]).length,2)
  assert.ok(sql.includes('ALTER TABLE public.loyalty_reward_cost_assumptions ENABLE ROW LEVEL SECURITY'))
  assert.ok(sql.includes('ALTER TABLE public.loyalty_reward_cost_audit ENABLE ROW LEVEL SECURITY'))
  assert.ok(sql.includes('FROM PUBLIC,anon,authenticated;'))
  assert.ok(sql.startsWith('-- Phase 13C/2'))
  assert.ok(sql.trimEnd().endsWith('COMMIT;'))
})
test('Frontend uses private RPCs, user confirmation and explicit partial-cost disclosures',()=>{
  assert.ok(ui.includes("supabase.rpc('loyalty_admin_economics'"))
  assert.ok(ui.includes("supabase.rpc('loyalty_admin_set_reward_cost'"))
  assert.ok(ui.includes('prepareLoyaltyEconomics(data)'))
  assert.ok(ui.includes('window.confirm'))
  assert.ok(ui.includes('PARCIAL'))
  assert.ok(ui.includes('NO'))
  assert.ok(ui.includes('Los datos agregados no cuadran'))
  assert.doesNotMatch(ui,/\.from\('loyalty_cards'\)|\.from\('reservations'\)|\.insert\(|\.update\(|\.delete\(/)
  assert.ok(analytics.includes("import LoyaltyEconomics from './LoyaltyEconomics.jsx'"))
  assert.ok(analytics.includes("activeTab === 'loyalty-economics' ? <LoyaltyEconomics />"))
})
