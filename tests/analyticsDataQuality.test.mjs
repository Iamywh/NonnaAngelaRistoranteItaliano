import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {monthDateRange,buildDataQuality} from '../src/lib/analyticsDataQuality.mjs'

const report=(source='history',ready=false)=>({
  source,ready,issues:ready?[]:['Pendiente de conciliación'],
  warnings:[],fingerprint:'fingerprint-abc'
})
const service=(type,overrides={})=>({
  service_type:type,covers:3,food_revenue_amount:60,beverage_revenue_amount:10,
  tax_basis:'net',tax_details:{status:'verified'},...overrides
})
const day=(date='2026-10-05',overrides={})=>({
  business_date:date,status:'finalized',lunch_status:'open',dinner_status:'closed',
  analytics_service_entries:[
    service('lunch'),
    service('dinner',{covers:0,food_revenue_amount:0,beverage_revenue_amount:0})
  ],...overrides
})
const base=(overrides={})=>({
  month:'2026-10',today:'2026-11-07',days:[],expenses:[],inventories:[],
  history:null,closure:null,closeReport:report('history'),...overrides
})
const model=options=>buildDataQuality(base(options))
const has=(result,title)=>result.findings.some(f=>f.title===title)

test('Month range handles February leap years and year rollover',()=>{
  assert.deepEqual(monthDateRange('2024-02'),{start:'2024-02-01',next:'2024-03-01',days:29})
  assert.deepEqual(monthDateRange('2026-12'),{start:'2026-12-01',next:'2027-01-01',days:31})
  assert.throws(()=>monthDateRange('2026-13'),/inválido/)
})
test('Never treat the present or future day as missing',()=>{
  const current=model({month:'2026-11',today:'2026-11-07',days:[],closeReport:report('daily')})
  assert.equal(current.unrecordedDays.length,6)
  assert.equal(current.unrecordedDays.at(-1),'2026-11-06')
  assert.ok(!current.unrecordedDays.includes('2026-11-07'))
  const future=model({month:'2026-12',today:'2026-11-07'})
  assert.equal(future.unrecordedDays.length,0)
})
test('History source does not falsely block closure when daily dates are absent',()=>{
  const result=model({history:{month_start:'2026-10-01',data_quality:'verified'},
    closeReport:report('history',true)})
  assert.equal(result.unrecordedDays.length,31)
  assert.equal(result.close.ready,true)
  assert.ok(result.findings.some(x=>x.section==='Registro diario'&&x.severity==='warning'))
  assert.equal(result.findings.some(x=>x.section==='Registro diario'&&x.severity==='critical'),false)
})
test('Daily source warns that elapsed dates require a declared entry even on closed days',()=>{
  const result=model({closeReport:report('daily')})
  assert.equal(result.unrecordedDays.length,31)
  assert.ok(result.findings.some(x=>x.title.includes('jornadas transcurridas')&&x.severity==='critical'))
  assert.ok(result.findings.some(x=>x.detail.includes('No significa que hubiera ventas cero')))
})
test('Flags missing service and financial inconsistencies without changing records',()=>{
  const result=model({days:[
    day('2026-10-05',{status:'draft',analytics_service_entries:[service('lunch')]}),
    day('2026-10-06',{analytics_service_entries:[
      service('lunch',{covers:0,tax_basis:'gross',tax_details:{status:'unverified'}}),
      service('dinner',{covers:1,food_revenue_amount:10,beverage_revenue_amount:0})
    ]})
  ]})
  assert.ok(has(result,'Jornada aún en borrador'))
  assert.ok(has(result,'Servicios incompletos'))
  assert.ok(has(result,'Ingresos sin comensales'))
  assert.ok(has(result,'Servicio cerrado con actividad registrada'))
  assert.ok(has(result,'Ventas registradas en bruto'))
  assert.ok(has(result,'Desglose fiscal sin verificar'))
})
test('Zero revenue with covers is a REVIEW signal, not inferred lost revenue',()=>{
  const result=model({days:[day('2026-10-05',{analytics_service_entries:[
    service('lunch',{covers:4,food_revenue_amount:0,beverage_revenue_amount:0}),
    service('dinner',{covers:0,food_revenue_amount:0,beverage_revenue_amount:0})
  ]})]})
  assert.ok(result.findings.some(x=>x.title==='Comensales sin ingresos'&&x.severity==='warning'))
})
test('Flags duplicate expense periods and gross bases, without inventing IGIC',()=>{
  const result=model({expenses:[
    {period_kind:'daily',period_date:'2026-10-05',category:'rent',amount:50,tax_basis:'gross',igic_amount:null},
    {period_kind:'monthly',period_date:'2026-10-01',category:'rent',amount:200,tax_basis:'net',igic_amount:null}
  ]})
  assert.ok(has(result,'Posible solapamiento de totales diarios y mensuales'))
  assert.ok(has(result,'Gastos en bruto'))
  assert.ok(!result.findings.some(x=>x.detail.includes('IGIC estimado')))
})
test('Closed month with drift warns and does not promise unlocking',()=>{
  const result=model({closure:{revenue_source:'daily',source_fingerprint:'different'},
    closeReport:report('daily',false)})
  assert.equal(result.close.closed,true)
  assert.equal(result.source,'daily')
  assert.ok(has(result,'Datos modificados después del cierre'))
  assert.ok(result.checklistSections.every(x=>typeof x.target==='string'))
})
test('Fails closed on missing/rejected server reconciliation and invalid month',()=>{
  assert.throws(()=>buildDataQuality(base({closeReport:null})),/Falta evaluación/)
  assert.throws(()=>buildDataQuality(base({month:'2026-99'})),/Mes inválido/)
})
test('Data Quality Center UI reads Supabase without modifying finance data',()=>{
  const ui=readFileSync(new URL('../src/pages/admin/AnalyticsDataQuality.jsx',import.meta.url),'utf8')
  const analytics=readFileSync(new URL('../src/pages/admin/Analytics.jsx',import.meta.url),'utf8')
  assert.match(ui,/analytics_evaluate_month_close/)
  for(const table of ['analytics_daily_entries','analytics_expenses',
    'analytics_monthly_inventory','analytics_monthly_history','analytics_monthly_closures']){
    assert.ok(ui.includes(".from('"+table+"')"),'Not reading '+table)
  }
  assert.doesNotMatch(ui,/\.insert\(|\.update\(|\.delete\(|analytics_finalize_month_close/)
  assert.match(ui,/checklistInitial\(\)/)
  assert.match(ui,/No se guardan|No se guarda/)
  assert.match(ui,/onNavigate/)
  assert.match(analytics,/import AnalyticsDataQuality from/)
  assert.match(analytics,/activeTab === 'quality' \? <AnalyticsDataQuality onNavigate=\{setActiveTab\}/)
})
