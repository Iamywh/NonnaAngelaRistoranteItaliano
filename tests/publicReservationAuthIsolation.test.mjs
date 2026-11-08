import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const load = path => readFileSync(new URL('../'+path, import.meta.url), 'utf8')
const clients = load('src/lib/supabaseClient.js')
const booking = load('src/pages/Locale.jsx')
const agent = load('src/components/VirtualAgent.jsx')
const availability = load('src/lib/reservationAvailability.js')
const blockedSlots = load('src/lib/reservationSlotBlocks.js')
const privateAnalytics = load('src/pages/admin/Analytics.jsx')

test('Public reservation client cannot inherit private Analytics session', () => {
  assert.match(clients, /export const publicSupabase = createClient\(supabaseUrl, supabaseAnonKey, \{/)
  const publicBlock = clients.split('export const publicSupabase = createClient(')[1].split('function getFirstInsertedReservation')[0]
  assert.match(publicBlock, /persistSession: false/)
  assert.match(publicBlock, /autoRefreshToken: false/)
  assert.match(publicBlock, /detectSessionInUrl: false/)
  assert.match(publicBlock, /storageKey: 'nonna-angela-public-reservations'/)
})
test('Public booking and chatbot reads/writes always use the anonymous client', () => {
  for (const [name, source] of [['Locale',booking],['VirtualAgent',agent]]) {
    assert.match(source, /import \{ publicSupabase \} from '\.\.\/lib\/supabaseClient\.js'/)
    assert.match(source, /publicSupabase\.from\('reservations'\)/)
    assert.doesNotMatch(source, /(?<!public)\bsupabase\.from\(/,name)
  }
})
test('Availability and blocked times checks share the public session', () => {
  for (const source of [availability, blockedSlots]) {
    assert.match(source, /import \{ publicSupabase \} from '\.\/supabaseClient\.js'/)
  }
  assert.match(blockedSlots, /await publicSupabase/)
  assert.match(availability, /publicSupabase\.rpc\('reservation_service_booked_guests'/)
  assert.doesNotMatch(availability, /\.from\('reservations'\)/)
  for (const source of [booking, agent]) {
    assert.match(source, /from '\.\.\/lib\/reservationAvailability\.js'/)
    assert.match(source, /await getBookedGuestsForService\(/)
  }
  assert.doesNotMatch(booking, /\.select\(/)
})
test('Reservation Telegram notification side effect remains attached for both clients', () => {
  assert.match(clients,/installReservationNotificationBridge\(supabase\)/)
  assert.match(clients,/installReservationNotificationBridge\(publicSupabase\)/)
  assert.match(clients,/notifyReservationCreated\(client, insertedReservation\)/)
  assert.match(clients,/client\.functions\.invoke\('reservation-telegram-notify'/)
  assert.match(clients,/if \(!response\?\.error\)/)
})
test('Private Analytics still uses original session-aware client', () => {
  assert.match(privateAnalytics,/import \{ supabase \} from '\.\.\/\.\.\/lib\/supabaseClient\.js'/)
  assert.match(privateAnalytics,/supabase\.auth\.signInWithPassword/)
  assert.doesNotMatch(privateAnalytics,/publicSupabase/)
})
