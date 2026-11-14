import test from 'node:test'
import assert from 'node:assert/strict'
import {PGlite} from '@electric-sql/pglite'
import fs from 'node:fs/promises'
test('migration revokes destructive grants without changing reads or service-role privileges',async()=>{
 const db=new PGlite()
 try{
  await db.exec(`create role anon; create role authenticated; create role service_role;
   create table analytics_daily_entries(id int); create table analytics_service_entries(id int);
   grant select,truncate on analytics_daily_entries,analytics_service_entries to authenticated;
   grant all on analytics_daily_entries,analytics_service_entries to service_role;`)
  const sql=await fs.readFile(new URL('../supabase/migrations/20261114175248_audit_revoke_analytics_truncate.sql',import.meta.url),'utf8')
  await db.exec(sql);await db.exec(sql)
  for(const table of ['analytics_daily_entries','analytics_service_entries']){
   const {rows:[r]}=await db.query(`select has_table_privilege('authenticated',$1,'SELECT') can_read, has_table_privilege('authenticated',$1,'TRUNCATE') can_truncate, has_table_privilege('service_role',$1,'TRUNCATE') service_truncate`,[table])
   assert.deepEqual(r,{can_read:true,can_truncate:false,service_truncate:true})
  }
  await db.exec('set role authenticated')
  await assert.rejects(db.exec('truncate analytics_daily_entries'),/permission denied/)
 }finally{await db.close()}
})
