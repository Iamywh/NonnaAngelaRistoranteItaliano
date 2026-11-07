import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(
  new URL('../supabase/migrations/20261107_add_analytics_telegram_expense_entry.sql', import.meta.url), 'utf8'
)
const functionSource = readFileSync(
  new URL('../supabase/functions/analytics-telegram-entry/index.ts', import.meta.url), 'utf8'
)
const expenseMigration = readFileSync(
  new URL('../supabase/migrations/20261101_create_analytics_expenses.sql', import.meta.url), 'utf8'
)
const dailyMigration = readFileSync(
  new URL('../supabase/migrations/20261102_create_analytics_telegram_entry.sql', import.meta.url), 'utf8'
)

test('Uses the existing private Analytics bot and a single service-only RPC', () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.analytics_telegram_entry_process/)
  assert.match(migration, /IF auth\.role\(\) IS DISTINCT FROM 'service_role'/)
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.analytics_telegram_entry_process[\s\S]*?FROM PUBLIC,anon,authenticated/)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.analytics_telegram_entry_process[\s\S]*?TO service_role/)
  assert.match(migration, /r\.user_id=p_actor AND r\.is_active AND r\.role IN \('owner','admin'\)/)
  assert.match(migration, /'\/startexpense'/)
  assert.match(migration, /'\/startentry'/)
  assert.match(migration, /'\/cancel'/)
  assert.match(functionSource, /analytics_telegram_entry_process/)
  assert.match(functionSource, /data\.saved_day_id\|\|data\.saved_expense_id/)
  assert.doesNotMatch(migration, /public\.reservations/)
})

test('Shares the receipt ID across both wizards and persists expense receipt on retry', () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS saved_expense_id uuid;/)
  assert.doesNotMatch(migration, /saved_expense_id uuid REFERENCES/)
  assert.doesNotMatch(migration, /expense_id uuid NOT NULL UNIQUE REFERENCES public\.analytics_expenses/)
  assert.match(migration, /INSERT INTO public\.analytics_telegram_entry_updates\(update_id,chat_id,sender_id,reply\)/)
  assert.match(migration, /ON CONFLICT DO NOTHING/)
  assert.match(migration, /'duplicate',true/)
  assert.match(migration, /'saved_expense_id',v_previous\.saved_expense_id/)
  assert.match(migration, /saved_expense_id=v_saved_expense/)
  assert.match(migration, /'saved_expense_id',v_saved_expense/)
})

test('Expense wizard preserves real finance categories and demands explicit confirmation', () => {
  const allCategories = [
    'food_purchases','beverage_purchases','payroll','rent','utilities','marketing',
    'cleaning_supplies','packaging','maintenance','professional_services','bank_fees','other'
  ]
  for (const category of allCategories) {
    assert.ok(migration.includes("'" + category + "'"), 'Missing expense category: ' + category)
    assert.ok(expenseMigration.includes("'" + category + "'"), 'Schema missing expense category: ' + category)
  }
  for (const step of ['expense_period','expense_date','expense_category','expense_amount',
    'expense_basis','expense_igic','expense_notes','expense_confirm']) {
    assert.ok(migration.includes("'" + step + "'"), 'Wizard step not handled: ' + step)
  }
  assert.match(migration, /IF upper\(v_text\)<>'CONFIRMAR'/)
  assert.match(migration, /ELSE 'monthly'::text/)
  assert.match(migration, /v_number<=0/)
  assert.match(migration, /No se calcula autom[aá]ticamente/)
  assert.match(migration, /WHEN 'expense_igic' THEN/)
})

test('Does not overwrite totals, checks monthly close, and creates both audit records', () => {
  assert.match(migration, /pg_advisory_xact_lock\(\s*hashtext\('nonna_month_close'\)/)
  assert.match(migration, /IF EXISTS\(SELECT 1 FROM public\.analytics_monthly_closures/)
  assert.match(migration, /INSERT INTO public\.analytics_expenses\([\s\S]*?ON CONFLICT\(period_kind,period_date,category\) DO NOTHING/)
  assert.doesNotMatch(migration, /ON CONFLICT\(period_kind,period_date,category\) DO UPDATE/)
  assert.match(migration, /INSERT INTO public\.analytics_expense_audit/)
  assert.match(migration, /INSERT INTO public\.analytics_telegram_expense_audit/)
  assert.match(migration, /analytics_has_permission\('analytics.read'\)/)
  assert.match(migration, /REVOKE ALL ON public\.analytics_telegram_expense_audit FROM PUBLIC,anon,authenticated/)
  assert.match(expenseMigration, /analytics_expenses_unique_period_category/)
})

test('Retains original daily entry contract in the upgraded function', () => {
  assert.match(dailyMigration, /CREATE FUNCTION public\.analytics_telegram_entry_process/)
  assert.match(migration, /INSERT INTO public\.analytics_daily_entries/)
  assert.match(migration, /INSERT INTO public\.analytics_service_entries/)
  assert.match(migration, /INSERT INTO public\.analytics_telegram_entry_audit/)
  assert.match(migration, /'draft',p_actor,p_actor/)
  assert.match(migration, /v_step='confirm'/)
  assert.match(migration, /IF v_saved IS NULL AND v_saved_expense IS NULL/)
  assert.match(migration, /v_session\.expires_at < now\(\)/)
})
