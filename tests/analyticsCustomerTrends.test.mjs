import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {recentCompletedMonths,buildCustomerTrends} from '../src/lib/analyticsCustomerTrends.mjs'

const ui=readFileSync(new URL('../src/pages/admin/CustomerTrends.jsx',import.meta.url),'utf8')
const analytics=readFileSync(new URL('../src/pages/admin/Analytics.jsx',import.meta.url),'utf8')
const modelSource=readFileSync(new URL('../src/lib/analyticsCustomerTrends.mjs',import.meta.url),'utf8')

function sample(month, requests=10, options={}){
  const activeGuests=requests*2
  const lunch=options.lunchGuests??Math.floor(activeGuests/2)
  const dinner=activeGuests-lunch
  const arrived=options.arrived??0
  const noShow=options.noShow??0
  const unmarked=options.unmarked??(requests-arrived-noShow)
  const day=month+'-03'
  return {
    month,today:'2026-11-07',
    totals:{
      requests,requested_guests:activeGuests,
      pending:0,confirmed:requests,cancelled:0,rejected:0,other_status:0,
      active:requests,active_guests:activeGuests,
      arrived,arrived_guests:arrived*2,
      no_show:noShow,no_show_guests:noShow*2,
      past_unmarked:unmarked,out_of_window:0
    },
    by_service:[
      {service:'lunch',requests:Math.floor(requests/2),active:Math.floor(requests/2),
       active_guests:lunch,arrived:0,arrived_guests:0,no_show:0},
      {service:'dinner',requests:Math.ceil(requests/2),active:Math.ceil(requests/2),
       active_guests:dinner,arrived:0,arrived_guests:0,no_show:0}
    ],
    by_weekday:[{weekday:1,requests,active:requests,active_guests:activeGuests,arrived}],
    by_date:[{day,requests,active:requests,active_guests:activeGuests,arrived,
      arrived_guests:arrived*2,no_show:noShow,cancelled:0,past_unmarked:unmarked}],
    by_lead:[
      {bucket:'same_day',requests:options.sameDay??0},
      {bucket:'eight_plus',requests:requests-(options.sameDay??0)}
    ],
    by_origin:[{origin:'website',requests}],
    by_channel_preference:[{channel_preference:'whatsapp',requests}],
    daily_register:{recorded_days:0,finalized_days:0,recorded_covers:null,comparable:false}
  }
}
const months=()=>[sample('2026-08',20),sample('2026-09',30),sample('2026-10',31)]

test('Only complete months may be selected; leap/December transitions are correct',()=>{
  assert.deepEqual(recentCompletedMonths('2026-10',3,'2026-11'),['2026-08','2026-09','2026-10'])
  assert.deepEqual(recentCompletedMonths('2026-01',3,'2026-02'),['2025-11','2025-12','2026-01'])
  assert.throws(()=>recentCompletedMonths('2026-11',3,'2026-11'),/COMPLETOS/)
  assert.throws(()=>recentCompletedMonths('2026-12',3,'2026-11'),/COMPLETOS/)
  assert.throws(()=>recentCompletedMonths('2026-10',7,'2026-11'),/3 o 6/)
  assert.throws(()=>recentCompletedMonths('2000-02',6,'2026-11'),/suficientes/)
})
test('Month-on-month comparisons use calendar days, not raw monthly totals',()=>{
  const r=buildCustomerTrends(months(),'2026-11')
  assert.equal(r.latest.requests,31)
  assert.equal(r.previous.requests,30)
  assert.equal(r.requestTrendPct,0) // 31/31 versus 30/30
  assert.equal(r.totals.requests,81)
  assert.equal(r.totals.active_guests,162)
  assert.equal(r.months[1].requestsPerCalendarDay,1)
  assert.equal(r.months[2].requestsPerCalendarDay,1)
})
test('Read-only aggregation preserves active-request meaning, no occupancy claims',()=>{
  const r=buildCustomerTrends(months(),'2026-11')
  assert.equal(r.services.find(x=>x.id==='lunch').value+r.services.find(x=>x.id==='dinner').value,162)
  assert.equal(r.weekdays[0].value,162)
  assert.equal(r.leads.reduce((a,b)=>a+b.value,0),81)
  assert.match(r.caveat,/NO son aforo ni ventas/)
})
test('Weekday normalization counts calendar occurrences instead of assuming openings',()=>{
  const r=buildCustomerTrends(months(),'2026-11')
  const occurrences=r.weekdays.reduce((sum,row)=>sum+row.calendarOccurrences,0)
  assert.equal(occurrences,31+30+31)
  assert.ok(r.weekdays.every(x=>Number.isFinite(x.perCalendarOccurrence)))
  assert.equal(r.weekdays.reduce((s,x)=>s+x.value,0),r.totals.active_guests)
})
test('Explicit arrival/no-show coverage calculated on classified active bookings',()=>{
  const r=buildCustomerTrends([
    sample('2026-08',20,{arrived:10,noShow:2,unmarked:8}),
    sample('2026-09',20,{arrived:8,noShow:2,unmarked:10}),
    sample('2026-10',20,{arrived:10,noShow:0,unmarked:10})
  ],'2026-11')
  assert.equal(r.totals.arrived,28)
  assert.equal(r.totals.no_show,4)
  assert.equal(r.markedNoShowPct,12.5)
  assert.equal(r.statusCoveragePct,53.3)
  assert.ok(r.alerts.some(x=>x.title.includes('Cobertura incompleta')))
})
test('Marketing tips require sample size, remain conditional on open days and capacity',()=>{
  const weak=buildCustomerTrends([
    sample('2026-08',30,{lunchGuests:8,sameDay:16}),
    sample('2026-09',30,{lunchGuests:8,sameDay:16}),
    sample('2026-10',30,{lunchGuests:8,sameDay:16})
  ],'2026-11')
  assert.ok(weak.alerts.some(x=>x.title.includes('Turno con menos plazas')))
  assert.ok(weak.alerts.some(x=>x.title==='Demanda de última hora'))
  assert.ok(weak.alerts.some(x=>x.detail.includes('comprueba')||x.detail.includes('Comprueba')))
  const low=buildCustomerTrends([
    sample('2026-08',2),sample('2026-09',3),sample('2026-10',4)
  ],'2026-11')
  assert.ok(low.alerts.some(x=>x.title==='Muestra limitada para decisiones comerciales'))
  assert.ok(!low.alerts.some(x=>x.title==='Demanda de última hora'))
})
test('Decline alert uses daily-calendar rates and requires sufficient observations',()=>{
  const res=buildCustomerTrends([
    sample('2026-08',45),sample('2026-09',40),sample('2026-10',20)
  ],'2026-11')
  assert.ok(res.requestTrendPct<-20)
  assert.ok(res.alerts.some(x=>x.title.includes('caída reciente')))
})
test('Zero or missing data never becomes an invented trend, attendance or success',()=>{
  const empty=buildCustomerTrends([
    sample('2026-08',0),sample('2026-09',0),sample('2026-10',0)
  ],'2026-11')
  assert.equal(empty.requestTrendPct,null)
  assert.equal(empty.markedNoShowPct,null)
  assert.equal(empty.statusCoveragePct,null)
  assert.ok(empty.alerts.some(x=>x.title==='Sin solicitudes registradas'))
})
test('Refuse partial, mixed-order and inconsistent aggregates rather than misleading graph',()=>{
  assert.throws(()=>buildCustomerTrends([sample('2026-10',5)],'2026-11'),/3 o 6/)
  assert.throws(()=>buildCustomerTrends([
    sample('2026-08',5),sample('2026-10',5),sample('2026-09',5)
  ],'2026-11'),/consecutivos/)
  assert.throws(()=>buildCustomerTrends([
    sample('2026-09',5),sample('2026-10',5),sample('2026-11',5)
  ],'2026-11'),/cerrado/)
  const invalid=months();invalid[1].by_lead[0].requests=2
  assert.throws(()=>buildCustomerTrends(invalid,'2026-11'),/incompleto/)
})
test('UI uses only private 13A aggregate RPC and no client-side reservations/PII',()=>{
  assert.match(ui,/Promise\.all\(months\.map/)
  assert.match(ui,/supabase\.rpc\('analytics_customer_intelligence'/)
  assert.match(ui,/buildCustomerTrends\(records,today\)/)
  assert.match(ui,/No se ha podido calcular el período completo/)
  assert.match(ui,/max=\{lastCompleted\}/)
  assert.doesNotMatch(ui,/\.from\('reservations'\)|\.insert\(|\.update\(|\.delete\(/)
  assert.doesNotMatch(ui,/customer_name|customer_email|customer_phone/)
  assert.match(analytics,/import CustomerTrends/)
  assert.match(analytics,/activeTab === 'customer-trends' \? <CustomerTrends onNavigate=\{setActiveTab\}/)
  assert.match(modelSource,/prepareCustomerIntelligence/)
})
