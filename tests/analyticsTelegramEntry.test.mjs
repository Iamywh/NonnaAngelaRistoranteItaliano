import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const source=readFileSync(new URL('../supabase/functions/analytics-telegram-entry/index.ts',import.meta.url),'utf8')
const sql=readFileSync(new URL('../supabase/migrations/20261102_create_analytics_telegram_entry.sql',import.meta.url),'utf8')
const config=readFileSync(new URL('../supabase/config.toml',import.meta.url),'utf8')

test('Telegram entry webhook has separate JWT-bypass config and rejects unknown webhook secrets',()=>{
 assert.match(config,/\[functions\.analytics-telegram-entry\]\s*verify_jwt\s*=\s*false/)
 assert.match(source,/x-telegram-bot-api-secret-token/)
 assert.match(source,/expected\.length<32/)
 assert.match(source,/return json\(\{error:'Unauthorized'\},401\)/)
})
test('Analytics-only bot and strict private sender/chat allowlist',()=>{
 for(const key of ['ANALYTICS_TELEGRAM_BOT_TOKEN','ANALYTICS_TELEGRAM_CHAT_ID',
                   'ANALYTICS_TELEGRAM_USER_ID','ANALYTICS_ENTRY_ACTOR_UID'])
   assert.ok(source.includes(key),key+' missing')
 assert.match(source,/token===reservationBot/)
 assert.match(source,/chat\.type!=='private'/)
 assert.match(source,/String\(chat\.id\)!==allowedChat/)
 assert.match(source,/String\(from\.id\)!==allowedSender/)
 assert.doesNotMatch(source,/\.from\('reservations'\)/)
})
test('No user-input actor/date bypass; service-only atomic RPC',()=>{
 assert.match(sql,/IF auth\.role\(\) IS DISTINCT FROM 'service_role'/)
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.analytics_telegram_entry_process[\s\S]*FROM PUBLIC,anon,authenticated/)
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.analytics_telegram_entry_process[\s\S]*TO service_role/)
 assert.match(source,/p_actor:actor/)
 assert.match(sql,/r\.user_id=p_actor AND r\.is_active AND r\.role IN \('owner','admin'\)/)
 assert.match(sql,/v_today date := \(now\(\) AT TIME ZONE 'Atlantic\/Canary'\)::date/)
})
test('Explicit confirmation stores draft and never overwrites existing dates',()=>{
 assert.match(sql,/upper\(v_text\)<>'CONFIRMAR'/)
 assert.match(sql,/status,created_by,updated_by\)[\s\S]*'draft',p_actor,p_actor/)
 assert.match(sql,/WHERE business_date=v_date/)
 assert.match(sql,/analytics_monthly_closures/)
 assert.doesNotMatch(sql,/ON CONFLICT \(business_date\) DO UPDATE/)
 assert.match(sql,/analytics_service_entries/)
 assert.match(sql,/analytics_telegram_entry_audit/)
})
test('Telegram replay is idempotent and both services require real inputs',()=>{
 assert.match(sql,/update_id bigint PRIMARY KEY/)
 assert.match(sql,/ON CONFLICT DO NOTHING/)
 assert.match(sql,/RETURN jsonb_build_object\('ok',true,'duplicate',true,/)
 assert.match(sql,/IF v_text !~ '\^\[0-9\]\{1,5\}\$'/)
 assert.match(sql,/v_step IN \('lunch_food','lunch_beverage','dinner_food','dinner_beverage'\)/)
 assert.match(sql,/v_step IN \('lunch_basis','dinner_basis'\)/)
 assert.match(sql,/IF v_status='closed'/)
 assert.match(sql,/tax_details/)
})
test('No default money from reservations, no silent IGIC computation, and receipts preserve reply',()=>{
 assert.doesNotMatch(sql,/\bFROM public\.reservations\b|\bUPDATE public\.reservations\b/i)
 assert.doesNotMatch(sql,/analytics_upsert_expense|analytics_save_daily/)
 assert.match(sql,/'\{"status":"unverified"\}'::jsonb/)
 assert.match(sql,/SET reply=v_reply,saved_day_id=v_saved/)
 assert.match(source,/if\(data\.reply\)await sendMessage\(token,allowedChat,data\.reply\)/)
})
