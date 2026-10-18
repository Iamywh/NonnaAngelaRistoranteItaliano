export const NORMAL_CLOSED_RESERVATION_DAYS = [2, 3]

export function getDayFromDateValue(dateValue) {
  if (!dateValue) return null

  const [year, month, day] = String(dateValue).split('-').map(Number)
  if (!year || !month || !day) return null

  return new Date(year, month - 1, day).getDay()
}

export function isClosedReservationDate(dateValue) {
  if (!dateValue) return false

  const day = getDayFromDateValue(dateValue)
  return day !== null && NORMAL_CLOSED_RESERVATION_DAYS.includes(day)
}
