import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

function getFirstInsertedReservation(values) {
  if (Array.isArray(values)) return values[0] || null
  if (values && typeof values === 'object') return values
  return null
}

function shouldNotifyReservationInsert(reservation) {
  if (!reservation) return false
  if (!reservation.reservation_date || !reservation.reservation_time) return false
  if (!reservation.customer_name && !reservation.customer_phone) return false
  if (reservation.reservation_status && reservation.reservation_status !== 'pending') return false
  return true
}

async function notifyReservationCreated(reservation) {
  try {
    const { error } = await supabase.functions.invoke('reservation-telegram-notify', {
      body: { reservation }
    })

    if (error) {
      console.warn('Reservation Telegram notification skipped:', error.message || error)
    }
  } catch (error) {
    console.warn('Reservation Telegram notification failed:', error?.message || error)
  }
}

const originalFrom = supabase.from.bind(supabase)

supabase.from = (...args) => {
  const tableName = args[0]
  const builder = originalFrom(...args)

  if (tableName !== 'reservations' || typeof builder.insert !== 'function') return builder

  const originalInsert = builder.insert.bind(builder)

  builder.insert = (values, options) => {
    const insertedReservation = getFirstInsertedReservation(values)
    const insertBuilder = originalInsert(values, options)
    const originalThen = typeof insertBuilder.then === 'function' ? insertBuilder.then.bind(insertBuilder) : null

    if (!originalThen || !shouldNotifyReservationInsert(insertedReservation)) {
      return insertBuilder
    }

    insertBuilder.then = (onFulfilled, onRejected) => originalThen((response) => {
      if (!response?.error) {
        notifyReservationCreated(insertedReservation)
      }

      return onFulfilled ? onFulfilled(response) : response
    }, onRejected)

    return insertBuilder
  }

  return builder
}
