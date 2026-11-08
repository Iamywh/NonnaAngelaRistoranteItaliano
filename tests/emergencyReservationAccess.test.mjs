import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const sql=readFileSync(
  new URL('../supabase/migrations/20261108_emergency_reservations_anon_containment.sql',import.meta.url),
  'utf8'
)
const publicForm=readFileSync(new URL('../src/pages/Locale.jsx',import.meta.url),'utf8')
const publicBot=readFileSync(new URL('../src/components/VirtualAgent.jsx',import.meta.url),'utf8')
const manager=readFileSync(new URL('../src/pages/admin/ReservationsDashboard.jsx',import.meta.url),'utf8')

test('Anonymous reservation SELECT and UPDATE MVP policies are removed',()=>{
  assert.match(sql,/DROP POLICY IF EXISTS\s+"Allow anon read reservations for dashboard MVP"/)
  assert.match(sql,/DROP POLICY IF EXISTS\s+"Allow anon update reservation status for dashboard MVP"/)
  assert.match(sql,/REVOKE SELECT, UPDATE, DELETE\s+ON TABLE public[.]reservations FROM anon/)
  assert.doesNotMatch(sql,/CREATE POLICY|GRANT SELECT|GRANT UPDATE/)
})

test('Emergency SQL is idempotent and preserves anonymous booking insert',()=>{
  assert.match(sql,/BEGIN;/)
  assert.match(sql,/COMMIT;/)
  assert.doesNotMatch(sql,/DROP POLICY[^;]+Allow public reservation requests/)
  assert.doesNotMatch(sql,/REVOKE INSERT/)
  assert.doesNotMatch(sql,/DROP TABLE|TRUNCATE|DELETE FROM public[.]reservations/)
})

test('Document intentional breakage until secure RPC replacements are ready',()=>{
  assert.match(sql,/public capacity checks/)
  assert.match(sql,/public chatbot phone search and modification/)
  assert.match(sql,/legacy Manager reservations dashboard/)
  // Prevent interpreting static CI as evidence the end-to-end booking works.
  assert.match(publicForm,/publicSupabase[.]from[(]'reservations'[)]/)
  assert.match(publicBot,/publicSupabase[.]from[(]'reservations'[)]/)
  assert.match(manager,/\.from[(]'reservations'[)]/)
})
