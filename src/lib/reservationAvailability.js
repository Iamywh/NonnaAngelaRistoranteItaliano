import { publicSupabase } from './supabaseClient.js'

export async function getBookedGuestsForService(date, service) {
  const { data, error } = await publicSupabase.rpc('reservation_service_booked_guests', {
    p_date: date,
    p_service: service,
  })

  if (error) throw error
  return data
}
