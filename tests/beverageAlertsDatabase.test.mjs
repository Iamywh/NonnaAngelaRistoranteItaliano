import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
test('beverage transition, rearm, weekly DST, chunking, auth and claim isolation',async()=>{
 const db=new PGlite()
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE TABLE beverage_inventory(id smallint PRIMARY KEY,categories jsonb,version bigint,updated_at timestamptz DEFAULT now());`)
 await db.exec(await fs.readFile(new URL('../supabase/migrations/20261112010000_beverage_alerts.sql',import.meta.url),'utf8'))
 const q=async(sql,args=[])=>(await db.query(sql,args)).rows[0]
 const cats=(qty,extra=[])=>[{id:'wine',title:'Vini',unit:'bottiglie',items:[{name:'Gavi',quantity:qty},...extra]}]
 await db.query('INSERT INTO beverage_inventory(id,categories,version) VALUES(1,$1,1)',[JSON.stringify(cats(2))])
 assert.equal((await q('SELECT count(*)::int n FROM beverage_alert_outbox')).n,0)
 await db.exec(`UPDATE beverage_alert_settings SET enabled=true,secret_hash=sha256(convert_to(repeat('a',64),'UTF8')),ticket_expires_at=now()+interval '2 minutes'`)
 let version=1
 const save=async body=>db.query('UPDATE beverage_inventory SET categories=$1,version=$2 WHERE id=1',[JSON.stringify(body),++version])
 await save(cats(0));assert.equal((await q('SELECT count(*)::int n FROM beverage_alert_outbox')).n,1)
 await save(cats(0));assert.equal((await q('SELECT count(*)::int n FROM beverage_alert_outbox')).n,1)
 await save(cats(3));await save(cats(0));assert.equal((await q('SELECT count(*)::int n FROM beverage_alert_outbox')).n,2)
 // New zero item alerts once; unrelated kitchen data is not part of this trigger.
 await save(cats(0,[{name:'New wine',quantity:0}]));assert.equal((await q('SELECT count(*)::int n FROM beverage_alert_outbox')).n,3)
 assert.equal((await q('SELECT beverage_alert_authorize($1) r',['a'.repeat(64)])).r,true)
 assert.equal((await q('SELECT beverage_alert_authorize($1) r',['a'.repeat(64)])).r,false)
 assert.equal((await q('SELECT beverage_alert_authorize($1) r',['b'.repeat(64)])).r,false)
 assert.equal((await q('SELECT beverage_alert_authorize(NULL) r')).r,false)
 const a=(await q('SELECT beverage_alert_claim() r')).r,b=(await q('SELECT beverage_alert_claim() r')).r
 assert.notEqual(a.id,b.id)
 assert.equal((await q('SELECT beverage_alert_finish($1,$2,$3) r',[a.id,b.attempt,'sent'])).r,false)
 assert.equal((await q('SELECT beverage_alert_finish($1,$2,$3) r',[a.id,a.attempt,'sent'])).r,true)
 assert.equal((await q('SELECT beverage_alert_finish($1,$2,$3) r',[a.id,a.attempt,'sent'])).r,false)
 // Sunday 18:00 Tenerife: UTC 18 winter, UTC 17 summer. Once even after clock/retries.
 for(const [before,due] of [['2026-11-15T17:59:00Z','2026-11-15T18:00:00Z'],['2027-07-04T16:59:00Z','2027-07-04T17:00:00Z']]){
  assert.equal((await q('SELECT beverage_alert_due($1) r',[before])).r,0)
  assert.equal((await q('SELECT beverage_alert_due($1) r',[due])).r,1)
  assert.equal((await q('SELECT beverage_alert_due($1) r',[due])).r,0)
 }
 assert.equal((await q("SELECT beverage_alert_due('2026-11-16T18:00:00Z') r")).r,0)
 await save(cats(1,Array.from({length:100},(_,i)=>({name:'Vino '+i+' 🍷'.repeat(30),quantity:1}))))
 const parts=(await q("SELECT beverage_alert_summary('test:long',true) n")).n;assert.ok(parts>1)
 assert.equal((await q("SELECT count(*)::int n FROM beverage_alert_outbox WHERE octet_length(message)>3500")).n,0)
 assert.equal((await q("SELECT beverage_alert_summary('test:long',true) n")).n,0)
 for(const role of ['anon','authenticated']){
  for(const fn of ['beverage_alert_claim()','beverage_alert_authorize(text)','beverage_alert_due(timestamp with time zone)','beverage_alert_summary(text,boolean)'])assert.equal((await q('SELECT has_function_privilege($1,$2,\'execute\') r',[role,fn])).r,false)
  assert.equal((await q('SELECT has_table_privilege($1,\'beverage_alert_outbox\',\'select\') r',[role])).r,false)
 }
 await db.exec('UPDATE beverage_alert_settings SET enabled=false')
 assert.equal((await q('SELECT beverage_alert_authorize($1) r',['a'.repeat(64)])).r,false)
 assert.equal((await q('SELECT beverage_alert_claim() r')).r,null)
 await db.close()
})

test('scheduler uses expiring single-use tickets and dispatches only pending work',async()=>{
 const db=new PGlite()
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE TABLE beverage_inventory(id smallint PRIMARY KEY,categories jsonb,version bigint,updated_at timestamptz DEFAULT now());
 CREATE SCHEMA net; CREATE TABLE net.http_request_queue(id bigserial,headers jsonb); CREATE TABLE net._http_response(id bigint);
 GRANT SELECT ON net.http_request_queue,net._http_response TO PUBLIC;
 CREATE FUNCTION net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds int) RETURNS bigint LANGUAGE sql AS $$ INSERT INTO net.http_request_queue(headers) VALUES(headers) RETURNING id $$;
 CREATE SCHEMA vault; CREATE TABLE vault.decrypted_secrets(name text,decrypted_secret text);
 CREATE FUNCTION vault.create_secret(secret text,name text,description text) RETURNS uuid LANGUAGE sql AS $$ INSERT INTO vault.decrypted_secrets VALUES(name,secret) RETURNING gen_random_uuid() $$;
 CREATE SCHEMA cron; CREATE TABLE cron.job(jobname text,schedule text,active boolean);
 CREATE FUNCTION cron.schedule(name text,schedule text,command text) RETURNS bigint LANGUAGE sql AS $$ INSERT INTO cron.job VALUES(name,schedule,true) RETURNING 1::bigint $$;`)
 await db.exec(await fs.readFile(new URL('../supabase/migrations/20261112010000_beverage_alerts.sql',import.meta.url),'utf8'))
 const installer=(await fs.readFile(new URL('../docs/deployment/beverage-alerts-enable.sql',import.meta.url),'utf8')).replace(/^CREATE EXTENSION.*$/gm,'').replaceAll('<SUPABASE_ANON_KEY>','eyJtest.public.signature')
 await db.exec(installer)
 const q=async(sql)=>(await db.query(sql)).rows[0]
 assert.equal((await q('SELECT beverage_alert_tick() r')).r,null)
 await db.exec("SELECT beverage_alert_summary('test:cron',true)")
 assert.equal((await q('SELECT beverage_alert_tick() r')).r,1)
 assert.equal((await q("SELECT beverage_alert_authorize(headers->>'x-beverage-ticket') r FROM net.http_request_queue")).r,true)
 assert.equal((await q("SELECT beverage_alert_authorize(headers->>'x-beverage-ticket') r FROM net.http_request_queue")).r,false)
 assert.equal((await q("SELECT secret_hash IS NULL AND ticket_expires_at IS NULL r FROM beverage_alert_settings")).r,true)
 assert.equal((await q("SELECT headers->>'Authorization' h FROM net.http_request_queue")).h,'Bearer eyJtest.public.signature')
 assert.equal((await q('SELECT beverage_alert_tick() r')).r,null)
 await db.exec("UPDATE beverage_alert_settings SET secret_hash=sha256(convert_to(repeat('b',64),'UTF8')),ticket_expires_at=now()-interval '1 second'")
 assert.equal((await q("SELECT beverage_alert_authorize(repeat('b',64)) r")).r,false)
 await db.exec("UPDATE beverage_alert_outbox SET state='sending',claimed_at=now()-interval '6 minutes'; SELECT beverage_alert_tick();")
 assert.equal((await q('SELECT state FROM beverage_alert_outbox')).state,'uncertain')
 await db.close()
})
