import { supabase } from './supabaseClient.js'

export const RESERVATION_SLOT_BLOCKS_TABLE = 'reservation_slot_blocks'

export function formatTime(minutes) {
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return `${String(hours).padStart(2, '0')}:${String(remainingMinutes).padStart(2, '0')}`
}

export function buildTimeSlots(startTime, lastTime) {
  const [startHours, startMinutes] = startTime.split(':').map(Number)
  const [lastHours, lastMinutes] = lastTime.split(':').map(Number)
  const start = startHours * 60 + startMinutes
  const last = lastHours * 60 + lastMinutes
  const slots = []

  for (let minutes = start; minutes <= last; minutes += 15) {
    slots.push(formatTime(minutes))
  }

  return slots
}

export function getReservationServiceFromTime(timeValue) {
  if (!timeValue) return 'outside'

  const [hours, minutes] = String(timeValue).split(':').map(Number)
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return 'outside'

  return hours * 60 + minutes < 17 * 60 ? 'lunch' : 'dinner'
}

export function getManagementTimeSlotGroups(dateValue) {
  const reservableSlots = new Set(getOnlineReservationSlots(dateValue))

  return [
    {
      id: 'lunch',
      title: 'Pranzo',
      description: 'Control manual para mediodía. Los horarios marcados como online son los que ve el cliente.',
      slots: buildTimeSlots('12:00', '15:30').map((time) => ({
        time,
        isReservableOnline: reservableSlots.has(time)
      }))
    },
    {
      id: 'dinner',
      title: 'Cena',
      description: 'Control manual para la noche. Bloquea un horario si quieres reservarlo para walk-ins o gestión interna.',
      slots: buildTimeSlots('19:00', '23:00').map((time) => ({
        time,
        isReservableOnline: reservableSlots.has(time)
      }))
    }
  ]
}

export function getOnlineReservationSlots(dateValue) {
  if (!dateValue) return []

  const day = getDayFromDateValue(dateValue)
  if (day === 0 || day === 1) return []

  const lastDinnerSlot = day === 5 || day === 6 ? '22:45' : '22:30'

  return [
    ...buildTimeSlots('12:30', '15:15'),
    ...buildTimeSlots('19:30', lastDinnerSlot)
  ]
}

export function getDayFromDateValue(dateValue) {
  if (!dateValue) return null

  const [year, month, day] = String(dateValue).split('-').map(Number)
  if (!year || !month || !day) return null

  return new Date(year, month - 1, day).getDay()
}

export function filterBlockedSlots(slots, blockedTimes = []) {
  const blockedSet = new Set(blockedTimes)
  return (slots || []).filter((slot) => !blockedSet.has(typeof slot === 'string' ? slot : slot.time))
}

export async function fetchBlockedReservationTimes(dateValue) {
  if (!dateValue) return []

  const { data, error } = await supabase
    .from(RESERVATION_SLOT_BLOCKS_TABLE)
    .select('reservation_time')
    .eq('reservation_date', dateValue)

  if (error) throw error

  return (data || [])
    .map((item) => item.reservation_time)
    .filter(Boolean)
}
