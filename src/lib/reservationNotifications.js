import { supabase } from './supabaseClient.js'

export async function notifyReservationCreated(reservation) {
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
