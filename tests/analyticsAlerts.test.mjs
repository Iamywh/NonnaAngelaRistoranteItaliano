import test from 'node:test'
import assert from 'node:assert/strict'
import {buildManagementAlerts,DEFAULT_ALERT_THRESHOLDS,validateAlertThresholds} from '../src/lib/analyticsAlerts.mjs'

const month='2026-10',prev='2026-09',currentMonth='2026-11'
const row=(name,overrides={})=>({
  month:name,status:'verified',source:'Historico verificado',basis:'gross',
  revenue:20000,covers:800,ticket:25,target:23000,targetBasis:'gross',targetDelta:-3000,
  recordedDays:0,finalizedDays:0,daysInMonth:name==='2026-09'?30:31,
  expenseTotal:null,expenseBasis:null,closureStatus:null,
  foodConsumption:null,beverageConsumption:null,otherExpenses:null,operatingResult:null,
  warnings:[],...overrides
})
const metric=(overrides={})=>({
  complete:false,recordedDays:0,finalizedDays:0,daysInMonth:31,
  daily:[],revenueMixed:false,expenseMixed:false,
  overlappingExpenseCategories:[],missingOpenServices:false,
  expenseTotal:null,expenseBases:[],
  consumption:{food:{valid:false,rate:null},beverage:{valid:false,rate:null}},
  ...overrides
})
const target=(overrides={})=>({
  revenue_target:23000,covers_target:900,ticket_target:30,
  revenue_basis:'gross',expense_basis:'gross',expense_ceiling:null,
  food_cost_ceiling_pct:null,beverage_cost_ceiling_pct:null,...overrides
})
const run=(overrides={})=>{
 const config={
  month,currentMonth,
  report:{months:[row(prev),row(month)]},
  metrics:{[month]:metric(),[prev]:metric()},
  targets:{[month]:target()},
  expenses:{[month]:[],[prev]:[]},
  ...overrides
 }
 return buildManagementAlerts(config)
}
const find=(result,fragment)=>result.alerts.find(x=>x.id.endsWith(fragment))
test('real, verified month triggers threshold-based sales, covers and ticket alerts',()=>{
 const x=run()
 assert.ok(find(x,'target-revenue'))
 assert.ok(find(x,'target-covers'))
 assert.ok(find(x,'target-ticket'))
 assert.equal(x.evaluated,true)
 assert.equal(find(x,'target-revenue').reference,23000)
})
test('partial month is informative, never appears as target underperformance',()=>{
 const x=run({
  month:'2026-11',
  report:{months:[row('2026-10'),row('2026-11',{
   status:'partial',revenue:700,covers:29,ticket:24.14,recordedDays:2,finalizedDays:1,daysInMonth:30
  })]},
  metrics:{'2026-11':metric({recordedDays:2,finalizedDays:1,daysInMonth:30,
   daily:[{covers:17,finalized:true},{covers:12,finalized:false}]})},
  targets:{'2026-11':target()}
 })
 assert.equal(x.evaluated,false)
 assert.ok(find(x,'partial'))
 assert.equal(find(x,'target-revenue'),undefined)
 assert.equal(find(x,'target-covers'),undefined)
 assert.equal(x.coverage.coversFinalized,17)
 assert.equal(x.coverage.coversProvisional,12)
})
test('estimated historical revenue is never treated as verified actual',()=>{
 const x=run({report:{months:[row(prev),row(month,{status:'estimated'})]}})
 assert.ok(find(x,'estimated'))
 assert.equal(find(x,'target-revenue'),undefined)
 assert.equal(x.evaluated,false)
})
test('mixed bases and monthly/daily expense overlaps are flagged regardless of sales quality',()=>{
 const x=run({report:{months:[row(prev),row(month,{status:'partial'})]},
  metrics:{[month]:metric({
   revenueMixed:true,expenseMixed:true,missingOpenServices:true,
   overlappingExpenseCategories:['payroll']
  })}})
 for(const suffix of ['mixed-sales','mixed-costs','overlap','services'])
  assert.ok(find(x,suffix),suffix+' expected')
 assert.equal(x.counts.critical,3)
})
test('stale closure is critical, and no financial alerts use its snapshot',()=>{
 const x=run({
  report:{months:[row(prev),row(month,{
   status:'closed',basis:'net',closureStatus:'changed'
  })]},
  targets:{[month]:target({revenue_basis:'net'})}
 })
 assert.ok(find(x,'stale-close'))
 assert.equal(find(x,'target-revenue'),undefined)
 assert.equal(x.evaluated,false)
})
test('unverifiable closure is not a trusted source',()=>{
 const x=run({report:{months:[row(prev),row(month,{
  status:'closed',basis:'net',closureStatus:'unavailable'
 })]}})
 assert.ok(find(x,'unverified-close'))
 assert.equal(find(x,'target-revenue'),undefined)
})
test('tax basis mismatch blocks revenue and ticket goals while covers may still compare',()=>{
 const x=run({
  report:{months:[row(prev),row(month,{basis:'net'})]},
  targets:{[month]:target({revenue_basis:'gross'})}
 })
 assert.equal(find(x,'target-revenue'),undefined)
 assert.equal(find(x,'target-ticket'),undefined)
 assert.ok(find(x,'target-covers'))
})
test('if all goals are reached there are no commercial shortfall alerts',()=>{
 const x=run({
  report:{months:[row(prev),row(month,{revenue:25000,covers:1000,ticket:25})]},
  targets:{[month]:target({revenue_target:20000,covers_target:800,ticket_target:20})}
 })
 assert.equal(find(x,'target-revenue'),undefined)
 assert.equal(find(x,'target-covers'),undefined)
 assert.equal(find(x,'target-ticket'),undefined)
})
test('food and beverage percent limits only work with complete reconciled inventory',()=>{
 const full=metric({complete:true,recordedDays:31,finalizedDays:31,
  consumption:{food:{valid:true,rate:40},beverage:{valid:true,rate:21}}})
 const x=run({metrics:{[month]:full},targets:{[month]:target({
   food_cost_ceiling_pct:33,beverage_cost_ceiling_pct:25
 })}})
 assert.ok(find(x,'cost-food'))
 assert.equal(find(x,'cost-beverage'),undefined)
 const incomplete=run({targets:{[month]:target({food_cost_ceiling_pct:33})}})
 assert.equal(find(incomplete,'cost-food'),undefined)
})
test('expense ceiling only on closed month with consistent source and matching basis',()=>{
 const close=row(month,{status:'closed',basis:'net',closureStatus:'consistent'})
 const full=metric({expenseTotal:9000,expenseBases:['net']})
 const allowedResult=run({
  report:{months:[row(prev),close]},
  metrics:{[month]:full},
  targets:{[month]:target({revenue_basis:'net',expense_basis:'net',expense_ceiling:8000})}
 })
 assert.ok(find(allowedResult,'budget'))
 const wrongBasis=run({
  report:{months:[row(prev),close]},metrics:{[month]:full},
  targets:{[month]:target({revenue_basis:'net',expense_basis:'gross',expense_ceiling:8000})}
 })
 assert.equal(find(wrongBasis,'budget'),undefined)
})
test('monthly revenue drops need 2 verified months with same basis',()=>{
 const a=run({report:{months:[row(prev,{revenue:28000}),row(month,{revenue:20000})]},
  targets:{[month]:target({revenue_target:10000,covers_target:500,ticket_target:20})}})
 assert.ok(find(a,'sales-drop'))
 const b=run({report:{months:[row(prev,{revenue:28000,basis:'net'}),row(month)]}})
 assert.equal(find(b,'sales-drop'),undefined)
 const c=run({report:{months:[row(prev,{status:'partial',revenue:28000}),row(month)]}})
 assert.equal(find(c,'sales-drop'),undefined)
})
test('category anomaly only with 2 consistent closes and observed net expenses in both',()=>{
 const closed=name=>row(name,{status:'closed',basis:'net',closureStatus:'consistent'})
 const exp={
  [prev]:[{category:'rent',amount:1000,tax_basis:'net',period_kind:'monthly'}],
  [month]:[{category:'rent',amount:1400,tax_basis:'net',period_kind:'monthly'}]
 }
 const result=run({report:{months:[closed(prev),closed(month)]},expenses:exp})
 assert.ok(find(result,'expense-rent'))
 const bad=run({report:{months:[closed(prev),row(month)]},expenses:exp})
 assert.equal(find(bad,'expense-rent'),undefined)
 const gross=run({report:{months:[closed(prev),closed(month)]},
  expenses:{...exp,[month]:[{...exp[month][0],tax_basis:'gross'}]}})
 assert.equal(find(gross,'expense-rent'),undefined)
})
test('category expense comparison requires observed previous record, not invented zero',()=>{
 const closed=name=>row(name,{status:'closed',basis:'net',closureStatus:'consistent'})
 const r=run({report:{months:[closed(prev),closed(month)]},
  expenses:{[prev]:[],[month]:[{category:'payroll',amount:5500,tax_basis:'net',period_kind:'monthly'}]}})
 assert.equal(find(r,'expense-payroll'),undefined)
})
test('category period overlap blocks expense comparison',()=>{
 const closed=name=>row(name,{status:'closed',basis:'net',closureStatus:'consistent'})
 const x=run({
  report:{months:[closed(prev),closed(month)]},
  metrics:{[month]:metric({overlappingExpenseCategories:['rent']})},
  expenses:{
   [prev]:[{category:'rent',amount:1000,tax_basis:'net',period_kind:'monthly'}],
   [month]:[{category:'rent',amount:1600,tax_basis:'net',period_kind:'monthly'},
    {category:'rent',amount:500,tax_basis:'net',period_kind:'daily'}]
  }
 })
 assert.equal(find(x,'expense-rent'),undefined)
 assert.ok(find(x,'overlap'))
})
test('thresholds must be integer 1-100; no arbitrary string coercion',()=>{
 assert.deepEqual(validateAlertThresholds({...DEFAULT_ALERT_THRESHOLDS,revenueDropPct:0}),['revenueDropPct'])
 assert.deepEqual(validateAlertThresholds({...DEFAULT_ALERT_THRESHOLDS,expenseIncreasePct:'25'}),['expenseIncreasePct'])
 assert.throws(()=>run({thresholds:{...DEFAULT_ALERT_THRESHOLDS,coversShortfallPct:150}}),/Umbral/)
})
test('empty goals are informative, not a failed business target',()=>{
 const x=run({targets:{}})
 assert.ok(find(x,'no-goals'))
 assert.equal(find(x,'target-revenue'),undefined)
})
