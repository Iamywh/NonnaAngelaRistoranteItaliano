import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const edge=readFileSync(new URL('../supabase/functions/analytics-digest/index.ts',import.meta.url),'utf8')
const section=edge.split("if(body?.mode==='telegram_test'){")[1]?.split("  const clock=canaryDate(")[0]||''

test('manual Telegram test is guarded by the independent cron secret',()=>{
  const auth=edge.indexOf("if(!await sameSecret")
  const mode=edge.indexOf("if(body?.mode==='telegram_test')")
  assert.ok(auth!==-1&&mode>auth,'secret verification precedes test-mode entry')
})
test('requires explicit confirmation and both automated settings disabled',()=>{
  assert.match(section,/body.confirm!=='SEND_ONE_TEST_MESSAGE'/)
  assert.match(section,/settings\.enabled\|\|settings\.telegram_enabled/)
  assert.match(section,/Disable automated notifications before testing Telegram/)
})
test('sends using only dedicated Analytics bot and destination',()=>{
  assert.match(section,/Deno\.env\.get\('ANALYTICS_TELEGRAM_BOT_TOKEN'\)/)
  assert.match(section,/Deno\.env\.get\('ANALYTICS_TELEGRAM_CHAT_ID'\)/)
  assert.match(section,/token===Deno\.env\.get\('TELEGRAM_BOT_TOKEN'\)/)
  assert.match(section,/api\.telegram\.org/)
  assert.match(section,/sendMessage/)
})
test('a successful manual test returns no token or message contents and never mutates financial records',()=>{
  assert.match(section,/mode:'telegram_test',delivered:true,autoNotificationsEnabled:false/)
  assert.doesNotMatch(section,/\.insert\(|\.update\(|\.delete\(|\.rpc\(/)
  assert.doesNotMatch(section,/JSON\.stringify\(\{[^}]*token/)
})
test('scheduled digest remains separate from manual Telegram test',()=>{
  assert.match(edge,/if\(body\?\.mode==='telegram_test'\)/)
  assert.match(edge,/const cadence=clock\.monday\?\['daily','weekly'\]:\['daily'\]/)
})
