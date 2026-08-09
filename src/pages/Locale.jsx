import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import '../styles/reservation-form.css'

const menuStory =
  'En Italia, las mejores recetas no nacen en los restaurantes, sino alrededor de una mesa familiar. En Nonna Angela queremos compartir precisamente esa tradición: platos preparados con tiempo, ingredientes seleccionados y el cariño de la cocina de casa. Nuestra propuesta está inspirada en los sabores que han acompañado a generaciones de familias italianas: pastas artesanales, salsas cocinadas lentamente, embutidos, quesos y vinos cuidadosamente elegidos para acompañar cada momento. Más que un restaurante, queremos ser un lugar donde disfrutar sin prisas, compartir, brindar y sentirse como en casa. Benvenuti a Nonna Angela.'

const SERVICE_CAPACITY = 50
const CLOSED_RESERVATION_DAYS = [0, 1]
const CLOSED_RESERVATION_STATUSES_FOR_CAPACITY = ['rejected', 'cancelled']
const CLOSED_SERVICE_STATUSES_FOR_CAPACITY = ['completed', 'no_show']
const SERVICE_FULL_MESSAGE =
  'Las reservas online para este servicio están casi completas. Por favor, contacta directamente con el restaurante para comprobar disponibilidad.'
const CLOSED_DAY_MESSAGE =
  'El restaurante permanece cerrado los domingos y lunes. Por favor, selecciona otra fecha para tu reserva.'

const PHONE_COUNTRIES = [
  { iso: 'ES', dial: '+34', name: 'España', flagCode: 'es' },
  { iso: 'IT', dial: '+39', name: 'Italia', flagCode: 'it' },
  { iso: 'FR', dial: '+33', name: 'Francia', flagCode: 'fr' },
  { iso: 'DE', dial: '+49', name: 'Alemania', flagCode: 'de' },
  { iso: 'GB', dial: '+44', name: 'Reino Unido', flagCode: 'gb' },
  { iso: 'PT', dial: '+351', name: 'Portugal', flagCode: 'pt' },
  { iso: 'IE', dial: '+353', name: 'Irlanda', flagCode: 'ie' },
  { iso: 'NL', dial: '+31', name: 'Países Bajos', flagCode: 'nl' },
  { iso: 'BE', dial: '+32', name: 'Bélgica', flagCode: 'be' },
  { iso: 'LU', dial: '+352', name: 'Luxemburgo', flagCode: 'lu' },
  { iso: 'CH', dial: '+41', name: 'Suiza', flagCode: 'ch' },
  { iso: 'AT', dial: '+43', name: 'Austria', flagCode: 'at' },
  { iso: 'DK', dial: '+45', name: 'Dinamarca', flagCode: 'dk' },
  { iso: 'SE', dial: '+46', name: 'Suecia', flagCode: 'se' },
  { iso: 'NO', dial: '+47', name: 'Noruega', flagCode: 'no' },
  { iso: 'FI', dial: '+358', name: 'Finlandia', flagCode: 'fi' },
  { iso: 'IS', dial: '+354', name: 'Islandia', flagCode: 'is' },
  { iso: 'PL', dial: '+48', name: 'Polonia', flagCode: 'pl' },
  { iso: 'CZ', dial: '+420', name: 'Chequia', flagCode: 'cz' },
  { iso: 'SK', dial: '+421', name: 'Eslovaquia', flagCode: 'sk' },
  { iso: 'HU', dial: '+36', name: 'Hungría', flagCode: 'hu' },
  { iso: 'RO', dial: '+40', name: 'Rumanía', flagCode: 'ro' },
  { iso: 'BG', dial: '+359', name: 'Bulgaria', flagCode: 'bg' },
  { iso: 'GR', dial: '+30', name: 'Grecia', flagCode: 'gr' },
  { iso: 'HR', dial: '+385', name: 'Croacia', flagCode: 'hr' },
  { iso: 'SI', dial: '+386', name: 'Eslovenia', flagCode: 'si' },
  { iso: 'EE', dial: '+372', name: 'Estonia', flagCode: 'ee' },
  { iso: 'LV', dial: '+371', name: 'Letonia', flagCode: 'lv' },
  { iso: 'LT', dial: '+370', name: 'Lituania', flagCode: 'lt' },
  { iso: 'MT', dial: '+356', name: 'Malta', flagCode: 'mt' },
  { iso: 'CY', dial: '+357', name: 'Chipre', flagCode: 'cy' },
  { iso: 'AD', dial: '+376', name: 'Andorra', flagCode: 'ad' },
  { iso: 'MC', dial: '+377', name: 'Mónaco', flagCode: 'mc' },
  { iso: 'SM', dial: '+378', name: 'San Marino', flagCode: 'sm' },
  { iso: 'UA', dial: '+380', name: 'Ucrania', flagCode: 'ua' },
  { iso: 'TR', dial: '+90', name: 'Turquía', flagCode: 'tr' },
  { iso: 'US', dial: '+1', name: 'Estados Unidos', flagCode: 'us' },
  { iso: 'CA', dial: '+1', name: 'Canadá', flagCode: 'ca' },
  { iso: 'MX', dial: '+52', name: 'México', flagCode: 'mx' },
  { iso: 'BR', dial: '+55', name: 'Brasil', flagCode: 'br' },
  { iso: 'AR', dial: '+54', name: 'Argentina', flagCode: 'ar' },
  { iso: 'CL', dial: '+56', name: 'Chile', flagCode: 'cl' },
  { iso: 'CO', dial: '+57', name: 'Colombia', flagCode: 'co' },
  { iso: 'PE', dial: '+51', name: 'Perú', flagCode: 'pe' },
  { iso: 'UY', dial: '+598', name: 'Uruguay', flagCode: 'uy' },
  { iso: 'VE', dial: '+58', name: 'Venezuela', flagCode: 've' },
  { iso: 'MA', dial: '+212', name: 'Marruecos', flagCode: 'ma' },
  { iso: 'ZA', dial: '+27', name: 'Sudáfrica', flagCode: 'za' },
  { iso: 'AU', dial: '+61', name: 'Australia', flagCode: 'au' },
  { iso: 'NZ', dial: '+64', name: 'Nueva Zelanda', flagCode: 'nz' },
  { iso: 'CN', dial: '+86', name: 'China', flagCode: 'cn' },
  { iso: 'JP', dial: '+81', name: 'Japón', flagCode: 'jp' },
  { iso: 'KR', dial: '+82', name: 'Corea del Sur', flagCode: 'kr' },
  { iso: 'IN', dial: '+91', name: 'India', flagCode: 'in' },
  { iso: 'AE', dial: '+971', name: 'Emiratos Árabes', flagCode: 'ae' },
  { iso: 'SA', dial: '+966', name: 'Arabia Saudí', flagCode: 'sa' },
  { iso: 'QA', dial: '+974', name: 'Catar', flagCode: 'qa' },
  { iso: 'IL', dial: '+972', name: 'Israel', flagCode: 'il' }
]

const MIN_GUESTS = 1
const MAX_GUESTS = 20

const initialReservation = {
  customer_name: '',
  phone_country_iso: 'ES',
  phone_country_code: '+34',
  customer_phone_number: '',
  customer_email: '',
  confirmation_channel: 'whatsapp',
  reservation_date: '',
  reservation_time: '',
  guests: 2,
  area_preference: 'indiferente',
  notes: '',
}

function formatTime(minutes) {
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60

  return `${String(hours).padStart(2, '0')}:${String(remainingMinutes).padStart(2, '0')}`
}

function buildTimeSlots(startTime, lastTime) {
  const [startHours, startMinutes] = startTime.split(':').map(Number)
  const [lastHours, lastMinutes] = lastTime.split(':').map(Number)
  const start = startHours * 60 + startMinutes
  const last = lastHours * 60 + lastMinutes
  const slots = []

  for (let minutes = start; minutes <= last; minutes += 15) {
    slots.push(formatTime(minutes))
  }

  return slots
}

function getDayFromDateValue(dateValue) {
  if (!dateValue) return null

  const [year, month, day] = dateValue.split('-').map(Number)
  return new Date(year, month - 1, day).getDay()
}

function isClosedReservationDate(dateValue) {
  const day = getDayFromDateValue(dateValue)

  return day !== null && CLOSED_RESERVATION_DAYS.includes(day)
}

function isFridayOrSaturday(dateValue) {
  const day = getDayFromDateValue(dateValue)

  return day === 5 || day === 6
}

function getReservationTimeSlots(dateValue) {
  if (!dateValue || isClosedReservationDate(dateValue)) return []

  const lastDinnerSlot = isFridayOrSaturday(dateValue) ? '22:45' : '22:30'

  return [
    ...buildTimeSlots('12:30', '15:15'),
    ...buildTimeSlots('19:30', lastDinnerSlot),
  ]
}

function getReservationService(timeValue) {
  if (!timeValue) return null

  const [hours, minutes] = timeValue.split(':').map(Number)
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null

  return hours * 60 + minutes < 17 * 60 ? 'lunch' : 'dinner'
}

function getServiceLabel(service) {
  if (service === 'lunch') return 'mediodía'
  if (service === 'dinner') return 'cena'
  return 'servicio'
}

function getReservationStatus(booking) {
  return booking?.reservation_status || booking?.status || 'pending'
}

function getServiceStatus(booking) {
  if (booking?.service_status) return booking.service_status
  if (['seated', 'completed', 'no_show'].includes(booking?.status)) return booking.status
  return 'not_arrived'
}

function countsForServiceCapacity(booking) {
  return (
    !CLOSED_RESERVATION_STATUSES_FOR_CAPACITY.includes(getReservationStatus(booking)) &&
    !CLOSED_SERVICE_STATUSES_FOR_CAPACITY.includes(getServiceStatus(booking))
  )
}

function clampGuests(value) {
  const numericValue = Number(value)
  if (Number.isNaN(numericValue)) return MIN_GUESTS
  return Math.min(Math.max(numericValue, MIN_GUESTS), MAX_GUESTS)
}

function getPhoneCountry(iso) {
  return PHONE_COUNTRIES.find((country) => country.iso === iso) || PHONE_COUNTRIES[0]
}

async function getBookedGuestsForService(dateValue, timeValue) {
  const service = getReservationService(timeValue)

  if (!dateValue || !service) return 0

  const { data, error } = await supabase
    .from('reservations')
    .select('reservation_time, guests, status, reservation_status, service_status')
    .eq('reservation_date', dateValue)

  if (error) throw error

  return (data || [])
    .filter((booking) => getReservationService(booking.reservation_time) === service)
    .filter((booking) => countsForServiceCapacity(booking))
    .reduce((total, booking) => total + Number(booking.guests || 0), 0)
}

export default function Locale() {
  const [reservation, setReservation] = useState(initialReservation)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)
  const [serviceAvailability, setServiceAvailability] = useState(null)
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false)
  const [availabilityError, setAvailabilityError] = useState(null)
  const reservationTimeSlots = getReservationTimeSlots(reservation.reservation_date)
  const isReservationDateClosed = isClosedReservationDate(reservation.reservation_date)
  const selectedService = getReservationService(reservation.reservation_time)
  const selectedGuests = Number(reservation.guests || 0)
  const selectedPhoneCountry = getPhoneCountry(reservation.phone_country_iso)
  const isEmailConfirmation = reservation.confirmation_channel === 'email'

  const capacityStatus = useMemo(() => {
    if (!serviceAvailability || !selectedService) {
      return {
        bookedGuests: 0,
        remainingGuests: null,
        isCapacityBlocking: false,
      }
    }

    const bookedGuests = serviceAvailability.bookedGuests
    const remainingGuests = Math.max(SERVICE_CAPACITY - bookedGuests, 0)

    return {
      bookedGuests,
      remainingGuests,
      isCapacityBlocking:
        bookedGuests >= SERVICE_CAPACITY || bookedGuests + selectedGuests > SERVICE_CAPACITY,
    }
  }, [serviceAvailability, selectedGuests, selectedService])

  useEffect(() => {
    let shouldIgnore = false

    const loadServiceAvailability = async () => {
      setAvailabilityError(null)

      if (!reservation.reservation_date || !reservation.reservation_time || !selectedService) {
        setServiceAvailability(null)
        return
      }

      setIsCheckingAvailability(true)

      try {
        const bookedGuests = await getBookedGuestsForService(
          reservation.reservation_date,
          reservation.reservation_time
        )

        if (!shouldIgnore) {
          setServiceAvailability({
            bookedGuests,
            service: selectedService,
          })
        }
      } catch (availabilityCheckError) {
        console.error(availabilityCheckError)

        if (!shouldIgnore) {
          setServiceAvailability(null)
          setAvailabilityError(
            'No hemos podido comprobar la disponibilidad online. Inténtalo de nuevo o contacta directamente con el restaurante.'
          )
        }
      } finally {
        if (!shouldIgnore) {
          setIsCheckingAvailability(false)
        }
      }
    }

    loadServiceAvailability()

    return () => {
      shouldIgnore = true
    }
  }, [reservation.reservation_date, reservation.reservation_time, selectedService])

  const handleChange = (event) => {
    const { name, value } = event.target

    setReservation((current) => {
      if (name === 'reservation_date') {
        const nextSlots = getReservationTimeSlots(value)

        return {
          ...current,
          reservation_date: value,
          reservation_time: nextSlots.includes(current.reservation_time)
            ? current.reservation_time
            : '',
        }
      }

      if (name === 'phone_country_iso') {
        const nextCountry = getPhoneCountry(value)
        return {
          ...current,
          phone_country_iso: nextCountry.iso,
          phone_country_code: nextCountry.dial,
        }
      }

      return {
        ...current,
        [name]: name === 'guests' ? clampGuests(value) : value,
      }
    })
  }

  const adjustGuests = (delta) => {
    setReservation((current) => ({
      ...current,
      guests: clampGuests(Number(current.guests || 0) + delta),
    }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setIsSubmitting(true)
    setMessage(null)
    setError(null)

    if (isClosedReservationDate(reservation.reservation_date)) {
      setError(CLOSED_DAY_MESSAGE)
      setIsSubmitting(false)
      return
    }

    if (isEmailConfirmation && !reservation.customer_email.trim()) {
      setError('Introduce tu email para recibir la confirmación por correo.')
      setIsSubmitting(false)
      return
    }

    if (!reservation.customer_phone_number.trim()) {
      setError('Introduce un número de teléfono válido.')
      setIsSubmitting(false)
      return
    }

    if (!getReservationTimeSlots(reservation.reservation_date).includes(reservation.reservation_time)) {
      setError('Selecciona una hora disponible para la fecha elegida.')
      setIsSubmitting(false)
      return
    }

    try {
      const bookedGuests = await getBookedGuestsForService(
        reservation.reservation_date,
        reservation.reservation_time
      )

      setServiceAvailability({
        bookedGuests,
        service: getReservationService(reservation.reservation_time),
      })

      if (bookedGuests + Number(reservation.guests || 0) > SERVICE_CAPACITY) {
        setError(SERVICE_FULL_MESSAGE)
        setIsSubmitting(false)
        return
      }
    } catch (availabilityCheckError) {
      console.error(availabilityCheckError)
      setError(
        'No hemos podido comprobar la disponibilidad online. Inténtalo de nuevo o contacta directamente con el restaurante.'
      )
      setIsSubmitting(false)
      return
    }

    const phoneNumber = reservation.customer_phone_number.trim()
    const fullPhone = `${selectedPhoneCountry.dial} ${phoneNumber}`

    const payload = {
      customer_name: reservation.customer_name.trim(),
      customer_phone: fullPhone,
      customer_email: reservation.customer_email.trim() || null,
      phone_country_code: selectedPhoneCountry.dial,
      phone_country_iso: selectedPhoneCountry.iso,
      confirmation_channel: reservation.confirmation_channel,
      reservation_date: reservation.reservation_date,
      reservation_time: reservation.reservation_time,
      guests: reservation.guests,
      area_preference: reservation.area_preference,
      notes: reservation.notes.trim() || null,
      reservation_status: 'pending',
      service_status: 'not_arrived',
      status: 'pending',
      source: 'website',
    }

    const { error: insertError } = await supabase
      .from('reservations')
      .insert([payload])

    if (insertError) {
      setError('No hemos podido enviar la solicitud. Inténtalo de nuevo o llámanos directamente.')
      console.error(insertError)
    } else {
      setMessage('Solicitud recibida. Nuestro equipo revisará la disponibilidad y te enviará la confirmación por el canal elegido.')
      setReservation(initialReservation)
      setServiceAvailability(null)
    }

    setIsSubmitting(false)
  }

  return (
    <section className="content-page locale-page">
      <div className="locale-hero">
        <div className="locale-hero-copy">
          <p className="eyebrow">El restaurante</p>
          <h2>Un bistrot italiano con alma familiar</h2>
          <p>
            Nonna Angela nace para diferenciarse de los restaurantes italianos
            turísticos: menos confusión, más identidad, menos carta infinita y más
            control en cada plato.
          </p>
        </div>

        <blockquote className="locale-story-card">
          <p>{menuStory}</p>
        </blockquote>
      </div>

      <div className="locale-experience-block">
        <div className="info-grid locale-info-grid">
          <article>
            <h3>Servicio</h3>
            <p>Acogida cálida, atención en mesa y explicación de los platos.</p>
          </article>

          <article>
            <h3>Cocina</h3>
            <p>
              Preparaciones organizadas, ragú, pastas, carnes y postres
              tradicionales italianos.
            </p>
          </article>

          <article>
            <h3>Experiencia</h3>
            <p>
              Platos sencillos, pero presentados y contados con valor.
            </p>
          </article>
        </div>
      </div>

      <section id="reservas" className="reservation-section">
        <div className="reservation-copy">
          <p className="eyebrow">Reservas</p>
          <h3>Reserva tu mesa</h3>
          <p>
            Envíanos tu solicitud y nuestro equipo confirmará la reserva lo antes posible.
            La reserva será válida únicamente después de recibir confirmación por email o WhatsApp.
          </p>

          <ol className="reservation-process-list">
            <li>Envías tu solicitud.</li>
            <li>Revisamos disponibilidad.</li>
            <li>Recibes la confirmación por el canal elegido.</li>
          </ol>
        </div>

        <form className="reservation-form" onSubmit={handleSubmit}>
          <div className="form-row">
            <label>
              Nombre
              <input
                type="text"
                name="customer_name"
                value={reservation.customer_name}
                onChange={handleChange}
                required
              />
            </label>

            <label className="phone-field">
              Teléfono
              <div className="phone-input-grid">
                <div className="phone-prefix-control">
                  <img
                    className="phone-country-flag"
                    src={`https://flagcdn.com/w40/${selectedPhoneCountry.flagCode}.png`}
                    alt={`Bandera ${selectedPhoneCountry.name}`}
                    loading="lazy"
                  />
                  <select
                    name="phone_country_iso"
                    value={reservation.phone_country_iso}
                    onChange={handleChange}
                    aria-label="Prefijo telefónico"
                  >
                    {PHONE_COUNTRIES.map((country) => (
                      <option key={country.iso} value={country.iso}>
                        {country.name} {country.dial}
                      </option>
                    ))}
                  </select>
                </div>
                <input
                  type="tel"
                  name="customer_phone_number"
                  value={reservation.customer_phone_number}
                  onChange={handleChange}
                  placeholder="Número"
                  required
                />
              </div>
            </label>
          </div>

          <label>
            Email {isEmailConfirmation ? '' : 'opcional'}
            <input
              type="email"
              name="customer_email"
              value={reservation.customer_email}
              onChange={handleChange}
              placeholder="Para confirmación por correo"
              required={isEmailConfirmation}
            />
          </label>

          <fieldset className="confirmation-channel-fieldset">
            <legend>¿Cómo prefieres recibir la confirmación?</legend>
            <div className="confirmation-channel-grid">
              <label className={reservation.confirmation_channel === 'whatsapp' ? 'confirmation-channel-card selected' : 'confirmation-channel-card'}>
                <input
                  type="radio"
                  name="confirmation_channel"
                  value="whatsapp"
                  checked={reservation.confirmation_channel === 'whatsapp'}
                  onChange={handleChange}
                />
                <span>WhatsApp</span>
                <small>Te escribiremos al número indicado.</small>
              </label>

              <label className={reservation.confirmation_channel === 'email' ? 'confirmation-channel-card selected' : 'confirmation-channel-card'}>
                <input
                  type="radio"
                  name="confirmation_channel"
                  value="email"
                  checked={reservation.confirmation_channel === 'email'}
                  onChange={handleChange}
                />
                <span>Email</span>
                <small>Recibirás la confirmación por correo.</small>
              </label>
            </div>
          </fieldset>

          <p className="form-helper strong">
            La reserva será válida únicamente después de recibir confirmación del equipo de Nonna Angela por email o WhatsApp.
          </p>

          <div className="form-row">
            <label>
              Fecha
              <input
                type="date"
                name="reservation_date"
                value={reservation.reservation_date}
                onChange={handleChange}
                required
              />
            </label>

            <label>
              Hora
              <select
                name="reservation_time"
                value={reservation.reservation_time}
                onChange={handleChange}
                disabled={!reservation.reservation_date || isReservationDateClosed}
                required
              >
                <option value="">
                  {!reservation.reservation_date
                    ? 'Selecciona primero una fecha'
                    : isReservationDateClosed
                      ? 'Cerrado domingos y lunes'
                      : 'Selecciona una hora'}
                </option>
                {reservationTimeSlots.map((time) => (
                  <option key={time} value={time}>
                    {time}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {isReservationDateClosed && (
            <p className="form-message error">{CLOSED_DAY_MESSAGE}</p>
          )}

          <div className="form-row">
            <label>
              Personas
              <div className="guest-stepper">
                <button type="button" onClick={() => adjustGuests(-1)} disabled={reservation.guests <= MIN_GUESTS}>
                  −
                </button>
                <input
                  type="number"
                  name="guests"
                  min={MIN_GUESTS}
                  max={MAX_GUESTS}
                  value={reservation.guests}
                  onChange={handleChange}
                  required
                />
                <button type="button" onClick={() => adjustGuests(1)} disabled={reservation.guests >= MAX_GUESTS}>
                  +
                </button>
              </div>
            </label>

            <label>
              Zona preferida
              <select
                name="area_preference"
                value={reservation.area_preference}
                onChange={handleChange}
              >
                <option value="indiferente">Indiferente</option>
                <option value="terrazza">Terrazza</option>
                <option value="sala">Sala</option>
                <option value="coworking">Coworking</option>
              </select>
            </label>
          </div>

          {isCheckingAvailability && (
            <p className="form-message">Comprobando disponibilidad del servicio...</p>
          )}

          {!isCheckingAvailability && selectedService && capacityStatus.remainingGuests !== null && !capacityStatus.isCapacityBlocking && (
            <p className="form-message success">
              Disponibilidad online para {getServiceLabel(selectedService)}: quedan {capacityStatus.remainingGuests} plazas.
            </p>
          )}

          {!isCheckingAvailability && selectedService && capacityStatus.isCapacityBlocking && (
            <p className="form-message error">{SERVICE_FULL_MESSAGE}</p>
          )}

          {availabilityError && <p className="form-message error">{availabilityError}</p>}

          <label>
            Notas
            <textarea
              name="notes"
              value={reservation.notes}
              onChange={handleChange}
              rows="4"
              placeholder="Alergias, carrito de bebé, celebración, preferencia..."
            />
          </label>

          <button
            className="primary-button"
            type="submit"
            disabled={
              isSubmitting ||
              isCheckingAvailability ||
              isReservationDateClosed ||
              capacityStatus.isCapacityBlocking
            }
          >
            {isSubmitting ? 'Enviando...' : 'Enviar solicitud'}
          </button>

          {message && <p className="form-message success">{message}</p>}
          {error && <p className="form-message error">{error}</p>}
        </form>
      </section>

      <section className="reviews-section">
        <div>
          <p className="eyebrow">Google Reviews</p>
          <h3>¿Ya nos has visitado?</h3>
          <p>
            Tu valoración ayuda a Nonna Angela a crecer y a que más personas descubran
            nuestra cocina italiana.
          </p>
        </div>

        <a
          className="primary-button review-button"
          href="https://g.page/r/CQb-RYyd7PNAEBM/review"
          target="_blank"
          rel="noreferrer"
        >
          Valóranos en Google
        </a>
      </section>
    </section>
  )
}
