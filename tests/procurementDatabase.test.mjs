import {PGlite} from '@electric-sql/pglite'
import test from 'node:test'
import fs from 'node:fs/promises'
import assert from 'node:assert/strict'
test('Private costs and procurement RPCs enforce role checks, revisions and idempotency',async()=>{
const db=new PGlite()
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('test.role',true) $$;
CREATE TABLE public.staff_module_permissions(user_id uuid,module text);
CREATE FUNCTION public.analytics_has_permission(text) RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce(current_setting('test.admin',true),'')='true' $$;`)
const root=new URL('../',import.meta.url).pathname
for(const f of ['20261110170000_manager_costs_procurement.sql','20261110171000_manager_workbook_seed.sql'])await db.exec(await fs.readFile(root+'supabase/migrations/'+f,'utf8'))
const uid='77eceac8-6ccf-4e25-8bd8-c3d95c5fba74'
await db.exec(`SET test.uid='${uid}'; SET test.role='authenticated'; SET test.admin='true';`)
const q=async(sql,args=[])=> (await db.query(sql,args)).rows[0]
const fail=async(sql,args,pattern)=>{await assert.rejects(db.query(sql,args),pattern)}
const model=(await q('select manager_cost_load() as r')).r
assert.equal(model.body.params.fixed_monthly,20000);assert.equal(model.body.rows.filter(r=>r.source_row).length,31)
assert.equal(model.body.rows.length,34)
assert.equal((await q("select count(*)::int n from procurement_products")).n,123)
let saved=(await q('select manager_cost_save($1,$2,$3) as r',[model.version,JSON.stringify({...model.body.params,fixed_monthly:21000}),JSON.stringify(model.body.rows)])).r
assert.equal(saved.version,2)
await fail('select manager_cost_save($1,$2,$3)',[1,JSON.stringify(model.body.params),JSON.stringify(model.body.rows)],/Conflitto/)
await fail('select manager_cost_save($1,$2,$3)',[2,JSON.stringify({...model.body.params,raw_target:.99}),JSON.stringify(model.body.rows)],/Targets/)
let p=(await q("select body||jsonb_build_object('version',version) p from procurement_products where id='ingredients:bresaola'")).p
let updated=(await q('select procurement_product_save($1,$2,$3,$4,$5,$6) r',[p.id,p.version,2,4,p.supplier,p.unit_cost])).r
assert.equal(updated.quantity,2);assert.equal(updated.version,2)
await fail('select procurement_product_save($1,$2,$3,$4,$5,$6)',[p.id,p.version,5,4,p.supplier,p.unit_cost],/Conflitto/)
await db.exec(`SET test.admin='false'; INSERT INTO staff_module_permissions VALUES ('${uid}','orders')`)
await fail('select manager_cost_load()',[],/Access denied/)
await fail('select procurement_product_save($1,$2,$3,$4,$5,$6)',[p.id,2,3,4,'gm',50],/Only admin/)
updated=(await q('select procurement_product_save($1,$2,$3,$4,$5,$6) r',[p.id,2,3,4,p.supplier,p.unit_cost])).r
assert.equal(updated.quantity,3)
const lines=[{product_id:p.id,quantity:2,notes:'test'}]
const oid='00000000-0000-4000-8000-000000000001'
const a=(await q('select procurement_order_create($1,$2) r',[oid,JSON.stringify(lines)])).r
const b=(await q('select procurement_order_create($1,$2) r',[oid,JSON.stringify(lines)])).r
assert.deepEqual(a,b);assert.equal(a.lines[0].product,'Bresaola')
assert.equal((await q('select count(*)::int n from procurement_orders')).n,1)
await fail('select procurement_order_create($1,$2)',[oid,JSON.stringify([{...lines[0],quantity:3}])],/already used/)
await fail('select procurement_order_create($1,$2)',['00000000-0000-4000-8000-000000000002',JSON.stringify([{...lines[0],quantity:-1}])],/Invalid/)
const claim=(await q('select procurement_notify_claim($1) r',[oid])).r
assert.equal(claim.state,'claimed');assert.equal((await q('select procurement_notify_claim($1) r',[oid])).r.state,'sending')
assert.equal((await q('select procurement_notify_finish($1,$2,$3) r',[oid,oid,'sent'])).r,false)
assert.equal((await q('select procurement_notify_finish($1,$2,$3) r',[oid,claim.attempt,'sent'])).r,true)
assert.equal((await q('select procurement_notify_claim($1) r',[oid])).r.state,'sent')
for(const table of ['manager_cost_model','procurement_products','procurement_orders','procurement_suppliers']){
 assert.equal((await q('select has_table_privilege($1,$2,$3) r',['authenticated','public.'+table,'select'])).r,false)
 assert.equal((await q('select has_table_privilege($1,$2,$3) r',['anon','public.'+table,'truncate'])).r,false)
}
assert.equal((await q("select has_function_privilege('authenticated','public.procurement_notify_claim(uuid)','execute') r")).r,false)
await db.exec('DELETE FROM staff_module_permissions')
await fail('select procurement_load()',[],/Access denied/)
await fail('select procurement_order_list()',[],/Access denied/)
await db.exec("SET test.uid=''; SET test.role='anon'")
await fail('select procurement_order_create($1,$2)',['00000000-0000-4000-8000-000000000002',JSON.stringify(lines)],/Access denied/)
await db.exec('SET ROLE authenticated')
await fail('SELECT * FROM public.manager_cost_model',[],/permission denied/)
await fail('select procurement_notify_claim($1)',[oid],/permission denied/)
await db.exec('RESET ROLE; SET ROLE anon')
await fail('select procurement_load()',[],/permission denied/)
await fail('select manager_cost_load()',[],/permission denied/)
await db.exec('RESET ROLE')
await db.close()

})
