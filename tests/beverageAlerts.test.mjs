import test from 'node:test'
import assert from 'node:assert/strict'
import {createBeverageAlertHandler} from '../supabase/functions/beverage-telegram-alerts/handler.mjs'
const secret='a'.repeat(64)
const req=(token=secret)=>new Request('https://worker.test',{method:'POST',headers:{'x-beverage-secret':token}})
function fixture(overrides={}){
 const finished=[],sent=[];let claimed=false
 const deps={authorize:async()=>true,configured:()=>true,claim:async()=>claimed?null:(claimed=true,{id:'one',attempt:'attempt',text:'TEST'}),send:async text=>(sent.push(text),{ok:true}),finish:async(...args)=>(finished.push(args),true),pause:async()=>{},...overrides}
 return {handler:createBeverageAlertHandler(deps),finished,sent}
}
test('worker rejects public callers before any claim',async()=>{
 const x=fixture({claim:()=>assert.fail('unauthorized claim')})
 assert.equal((await x.handler(req(''))).status,401)
 assert.equal((await fixture({authorize:async()=>false,claim:()=>assert.fail('invalid secret claim')}).handler(req())).status,401)
 assert.equal((await x.handler(new Request('https://worker.test'))).status,405)
})
test('worker sends claimed text once and finishes matching attempt',async()=>{
 const x=fixture();assert.equal((await x.handler(req())).status,200)
 await x.handler(req());assert.deepEqual(x.sent,['TEST']);assert.deepEqual(x.finished,[['one','attempt','sent',null]])
})
test('explicit rejection is failed, timeout is uncertain; neither retried',async()=>{
 for(const [send,state] of [[async()=>({ok:false,error_code:400}),'failed'],[async()=>{throw Error('timeout')},'uncertain'],[async()=>({}),'uncertain']]){
  let count=0;const x=fixture({claim:async()=>{count++;return {id:'one',attempt:'attempt',text:'TEST'}},send})
  assert.equal((await x.handler(req())).status,502);assert.equal(count,1);assert.equal(x.finished[0][2],state)
 }
})
test('missing bot configuration does not claim a message',async()=>{
 const x=fixture({configured:()=>false,claim:()=>assert.fail('claim without config')});assert.equal((await x.handler(req())).status,503)
})
