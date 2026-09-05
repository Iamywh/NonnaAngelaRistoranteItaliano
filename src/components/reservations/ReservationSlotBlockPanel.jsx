import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient.js'
import {
  fetchBlockedReservationTimes,
  getManagementTimeSlotGroups,
  getReservationServiceFromTime,
  RESERVATION_SLOT_BLOCKS_TABLE
} from '../../lib/reservationSlotBlocks.js'

const BLOCKED_RESERVATION_STATUSES = ['rejected', 'cancelled']
const BLOCKED_SERVICE_STATUSES = ['completed', 'no_show']

function getTodayDateValue() {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getReservationStatus(reservation) {
  return reservation?.reservation_status || reservation?.status || 'pending'
}

function getServiceStatus(reservation) {
  if (reservation?.service_status) return reservation.service_status
  if (['seated', 'completed', 'no_show'].includes(reservation?.status)) return reservation.status
  return 'not_arrived'
}

function countsAsActiveReservation(reservation) {
  return (
    !BLOCKED_RESERVATION_STATUSES.includes(getReservationStatus(reservation)) &&
    !BLOCKED_SERVICE_STATUSES.includes(getServiceStatus(reservation))
  )
}

export default function ReservationSlotBlockPanel({ reservations = [], selectedDate, onDateChange }) {
  const todayValue = getTodayDateValue()
  const [blockDate, setBlockDate] = useState(selectedDate || todayValue)
  const [blockedTimes, setBlockedTimes] = useState([])
  const [isLoadingBlocks, setIsLoadingBlocks] = useState(false)
  const [updatingTime, setUpdatingTime] = useState('')
  const [slotBlockMessage, setSlotBlockMessage] = useState('')
  const [slotBlockError, setSlotBlockError] = useState('')

  const loadBlockedTimes = async (dateValue = blockDate) => {
    if (!dateValue) {
      setBlockedTimes([])
      return
    }

    setIsLoadingBlocks(true)
    setSlotBlockError('')

    try {
      const blocked = await fetchBlockedReservationTimes(dateValue)
      setBlockedTimes(blocked)
    } catch (error) {
      console.error(error)
      setBlockedTimes([])
      setSlotBlockError(error?.message || 'No se han podido cargar los horarios bloqueados.')
    } finally {
      setIsLoadingBlocks(false)
    }
  }

  useEffect(() => {
    if (selectedDate && selectedDate !== blockDate) {
      setBlockDate(selectedDate)
    }
  }, [selectedDate])

  useEffect(() => {
    loadBlockedTimes(blockDate)
  }, [blockDate])

  const slotGroups = useMemo(() => getManagementTimeSlotGroups(blockDate), [blockDate])

  const reservationsByTime = useMemo(() => {
    const summary = new Map()

    reservations
      .filter((reservation) => reservation.reservation_date === blockDate)
      .filter((reservation) => countsAsActiveReservation(reservation))
      .forEach((reservation) => {
        const time = reservation.reservation_time
        if (!time) return

        const current = summary.get(time) || { reservations: 0, guests: 0 }
        summary.set(time, {
          reservations: current.reservations + 1,
          guests: current.guests + Number(reservation.guests || 0)
        })
      })

    return summary
  }, [reservations, blockDate])

  const blockedSet = useMemo(() => new Set(blockedTimes), [blockedTimes])

  const handleDateChange = (dateValue) => {
    setBlockDate(dateValue)
    setSlotBlockMessage('')
    if (dateValue) onDateChange?.(dateValue)
  }

  const toggleSlotBlock = async (slot) => {
    if (!blockDate || !slot?.time) return

    const time = slot.time
    const isBlocked = blockedSet.has(time)

    setUpdatingTime(time)
    setSlotBlockError('')
    setSlotBlockMessage('')

    const query = isBlocked
      ? supabase
        .from(RESERVATION_SLOT_BLOCKS_TABLE)
        .delete()
        .eq('reservation_date', blockDate)
        .eq('reservation_time', time)
      : supabase
        .from(RESERVATION_SLOT_BLOCKS_TABLE)
        .insert([
          {
            reservation_date: blockDate,
            reservation_time: time,
            service: getReservationServiceFromTime(time),
            reason: slot.isReservableOnline
              ? 'Bloqueado manualmente desde Manager.'
              : 'Bloqueo operativo interno desde Manager.',
            created_by: 'manager'
          }
        ])

    const { error } = await query

    if (error) {
      setSlotBlockError(error.message)
    } else {
      await loadBlockedTimes(blockDate)
      setSlotBlockMessage(isBlocked ? `${time} vuelve a estar disponible.` : `${time} bloqueado para reservas online.`)
    }

    setUpdatingTime('')
  }

  const blockedCount = blockedTimes.length

  return (
    <section className="dashboard-panel slot-block-panel">
      <div className="slot-block-header">
        <div>
          <p className="eyebrow">Control manual</p>
          <h3>Bloqueo de horarios</h3>
          <p>
            Elige una fecha y bloquea los horarios que no quieres recibir online. Útil cuando ya tienes reservas,
            walk-ins previstos o quieres guardar huecos para gestión interna.
          </p>
        </div>

        <div className="slot-block-controls">
          <label>
            Fecha
            <input type="date" value={blockDate} onChange={(event) => handleDateChange(event.target.value)} />
          </label>
          <button className="ghost-button small" type="button" onClick={() => handleDateChange(todayValue)}>
            Hoy
          </button>
          <button className="ghost-button small" type="button" onClick={() => loadBlockedTimes(blockDate)} disabled={isLoadingBlocks}>
            {isLoadingBlocks ? 'Cargando...' : 'Actualizar bloqueos'}
          </button>
        </div>
      </div>

      <div className="slot-block-summary">
        <span>{blockedCount} horario{blockedCount === 1 ? '' : 's'} bloqueado{blockedCount === 1 ? '' : 's'}</span>
        <small>Los botones rojos quedan cerrados para nuevas reservas online.</small>
      </div>

      {slotBlockError && <p className="form-message error">{slotBlockError}</p>}
      {slotBlockMessage && <p className="form-message success">{slotBlockMessage}</p>}

      <div className="slot-block-groups">
        {slotGroups.map((group) => (
          <div className="slot-block-group" key={group.id}>
            <div className="slot-block-group-heading">
              <h4>{group.title}</h4>
              <p>{group.description}</p>
            </div>

            <div className="slot-block-grid">
              {group.slots.map((slot) => {
                const isBlocked = blockedSet.has(slot.time)
                const slotReservations = reservationsByTime.get(slot.time)
                const reservationLabel = slotReservations
                  ? `${slotReservations.reservations} reserva${slotReservations.reservations === 1 ? '' : 's'} · ${slotReservations.guests} pax`
                  : ''

                return (
                  <button
                    key={`${group.id}-${slot.time}`}
                    className={`slot-block-time ${isBlocked ? 'is-blocked' : 'is-open'} ${slot.isReservableOnline ? 'is-online' : 'is-internal'}`}
                    type="button"
                    disabled={isLoadingBlocks || updatingTime === slot.time || !blockDate}
                    onClick={() => toggleSlotBlock(slot)}
                  >
                    <strong>{slot.time}</strong>
                    <span>{isBlocked ? 'Bloqueado' : slot.isReservableOnline ? 'Online' : 'Interno'}</span>
                    {reservationLabel && <small>{reservationLabel}</small>}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
