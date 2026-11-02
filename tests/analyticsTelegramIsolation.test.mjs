import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const worker=readFileSync(new URL('../supabase/functions/analytics-digest/index.ts',import.meta.url),'utf8')
const docs=readFileSync(new URL('../docs/analytics-phase11-deployment.md',import.meta.url),'utf8')
const ui=readFileSync(new URL('../src/pages/admin/AnalyticsNotifications.jsx',import.meta.url),'utf8')

test('Analytics worker only uses dedicated Telegram bot token for sends',()=>{
  assert.match(worker,/const token=Deno\.env\.get\('ANALYTICS_TELEGRAM_BOT_TOKEN'\)/)
  assert.doesNotMatch(worker,/const token=Deno\.env\.get\('TELEGRAM_BOT_TOKEN'\)/)
})
test('Analytics worker fails closed if dedicated token matches reservation bot token',()=>{
  assert.match(worker,/token===Deno\.env\.get\('TELEGRAM_BOT_TOKEN'\)/)
  assert.match(worker,/different from reservations bot/)
})
test('The dedicated Analytics destination and documentation stay separate',()=>{
  assert.match(worker,/Deno\.env\.get\('ANALYTICS_TELEGRAM_CHAT_ID'\)/)
  assert.match(docs,/ANALYTICS_TELEGRAM_BOT_TOKEN/)
  assert.match(ui,/ANALYTICS_TELEGRAM_BOT_TOKEN/)
})
test('In-app digests remain opt-in and missing cron secret is rejected',()=>{
  assert.match(worker,/ANALYTICS_CRON_SECRET/)
  assert.match(worker,/error:'Unauthorized'\},401/)
})
