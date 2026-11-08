import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Phase 15: deterministic, offline contract checks. They do NOT connect to
// production Supabase, exercise live Telegram webhooks, or certify GDPR/RLS.
const file=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
const json=path=>JSON.parse(file(path))

const app=file('src/App.jsx')
const navbar=file('src/components/Navbar.jsx')
const clients=file('src/lib/supabaseClient.js')
const booking=file('src/pages/Locale.jsx')
const agent=file('src/components/VirtualAgent.jsx')
const managerReservations=file('src/pages/admin/ReservationsDashboard.jsx')
const analytics=file('src/pages/admin/Analytics.jsx')
const loyaltyWallet=file('src/pages/LoyaltyCard.jsx')
const loyaltyManager=file('src/pages/admin/LoyaltyManager.jsx')
const growth=file('src/pages/admin/GrowthPlanner.jsx')
const editorial=file('src/pages/admin/EditorialCalendar.jsx')
const creative=file('src/pages/admin/CreativeLibrary.jsx')
const menu=file('src/pages/Menu.jsx')
const reservationBot=file('supabase/functions/telegram-reservations-bot/index.ts')
const analyticsBot=file('supabase/functions/analytics-telegram-entry/index.ts')
const reservationNotifier=file('supabase/functions/reservation-telegram-notify/index.ts')
const rlsDiagnostics=file('docs/phase15/read-only-rls-diagnostics.sql')
const creativeMigration=file('supabase/migrations/20261108_analytics_creative_library.sql')
const editorialMigration=file('supabase/migrations/20261108_analytics_editorial_calendar.sql')
const growthMigration=file('supabase/migrations/20261108_analytics_growth_campaigns.sql')
const loyaltyMigration=file('supabase/migrations/20261107_loyalty_cards_pilot.sql')
const loyaltyEconomicsMigration=file('supabase/migrations/20261108_loyalty_economics.sql')
const intelligenceMigration=file('supabase/migrations/20261107_analytics_customer_intelligence.sql')

test('Routes for restaurant, bookings, menu, loyalty and Analytics remain defined',()=>{
  for(const path of ['/restaurante','/menu','/bebidas','/famiglia',
    '/manager/reservas','/manager/analytics']){
    assert.ok(app.includes("'"+path+"'"),'Missing route '+path)
  }
  assert.match(app,/window[.]addEventListener[(]'popstate'/)
  assert.match(app,/new Set[(]\[/)
  assert.match(app,/if [(]isAdminPage[(]currentPage[)] && !isAdminMode[)]/)
})

test('Anonymous reservation client remains separate from authenticated Analytics',()=>{
  assert.match(clients,/export const publicSupabase = createClient/)
  for(const snippet of ['persistSession: false','autoRefreshToken: false',
    'detectSessionInUrl: false']){
    assert.ok(clients.includes(snippet),snippet)
  }
  for(const [name,source] of [['booking form',booking],['chatbot',agent]]){
    assert.match(source,/publicSupabase[.]from[(]'reservations'[)]/,name)
    assert.doesNotMatch(source,/(?<!public)\bsupabase[.]from[(]'reservations'[)]/,name)
  }
  assert.match(analytics,/supabase[.]auth[.]signInWithPassword/)
  assert.match(analytics,/analytics_user_roles/)
  assert.match(analytics,/['"]owner['"].*['"]admin['"]/)
  assert.doesNotMatch(analytics,/publicSupabase/)
})

test('Frontend never includes service role secrets or webhook secret values',()=>{
  for(const [name,s] of Object.entries({
    supabaseClient:clients,webApp:app,bookingForm:booking,virtualAgent:agent,
    analyticsPage:analytics,loyaltyPage:loyaltyWallet
  })){
    assert.doesNotMatch(s,/SUPABASE_SERVICE_ROLE_KEY|ANALYTICS_TELEGRAM_BOT_TOKEN|ANALYTICS_TELEGRAM_WEBHOOK_SECRET/,name)
  }
  assert.match(navbar,/VITE_MANAGER_PASSWORD/)
  assert.match(app,/sessionStorage[.]getItem[(]'nonna_manager_unlocked'[)]/)
  // Presence of the legacy client-side Manager gate is explicitly NOT a
  // server-side authorization guarantee. Must be resolved in Phase 16.
})

test('Reservations editor status models remain available for live manual test',()=>{
  assert.match(managerReservations,/reservation_status/)
  assert.match(managerReservations,/service_status/)
  assert.match(managerReservations,/no_show/)
  assert.match(managerReservations,/confirmed/)
  assert.match(managerReservations,/customer_name/)
  assert.match(booking,/reservation_status: 'pending'/)
  assert.match(agent,/reservation_status: 'pending'/)
  assert.match(clients,/reservation-telegram-notify/)
})

test('Telegram reservation/Analytics bots remain distinct and auth gate stays present',()=>{
  assert.match(reservationBot,/\/reservashoy/)
  assert.match(reservationBot,/TELEGRAM_BOT_TOKEN/)
  assert.match(reservationBot,/TELEGRAM_CHAT_ID/)
  assert.match(analyticsBot,/ANALYTICS_TELEGRAM_BOT_TOKEN/)
  assert.match(analyticsBot,/ANALYTICS_TELEGRAM_WEBHOOK_SECRET/)
  assert.match(analyticsBot,/x-telegram-bot-api-secret-token/)
  assert.match(analyticsBot,/ANALYTICS_TELEGRAM_CHAT_ID/)
  assert.match(analyticsBot,/ANALYTICS_TELEGRAM_USER_ID/)
  assert.match(analyticsBot,/analytics_telegram_entry_process/)
  assert.match(analyticsBot,/token===reservationBot/)
  assert.match(reservationNotifier,/TELEGRAM_CHAT_ID/)
  assert.match(file('supabase/migrations/20261102_create_analytics_telegram_entry.sql'),/\/startentry/)
  assert.match(file('supabase/migrations/20261107_add_analytics_telegram_expense_entry.sql'),/\/startexpense/)
})

test('Customer Intelligence server API stays aggregate-only and guarded',()=>{
  assert.match(intelligenceMigration,/SECURITY DEFINER SET search_path = ''/)
  assert.match(intelligenceMigration,/analytics_has_permission[(]'analytics.read'[)]/)
  assert.match(intelligenceMigration,/REVOKE ALL ON FUNCTION public[.]analytics_customer_intelligence/)
  assert.match(intelligenceMigration,/GRANT EXECUTE ON FUNCTION public[.]analytics_customer_intelligence/)
  assert.doesNotMatch(analytics,/publicSupabase/)
})

test('Loyalty program preserves staff-authorized stamps, bearer token and deletion',()=>{
  assert.match(loyaltyMigration,/issuing_enabled boolean NOT NULL DEFAULT false/)
  assert.match(loyaltyMigration,/loyalty_staff_authorized/)
  assert.match(loyaltyMigration,/UNIQUE[(]card_id,visit_date[)]/)
  assert.match(loyaltyMigration,/secret_sha256/)
  assert.match(loyaltyWallet,/loyalty_public_delete/)
  assert.match(loyaltyManager,/loyalty_admin_stamp/)
  assert.match(loyaltyManager,/loyalty_admin_redeem/)
  assert.match(loyaltyEconomicsMigration,/loyalty_admin_economics/)
})

test('Growth Planner campaigns are manually logged and audited, not launched',()=>{
  assert.match(growth,/analytics_growth_save/)
  assert.match(growth,/analytics_growth_list/)
  assert.match(growthMigration,/analytics_growth_editor/)
  assert.match(growthMigration,/revision=revision[+]1/)
  assert.match(growthMigration,/analytics_growth_audit/)
  assert.doesNotMatch(growth,/facebook[.]com\/v[0-9]|graph[.]facebook[.]com|ads[.]google[.]com\/api/)
})

test('Editorial review and publishing remain manual operations',()=>{
  assert.match(editorial,/analytics_editorial_action/)
  assert.match(editorial,/YA fue publicado o ejecutado FUERA del sitio/)
  assert.match(editorialMigration,/analytics_editorial_authorized/)
  assert.match(editorialMigration,/rights_checked/)
  assert.match(editorialMigration,/status='draft',approved_at=NULL,approved_by=NULL/)
  assert.doesNotMatch(editorial,/graph[.]facebook[.]com|\/media_publish/)
})

test('Creative Library media are private, with verified-rights linking only',()=>{
  assert.match(creativeMigration,/'nonna-creative-library','nonna-creative-library',false/)
  assert.match(creativeMigration,/CREATE POLICY creative_library_staff_select/)
  assert.match(creativeMigration,/CREATE POLICY creative_library_staff_insert/)
  assert.match(creativeMigration,/Only active assets with verified usage rights can be linked/)
  assert.match(creativeMigration,/rights_checked=false/)
  assert.match(creative,/createSignedUrl[(]asset[.]storage_path,600[)]/)
  assert.match(creative,/upsert:false/)
  assert.doesNotMatch(creative,/getPublicUrl/)
})

test('Menu catalogue and declared allergen aliases resolve to defined badges',()=>{
  const allergens=json('src/data/allergens.json')
  const valid=new Set(allergens.map(a=>a.id))
  assert.equal(valid.size,allergens.length)
  assert.ok(valid.size>=14)
  const aliasBlock=menu.match(/const ALLERGEN_ALIASES = \{([\s\S]*?)\n\}/)
  assert.ok(aliasBlock,'Cannot find menu allergen aliases')
  const aliases=Object.fromEntries([...aliasBlock[1].matchAll(
    /^\s*(?:'([^']+)'|([a-z_]+)):\s*'([^']+)'/gm
  )].map(m=>[m[1]||m[2],m[3]]))
  assert.equal(aliases.senape,'mostaza','Italian senape must show mustard warning')
  for(const [label,code] of Object.entries(aliases)){
    assert.ok(valid.has(code),'Unrecognized allergen mapping: '+label+' -> '+code)
  }
  const filenames=[
    'AntipastiFreddi','AntipastiCaldi','PrimiPiatti','SecondiPiatti',
    'EspecialidadesSemana','Contorni','insalate','Dolci'
  ]
  let checked=0
  for(const name of filenames){
    const list=json('data/menu/'+name+'.json')
    assert.ok(Array.isArray(list),'Missing menu array '+name)
    const ids=new Set()
    for(const dish of list){
      assert.ok(dish.id,'Dish is missing ID in '+name)
      assert.ok(!ids.has(dish.id),'Duplicated dish ID '+dish.id+' in '+name)
      ids.add(dish.id)
      checked++
      for(const field of ['allergens','allergens_es','allergens_to_verify']){
        const values=Array.isArray(dish[field])?dish[field]:[]
        for(const value of values){
          const raw=String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'')
            .toLowerCase().trim().replace(/[_-]+/g,' ').replace(/\s+/g,' ')
          assert.ok(aliases[raw]&&valid.has(aliases[raw]),
            name+'/'+dish.id+' unrecognized allergen: '+value)
        }
      }
    }
  }
  assert.ok(checked>=25,'Catalogue unusually small')
  assert.match(menu,/allergen-disclaimer/)
})

test('All new server RPC migrations retain balanced PostgreSQL dollar quotes',()=>{
  for(const [name,source] of Object.entries({
    loyalty:loyaltyMigration,loyaltyEconomics:loyaltyEconomicsMigration,
    intelligence:intelligenceMigration,growth:growthMigration,
    editorial:editorialMigration,creative:creativeMigration
  })){
    const start=(source.match(/^AS [$][$]$/gm)||[]).length
    const end=(source.match(/^[$][$];$/gm)||[]).length
    assert.equal(start,end,name+' has unbalanced PostgreSQL delimiter')
    assert.ok(start>0,name+' missing dollar-quoted functions')
    assert.doesNotMatch(source,/^AS [$]$/m)
    assert.doesNotMatch(source,/^[$];$/m)
  }
})

test('RLS diagnostic SQL is read-only and contains no customer row queries',()=>{
  assert.match(rlsDiagnostics,/pg_policies/)
  assert.match(rlsDiagnostics,/role_table_grants/)
  assert.match(rlsDiagnostics,/column_privileges/)
  assert.match(rlsDiagnostics,/pg_class/)
  assert.doesNotMatch(rlsDiagnostics,/\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE)\b(?![^\n]*--)/i)
  assert.doesNotMatch(rlsDiagnostics,/SELECT\s+\*\s+FROM\s+public[.]reservations/i)
})

test.todo('LIVE: verify anon/guest cannot read reservation PII or modify other reservations via Supabase RLS')
test.todo('LIVE: test booking form + chatbot concurrently with logged-in Analytics manager')
test.todo('LIVE: test /reservashoy, /startentry and /startexpense on distinct Telegram webhooks')
test.todo('LIVE: test Creative Library signed uploads, permission failures, editorial approval rollback')
test.todo('LIVE: obtain kitchen sign-off for full menu recipes and EU allergen information')
test.todo('LIVE: test mobile devices, restore/backups, browser history and cookie/privacy disclosures')
