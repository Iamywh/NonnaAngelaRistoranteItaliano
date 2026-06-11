import React, { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient.js'

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

const reservationGridColumns =
  '1.2fr 1fr 1.3fr 0.9fr 0.8fr 0.6fr 1fr 1.4fr 0.9fr 0.8fr 1fr 1.6fr'

const whatsAppReservationsPhone = import.meta.env.VITE_WHATSAPP_RESERVATIONS_PHONE

function formatDateTime(value) {
  if (!value) return '-'

  return new Date(value).toLocaleString()
}

function formatReservationDate(dateValue) {
  if (!dateValue) return '-'

  const [year, month, day] = dateValue.split('-').map(Number)

  return new Date(year, month - 1, day).toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
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
  const [reservations, setReservations] = useState([])
  const [statusFilter, setStatusFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('')
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

  return (
    <section className="admin-page">
      <button className="back-button" onClick={() => setCurrentPage('admin')}>
        ← Volver al panel admin
      </button>

      <div className="admin-header">
        <div>
          <p className="eyebrow">Reservas</p>
          <h2>Dashboard reservas</h2>
          <p>
            Solicitudes de reserva, confirmaciones, cancelaciones y no-show de Nonna Angela.
          </p>
        </div>
      </div>

      <div className="dashboard-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Filtros</p>
            <h3>Reservas recibidas</h3>
          </div>

          <button className="ghost-button" type="button" onClick={loadReservations} disabled={isLoading}>
            {isLoading ? 'Cargando...' : 'Actualizar'}
          </button>
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
            Fecha reserva
            <input
              type="date"
              value={dateFilter}
              onChange={(event) => setDateFilter(event.target.value)}
            />
          </label>
        </div>

        {errorMessage && <p className="empty-state">Error: {errorMessage}</p>}
      </div>

      <div className="data-table" style={{ overflowX: 'auto' }}>
        <div className="data-row table-head" style={{ gridTemplateColumns: reservationGridColumns, minWidth: 1320 }}>
          <span>Nombre</span>
          <span>Teléfono</span>
          <span>Email</span>
          <span>Fecha</span>
          <span>Hora</span>
          <span>Guests</span>
          <span>Área</span>
          <span>Notas</span>
          <span>Estado</span>
          <span>Source</span>
          <span>Creada</span>
          <span>Acciones</span>
        </div>

        {reservations.map((reservation) => (
          <div
            className="data-row"
            key={reservation.id}
            style={{ gridTemplateColumns: reservationGridColumns, minWidth: 1320 }}
          >
            <span>{reservation.customer_name || '-'}</span>
            <span>{reservation.customer_phone || '-'}</span>
            <span>{reservation.customer_email || '-'}</span>
            <span>{reservation.reservation_date || '-'}</span>
            <span>{reservation.reservation_time || '-'}</span>
            <span>{reservation.guests || '-'}</span>
            <span>{reservation.area_preference || '-'}</span>
            <span>{reservation.notes || '-'}</span>
            <span>{reservation.status || '-'}</span>
            <span>{reservation.source || '-'}</span>
            <span>{formatDateTime(reservation.created_at)}</span>
            <span className="history-actions">
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
            </span>
          </div>
        ))}

        {!isLoading && !reservations.length && (
          <p className="empty-state">No hay reservas para estos filtros.</p>
        )}
      </div>
    </section>
  )
}
