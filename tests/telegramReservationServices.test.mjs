import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {transform} from 'esbuild'

test('reservation webhook routes day, lunch, dinner and interactive date reports',async()=>{
 const source=await fs.readFile(new URL('../supabase/functions/telegram-reservations-bot/index.ts',import.meta.url),'utf8')
 const code=(await transform(source.replace(/^import .*createClient.*$/m,'const createClient = () => globalThis.__testReservationDb'),{loader:'ts',format:'esm'})).code
 const originalFetch=global.fetch, originalDeno=global.Deno
 let handler;const sent=[];const queries=[];let session=null
 const rows=[
  {customer_name:'LunchOnly',reservation_time:'16:59:59',guests:2,reservation_status:'confirmed'},
  {customer_name:'DinnerOnly',reservation_time:'17:00:00',guests:3,reservation_status:'pending'},
  {customer_name:'Cancelled',reservation_time:'13:00:00',guests:9,reservation_status:'cancelled'}
 ]
 global.__testReservationDb={from(table){const filters=[];let operation='read';const q={
  select(){return q},eq(k,v){filters.push(['eq',k,v]);return q},lt(k,v){filters.push(['lt',k,v]);return q},gte(k,v){filters.push(['gte',k,v]);return q},order(){return q},
  upsert(value){session=value;return Promise.resolve({error:null})},delete(){operation='delete';return q},maybeSingle(){return Promise.resolve({data:session,error:null})},
  then(resolve,reject){if(operation==='delete'){session=null;return Promise.resolve({error:null}).then(resolve,reject)}queries.push({table,filters});const data=rows.filter(r=>filters.every(([op,k,v])=>k==='reservation_date'||(op==='lt'?r[k]<v:op==='gte'?r[k]>=v:true)));return Promise.resolve({data,error:null}).then(resolve,reject)}
 };return q}}
 global.Deno={env:{get:k=>({SUPABASE_URL:'https://example.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic',TELEGRAM_BOT_TOKEN:'synthetic',TELEGRAM_CHAT_ID:'123'}[k])},serve:fn=>{handler=fn}}
 global.fetch=async(_url,options)=>{sent.push(JSON.parse(options.body));return new Response('{"ok":true}',{status:200})}
 try{
  const mod=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))
  const command=async(text,chatId=123)=>{sent.length=0;queries.length=0;const r=await handler(new Request('https://example.invalid',{method:'POST',body:JSON.stringify({message:{chat:{id:chatId},from:{id:456},text}})}));assert.equal((await r.json()).ok,true);return sent.map(m=>m.text).join('\n')}
  let report=await command('/reslunch@TestBot')
  assert.match(report,/Almuerzo/);assert.match(report,/LunchOnly/);assert.doesNotMatch(report,/DinnerOnly|9 pax/);assert.match(report,/Personas: 2/)
  assert.ok(queries[0].filters.some(f=>f[0]==='lt'&&f[2]==='17:00:00'))
  report=await command('/resdinner');assert.match(report,/Cena/);assert.match(report,/DinnerOnly/);assert.doesNotMatch(report,/LunchOnly/);assert.match(report,/Personas: 3/)
  report=await command('/reservashoy');assert.match(report,/LunchOnly/);assert.match(report,/DinnerOnly/);assert.match(report,/Personas: 5/)
  assert.equal(queries[0].filters.find(f=>f[1]==='reservation_date')[2],mod.getTodayDateValue())
  report=await command('/reservasdate');assert.match(report,/Qué fecha/);assert.equal(sent[0].reply_markup.force_reply,true)
  report=await command('31-02-2027');assert.match(report,/Formato no reconocido/);assert.ok(session)
  report=await command('21-12-2026');assert.match(report,/LunchOnly/);assert.match(report,/DinnerOnly/);assert.equal(session,null);assert.equal(queries[0].filters[0][2],'2026-12-21')
  report=await command('/reservasdate 22-12-2026');assert.match(report,/LunchOnly/);assert.equal(queries[0].filters[0][2],'2026-12-22')
  report=await command('/help');for(const c of ['/reslunch','/resdinner','/reservashoy','/reservasdate'])assert.ok(report.includes(c))
  await command('/reslunch',999);assert.equal(sent.length,0);assert.equal(queries.length,0)
  rows.splice(0,rows.length);report=await command('/resdinner');assert.match(report,/No hay reservas activas para este servicio/)
  assert.equal(mod.getTodayDateValue(new Date('2026-07-01T23:30:00Z')),'2026-07-02')
  assert.equal(mod.getTodayDateValue(new Date('2026-12-01T23:30:00Z')),'2026-12-01')
 }finally{global.fetch=originalFetch;global.Deno=originalDeno;delete global.__testReservationDb}
})
