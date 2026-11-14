import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
test('public bookings keep pending inserts but cannot populate staff fields or forge states',async()=>{
 const db=new PGlite()
 try{
  await db.exec(`create role anon; create table reservations(
   id uuid default gen_random_uuid(), customer_name text,customer_phone text,customer_email text,
   reservation_date date,reservation_time time,guests int,status text default 'pending',
   area_preference text,notes text,source text default 'website',phone_country_code text,
   phone_country_iso text,confirmation_channel text,reservation_status text default 'pending',
   service_status text default 'not_arrived',internal_notes text,assigned_tables text[] default '{}');
   alter table reservations enable row level security; grant insert on reservations to anon;
   create policy original_insert on reservations for insert to anon with check (status='pending' and source='website');`)
  const migration=await fs.readFile(new URL('../supabase/migrations/20261114175415_audit_public_reservation_permissions.sql',import.meta.url),'utf8')
  await db.exec(migration);await db.exec(migration);await db.exec('set role anon')
  await db.query("insert into reservations(customer_name,customer_phone,reservation_date,reservation_time,guests,status,source,reservation_status,service_status) values ('Synthetic','000000','2027-02-01','13:00',2,'pending','website','pending','not_arrived')")
  for(const field of ['internal_notes','assigned_tables','id']) await assert.rejects(db.exec(`insert into reservations(${field}) values (null)`),/permission denied/)
  await assert.rejects(db.exec("insert into reservations(reservation_status) values ('confirmed')"),/row-level security/)
  await assert.rejects(db.exec("insert into reservations(service_status) values ('completed')"),/row-level security/)
  await assert.rejects(db.exec('select * from reservations'),/permission denied/)
  await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from reservations')).rows[0].n,1)
 }finally{await db.close()}
})
