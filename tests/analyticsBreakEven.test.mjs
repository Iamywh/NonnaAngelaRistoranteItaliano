import test from 'node:test'
import assert from 'node:assert/strict'
import {checkBreakEvenPlan,parseBreakEvenFields,simulateBreakEven} from '../src/lib/analyticsBreakEven.mjs'

const base=()=>({
  month:'2026-11',openDays:24,lunchDays:24,dinnerDays:24,
  ticketNet:25,fixedMonthlyNet:7000,variablePct:30,
  plannedCovers:800,lunchSharePct:50,lunchCapacity:null,dinnerCapacity:null
})
test('800 customers at net ticket 25 gives 20k simulated revenue and 33.33/day',()=>{
  const result=simulateBreakEven(base())
  assert.equal(result.valid,true)
  assert.equal(result.plannedRevenue,20000)
  assert.equal(result.dailyAveragePlanned,34)
  assert.equal(result.services.lunch.plannedPerService,17)
  assert.equal(result.services.dinner.plannedPerService,17)
})
test('contribution margin and break even threshold computed per whole guest',()=>{
  const result=simulateBreakEven(base())
  assert.equal(result.variablePerCover,7.5)
  assert.equal(result.contribution,17.5)
  assert.equal(result.coversRequired,400)
  assert.equal(result.breakEvenRevenue,10000)
  assert.equal(result.dailyAverageRequired,17)
  assert.equal(result.simulatedOperatingBalance,7000)
  assert.equal(result.distanceCovers,400)
})
test('uneven service days produce different per-service requirements without phantom openings',()=>{
  const result=simulateBreakEven({...base(),lunchDays:15,dinnerDays:24,lunchSharePct:35})
  assert.equal(result.valid,true)
  assert.equal(result.services.lunch.requiredCovers,140)
  assert.equal(result.services.lunch.requiredPerService,10)
  assert.equal(result.services.dinner.requiredCovers,260)
  assert.equal(result.services.dinner.requiredPerService,11)
})
test('a closed service must receive 0 percent of guests',()=>{
  let errors=checkBreakEvenPlan({...base(),lunchDays:0,lunchSharePct:50})
  assert.match(errors.lunchSharePct,/0%/)
  errors=checkBreakEvenPlan({...base(),lunchDays:0,lunchSharePct:0})
  assert.equal(Object.keys(errors).length,0)
})
test('break even cannot be reached with zero contribution and positive fixed costs',()=>{
  const result=simulateBreakEven({...base(),variablePct:100})
  assert.equal(result.viable,false)
  assert.equal(result.coversRequired,null)
})
test('capacity warnings for lunch dinner, but not made-up seating limits',()=>{
  const result=simulateBreakEven({...base(),lunchCapacity:7,dinnerCapacity:50})
  assert.ok(result.capacityAlerts.some(s=>s.includes('almuerzo')))
  assert.ok(!result.capacityAlerts.some(s=>s.includes('cena')))
  assert.equal(simulateBreakEven(base()).capacityAlerts.length,0)
})
test('Spanish decimal comma is parsed, invalid client counts are rejected',()=>{
  const from=Object.fromEntries(Object.entries(base()).map(([k,v])=>[k,v==null?'':String(v)]))
  from.ticketNet='25,01';from.variablePct='30,25';from.fixedMonthlyNet='7000,50'
  let p=parseBreakEvenFields(from)
  assert.equal(p.ticketNet,25.01)
  assert.equal(p.variablePct,30.25)
  assert.equal(p.fixedMonthlyNet,7000.5)
  assert.equal(Object.keys(checkBreakEvenPlan(p)).length,0)
  from.plannedCovers='800,01'
  p=parseBreakEvenFields(from)
  assert.ok(checkBreakEvenPlan(p).plannedCovers)
})
test('never mix gross ticket or unknown costs silently, positive numbers required',()=>{
  assert.ok(checkBreakEvenPlan({...base(),ticketNet:0}).ticketNet)
  assert.ok(checkBreakEvenPlan({...base(),fixedMonthlyNet:NaN}).fixedMonthlyNet)
  assert.ok(checkBreakEvenPlan({...base(),variablePct:101}).variablePct)
  assert.ok(checkBreakEvenPlan({...base(),openDays:0}).openDays)
  assert.ok(checkBreakEvenPlan({...base(),lunchDays:28}).lunchDays)
  assert.ok(checkBreakEvenPlan({...base(),lunchSharePct:101}).lunchSharePct)
  const plan=simulateBreakEven({...base(),ticketNet:0})
  assert.equal(plan.valid,false)
})
test('no saved real profit or tax inference is produced',()=>{
  const result=simulateBreakEven(base())
  assert.ok(!Object.hasOwn(result,'profit'))
  assert.match(result.disclaimer,/NETA|neta|IGIC/)
})
