export const NORMAL_CLOSED_RESERVATION_DAYS = [2, 3]

export const SPECIAL_RESERVATION_DATES = {
  '12-24': {
    isClosed: false,
    label: 'Nochebuena',
    opens: '13:00',
    closes: '18:00',
    firstReservation: '13:00',
    lastReservation: '17:45',
  },
  '12-25': {
    isClosed: true,
    label: 'Navidad',
  },
  '12-31': {
    isClosed: false,
    label: 'Nochevieja',
    opens: '13:00',
    closes: '18:00',
    firstReservation: '13:00',
    lastReservation: '17:45',
  },
  '01-01': {
    isClosed: true,
    label: 'Año Nuevo',
  },
}

export function getDayFromDateValue(dateValue) {
  if (!dateValue) return null

  const [year, month, day] = String(dateValue).split('-').map(Number)
  if (!year || !month || !day) return null

  return new Date(year, month - 1, day).getDay()
}

export function getSpecialReservationDate(dateValue) {
  if (!dateValue) return null

  const parts = String(dateValue).split('-')
  if (parts.length !== 3) return null

  const monthDay = `${parts[1]}-${parts[2]}`
  return SPECIAL_RESERVATION_DATES[monthDay] || null
}

export function getSpecialSchedule(dateValue) {
  const specialDate = getSpecialReservationDate(dateValue)
  if (!specialDate) return null

  return specialDate.isClosed
    ? { ...specialDate, type: 'closed' }
    : { ...specialDate, type: 'special_open' }
}

export function isClosedReservationDate(dateValue) {
  if (!dateValue) return false

  const specialDate = getSpecialReservationDate(dateValue)
  if (specialDate) return specialDate.isClosed

  const day = getDayFromDateValue(dateValue)
  return day !== null && NORMAL_CLOSED_RESERVATION_DAYS.includes(day)
}
