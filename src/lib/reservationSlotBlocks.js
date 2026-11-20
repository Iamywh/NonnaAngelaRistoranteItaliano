import { publicSupabase } from './supabaseClient.js'
import { getReservationTimeSlots, getSpecialSchedule, isClosedReservationDate, isDinnerClosed } from './scheduleExceptions.js'

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
  if (!dateValue || isClosedReservationDate(dateValue)) return []

  const reservableSlots = new Set(getOnlineReservationSlots(dateValue))
  const specialSchedule = getSpecialSchedule(dateValue)

  if (specialSchedule?.type === 'special_open') {
    return [
      {
        id: 'special',
        title: 'Horario especial',
        description: `${specialSchedule.label}: servicio continuo especial. Los horarios marcados como online son los que ve el cliente.`,
        slots: buildTimeSlots(specialSchedule.opens, specialSchedule.closes).map((time) => ({
          time,
          isReservableOnline: reservableSlots.has(time)
        }))
      }
    ]
  }

  return [
    {
      id: 'lunch',
      title: 'Pranzo',
      description: 'Control manual para mediodía. Los horarios marcados como online son los que ve el cliente.',
      slots: buildTimeSlots('12:30', '15:30').map((time) => ({
        time,
        isReservableOnline: reservableSlots.has(time)
      }))
    },
    {
      id: 'dinner',
      title: 'Cena',
      description: 'Control manual para la noche. Bloquea un horario si quieres reservarlo para walk-ins o gestión interna.',
      slots: buildTimeSlots('19:30', '23:00').map((time) => ({
        time,
        isReservableOnline: reservableSlots.has(time)
      }))
    }
  ].filter(group => group.id !== 'dinner' || !isDinnerClosed(dateValue))
}

export function getOnlineReservationSlots(dateValue) {
  // Managers can inspect historical dates; use the same calendar without a today cutoff.
  return getReservationTimeSlots(dateValue, dateValue)
}

export function filterBlockedSlots(slots, blockedTimes = []) {
  const blockedSet = new Set(blockedTimes)
  return (slots || []).filter((slot) => !blockedSet.has(typeof slot === 'string' ? slot : slot.time))
}

export async function fetchBlockedReservationTimes(dateValue) {
  if (!dateValue) return []

  const { data, error } = await publicSupabase.from(RESERVATION_SLOT_BLOCKS_TABLE)
    .select('reservation_time')
    .eq('reservation_date', dateValue)

  if (error) throw error

  return (data || [])
    .map((item) => item.reservation_time)
    .filter(Boolean)
}
