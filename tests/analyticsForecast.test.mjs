import test from 'node:test'
import assert from 'node:assert/strict'
import {
  shiftMonth,nextCanaryMonth,defaultScenarios,historyBaseline,
  validateForecastPlan,projectForecast
} from '../src/lib/analyticsForecast.mjs'

const history=(month,revenue,covers,basis='gross',quality='verified')=>({
  month_start:month+'-01',revenue_total:revenue,covers,tax_basis:basis,data_quality:quality
})
const plan=(extra={})=>({
  forecast_start:'2026-12',tax_basis:'gross',baseline_mode:'manual',
  manual_covers:600,manual_ticket:40,monthly_capacity:null,
  scenarios:defaultScenarios(),notes:'',...extra
})
test('month arithmetic supports year boundaries without date-time shifts',()=>{
  assert.equal(shiftMonth('2026-12',1),'2027-01')
  assert.equal(shiftMonth('2027-01',-2),'2026-11')
  assert.equal(nextCanaryMonth(new Date('2026-11-01T16:00:00Z')),'2026-12')
})
test('verified history filters out estimates, incompatible IGIC basis, no covers and future months',()=>{
  const source=[
    history('2026-08',11000,250),history('2026-09',16000,400),
    history('2026-10',24000,600),
    history('2026-11',29000,700,'net'),
    history('2026-07',18000,460,'gross','estimated'),
    history('2027-01',20000,900)
  ]
  const base=historyBaseline(source,'2026-12','gross')
  assert.deepEqual(base.months,['2026-10','2026-09','2026-08'])
  assert.equal(base.covers,417)
  assert.equal(base.ticket,40.8)
  assert.equal(base.sampleSize,3)
})
test('if no verified historical covers, do not invent a base',()=>{
  assert.equal(historyBaseline([
    history('2026-10',24000,null),history('2026-09',19000,500,'gross','estimated')
  ],'2026-12','gross'),null)
  const output=projectForecast(plan({baseline_mode:'history',manual_covers:null,manual_ticket:null}),[],[])
  assert.equal(output.available,false)
})
test('baseline mode manual yields exact base and 3-6-12 cumulative outputs with no data mixing',()=>{
  const result=projectForecast(plan(),[
    history('2026-10',24000,600,'gross','estimated')
  ],[])
  assert.equal(result.available,true)
  assert.equal(result.reference.sampleSize,0)
  const base=result.series.find(s=>s.name==='base')
  assert.equal(base.points.length,12)
  assert.equal(base.points[0].month,'2026-12')
  assert.equal(base.points[0].revenue,24000)
  assert.deepEqual(base.horizons.map(h=>h.revenue),[72000,144000,288000])
  assert.deepEqual(base.horizons.map(h=>h.covers),[1800,3600,7200])
})
test('growth is compounded, not linear 3 percentage points each month',()=>{
  const output=projectForecast(plan(),[],[])
  const optimistic=output.series.find(s=>s.name==='optimistic')
  assert.equal(optimistic.points[0].covers,618)
  assert.ok(optimistic.points[1].covers>optimistic.points[0].covers)
  assert.ok(optimistic.points[11].ticket>optimistic.points[1].ticket)
})
test('capacity ceiling caps covers and reports cap rather than inventing extra seating',()=>{
  const output=projectForecast(plan({monthly_capacity:605}),[],[])
  const optimistic=output.series.find(s=>s.name==='optimistic')
  assert.equal(optimistic.points[0].covers,605)
  assert.equal(optimistic.points[0].capped,true)
  assert.equal(optimistic.points[0].revenue,Math.round(605*40.6*100)/100)
})
test('targets compare only if fiscal basis matches and never auto-assume',()=>{
  const output=projectForecast(plan(),[],[
    {month_start:'2026-12-01',revenue_target:25000,revenue_basis:'net'},
    {month_start:'2027-01-01',revenue_target:26000,revenue_basis:'gross'}
  ])
  const points=output.series.find(s=>s.name==='base').points
  assert.equal(points[0].revenueTarget,null)
  assert.equal(points[0].targetDelta,null)
  assert.equal(points[1].revenueTarget,26000)
  assert.equal(points[1].targetDelta,-2000)
})
test('reject fractional covers, unsupported growth percentages and missing tax basis',()=>{
  assert.ok(validateForecastPlan(plan({manual_covers:800.01})).length>0)
  assert.ok(validateForecastPlan(plan({tax_basis:''})).length>0)
  assert.ok(validateForecastPlan(plan({scenarios:{
    ...defaultScenarios(),optimistic:{covers_growth_pct:35,ticket_growth_pct:0}
  }})).length>0)
})
test('history baseline uses weighted revenue over covers rather than average tickets',()=>{
  const base=historyBaseline([
    history('2026-10',12000,300),history('2026-09',18000,600)
  ],'2026-12','gross')
  assert.equal(base.covers,450)
  assert.equal(base.ticket,33.33)
  assert.equal(base.limited,true)
})
test('there is no claim of profit in forecast output',()=>{
  const result=projectForecast(plan(),[],[])
  assert.equal(Object.hasOwn(result,'profit'),false)
  assert.match(result.disclaimer,/No incluye gastos/)
})
