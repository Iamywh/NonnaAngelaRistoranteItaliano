import test from 'node:test'
import assert from 'node:assert/strict'
import {createOrderNotificationHandler,formatOrderMessage} from '../supabase/functions/orders-telegram-notify/handler.mjs'
const id='77eceac8-6ccf-4e25-8bd8-c3d95c5fba74'
const order={id,orderNumber:'NA-example',lines:[{product:'Bresaola',quantity:2,unit:'kg',supplier:'Orthidal',notes:'Consegna domani'}]}
const req=(body={order_id:id})=>new Request('https://test/',{method:'POST',headers:{authorization:'Bearer test'},body:JSON.stringify(body)})
function setup(overrides={}){
 let sends=0,finishes=[]
 const deps={verify:async()=>true,authorize:async()=>true,configured:()=>true,claim:async()=>({state:'claimed',order,attempt:id}),finish:async(...args)=>{finishes.push(args);return true},send:async()=>{sends++;return{ok:true}},...overrides}
 return {handler:createOrderNotificationHandler(deps),counts:()=>({sends,finishes})}
}
test('notification only uses saved server order and ignores browser-supplied lines',async()=>{
 const s=setup();const r=await s.handler(req({order_id:id,lines:'spoofed'}));assert.equal(r.status,200)
 assert.deepEqual(await r.json(),{state:'sent'});assert.equal(s.counts().sends,1);assert.equal(s.counts().finishes[0][2],'sent')
})
test('unverified and unauthorized users cannot claim or send',async()=>{
 for(const overrides of [{verify:async()=>false},{authorize:async()=>false}]){
  let claims=0;const s=setup({...overrides,claim:async()=>{claims++}})
  assert.ok([401,403].includes((await s.handler(req())).status));assert.equal(claims,0);assert.equal(s.counts().sends,0)
 }
})
test('missing configuration leaves saved order pending and unclaimed',async()=>{
 let claims=0;const s=setup({configured:()=>false,claim:async()=>{claims++}})
 assert.equal((await s.handler(req())).status,503);assert.equal(claims,0)
})
test('sent, in-flight and ambiguous notifications cannot trigger another Telegram send',async()=>{
 for(const state of ['sent','sending','uncertain']){const s=setup({claim:async()=>({state})});assert.deepEqual(await(await s.handler(req())).json(),{state});assert.equal(s.counts().sends,0)}
})
test('network ambiguity is retained instead of allowing duplicate retry',async()=>{
 const s=setup({send:async()=>{throw new Error('timeout after delivery')}})
 assert.deepEqual(await(await s.handler(req())).json(),{state:'uncertain'});assert.equal(s.counts().finishes[0][2],'uncertain')
})
test('explicit Telegram rejection allows a later user retry',async()=>{
 const s=setup({send:async()=>({ok:false,error_code:429})})
 assert.deepEqual(await(await s.handler(req())).json(),{state:'failed'})
})
test('failure to persist delivery status is reported without resending',async()=>{
 const s=setup({finish:async()=>false});assert.equal((await s.handler(req())).status,503);assert.equal(s.counts().sends,1)
})
test('large order produces a bounded plain-text message and link',()=>{
 const text=formatOrderMessage({...order,lines:Array.from({length:100},()=>({...order.lines[0],notes:'x'.repeat(500)}))})
 assert.ok(text.length<4096);assert.match(text,/altre/);assert.match(text,/manager\/orders/)
})
test('invalid input and wrong methods are rejected before claiming',async()=>{
 const s=setup();assert.equal((await s.handler(req({order_id:'x'}))).status,400)
 assert.equal((await s.handler(new Request('https://test/'))).status,405)
 assert.equal(s.counts().sends,0)
})

test('groups interleaved lines by supplier and keeps quantities and notes', () => {
  const text = formatOrderMessage({ ...order, lines: [
    { product: 'Prosecco', quantity: 6, unit: 'bottiglie', supplierName: 'Orthidal' },
    { product: 'Coca-Cola', quantity: 24, unit: 'lattine', supplierName: 'GM' },
    { product: 'Pecorino', quantity: 2, unit: 'kg', supplierName: 'Orthidal', notes: 'Intero' }
  ] })
  assert.match(text, /Ordine Orthidal\n• Prosecco — 6 bottiglie\n• Pecorino — 2 kg\n  Intero\n\nOrdine GM\n• Coca-Cola — 24 lattine/)
})
