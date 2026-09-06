import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient.js'
import '../../styles/current-service-sheet.css'

const TABLE_NUMBERS = Array.from({ length: 16 }, (_, index) => String(index + 1))
const OPEN_DAYS = [2, 3, 4, 5, 6]
const ACTIVE_RESERVATION_STATUSES = ['pending', 'confirmed']

const SERVICE_WINDOWS = {
  lunch: {
    label: 'Pranzo',
    title: 'Turno de mediodía',
    start: '12:00',
    end: '16:00',
  },
  dinner: {
    label: 'Cena',
    title: 'Turno de noche',
    start: '19:00',
    end: '23:30',
  },
}

function pad(value) {
  return String(value).padStart(2, '0')
}

function getDateValue(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function getDateFromValue(dateValue) {
  const [year, month, day] = String(dateValue || '').split('-').map(Number)
  if (!year || !month || !day) return new Date()
  return new Date(year, month - 1, day)
}

function addDays(dateValue, days) {
  const date = getDateFromValue(dateValue)
  date.setDate(date.getDate() + days)
  return getDateValue(date)
}

function isOpenDate(dateValue) {
  return OPEN_DAYS.includes(getDateFromValue(dateValue).getDay())
}

function getNextOpenDate(dateValue) {
  let nextDate = dateValue

  for (let index = 0; index < 8; index += 1) {
    if (isOpenDate(nextDate)) return nextDate
    nextDate = addDays(nextDate, 1)
  }

  return dateValue
}

function toMinutes(timeValue) {
  const [hours, minutes] = String(timeValue || '').split(':').map(Number)
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null
  return hours * 60 + minutes
}

function getServiceInfo(now = new Date()) {
  const todayValue = getDateValue(now)
  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  const lunchStart = toMinutes(SERVICE_WINDOWS.lunch.start)
  const lunchEnd = toMinutes(SERVICE_WINDOWS.lunch.end)
  const dinnerStart = toMinutes(SERVICE_WINDOWS.dinner.start)
  const dinnerEnd = toMinutes(SERVICE_WINDOWS.dinner.end)

  if (!isOpenDate(todayValue)) {
    return {
      key: 'lunch',
      date: getNextOpenDate(addDays(todayValue, 1)),
      mode: 'next',
      ...SERVICE_WINDOWS.lunch,
    }
  }

  if (currentMinutes >= lunchStart && currentMinutes <= lunchEnd) {
    return { key: 'lunch', date: todayValue, mode: 'current', ...SERVICE_WINDOWS.lunch }
  }

  if (currentMinutes >= dinnerStart && currentMinutes <= dinnerEnd) {
    return { key: 'dinner', date: todayValue, mode: 'current', ...SERVICE_WINDOWS.dinner }
  }

  if (currentMinutes < lunchStart) {
    return { key: 'lunch', date: todayValue, mode: 'next', ...SERVICE_WINDOWS.lunch }
  }

  if (currentMinutes < dinnerStart) {
    return { key: 'dinner', date: todayValue, mode: 'next', ...SERVICE_WINDOWS.dinner }
  }

  return {
    key: 'lunch',
    date: getNextOpenDate(addDays(todayValue, 1)),
    mode: 'next',
    ...SERVICE_WINDOWS.lunch,
  }
}

function formatDateLabel(dateValue) {
  return getDateFromValue(dateValue).toLocaleDateString('es-ES', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function normalizeStatus(reservation) {
  return reservation?.reservation_status || reservation?.status || 'pending'
}

function normalizeServiceStatus(reservation) {
  if (reservation?.service_status) return reservation.service_status
  if (['seated', 'completed', 'no_show'].includes(reservation?.status)) return reservation.status
  return 'not_arrived'
}

function getStatusLabel(status) {
  const labels = {
    pending: 'Pendiente',
    confirmed: 'Confirmada',
    seated: 'Sentado',
    completed: 'Completado',
    no_show: 'No-show',
    not_arrived: 'Sin llegar',
  }

  return labels[status] || status || '-'
}

function isActiveReservation(reservation) {
  return ACTIVE_RESERVATION_STATUSES.includes(normalizeStatus(reservation))
}

function belongsToService(reservation, serviceInfo) {
  const reservationMinutes = toMinutes(reservation.reservation_time)
  const start = toMinutes(serviceInfo.start)
  const end = toMinutes(serviceInfo.end)

  if (reservationMinutes === null || start === null || end === null) return false
  return reservationMinutes >= start && reservationMinutes <= end
}

function normalizeAssignedTables(value) {
  if (Array.isArray(value)) {
    return value.map(String).filter(Boolean).sort((a, b) => Number(a) - Number(b))
  }

  if (typeof value === 'string' && value.trim()) {
    return value.split(',').map((item) => item.trim()).filter(Boolean).sort((a, b) => Number(a) - Number(b))
  }

  return []
}

function formatTables(tables) {
  if (!tables.length) return 'Sin mesa'
  if (tables.length === 1) return `Mesa ${tables[0]}`
  return `Mesas ${tables.join(' + ')}`
}

function getTableUsage(rows, currentReservationId) {
  const usage = new Map()

  rows.forEach((reservation) => {
    if (reservation.id === currentReservationId) return

    normalizeAssignedTables(reservation.assigned_tables).forEach((tableNumber) => {
      usage.set(tableNumber, reservation.customer_name || 'Otra reserva')
    })
  })

  return usage
}

export default function CurrentServiceSheet() {
  const [serviceInfo, setServiceInfo] = useState(() => getServiceInfo())
  const [reservations, setReservations] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [savingKey, setSavingKey] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const loadServiceReservations = useCallback(async () => {
    const nextServiceInfo = getServiceInfo()
    setServiceInfo(nextServiceInfo)
    setIsLoading(true)
    setErrorMessage('')

    const { data, error } = await supabase
      .from('reservations')
      .select('id, customer_name, customer_phone, reservation_date, reservation_time, guests, area_preference, notes, status, reservation_status, service_status, assigned_tables, created_at')
      .eq('reservation_date', nextServiceInfo.date)
      .order('reservation_time', { ascending: true })
      .order('created_at', { ascending: true })

    if (error) {
      setReservations([])
      setErrorMessage(error.message)
    } else {
      setReservations(
        (data || [])
          .filter(isActiveReservation)
          .filter((reservation) => belongsToService(reservation, nextServiceInfo))
      )
    }

    setIsLoading(false)
  }, [])

  useEffect(() => {
    loadServiceReservations()
  }, [loadServiceReservations])

  const summary = useMemo(() => {
    return reservations.reduce(
      (totals, reservation) => {
        totals.reservations += 1
        totals.guests += Number(reservation.guests || 0)
        totals.tables += normalizeAssignedTables(reservation.assigned_tables).length
        return totals
      },
      { reservations: 0, guests: 0, tables: 0 }
    )
  }, [reservations])

  const updateAssignedTables = async (reservation, nextTables) => {
    setSavingKey(`${reservation.id}-${nextTables.join('-')}`)
    setErrorMessage('')

    const { error } = await supabase
      .from('reservations')
      .update({ assigned_tables: nextTables })
      .eq('id', reservation.id)

    if (error) {
      setErrorMessage(error.message)
    } else {
      setReservations((current) => current.map((item) => (
        item.id === reservation.id ? { ...item, assigned_tables: nextTables } : item
      )))
    }

    setSavingKey('')
  }

  const toggleTable = (reservation, tableNumber) => {
    const currentTables = normalizeAssignedTables(reservation.assigned_tables)
    const nextTables = currentTables.includes(tableNumber)
      ? currentTables.filter((item) => item !== tableNumber)
      : [...currentTables, tableNumber].sort((a, b) => Number(a) - Number(b))

    updateAssignedTables(reservation, nextTables)
  }

  return (
    <section className="dashboard-panel current-service-sheet">
      <div className="current-service-header">
        <div>
          <p className="eyebrow">Turno actual</p>
          <h3>Foglio sala digitale</h3>
          <p>
            Lista rápida del turno para recibir clientes, asignar mesas y mantener el servicio ordenado.
          </p>
        </div>

        <button className="ghost-button" type="button" onClick={loadServiceReservations} disabled={isLoading}>
          {isLoading ? 'Actualizando...' : 'Actualizar turno'}
        </button>
      </div>

      <div className="current-service-meta-grid">
        <article>
          <span>Turno</span>
          <strong>{serviceInfo.label}</strong>
          <small>{serviceInfo.start}–{serviceInfo.end}</small>
        </article>
        <article>
          <span>Fecha</span>
          <strong>{formatDateLabel(serviceInfo.date)}</strong>
          <small>{serviceInfo.mode === 'current' ? 'Servicio en curso' : 'Próximo servicio útil'}</small>
        </article>
        <article>
          <span>Reservas</span>
          <strong>{summary.reservations}</strong>
          <small>{summary.guests} personas</small>
        </article>
        <article>
          <span>Mesas asignadas</span>
          <strong>{summary.tables}</strong>
          <small>tavoli 1–16</small>
        </article>
      </div>

      {errorMessage && (
        <p className="current-service-error">
          {errorMessage.includes('assigned_tables')
            ? 'Falta la columna assigned_tables en Supabase. Ejecuta el SQL de actualización antes de usar el foglio sala.'
            : errorMessage}
        </p>
      )}

      {!errorMessage && reservations.length === 0 && !isLoading && (
        <p className="current-service-empty">No hay reservas activas para este turno.</p>
      )}

      {!errorMessage && reservations.length > 0 && (
        <div className="current-service-list">
          {reservations.map((reservation) => {
            const selectedTables = normalizeAssignedTables(reservation.assigned_tables)
            const usedTables = getTableUsage(reservations, reservation.id)
            const reservationStatus = normalizeStatus(reservation)
            const serviceStatus = normalizeServiceStatus(reservation)

            return (
              <article className="current-service-row" key={reservation.id}>
                <div className="current-service-client">
                  <span className="current-service-time">{reservation.reservation_time || '-'}</span>
                  <div>
                    <strong>{reservation.customer_name || 'Cliente sin nombre'}</strong>
                    <small>{reservation.customer_phone || 'Sin teléfono'}</small>
                  </div>
                </div>

                <div className="current-service-details">
                  <span>{reservation.guests || '-'} pax</span>
                  <span>{reservation.area_preference || 'indiferente'}</span>
                  <span>{getStatusLabel(reservationStatus)} · {getStatusLabel(serviceStatus)}</span>
                  {reservation.notes && <em>{reservation.notes}</em>}
                </div>

                <div className="current-service-tables">
                  <div className="current-service-table-title">
                    <strong>{formatTables(selectedTables)}</strong>
                    <small>clic para asignar o quitar</small>
                  </div>
                  <div className="table-number-grid">
                    {TABLE_NUMBERS.map((tableNumber) => {
                      const isSelected = selectedTables.includes(tableNumber)
                      const usedBy = usedTables.get(tableNumber)
                      const isSaving = savingKey.startsWith(reservation.id)

                      return (
                        <button
                          className={`table-number-button${isSelected ? ' selected' : ''}${usedBy ? ' used' : ''}`}
                          key={tableNumber}
                          type="button"
                          disabled={isSaving}
                          onClick={() => toggleTable(reservation, tableNumber)}
                          title={usedBy ? `También usado por ${usedBy}` : `Mesa ${tableNumber}`}
                          aria-pressed={isSelected}
                        >
                          {tableNumber}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
