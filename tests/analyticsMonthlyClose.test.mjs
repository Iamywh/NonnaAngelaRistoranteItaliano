import test from 'node:test'
import assert from 'node:assert/strict'
import { closeStatus, closeReadyForSubmission, managerialNetResult } from '../src/lib/analyticsMonthlyClose.mjs'

const report={ready:true,fingerprint:'abc',issues:[],figures:{
  revenue_net:20000,food_consumption_net:4000,
  beverage_consumption_net:1000,other_expenses_net:8500
}}
const checks={sales:true,expenses:true,inventory:true,igic:true,scope:true}
test('net operating result subtracts consumption rather than double counting purchases',()=>{
  assert.equal(managerialNetResult(report.figures),6500)
})
test('cannot close when the server reports incomplete data',()=>{
  assert.equal(closeReadyForSubmission({...report,ready:false},null,checks,'cierre revisado'),false)
})
test('five explicit confirmations and evidence are mandatory',()=>{
  assert.equal(closeReadyForSubmission(report,null,checks,'cierre revisado'),true)
  for(const k of Object.keys(checks)){
    assert.equal(closeReadyForSubmission(report,null,{...checks,[k]:false},'cierre revisado'),false)
  }
  assert.equal(closeReadyForSubmission(report,null,checks,'brev'),false)
  assert.equal(closeReadyForSubmission(report,null,checks,'a'.repeat(1501)),false)
})
test('existing closed month cannot be finalized again by UI',()=>{
  assert.equal(closeReadyForSubmission(report,{source_fingerprint:'abc'},checks,'cierre revisado'),false)
})
test('changed sources are flagged without changing original stored figures',()=>{
  const closed={source_fingerprint:'abc',operating_result_net:6500}
  assert.equal(closeStatus(report,closed),'consistent')
  assert.equal(closeStatus({...report,fingerprint:'new'},closed),'changed')
  assert.equal(closed.operating_result_net,6500)
})
test('closing is not claimed consistent when source evaluation fails',()=>{
  assert.equal(closeStatus(null,{source_fingerprint:'abc'}),'unavailable')
  assert.equal(closeStatus({...report,ready:false},{source_fingerprint:'abc'}),'unavailable')
  assert.equal(closeStatus({...report,ready:false,fingerprint:'changed'},
    {source_fingerprint:'abc'}),'changed')
})
test('negative or missing financial inputs cannot be interpreted as zero',()=>{
  assert.equal(managerialNetResult({...report.figures,other_expenses_net:null}),null)
  assert.equal(managerialNetResult({...report.figures,food_consumption_net:-10}),null)
  assert.equal(managerialNetResult(null),null)
})
