export const NORMAL_CLOSED_RESERVATION_DAYS = [2, 3]

export const SPECIAL_RESERVATION_DATES = {
  '2026-12-24': {
    isClosed: false,
    label: 'Nochebuena',
    opens: '13:00',
    closes: '18:00',
    firstReservation: '13:00',
    lastReservation: '17:45',
  },
  '2026-12-25': {
    isClosed: true,
    label: 'Navidad',
  },
  '2026-12-31': {
    isClosed: false,
    label: 'Nochevieja',
    opens: '13:00',
    closes: '18:00',
    firstReservation: '13:00',
    lastReservation: '17:45',
  },
  '2027-01-01': {
    isClosed: true,
    label: 'Año Nuevo',
  },
}

export function getDayFromDateValue(dateValue) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue || '')) return null
  const [year, month, day] = dateValue.split('-').map(Number)
  const date = new Date(`${dateValue}T12:00:00Z`)
  if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() !== year ||
      date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return null
  return date.getUTCDay()
}

export function getSpecialReservationDate(dateValue) {
  if (!dateValue) return null

  return SPECIAL_RESERVATION_DATES[String(dateValue)] || null
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

export function getTodayDateValue(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Atlantic/Canary', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now).map(p => [p.type, p.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

export function isBookableDate(date, today = getTodayDateValue()) {
  return getDayFromDateValue(date) !== null && date >= today && !isClosedReservationDate(date)
}

function buildTimeSlots(first, last) {
  const minutes = time => time.split(':').reduce((h, m) => Number(h) * 60 + Number(m))
  const slots = []
  for (let t = minutes(first); t <= minutes(last); t += 15) {
    slots.push(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`)
  }
  return slots
}

export function getReservationTimeSlots(dateValue, today = getTodayDateValue()) {
  if (!isBookableDate(dateValue, today)) return []
  const special = getSpecialSchedule(dateValue)
  if (special) return buildTimeSlots(special.firstReservation, special.lastReservation)
  const day = getDayFromDateValue(dateValue)
  return [...buildTimeSlots('12:30', '15:15'), ...buildTimeSlots('19:30', [5, 6].includes(day) ? '22:45' : '22:30')]
}

export function getClosedDateMessage(dateValue, t) {
  return t(getSpecialSchedule(dateValue)?.type === 'closed' ? 'locale.closedSpecialDate' : 'locale.closedDay')
}
