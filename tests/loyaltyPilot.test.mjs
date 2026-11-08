import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const sql=readFileSync(
  new URL('../supabase/migrations/20261107_loyalty_cards_pilot.sql',import.meta.url),'utf8'
)
const wallet=readFileSync(new URL('../src/pages/LoyaltyCard.jsx',import.meta.url),'utf8')
const admin=readFileSync(new URL('../src/pages/admin/LoyaltyManager.jsx',import.meta.url),'utf8')
const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8')
const analytics=readFileSync(new URL('../src/pages/admin/Analytics.jsx',import.meta.url),'utf8')
const nav=readFileSync(new URL('../src/components/Navbar.jsx',import.meta.url),'utf8')

const rpcBodies = name=>{
  const re=new RegExp('CREATE FUNCTION public\\.'+name+'\\([^]*?\\$\\$;')
  const found=sql.match(re)
  assert.ok(found,'Missing RPC '+name)
  return found[0]
}

test('Every PL/pgSQL function has balanced, double-dollar SQL delimiters',()=>{
  const declarations=(sql.match(/^CREATE FUNCTION public[.]loyalty_[a-z_]+[(]/gm)||[]).length
  const openings=(sql.match(/^AS [$][$]$/gm)||[]).length
  const closings=(sql.match(/^[$][$];$/gm)||[]).length
  assert.equal(declarations,10)
  assert.equal(openings,declarations)
  assert.equal(closings,declarations)
  assert.doesNotMatch(sql,/^AS [$]$/m)
  assert.doesNotMatch(sql,/^[$];$/m)
  assert.ok(sql.includes('CREATE FUNCTION public.loyalty_public_program()'))
})

test('Loyalty program defaults OFF, cannot issue without a real configured reward',()=>{
  assert.match(sql,/issuing_enabled boolean NOT NULL DEFAULT false/)
  assert.match(sql,/reward_threshold integer NOT NULL DEFAULT 5/)
  assert.match(sql,/reward_threshold BETWEEN 3 AND 12/)
  assert.match(sql,/CONSTRAINT loyalty_settings_enabled_reward/)
  assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.loyalty_public_program\(\) TO anon,authenticated/)
  assert.match(wallet,/loyalty_public_program/)
  assert.match(wallet,/Próximamente/)
  assert.match(sql,/IF NOT v_cfg\.issuing_enabled OR v_cfg\.reward_label IS NULL/)
  assert.match(admin,/desactivado/)
  assert.match(admin,/p_issuing_enabled:draft\.issuing_enabled/)
})

test('Card issue only by authorized Analytics owners/admins, never by anonymous customers',()=>{
  assert.match(sql,/auth\.role\(\) = 'authenticated'/)
  assert.match(sql,/public\.analytics_user_roles r/)
  assert.match(sql,/r\.role IN \('owner','admin'\)/)
  for(const rpc of ['loyalty_admin_settings','loyalty_admin_configure','loyalty_admin_issue',
    'loyalty_admin_lookup','loyalty_admin_stamp','loyalty_admin_redeem']){
    assert.match(sql,new RegExp('REVOKE ALL ON FUNCTION public\\.'+rpc+'\\('))
    assert.match(sql,new RegExp('GRANT EXECUTE ON FUNCTION public\\.'+rpc+'\\([^;]+ TO authenticated;'))
    assert.match(rpcBodies(rpc),/IF NOT public\.loyalty_staff_authorized\(\)/)
  }
  assert.doesNotMatch(wallet,/loyalty_admin_issue|loyalty_admin_stamp|loyalty_admin_redeem/)
})

test('All raw tables remain inaccessible to public and authenticated direct queries',()=>{
  for(const table of ['loyalty_program_settings','loyalty_cards','loyalty_visits','loyalty_redemptions']){
    assert.match(sql,new RegExp('CREATE TABLE public\\.'+table+' \\('))
    assert.match(sql,new RegExp('ALTER TABLE public\\.'+table+' ENABLE ROW LEVEL SECURITY'))
  }
  assert.match(sql,/REVOKE ALL ON public\.loyalty_program_settings,public\.loyalty_cards,[\s\S]*FROM PUBLIC,anon,authenticated/)
  assert.doesNotMatch(sql,/GRANT (?:SELECT|INSERT|UPDATE|DELETE) ON .*loyalty_(?:cards|visits|redemptions)/)
  assert.doesNotMatch(sql,/CREATE POLICY /)
})

test('Issue stores only SHA256 token, short lookup codes never authenticate the public wallet',()=>{
  assert.match(sql,/replace\(gen_random_uuid\(\)::text,'-',''\)/)
  assert.match(sql,/v_hash:=encode\(sha256\(convert_to\(v_token,'UTF8'\)\),'hex'\)/)
  assert.match(sql,/secret_sha256 text NOT NULL UNIQUE/)
  assert.match(sql,/public_code text NOT NULL UNIQUE/)
  assert.doesNotMatch(sql,/CREATE TABLE public\.loyalty_cards[\s\S]*?customer_phone|customer_email|customer_name/)
  assert.match(sql,/RETURN jsonb_build_object\(\s*'token',v_token/)
  assert.match(wallet,/location\.hash/)
  assert.match(wallet,/#card=/)
  assert.match(wallet,/localStorage\.setItem\(STORAGE_KEY,token\)/)
  assert.match(wallet,/Guardar en este dispositivo/)
})

test('Earned reward terms freeze at issuance and cannot be changed retroactively',()=>{
  assert.match(sql,/v_cfg\.reward_threshold,v_cfg\.reward_label,auth\.uid\(\)/)
  assert.match(sql,/reward_threshold integer NOT NULL CHECK/)
  assert.match(sql,/reward_label text NOT NULL CHECK/)
  assert.doesNotMatch(rpcBodies('loyalty_admin_configure'),/UPDATE public\.loyalty_cards/)
  assert.match(admin,/tarjetas ya entregadas mantendrán sus condiciones/)
})

test('One verified visit per calendar date, controlled backfill and audit staff user',()=>{
  assert.match(sql,/UNIQUE\(card_id,visit_date\)/)
  assert.match(sql,/p_visit_date>v_today OR p_visit_date<v_today-7/)
  assert.match(sql,/FOR UPDATE/)
  assert.match(sql,/INSERT INTO public\.loyalty_visits\(card_id,visit_date,stamped_by\)/)
  assert.match(sql,/VALUES\(v_card\.id,p_visit_date,auth\.uid\(\)\)/)
  assert.match(sql,/ON CONFLICT\(card_id,visit_date\) DO NOTHING/)
  assert.match(admin,/He verificado la visita real/)
  assert.match(admin,/!witnessed/)
})

test('No over-redemption, one redemption per day and staff approval',()=>{
  assert.match(sql,/UNIQUE\(card_id,redeemed_on\)/)
  assert.match(sql,/\(v_visits\/v_card\.reward_threshold\) - v_redeemed < 1/)
  assert.match(sql,/ON CONFLICT\(card_id,redeemed_on\) DO NOTHING/)
  assert.match(sql,/INSERT INTO public\.loyalty_redemptions/)
  assert.match(admin,/¿Has ENTREGADO físicamente el premio/)
  assert.match(admin,/card\.available_rewards<1/)
})

test('Public wallet is bearer-token-only and offers self-service erasure',()=>{
  assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.loyalty_public_card\(text\) TO anon,authenticated/)
  assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.loyalty_public_delete\(text\) TO anon,authenticated/)
  assert.match(rpcBodies('loyalty_public_card'),/p_token !~ '\^\[0-9a-f\]\{64\}\$'/)
  assert.match(sql,/secret_sha256=encode\(sha256\(convert_to\(p_token,'UTF8'\)\),'hex'\)/)
  assert.match(sql,/REFERENCES public\.loyalty_cards\(id\) ON DELETE CASCADE/g)
  assert.match(wallet,/loyalty_public_card/)
  assert.match(wallet,/loyalty_public_delete/)
  assert.match(wallet,/Borrar DEFINITIVAMENTE esta tarjeta/)
  assert.match(wallet,/Olvidar tarjeta aquí/)
  assert.doesNotMatch(wallet,/customer_phone|customer_email|customer_name/)
})

test('Does not read reservations, trigger marketing or alter existing RLS/webhooks',()=>{
  for(const input of [sql,wallet,admin]){
    assert.doesNotMatch(input,/public\.reservations|\.from\('reservations'\)|analytics_telegram_entry|telegram_bot_token/)
    assert.doesNotMatch(input,/sendEmail\(|sendWhatsApp\(|marketing_opt_in|newsletter_subscribers/)
  }
  assert.match(app,/famiglia: '\/famiglia'/)
  assert.match(app,/currentPage === 'famiglia'\) return <LoyaltyCard/)
  assert.match(nav,/id: 'famiglia'/)
  assert.match(analytics,/import LoyaltyManager/)
  assert.match(analytics,/activeTab === 'loyalty' \? <LoyaltyManager/)
})
