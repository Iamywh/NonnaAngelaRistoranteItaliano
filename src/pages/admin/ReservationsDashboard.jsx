import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient.js'
import ReservationCalendar from '../../components/reservations/ReservationCalendar.jsx'
import ReservationSlotBlockPanel from '../../components/reservations/ReservationSlotBlockPanel.jsx'
import '../../styles/reservations-dashboard.css'

const RESERVATION_STATUS_OPTIONS = [
  { value: 'all', label: 'Todas' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'confirmed', label: 'Confirmadas' },
  { value: 'rejected', label: 'Rechazadas' },
  { value: 'cancelled', label: 'Canceladas' }
]

const SERVICE_STATUS_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'not_arrived', label: 'Sin llegar' },
  { value: 'seated', label: 'Sentado' },
  { value: 'completed', label: 'Completado' },
  { value: 'no_show', label: 'No-show' }
]

const RESERVATION_STATUS_ACTIONS = [
  { label: 'Rechazar', status: 'rejected' },
  { label: 'Cancelar', status: 'cancelled' }
]

const SERVICE_STATUS_ACTIONS = [
  { label: 'Sentado', status: 'seated' },
  { label: 'Completado', status: 'completed' },
  { label: 'No-show', status: 'no_show' }
]

const STATUS_LABELS = {
  pending: 'Pendiente',
  confirmed: 'Confirmada',
  rejected: 'Rechazada',
  cancelled: 'Cancelada',
  not_arrived: 'Sin llegar',
  seated: 'Sentado',
  completed: 'Completado',
  no_show: 'No-show',
}

function buildWhatsAppMessage(reservation) {
  const name = reservation.customer_name || 'cliente'
  const guests = reservation.guests || '-'
  const date = reservation.reservation_date || '-'
  const time = reservation.reservation_time || '-'

  return `Hola ${name}, tu reserva en Nonna Angela para ${guests} personas el día ${date} a las ${time} ha sido confirmada. Te esperamos. Un saludo.`
}

function getWhatsAppConfirmationUrl(reservation) {
  const phone = sanitizeWhatsAppPhone(reservation.customer_phone)

  if (!phone) return ''

  const message = buildWhatsAppMessage(reservation)
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
}

function buildEmailSubject() {
  return 'Reserva confirmada — Nonna Angela'
}

function buildEmailBody(reservation) {
  const name = reservation.customer_name || 'cliente'
  const guests = reservation.guests || '-'
  const date = formatReservationDate(reservation.reservation_date)
  const time = reservation.reservation_time || '-'

  return `Hola ${name},

tu reserva en Nonna Angela ha sido confirmada.

Fecha: ${date}
Hora: ${time}
Personas: ${guests}

Dirección:
Calle Méndez Núñez 20
38002 Santa Cruz de Tenerife

Si necesitas modificar o cancelar la reserva, puedes responder a este email o contactarnos por WhatsApp.

Te esperamos,
Nonna Angela Ristorante Italiano`
}

function getGmailConfirmationUrl(reservation) {
  if (!reservation.customer_email) return ''

  const url = new URL('https://mail.google.com/mail/')
  url.searchParams.set('view', 'cm')
  url.searchParams.set('fs', '1')
  url.searchParams.set('to', reservation.customer_email)
  url.searchParams.set('su', buildEmailSubject(reservation))
  url.searchParams.set('body', buildEmailBody(reservation))

  return url.toString()
}

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

function formatShortReservationDate(dateValue) {
  if (!dateValue) return '-'

  const parsed = parseDateValue(dateValue)
  if (!parsed) return '-'

  return createLocalDate(parsed.year, parsed.month, parsed.day).toLocaleDateString('es-ES', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
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

function getReservationService(timeValue) {
  if (!timeValue) return 'outside'

  const [hourValue] = String(timeValue).split(':')
  const hour = Number(hourValue)

  if (Number.isNaN(hour)) return 'outside'
  if (hour >= 9 && hour <= 17) return 'lunch'
  if (hour >= 18 || hour <= 1) return 'dinner'

  return 'outside'
}

function getReservationStatus(reservation) {
  return reservation?.reservation_status || reservation?.status || 'pending'
}

function getServiceStatus(reservation) {
  if (reservation?.service_status) return reservation.service_status
  if (['seated', 'completed', 'no_show'].includes(reservation?.status)) return reservation.status
  return 'not_arrived'
}

function getStatusLabel(status) {
  return STATUS_LABELS[status] || status || '-'
}

function getConfirmationChannelLabel(channel) {
  if (channel === 'email') return 'Email'
  if (channel === 'whatsapp') return 'WhatsApp'
  return 'No indicado'
}

export default function ReservationsDashboard({ setCurrentPage }) {
  const todayValue = getTodayDateValue()
  const [reservations, setReservations] = useState([])
  const [reservationStatusFilter, setReservationStatusFilter] = useState('all')
  const [serviceStatusFilter, setServiceStatusFilter] = useState('all')
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
        'id, customer_name, customer_phone, customer_email, phone_country_code, phone_country_iso, confirmation_channel, confirmation_channel_used, confirmed_at, reservation_date, reservation_time, guests, area_preference, notes, status, reservation_status, service_status, source, created_at'
      )
      .order('reservation_date', { ascending: true })
      .order('reservation_time', { ascending: true })
      .order('created_at', { ascending: false })

    if (reservationStatusFilter !== 'all') {
      query = query.eq('reservation_status', reservationStatusFilter)
    }

    if (serviceStatusFilter !== 'all') {
      query = query.eq('service_status', serviceStatusFilter)
    }

    if (dateFilter) {
      query = query.eq('reservation_date', dateFilter)
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
  }, [reservationStatusFilter, serviceStatusFilter, dateFilter])

  const updateReservationStatus = async (reservation, newStatus) => {
    setUpdatingId(`${reservation.id}-reservation-${newStatus}`)
    setErrorMessage('')

    const { error } = await supabase
      .from('reservations')
      .update({
        reservation_status: newStatus,
        status: newStatus,
      })
      .eq('id', reservation.id)

    if (error) {
      setErrorMessage(error.message)
    } else {
      await loadReservations()
    }

    setUpdatingId(null)
  }

  const updateServiceStatus = async (reservation, newStatus) => {
    setUpdatingId(`${reservation.id}-service-${newStatus}`)
    setErrorMessage('')

    const { error } = await supabase
      .from('reservations')
      .update({
        service_status: newStatus,
        status: newStatus,
      })
      .eq('id', reservation.id)

    if (error) {
      setErrorMessage(error.message)
    } else {
      await loadReservations()
    }

    setUpdatingId(null)
  }

  const confirmReservationAndOpenChannel = async (reservation, channel) => {
    const contactUrl = channel === 'email'
      ? getGmailConfirmationUrl(reservation)
      : getWhatsAppConfirmationUrl(reservation)

    if (!contactUrl) {
      setErrorMessage(
        channel === 'email'
          ? 'Esta reserva no tiene email de cliente.'
          : 'Esta reserva no tiene teléfono de cliente.'
      )
      return
    }

    const contactWindow = window.open('', '_blank')
    setUpdatingId(`${reservation.id}-confirm-${channel}`)
    setErrorMessage('')

    const { error } = await supabase
      .from('reservations')
      .update({
        reservation_status: 'confirmed',
        status: 'confirmed',
        confirmation_channel_used: channel,
        confirmed_at: new Date().toISOString(),
      })
      .eq('id', reservation.id)

    if (error) {
      setErrorMessage(error.message)
      if (contactWindow) contactWindow.close()
    } else {
      await loadReservations()
      if (contactWindow) {
        contactWindow.location.href = contactUrl
      } else {
        window.open(contactUrl, '_blank', 'noreferrer')
      }
    }

    setUpdatingId(null)
  }

  const reservationSummary = useMemo(() => {
    return reservations.reduce(
      (summary, reservation) => {
        const dateKey = reservation.reservation_date
        if (!dateKey) return summary

        const guestsCount = Number(reservation.guests || 0)
        const service = getReservationService(reservation.reservation_time)
        const reservationStatus = getReservationStatus(reservation)

        summary.total += 1
        summary.guests += guestsCount
        if (reservationStatus === 'pending') summary.pending += 1
        if (reservationStatus === 'confirmed') summary.confirmed += 1

        if (service === 'lunch') {
          summary.lunch.reservations += 1
          summary.lunch.guests += guestsCount
        }

        if (service === 'dinner') {
          summary.dinner.reservations += 1
          summary.dinner.guests += guestsCount
        }

        return summary
      },
      {
        total: 0,
        guests: 0,
        pending: 0,
        confirmed: 0,
        lunch: { reservations: 0, guests: 0 },
        dinner: { reservations: 0, guests: 0 },
      }
    )
  }, [reservations])

  const selectedDay = selectedDate || todayValue
  const pendingReservations = useMemo(
    () => reservations.filter((reservation) => getReservationStatus(reservation) === 'pending'),
    [reservations]
  )
  const isPendingQueueView = reservationStatusFilter === 'pending' && !dateFilter

  const selectedDayReservations = useMemo(() => {
    return [...reservations]
      .filter((reservation) => reservation.reservation_date === selectedDay)
      .sort((a, b) => (a.reservation_time || '').localeCompare(b.reservation_time || ''))
  }, [reservations, selectedDay])

  const visibleReservations = isPendingQueueView ? pendingReservations : selectedDayReservations
  const reservationsPanelTitle = isPendingQueueView
    ? 'Reservas pendientes de confirmar'
    : formatReservationDate(selectedDay)

  const handleSelectDate = (dateValue) => {
    setSelectedDate(dateValue)
    setCalendarMonth(dateValue.slice(0, 7))
  }

  const handleDateFilterChange = (dateValue) => {
    setDateFilter(dateValue)

    if (dateValue) {
      setSelectedDate(dateValue)
      setCalendarMonth(dateValue.slice(0, 7))
    }
  }

  const showPendingReservations = () => {
    setReservationStatusFilter('pending')
    setServiceStatusFilter('all')
    setDateFilter('')
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
              Solicitudes, confirmación del cliente y estado operativo del servicio separados.
            </p>
          </div>

          <button className="ghost-button" type="button" onClick={loadReservations} disabled={isLoading}>
            {isLoading ? 'Cargando...' : 'Actualizar'}
          </button>
        </div>
      </div>

      {reservationSummary.pending > 0 && (
        <div className="reservation-pending-alert">
          <div>
            <p className="eyebrow">Atención</p>
            <h3>Hay {reservationSummary.pending} reserva{reservationSummary.pending === 1 ? '' : 's'} pendiente{reservationSummary.pending === 1 ? '' : 's'} de confirmar</h3>
            <p>Revisa las solicitudes nuevas y confirma por email o por WhatsApp según el canal elegido por el cliente.</p>
          </div>
          <button className="primary-button" type="button" onClick={showPendingReservations}>
            Ver pendientes
          </button>
        </div>
      )}

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
          <p>Pendientes</p>
          <strong>{reservationSummary.pending}</strong>
        </article>
        <article className="reservation-summary-card">
          <p>Confirmadas</p>
          <strong>{reservationSummary.confirmed}</strong>
        </article>
        <article className="reservation-summary-card reservation-service-card lunch">
          <p>Pranzo</p>
          <strong>{reservationSummary.lunch.reservations}</strong>
          <span>{reservationSummary.lunch.guests} personas</span>
          <small>09:00–17:00</small>
        </article>
        <article className="reservation-summary-card reservation-service-card dinner">
          <p>Cena</p>
          <strong>{reservationSummary.dinner.reservations}</strong>
          <span>{reservationSummary.dinner.guests} personas</span>
          <small>18:00–01:00</small>
        </article>
      </div>

      <div className="dashboard-panel reservation-filter-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Filtros</p>
            <h3>Filtrar reservas</h3>
          </div>
        </div>

        <div className="history-filters reservation-filter-grid">
          <label>
            Estado reserva
            <select value={reservationStatusFilter} onChange={(event) => setReservationStatusFilter(event.target.value)}>
              {RESERVATION_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Estado servicio
            <select value={serviceStatusFilter} onChange={(event) => setServiceStatusFilter(event.target.value)}>
              {SERVICE_STATUS_OPTIONS.map((option) => (
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
              onChange={(event) => handleDateFilterChange(event.target.value)}
            />
            <small>Déjalo vacío para ver la cola filtrada.</small>
          </label>
        </div>

        {errorMessage && <p className="empty-state">Error: {errorMessage}</p>}
      </div>

      <ReservationSlotBlockPanel
        reservations={reservations}
        selectedDate={selectedDay}
        onDateChange={handleSelectDate}
      />

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
              <p className="eyebrow">Reservas</p>
              <h3>{reservationsPanelTitle}</h3>
            </div>
          </div>

          {visibleReservations.length > 0 ? (
            <div className="reservation-day-list">
              {visibleReservations.map((reservation) => {
                const reservationStatus = getReservationStatus(reservation)
                const serviceStatus = getServiceStatus(reservation)
                const preferredChannel = reservation.confirmation_channel || 'whatsapp'
                const isUpdatingReservation = updatingId?.startsWith(`${reservation.id}-`)
                const hasEmail = Boolean(reservation.customer_email)
                const hasPhone = Boolean(sanitizeWhatsAppPhone(reservation.customer_phone))

                return (
                  <article className="reservation-day-card" key={reservation.id}>
                    <div className="reservation-card-top">
                      <div>
                        <div className="reservation-date-time">
                          <span className="reservation-date-badge">{formatShortReservationDate(reservation.reservation_date)}</span>
                          <span className="reservation-time">{reservation.reservation_time || '-'}</span>
                        </div>
                        <h4>{reservation.customer_name || 'Cliente sin nombre'}</h4>
                        <p>{reservation.customer_phone || '-'}</p>
                        {reservation.customer_email && <p>{reservation.customer_email}</p>}
                      </div>
                      <div className="reservation-status-stack">
                        <span className={`reservation-status-badge status-${reservationStatus}`}>
                          Reserva: {getStatusLabel(reservationStatus)}
                        </span>
                        <span className={`reservation-status-badge status-${serviceStatus}`}>
                          Servicio: {getStatusLabel(serviceStatus)}
                        </span>
                      </div>
                    </div>

                    <div className="reservation-card-body">
                      <p>
                        <strong>Personas:</strong> {reservation.guests || '-'}
                      </p>
                      <p>
                        <strong>Área:</strong> {reservation.area_preference || '-'}
                      </p>
                      <p>
                        <strong>Confirmación elegida:</strong> {getConfirmationChannelLabel(preferredChannel)}
                      </p>
                      {reservation.confirmation_channel_used && (
                        <p>
                          <strong>Confirmada por:</strong> {getConfirmationChannelLabel(reservation.confirmation_channel_used)}
                        </p>
                      )}
                      {reservation.notes && (
                        <p>
                          <strong>Notas:</strong> {reservation.notes}
                        </p>
                      )}
                    </div>

                    <div className="reservation-card-meta">
                      <small>Creada: {formatDateTime(reservation.created_at)}</small>
                      {reservation.confirmed_at && <small>Confirmada: {formatDateTime(reservation.confirmed_at)}</small>}
                    </div>

                    <div className="reservation-actions-block">
                      <p>Confirmación cliente</p>
                      <div className="reservation-actions">
                        <button
                          className={preferredChannel === 'email' ? 'primary-button small' : 'ghost-button small'}
                          type="button"
                          disabled={isUpdatingReservation || !hasEmail}
                          onClick={() => confirmReservationAndOpenChannel(reservation, 'email')}
                          title={!hasEmail ? 'Falta email del cliente' : ''}
                        >
                          Confirmar por email
                        </button>
                        <button
                          className={preferredChannel === 'whatsapp' ? 'primary-button small' : 'ghost-button small'}
                          type="button"
                          disabled={isUpdatingReservation || !hasPhone}
                          onClick={() => confirmReservationAndOpenChannel(reservation, 'whatsapp')}
                          title={!hasPhone ? 'Falta teléfono del cliente' : ''}
                        >
                          Confirmar por WhatsApp
                        </button>
                        {RESERVATION_STATUS_ACTIONS.map((action) => (
                          <button
                            className="ghost-button small"
                            key={action.status}
                            type="button"
                            disabled={isUpdatingReservation || reservationStatus === action.status}
                            onClick={() => updateReservationStatus(reservation, action.status)}
                          >
                            {action.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="reservation-actions-block service-actions-block">
                      <p>Estado del servicio</p>
                      <div className="reservation-actions">
                        {SERVICE_STATUS_ACTIONS.map((action) => (
                          <button
                            className="ghost-button small"
                            key={action.status}
                            type="button"
                            disabled={isUpdatingReservation || serviceStatus === action.status}
                            onClick={() => updateServiceStatus(reservation, action.status)}
                          >
                            {action.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          ) : (
            <p className="empty-state">
              {isPendingQueueView ? 'No hay reservas pendientes de confirmar.' : 'No hay reservas para este día.'}
            </p>
          )}
        </section>
      </div>
    </section>
  )
}
