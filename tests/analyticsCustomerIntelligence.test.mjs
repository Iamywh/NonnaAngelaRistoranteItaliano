import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {prepareCustomerIntelligence,WEEKDAYS,LEAD_LABELS} from '../src/lib/analyticsCustomerIntelligence.mjs'

const sql=readFileSync(
  new URL('../supabase/migrations/20261107_analytics_customer_intelligence.sql',import.meta.url),'utf8')
const ui=readFileSync(
  new URL('../src/pages/admin/CustomerIntelligence.jsx',import.meta.url),'utf8')
const app=readFileSync(
  new URL('../src/pages/admin/Analytics.jsx',import.meta.url),'utf8')

function payload(overrides={}){
  return {
    month:'2026-10',today:'2026-11-07',
    totals:{
      requests:8,requested_guests:18,
      pending:2,confirmed:3,cancelled:2,rejected:1,other_status:0,
      active:5,active_guests:12,arrived:2,arrived_guests:5,
      no_show:1,no_show_guests:2,past_unmarked:2,out_of_window:0
    },
    by_service:[{service:'lunch',requests:3,active:2,active_guests:5,arrived:1,arrived_guests:2,no_show:0},
      {service:'dinner',requests:5,active:3,active_guests:7,arrived:1,arrived_guests:3,no_show:1}],
    by_weekday:[{weekday:5,requests:2,active:2,active_guests:5,arrived:1},
      {weekday:6,requests:6,active:3,active_guests:7,arrived:1}],
    by_date:[{day:'2026-10-02',requests:2,active:2,active_guests:5,arrived:1,no_show:0,cancelled:0,past_unmarked:1},
      {day:'2026-10-03',requests:6,active:3,active_guests:7,arrived:1,no_show:1,cancelled:2,past_unmarked:1}],
    by_lead:[{bucket:'same_day',requests:2},{bucket:'three_seven',requests:6}],
    by_origin:[{origin:'website',requests:8}],
    by_channel_preference:[{channel_preference:'whatsapp',requests:8}],
    daily_register:{recorded_days:3,finalized_days:2,recorded_covers:45,comparable:false},
    ...overrides
  }
}

test('Phase 13A computes marked-outcome rates, not a fake overall show-up rate',()=>{
  const result=prepareCustomerIntelligence(payload())
  assert.equal(result.markedOutcomes,3)
  assert.equal(result.markedNoShowPct,33.3)
  assert.equal(result.activeSharePct,62.5)
  assert.equal(result.totals.past_unmarked,2)
  assert.ok(result.insights.some(x=>x.title.includes('estados de servicio')))
  assert.ok(!('showRate' in result))
})
test('No-show resolution without any arrived/no-show remains unknown',()=>{
  const data=payload()
  data.totals={...data.totals,arrived:0,arrived_guests:0,no_show:0,no_show_guests:0}
  const result=prepareCustomerIntelligence(data)
  assert.equal(result.markedNoShowPct,null)
  assert.ok(result.insights.some(x=>x.title==='Asistencia todavía no medida'))
})
test('Reject inconsistent status totals and arrival beyond active requests',()=>{
  const a=payload();a.totals.pending=3
  assert.throws(()=>prepareCustomerIntelligence(a),/no cuadran|incoherentes/)
  const b=payload();b.totals.arrived=10
  assert.throws(()=>prepareCustomerIntelligence(b),/incoherentes/)
})
test('Refuse malformed server aggregate and partial datasets',()=>{
  assert.throws(()=>prepareCustomerIntelligence(null),/no válida/)
  assert.throws(()=>prepareCustomerIntelligence(payload({month:'2026-99'})),/no válida/)
  assert.throws(()=>prepareCustomerIntelligence(payload({by_date:[]})),/desglose/)
  const c=payload();c.totals.no_show=-1
  assert.throws(()=>prepareCustomerIntelligence(c),/inválidos/)
})
test('Weekday and lead keys have readable Spanish labels',()=>{
  assert.equal(WEEKDAYS[1],'Lunes')
  assert.equal(WEEKDAYS[7],'Domingo')
  assert.ok(LEAD_LABELS.same_day.includes('Mismo'))
  const result=prepareCustomerIntelligence(payload())
  assert.equal(result.weekdays[0].label,'Sábado')
})
test('RPC is authenticated and permission gated; only aggregates, not PII',()=>{
  assert.match(sql,/CREATE OR REPLACE FUNCTION public\.analytics_customer_intelligence\(p_month_start date\)/)
  assert.match(sql,/SECURITY DEFINER SET search_path = ''/)
  assert.match(sql,/auth\.role\(\) IS DISTINCT FROM 'authenticated'/)
  assert.match(sql,/analytics_has_permission\('analytics.read'\)/)
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.analytics_customer_intelligence\(date\)\s+FROM PUBLIC,anon,authenticated/)
  assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.analytics_customer_intelligence\(date\)\s+TO authenticated/)
  for(const banned of ['customer_name','customer_phone','customer_email','notes','assigned_tables'])
    assert.doesNotMatch(sql,new RegExp('\\br\\.'+banned+'\\b'))
  assert.doesNotMatch(sql,/GRANT\s+SELECT\s+ON\s+public\.reservations/i)
  assert.doesNotMatch(sql,/ALTER\s+TABLE\s+public\.reservations/i)
})
test('Explicit only: no_show and seated/completed are NOT assumed from pending reservations',()=>{
  assert.match(sql,/b\.service_status IN \('seated','completed'\)/)
  assert.match(sql,/b\.service_status='no_show'/)
  assert.match(sql,/b\.service_status='not_arrived' AND b\.day<v_today/)
  assert.match(sql,/b\.booking_status IN \('pending','confirmed'\)/)
  assert.match(sql,/v_today date := \(now\(\) AT TIME ZONE 'Atlantic\/Canary'\)::date/)
})
test('Time bands and sources are explicit, assistant cannot be falsely attributed',()=>{
  assert.match(sql,/BETWEEN '13:00' AND '15:30'/)
  assert.match(sql,/BETWEEN '19:30' AND '23:00'/)
  assert.match(sql,/website includes website form and virtual assistant/)
  assert.match(ui,/no distingue chatbot del formulario/)
})
test('Finance records aggregated separately: walk-ins not joined to booking identity',()=>{
  assert.match(sql,/analytics_daily_entries/)
  assert.match(sql,/analytics_service_entries/)
  assert.match(sql,/count\(DISTINCT d\.id\)/)
  assert.match(sql,/'comparable',false/)
  assert.match(ui,/Pueden incluir clientes sin reserva/)
  assert.match(ui,/no son directamente comparables/)
  assert.match(ui,/No calculamos:.*conversión/s)
})
test('UI uses one authenticated RPC and no raw reservation reads or changes',()=>{
  assert.match(ui,/supabase\.rpc\('analytics_customer_intelligence'/)
  assert.match(ui,/p_month_start:monthDate/)
  assert.doesNotMatch(ui,/\.from\('reservations'\)|\.insert\(|\.update\(|\.delete\(/)
  assert.match(ui,/No se interpretan automáticamente como no-show/)
  assert.match(app,/import CustomerIntelligence from/)
  assert.match(app,/activeTab === 'customers' \? <CustomerIntelligence/)
})
