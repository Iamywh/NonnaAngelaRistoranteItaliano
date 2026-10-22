export const NORMAL_CLOSED_RESERVATION_DAYS = [2, 3]

export const SPECIAL_SCHEDULES = {
  '2026-12-24': {
    type: 'special_open',
    label: 'Nochebuena',
    opens: '13:00',
    closes: '18:00',
    lastReservation: '17:45',
  },
  '2026-12-25': {
    type: 'closed',
    label: 'Navidad',
  },
  '2026-12-31': {
    type: 'special_open',
    label: 'Nochevieja',
    opens: '13:00',
    closes: '18:00',
    lastReservation: '17:45',
  },
  '2027-01-01': {
    type: 'closed',
    label: 'Año Nuevo',
  },
}

export function getDayFromDateValue(dateValue) {
  if (!dateValue) return null

  const [year, month, day] = String(dateValue).split('-').map(Number)
  if (!year || !month || !day) return null

  return new Date(year, month - 1, day).getDay()
}

export function getSpecialSchedule(dateValue) {
  if (!dateValue) return null
  return SPECIAL_SCHEDULES[String(dateValue)] || null
}

export function isClosedReservationDate(dateValue) {
  if (!dateValue) return false

  const specialSchedule = getSpecialSchedule(dateValue)
  if (specialSchedule) return specialSchedule.type === 'closed'

  const day = getDayFromDateValue(dateValue)
  return day !== null && NORMAL_CLOSED_RESERVATION_DAYS.includes(day)
}
