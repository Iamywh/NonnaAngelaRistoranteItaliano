import React, { useMemo, useState } from 'react'

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const MONTH_LABELS = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre'
]

function pad(value) {
  return String(value).padStart(2, '0')
}

function createLocalDate(year, month, day) {
  return new Date(year, month - 1, day)
}

function getTodayDateValue() {
  const today = new Date()
  return `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
}

function getMonthKey(dateValue) {
  return dateValue.slice(0, 7)
}

function parseDateValue(value) {
  if (!value) return null
  const [year, month, day] = value.split('-').map(Number)
  return { year, month, day }
}

function formatMonthLabel(value) {
  const { year, month } = parseDateValue(value)
  return `${MONTH_LABELS[month - 1]} ${year}`
}

function buildCalendarDays(year, month) {
  const firstOfMonth = createLocalDate(year, month, 1)
  const firstWeekday = (firstOfMonth.getDay() + 6) % 7
  const totalDays = new Date(year, month, 0).getDate()
  const days = []

  for (let i = 0; i < firstWeekday; i += 1) {
    days.push({ blank: true, key: `blank-${year}-${month}-${i}` })
  }

  for (let day = 1; day <= totalDays; day += 1) {
    const dateValue = `${year}-${pad(month)}-${pad(day)}`
    days.push({ blank: false, day, dateValue, key: dateValue })
  }

  return days
}

function summarizeReservations(reservations) {
  return reservations.reduce((summary, reservation) => {
    const dateValue = reservation.reservation_date
    if (!dateValue) return summary

    const entry = summary[dateValue] || {
      total: 0,
      guests: 0,
      pending: 0,
      confirmed: 0
    }

    entry.total += 1
    entry.guests += Number(reservation.guests || 0)

    if (reservation.status === 'pending') entry.pending += 1
    if (reservation.status === 'confirmed') entry.confirmed += 1

    summary[dateValue] = entry
    return summary
  }, {})
}

export default function ReservationCalendar({
  reservations,
  selectedDate,
  onSelectDate,
  currentMonth,
  onChangeMonth
}) {
  const initialMonth = currentMonth || getTodayDateValue().slice(0, 7)
  const [internalMonth, setInternalMonth] = useState(initialMonth)
  const activeMonth = currentMonth || internalMonth

  const reservationSummary = useMemo(
    () => summarizeReservations(reservations || []),
    [reservations]
  )

  const { year, month } = parseDateValue(`${activeMonth}-01`)
  const calendarDays = useMemo(
    () => buildCalendarDays(year, month),
    [year, month]
  )

  const todayValue = getTodayDateValue()

  const handleChangeMonth = (delta) => {
    const nextMonth = createLocalDate(year, month + delta, 1)
    const nextMonthKey = `${nextMonth.getFullYear()}-${pad(nextMonth.getMonth() + 1)}`

    if (onChangeMonth) {
      onChangeMonth(nextMonthKey)
      return
    }

    setInternalMonth(nextMonthKey)
  }

  return (
    <section className="reservation-calendar">
      <div className="reservation-calendar-header">
        <div>
          <p className="eyebrow">Calendario</p>
          <h3>{formatMonthLabel(`${activeMonth}-01`)}</h3>
        </div>

        <div className="reservation-calendar-nav">
          <button type="button" onClick={() => handleChangeMonth(-1)}>
            ←
          </button>
          <button type="button" onClick={() => handleChangeMonth(1)}>
            →
          </button>
        </div>
      </div>

      <div className="reservation-calendar-weekdays">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>

      <div className="reservation-calendar-grid">
        {calendarDays.map((day) => {
          if (day.blank) {
            return <div key={day.key} className="reservation-calendar-day empty" />
          }

          const summary = reservationSummary[day.dateValue] || {}
          const hasPending = summary.pending > 0
          const hasConfirmed = summary.confirmed > 0
          const isToday = day.dateValue === todayValue
          const isSelected = day.dateValue === selectedDate

          return (
            <button
              key={day.key}
              type="button"
              className={`reservation-calendar-day${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}${hasPending ? ' has-pending' : ''}${hasConfirmed ? ' has-confirmed' : ''}`}
              onClick={() => onSelectDate(day.dateValue)}
            >
              <div className="reservation-day-number">{day.day}</div>
              {summary.total > 0 ? (
                <div className="reservation-day-summary">
                  <span>{summary.total} reserva{summary.total === 1 ? '' : 's'}</span>
                  <span>{summary.guests} pax</span>
                </div>
              ) : (
                <div className="reservation-day-summary empty-summary">-</div>
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}
