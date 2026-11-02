import test from 'node:test'
import assert from 'node:assert/strict'
import {canaryIsoDate,shiftDay,previewDigest} from '../src/lib/analyticsDigest.mjs'

const day=(business_date,status,lunch,dinner,lunchOpen='open',dinnerOpen='open')=>({
 business_date,status,lunch_status:lunchOpen,dinner_status:dinnerOpen,
 analytics_service_entries:[
  {service_type:'lunch',covers:lunch},
  {service_type:'dinner',covers:dinner}
 ]
})
test('Canary local calendar date is derived from Canary time, not server UTC date',()=>{
 assert.equal(canaryIsoDate(new Date('2026-11-02T00:15:00Z')),'2026-11-02')
 assert.equal(canaryIsoDate(new Date('2026-07-01T23:15:00Z')),'2026-07-02')
})
test('day windows span month, year and leap-day boundaries',()=>{
 assert.equal(shiftDay('2027-01-01',-1),'2026-12-31')
 assert.equal(shiftDay('2024-03-01',-1),'2024-02-29')
 assert.throws(()=>shiftDay('wrong',-1),/Fecha/)
})
test('daily digest uses only yesterday and finalized registers',()=>{
 const result=previewDigest({
  kind:'daily',today:'2026-11-02',
  days:[day('2026-10-31','finalized',900,900),day('2026-11-01','finalized',17,21)]
 })
 assert.equal(result.begin,'2026-11-01')
 assert.equal(result.end,'2026-11-01')
 assert.equal(result.recorded,1)
 assert.equal(result.total,38)
 assert.equal(result.lunch,17)
 assert.equal(result.dinner,21)
})
test('draft days are provisional and never count as finalized covers',()=>{
 const result=previewDigest({
  kind:'daily',today:'2026-11-02',days:[day('2026-11-01','draft',19,25)]
 })
 assert.equal(result.recorded,1)
 assert.equal(result.finalized,0)
 assert.equal(result.total,0)
 assert.equal(result.provisional,1)
 assert.equal(result.hasData,true)
})
test('closed lunch or dinner never contributes even if bad source row exists',()=>{
 const r=previewDigest({kind:'daily',today:'2026-11-02',
  days:[day('2026-11-01','finalized',12,18,'closed','open')]
 })
 assert.equal(r.lunch,0)
 assert.equal(r.dinner,18)
})
test('weekly digest window uses the 7 prior days, not current Monday',()=>{
 const r=previewDigest({kind:'weekly',today:'2026-11-02',days:[
  day('2026-10-25','finalized',50,50),
  day('2026-10-26','finalized',10,20),
  day('2026-11-01','finalized',15,25),
  day('2026-11-02','finalized',60,60)
 ]})
 assert.equal(r.begin,'2026-10-26')
 assert.equal(r.end,'2026-11-01')
 assert.equal(r.recorded,2)
 assert.equal(r.total,70)
})
test('empty dates are unknown data, not a performance failure',()=>{
 const r=previewDigest({kind:'daily',today:'2026-11-02',days:[]})
 assert.equal(r.hasData,false)
 assert.equal(r.recorded,0)
 assert.match(r.notes.join(' '),/no se tratan/)
})
test('preview never includes sales, expenses, profit or projected values',()=>{
 const r=previewDigest({kind:'daily',today:'2026-11-02',days:[]})
 for(const k of ['revenue','profit','expense','forecast'])assert.equal(Object.hasOwn(r,k),false)
})
test('invalid digest period rejected',()=>{
 assert.throws(()=>previewDigest({kind:'monthly',today:'2026-11-02'}),/Periodicidad/)
})
