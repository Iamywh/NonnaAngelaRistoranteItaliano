import test from 'node:test'
import assert from 'node:assert/strict'
import {createManualHandler} from '../supabase/functions/manager-manual-docs/handler.mjs'
function setup({role='admin',active=true,valid=true}={}){
 const calls=[]
 const storage={list:async()=>{calls.push('list');return {data:[{name:'checklist-apertura-sala.pdf'}]}},download:async name=>{calls.push('download');return {data:new Blob(['%PDF-test'])}},upload:async()=>{calls.push('upload');return {error:null}}}
 const admin={auth:{getUser:async token=>({data:{user:valid?{id:'synthetic-user'}:null},error:valid?null:Error('expired')})},from(name){assert.equal(name,'analytics_user_roles');return {select(){return this},eq(key,value){assert.equal(key,'user_id');assert.equal(value,'synthetic-user');return this},maybeSingle:async()=>({data:role?{role,is_active:active}:null})}},storage:{from(name){assert.equal(name,'manager-manual');return storage}}}
 return {handler:createManualHandler(()=>admin),calls}
}
const req=(path='?status=1',options={})=>new Request('https://example.invalid/'+path,{headers:{Authorization:'Bearer synthetic-test'},...options})
test('manuals deny missing/expired/nonstaff/inactive credentials before storage',async()=>{
 for(const settings of [{role:null},{role:'staff'},{active:false},{valid:false}]){
  const {handler,calls}=setup(settings);const r=await handler(req());assert.ok([401,403].includes(r.status));assert.deepEqual(calls,[])
 }
 const {handler,calls}=setup();assert.equal((await handler(req('?status=1',{headers:{'x-manager-password':'old-test'}}))).status,401);assert.deepEqual(calls,[])
})
test('owner and admin status/download use private responses and fixed filenames',async()=>{
 for(const role of ['owner','admin']){
  const {handler,calls}=setup({role});const status=await handler(req());assert.equal(status.status,200);assert.equal((await status.json()).documents.apertura,true)
  const pdf=await handler(req('?document=apertura&download=1'));assert.equal(pdf.status,200);assert.equal(pdf.headers.get('cache-control'),'private, no-store');assert.match(pdf.headers.get('content-disposition'),/attachment/)
  assert.equal((await handler(req('?document=__proto__'))).status,400);assert.deepEqual(calls,['list','download'])
 }
})
test('synthetic PDF upload validates format and rejects unsupported methods',async()=>{
 const {handler,calls}=setup()
 assert.equal((await handler(req('?document=apertura',{method:'POST',headers:{Authorization:'Bearer test','Content-Type':'application/pdf'},body:'not pdf'}))).status,415)
 assert.equal((await handler(req('?document=apertura',{method:'POST',headers:{Authorization:'Bearer test','Content-Type':'application/pdf'},body:'%PDF-1.7 test'}))).status,200)
 assert.equal((await handler(req('?status=1',{method:'DELETE'}))).status,405)
 assert.deepEqual(calls,['upload'])
})
