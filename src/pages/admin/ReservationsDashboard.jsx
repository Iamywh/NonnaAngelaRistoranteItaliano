import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient.js'
import ReservationCalendar from '../../components/reservations/ReservationCalendar.jsx'

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'seated', label: 'Seated' },
  { value: 'completed', label: 'Completed' },
  { value: 'no_show', label: 'No-show' }
]

const STATUS_ACTIONS = [
  { label: 'Confirmar', status: 'confirmed' },
  { label: 'Rechazar', status: 'rejected' },
  { label: 'Cancelar', status: 'cancelled' },
  { label: 'Sentado', status: 'seated' },
  { label: 'Completado', status: 'completed' },
  { label: 'No-show', status: 'no_show' }
]

const whatsAppReservationsPhone = import.meta.env.VITE_WHATSAPP_RESERVATIONS_PHONE

function formatDateTime(value) {
  if (!value) return '-'

  return new Date(value).toLocaleString()
}

function parseDateValue(value) {
  if (!value) return null
  const [year, month, day] = value.split('-').map(Number)
  return { year, month, day }
}

function createLocalDate(year, month, day) {
  return new Date(year, month - 1, day)
}

function formatReservationDate(dateValue) {
  if (!dateValue) return '-'

  const parsed = parseDateValue(dateValue)
  if (!parsed) return '-'

  return createLocalDate(parsed.year, parsed.month, parsed.day).toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function getTodayDateValue() {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function sanitizeWhatsAppPhone(phone) {
  return String(phone || '').replace(/\D/g, '')
}

function getWhatsAppConfirmationUrl(reservation) {
  const phone = sanitizeWhatsAppPhone(
    whatsAppReservationsPhone || reservation.customer_phone
  )

  if (!phone) return ''

  const message = [
    `Hola ${reservation.customer_name || ''}, te confirmamos tu reserva en Nonna Angela.`,
    `Fecha: ${formatReservationDate(reservation.reservation_date)}.`,
    `Hora: ${reservation.reservation_time || '-'}.`,
    `Personas: ${reservation.guests || '-'}.`,
    'La reserva queda confirmada. Grazie!',
  ].join('\n')

  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
}

export default function ReservationsDashboard({ setCurrentPage }) {
  const todayValue = getTodayDateValue()
  const [reservations, setReservations] = useState([])
  const [statusFilter, setStatusFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('')
  const [selectedDate, setSelectedDate] = useState(todayValue)
  const [calendarMonth, setCalendarMonth] = useState(todayValue.slice(0, 7))
  const [isLoading, setIsLoading] = useState(false)
  const [updatingId, setUpdatingId] = useState(null)
  const [errorMessage, setErrorMessage] = useState('')

  const loadReservations = async () => {
    setIsLoading(true)
    setErrorMessage('')

    let query = supabase
      .from('reservations')
      .select(
        'id, customer_name, customer_phone, customer_email, reservation_date, reservation_time, guests, area_preference, notes, status, source, created_at'
      )
      .order('reservation_date', { ascending: true })
      .order('reservation_time', { ascending: true })
      .order('created_at', { ascending: false })

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter)
    }

    if (dateFilter) {
      query = query.eq('reservation_date', dateFilter)
    } else {
      query = query.gte('reservation_date', todayValue)
    }

    const { data, error } = await query

    if (error) {
      setErrorMessage(error.message)
      setReservations([])
    } else {
      setReservations(data || [])
    }

    setIsLoading(false)
  }

  useEffect(() => {
    loadReservations()
  }, [statusFilter, dateFilter])

  const updateReservationStatus = async (reservation, newStatus) => {
    setUpdatingId(reservation.id)
    setErrorMessage('')

    const { error } = await supabase
      .from('reservations')
      .update({ status: newStatus })
      .eq('id', reservation.id)

    if (error) {
      setErrorMessage(error.message)
    } else {
      await loadReservations()
    }

    setUpdatingId(null)
  }

  const reservationSummary = useMemo(() => {
    return reservations.reduce(
      (summary, reservation) => {
        const dateKey = reservation.reservation_date
        if (!dateKey) return summary

        summary.total += 1
        summary.guests += Number(reservation.guests || 0)
        if (reservation.status === 'pending') summary.pending += 1
        if (reservation.status === 'confirmed') summary.confirmed += 1
        return summary
      },
      { total: 0, guests: 0, pending: 0, confirmed: 0 }
    )
  }, [reservations])

  const selectedDay = selectedDate || todayValue
  const selectedDayReservations = useMemo(() => {
    return [...reservations]
      .filter((reservation) => reservation.reservation_date === selectedDay)
      .sort((a, b) => (a.reservation_time || '').localeCompare(b.reservation_time || ''))
  }, [reservations, selectedDay])

  const handleSelectDate = (dateValue) => {
    setSelectedDate(dateValue)
    setCalendarMonth(dateValue.slice(0, 7))
  }

  return (
    <section className="admin-page reservation-control-layout">
      <div className="reservation-page-top">
        <button className="back-button" onClick={() => setCurrentPage('admin')}>
          ← Volver al panel admin
        </button>

        <div className="reservation-page-header">
          <div>
            <p className="eyebrow">Reservas</p>
            <h2>Dashboard reservas</h2>
            <p>
              Solicitudes de reserva, confirmaciones, cancelaciones y no-show de Nonna Angela.
            </p>
          </div>

          <button className="ghost-button" type="button" onClick={loadReservations} disabled={isLoading}>
            {isLoading ? 'Cargando...' : 'Actualizar'}
          </button>
        </div>
      </div>

      <div className="reservation-summary-grid">
        <article className="reservation-summary-card">
          <p>Total reservas</p>
          <strong>{reservationSummary.total}</strong>
        </article>
        <article className="reservation-summary-card">
          <p>Total personas</p>
          <strong>{reservationSummary.guests}</strong>
        </article>
        <article className="reservation-summary-card">
          <p>Pending</p>
          <strong>{reservationSummary.pending}</strong>
        </article>
        <article className="reservation-summary-card">
          <p>Confirmadas</p>
          <strong>{reservationSummary.confirmed}</strong>
        </article>
      </div>

      <div className="dashboard-panel reservation-filter-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Filtros</p>
            <h3>Filtrar reservas</h3>
          </div>
        </div>

        <div className="history-filters">
          <label>
            Estado
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Fecha de filtro
            <input
              type="date"
              value={dateFilter}
              onChange={(event) => setDateFilter(event.target.value)}
            />
            <small>El calendario es el filtro visual principal.</small>
          </label>
        </div>

        {errorMessage && <p className="empty-state">Error: {errorMessage}</p>}
      </div>

      <div className="reservation-main-grid">
        <ReservationCalendar
          reservations={reservations}
          selectedDate={selectedDay}
          onSelectDate={handleSelectDate}
          currentMonth={calendarMonth}
          onChangeMonth={setCalendarMonth}
        />

        <section className="reservation-day-panel">
          <div className="reservation-day-panel-header">
            <div>
              <p className="eyebrow">Reservas del día</p>
              <h3>{formatReservationDate(selectedDay)}</h3>
            </div>
          </div>

          {selectedDayReservations.length > 0 ? (
            <div className="reservation-day-list">
              {selectedDayReservations.map((reservation) => (
                <article className="reservation-day-card" key={reservation.id}>
                  <div className="reservation-card-top">
                    <div>
                      <span className="reservation-time">{reservation.reservation_time || '-'}</span>
                      <h4>{reservation.customer_name || 'Cliente sin nombre'}</h4>
                      <p>{reservation.customer_phone || '-'}</p>
                    </div>
                    <span className={`reservation-status-badge status-${reservation.status}`}>
                      {reservation.status || '-'}
                    </span>
                  </div>

                  <div className="reservation-card-body">
                    <p>
                      <strong>Personas:</strong> {reservation.guests || '-'}
                    </p>
                    <p>
                      <strong>Área:</strong> {reservation.area_preference || '-'}
                    </p>
                    {reservation.notes && (
                      <p>
                        <strong>Notas:</strong> {reservation.notes}
                      </p>
                    )}
                  </div>

                  <div className="reservation-card-meta">
                    <small>Creada: {formatDateTime(reservation.created_at)}</small>
                  </div>

                  <div className="reservation-actions">
                    <a
                      className="ghost-button small"
                      href={getWhatsAppConfirmationUrl(reservation)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      WhatsApp
                    </a>
                    {STATUS_ACTIONS.map((action) => (
                      <button
                        className="ghost-button small"
                        key={action.status}
                        type="button"
                        disabled={updatingId === reservation.id || reservation.status === action.status}
                        onClick={() => updateReservationStatus(reservation, action.status)}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-state">No hay reservas para este día.</p>
          )}
        </section>
      </div>
    </section>
  )
}
