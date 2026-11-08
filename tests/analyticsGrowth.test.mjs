import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {
  emptyGrowthForm,growthFormFromRecord,validateGrowthPayload,
  analyzeGrowthCampaigns,CHANNELS,STATUSES
} from '../src/lib/analyticsGrowth.mjs'

const sql=readFileSync(new URL(
  '../supabase/migrations/20261108_analytics_growth_campaigns.sql',import.meta.url),'utf8')
const ui=readFileSync(new URL(
  '../src/pages/admin/GrowthPlanner.jsx',import.meta.url),'utf8')
const analytics=readFileSync(new URL(
  '../src/pages/admin/Analytics.jsx',import.meta.url),'utf8')

const draft=()=>({
  ...emptyGrowthForm(),
  name:'Cena del jueves',start_date:'2026-11-05',end_date:'2026-11-26',
  planned_budget:'120,50',status:'planned',tracking_code:'JUEVES26'
})
const campaign=(overrides={})=>({
  id:'67447a75-12bc-4c1d-b3b4-82dd37a908f2',
  revision:1,
  name:'Cena del jueves',channel:'instagram',objective:'weekday_demand',
  target_service:'dinner',status:'planned',start_date:'2026-11-05',
  end_date:'2026-11-26',planned_budget:120.5,actual_spend:null,
  impressions:null,clicks:null,inquiries:null,code_bookings:null,
  tracking_code:'JUEVES26',notes:'Hipótesis de campaña',...overrides
})
test('Create payload preserves unknown metrics (null != zero) and decimal commas',()=>{
  const p=validateGrowthPayload(draft())
  assert.equal(p.name,'Cena del jueves')
  assert.equal(p.planned_budget,120.5)
  assert.equal(p.actual_spend,null)
  assert.equal(p.code_bookings,null)
  assert.equal(p.impressions,null)
  assert.equal(p.tracking_code,'JUEVES26')
  assert.ok(!('id' in p))
})
test('Edit payload includes revision to prevent silent overwrites',()=>{
  const form=growthFormFromRecord(campaign())
  const p=validateGrowthPayload(form)
  assert.equal(p.expected_revision,1)
  assert.equal(p.id,campaign().id)
  assert.equal(p.actual_spend,null)
  assert.equal(p.impressions,null)
})
test('Reject invalid budget/count, untracked booking claims and invalid tracking codes',()=>{
  assert.throws(()=>validateGrowthPayload({...draft(),planned_budget:'1.200,00'}),/Importe/)
  assert.throws(()=>validateGrowthPayload({...draft(),actual_spend:'-1'}),/Importe/)
  assert.throws(()=>validateGrowthPayload({...draft(),clicks:'1.5'}),/Recuento/)
  assert.throws(()=>validateGrowthPayload({...draft(),code_bookings:'3',tracking_code:''}),/sin un código/)
  assert.throws(()=>validateGrowthPayload({...draft(),tracking_code:'@@'}),/Código/)
  assert.throws(()=>validateGrowthPayload({...draft(),name:'ab'}),/Nombre/)
  assert.throws(()=>validateGrowthPayload({...draft(),status:'sent'}),/Estado/)
})
test('Reject nonexistent dates and spans over a year',()=>{
  assert.throws(()=>validateGrowthPayload({...draft(),start_date:'2026-02-30'}),/inexistente/)
  assert.throws(()=>validateGrowthPayload({...draft(),end_date:'2028-12-31'}),/período/)
  assert.throws(()=>validateGrowthPayload({...draft(),end_date:'2026-11-04'}),/período/)
  assert.doesNotThrow(()=>validateGrowthPayload({...draft(),
    start_date:'2024-02-29',end_date:'2024-03-01'}))
})
test('CTR, CPC, and cost-per-reported-code-reservation are only computed when supported',()=>{
  const result=analyzeGrowthCampaigns([
    campaign({actual_spend:50,impressions:1000,clicks:25,code_bookings:5}),
    campaign({id:'67447a75-12bc-4c1d-b3b4-82dd37a908f3',
      channel:'google_ads',planned_budget:200,tracking_code:null})
  ])
  assert.equal(result.campaigns[0].ctrPct,2.5)
  assert.equal(result.campaigns[0].costPerClick,2)
  assert.equal(result.campaigns[0].costPerReportedCodeBooking,10)
  assert.equal(result.campaigns[1].ctrPct,null)
  assert.equal(result.campaigns[1].costPerClick,null)
  assert.equal(result.campaigns[1].costPerReportedCodeBooking,null)
  assert.equal(result.totals.planned,320.5)
  assert.equal(result.totals.spentKnown,50)
  assert.equal(result.totals.unknownSpend,1)
  assert.equal(result.channels.length,2)
})
test('Zero impressions and zero bookings do NOT cause division-by-zero performance',()=>{
  const result=analyzeGrowthCampaigns([campaign({
    actual_spend:0,impressions:0,clicks:0,code_bookings:0
  })])
  assert.equal(result.campaigns[0].ctrPct,null)
  assert.equal(result.campaigns[0].costPerClick,null)
  assert.equal(result.campaigns[0].costPerReportedCodeBooking,null)
})
test('Status and budget warnings are descriptive, not fake booking attribution',()=>{
  const result=analyzeGrowthCampaigns([
    campaign({planned_budget:30,actual_spend:50,status:'finished'}),
    campaign({id:'67447a75-12bc-4c1d-b3b4-82dd37a908f3',
      actual_spend:null,status:'finished'})
  ])
  assert.ok(result.alerts.some(a=>a.title.includes('supera presupuesto')))
  assert.ok(result.alerts.some(a=>a.title.includes('sin gasto documentado')))
  assert.doesNotMatch(JSON.stringify(result.alerts),/ROI|beneficio incrementado/)
})
test('Reject malformed or duplicated server data before displaying a report',()=>{
  assert.throws(()=>analyzeGrowthCampaigns(null),/incompleta/)
  const c=campaign()
  assert.throws(()=>analyzeGrowthCampaigns([c,c]),/duplicada/)
  assert.throws(()=>analyzeGrowthCampaigns([campaign({status:'unrecognized'})]),/inválida/)
  assert.throws(()=>analyzeGrowthCampaigns([campaign({actual_spend:-2})]),/Importe/)
  assert.throws(()=>analyzeGrowthCampaigns([campaign({clicks:-1})]),/Recuento/)
  assert.throws(()=>analyzeGrowthCampaigns([campaign({revision:0})]),/Versión/)
})
test('Growth database RLS and owner-only RPC gate avoid public campaign reads',()=>{
  assert.match(sql,/ALTER TABLE public[.]analytics_growth_campaigns ENABLE ROW LEVEL SECURITY/)
  assert.match(sql,/ALTER TABLE public[.]analytics_growth_audit ENABLE ROW LEVEL SECURITY/)
  assert.match(sql,/REVOKE ALL ON public[.]analytics_growth_campaigns,public[.]analytics_growth_audit/)
  assert.match(sql,/auth[.]role[(][)]='authenticated'/)
  assert.match(sql,/r[.]role IN [(]'owner','admin'[)]/)
  for(const name of ['analytics_growth_list','analytics_growth_save']){
    assert.ok(sql.includes('CREATE FUNCTION public.'+name+'('))
    assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.'+name+'('))
    assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.'+name+'('))
  }
  assert.equal((sql.match(/^AS [$][$]$/gm)||[]).length,3)
  assert.equal((sql.match(/^[$][$];$/gm)||[]).length,3)
  assert.doesNotMatch(sql,/^AS [$]$/m)
  assert.doesNotMatch(sql,/\bGRANT SELECT ON public[.]analytics_growth_campaigns/i)
})
test('No destructive update, audit every create/update, enforce optimistic revision',()=>{
  assert.match(sql,/revision=revision[+]1/)
  assert.match(sql,/FOR UPDATE/)
  assert.match(sql,/v_existing[.]revision<>v_expected/)
  assert.match(sql,/Changed by another session|Campaign was changed by another session/)
  assert.match(sql,/INSERT INTO public[.]analytics_growth_audit/g)
  assert.match(sql,/changed_by\)/)
  assert.doesNotMatch(sql,/DELETE FROM public[.]analytics_growth_campaigns/)
  assert.doesNotMatch(sql,/public[.]reservations|public[.]analytics_expenses|supabase[.]functions/)
  assert.match(sql,/coalesce\(v_bookings,0\)>0 AND v_tracking IS NULL/)
})
test('Campaign UI is staff only, calls two authorized RPCs, never external Ads APIs',()=>{
  assert.ok(ui.includes("supabase.rpc('analytics_growth_list'"))
  assert.ok(ui.includes("supabase.rpc('analytics_growth_save'"))
  assert.ok(ui.includes('validateGrowthPayload(form)'))
  assert.ok(ui.includes('analyzeGrowthCampaigns(data.campaigns)'))
  assert.ok(ui.includes('window.confirm'))
  assert.ok(ui.includes('PARCIAL'))
  assert.ok(ui.includes('No se calcula ROI'))
  assert.ok(ui.includes('Consultar Tendencias clientes'))
  assert.ok(analytics.includes("import GrowthPlanner from './GrowthPlanner.jsx'"))
  assert.ok(analytics.includes("activeTab === 'growth' ? <GrowthPlanner onNavigate={setActiveTab} />"))
  assert.doesNotMatch(ui,/\.from\('reservations'\)|\.insert\(|\.update\(|\.delete\(|fetch\(['"]https:\/\//)
  assert.ok(Object.hasOwn(CHANNELS,'google_ads'))
  assert.ok(Object.hasOwn(STATUSES,'draft'))
})
