export const NORMAL_CLOSED_RESERVATION_DAYS = [3, 4]

export const EMERGENCY_CLOSED_DATES = ['2026-10-13']
export const EMERGENCY_OPEN_DATES = ['2026-10-15']

export function getDayFromDateValue(dateValue) {
  if (!dateValue) return null

  const [year, month, day] = String(dateValue).split('-').map(Number)
  if (!year || !month || !day) return null

  return new Date(year, month - 1, day).getDay()
}

export function isEmergencyClosedDate(dateValue) {
  return EMERGENCY_CLOSED_DATES.includes(String(dateValue || ''))
}

export function isEmergencyOpenDate(dateValue) {
  return EMERGENCY_OPEN_DATES.includes(String(dateValue || ''))
}

export function isClosedReservationDate(dateValue) {
  if (!dateValue) return false
  if (isEmergencyClosedDate(dateValue)) return true
  if (isEmergencyOpenDate(dateValue)) return false

  const day = getDayFromDateValue(dateValue)
  return day !== null && NORMAL_CLOSED_RESERVATION_DAYS.includes(day)
}

function toLocalIsoDate(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function isEmergencyScheduleWindowActive(date = new Date()) {
  const value = toLocalIsoDate(date)
  return value >= '2026-10-12' && value <= '2026-10-15'
}
