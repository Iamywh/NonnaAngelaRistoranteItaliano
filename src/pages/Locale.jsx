import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import '../styles/reservation-form.css'

const SERVICE_CAPACITY = 50
const CLOSED_RESERVATION_DAYS = [0, 1]
const CLOSED_RESERVATION_STATUSES_FOR_CAPACITY = ['rejected', 'cancelled']
const CLOSED_SERVICE_STATUSES_FOR_CAPACITY = ['completed', 'no_show']

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
  const { t } = useLanguage()
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

  const getServiceLabel = (service) => {
    if (service === 'lunch') return t('locale.lunch')
    if (service === 'dinner') return t('locale.dinner')
    return t('locale.service')
  }

  const capacityStatus = useMemo(() => {
    if (!serviceAvailability || !selectedService) {
      return { bookedGuests: 0, remainingGuests: null, isCapacityBlocking: false }
    }

    const bookedGuests = serviceAvailability.bookedGuests
    const remainingGuests = Math.max(SERVICE_CAPACITY - bookedGuests, 0)

    return {
      bookedGuests,
      remainingGuests,
      isCapacityBlocking: bookedGuests >= SERVICE_CAPACITY || bookedGuests + selectedGuests > SERVICE_CAPACITY,
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
        const bookedGuests = await getBookedGuestsForService(reservation.reservation_date, reservation.reservation_time)

        if (!shouldIgnore) {
          setServiceAvailability({ bookedGuests, service: selectedService })
        }
      } catch (availabilityCheckError) {
        console.error(availabilityCheckError)
        if (!shouldIgnore) {
          setServiceAvailability(null)
          setAvailabilityError(t('locale.availabilityError'))
        }
      } finally {
        if (!shouldIgnore) setIsCheckingAvailability(false)
      }
    }

    loadServiceAvailability()

    return () => {
      shouldIgnore = true
    }
  }, [reservation.reservation_date, reservation.reservation_time, selectedService, t])

  const handleChange = (event) => {
    const { name, value } = event.target

    setReservation((current) => {
      if (name === 'reservation_date') {
        const nextSlots = getReservationTimeSlots(value)
        return {
          ...current,
          reservation_date: value,
          reservation_time: nextSlots.includes(current.reservation_time) ? current.reservation_time : '',
        }
      }

      if (name === 'phone_country_iso') {
        const nextCountry = getPhoneCountry(value)
        return { ...current, phone_country_iso: nextCountry.iso, phone_country_code: nextCountry.dial }
      }

      return { ...current, [name]: name === 'guests' ? clampGuests(value) : value }
    })
  }

  const adjustGuests = (delta) => {
    setReservation((current) => ({ ...current, guests: clampGuests(Number(current.guests || 0) + delta) }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setIsSubmitting(true)
    setMessage(null)
    setError(null)

    if (isClosedReservationDate(reservation.reservation_date)) {
      setError(t('locale.closedDay'))
      setIsSubmitting(false)
      return
    }

    if (isEmailConfirmation && !reservation.customer_email.trim()) {
      setError(t('locale.emailRequired'))
      setIsSubmitting(false)
      return
    }

    if (!reservation.customer_phone_number.trim()) {
      setError(t('locale.phoneRequired'))
      setIsSubmitting(false)
      return
    }

    if (!getReservationTimeSlots(reservation.reservation_date).includes(reservation.reservation_time)) {
      setError(t('locale.timeRequired'))
      setIsSubmitting(false)
      return
    }

    try {
      const bookedGuests = await getBookedGuestsForService(reservation.reservation_date, reservation.reservation_time)
      setServiceAvailability({ bookedGuests, service: getReservationService(reservation.reservation_time) })

      if (bookedGuests + Number(reservation.guests || 0) > SERVICE_CAPACITY) {
        setError(t('locale.full'))
        setIsSubmitting(false)
        return
      }
    } catch (availabilityCheckError) {
      console.error(availabilityCheckError)
      setError(t('locale.availabilityError'))
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

    const { error: insertError } = await supabase.from('reservations').insert([payload])

    if (insertError) {
      setError(t('locale.submitError'))
      console.error(insertError)
    } else {
      setMessage(t('locale.success'))
      setReservation(initialReservation)
      setServiceAvailability(null)
    }

    setIsSubmitting(false)
  }

  return (
    <section className="content-page locale-page">
      <div className="locale-hero">
        <div className="locale-hero-copy">
          <p className="eyebrow">{t('locale.eyebrow')}</p>
          <h2>{t('locale.title')}</h2>
          <p>{t('locale.intro')}</p>
        </div>

        <blockquote className="locale-story-card">
          <p>{t('locale.story')}</p>
        </blockquote>
      </div>

      <div className="locale-experience-block">
        <div className="info-grid locale-info-grid">
          <article>
            <h3>{t('locale.serviceTitle')}</h3>
            <p>{t('locale.serviceText')}</p>
          </article>
          <article>
            <h3>{t('locale.kitchenTitle')}</h3>
            <p>{t('locale.kitchenText')}</p>
          </article>
          <article>
            <h3>{t('locale.experienceTitle')}</h3>
            <p>{t('locale.experienceText')}</p>
          </article>
        </div>
      </div>

      <section id="reservas" className="reservation-section">
        <div className="reservation-copy">
          <p className="eyebrow">{t('locale.reservationEyebrow')}</p>
          <h3>{t('locale.reservationTitle')}</h3>
          <p>{t('locale.reservationIntro')}</p>

          <ol className="reservation-process-list">
            <li>{t('locale.step1')}</li>
            <li>{t('locale.step2')}</li>
            <li>{t('locale.step3')}</li>
          </ol>
        </div>

        <form className="reservation-form" onSubmit={handleSubmit}>
          <div className="form-row">
            <label>
              {t('locale.name')}
              <input type="text" name="customer_name" value={reservation.customer_name} onChange={handleChange} required />
            </label>

            <label className="phone-field">
              {t('locale.phone')}
              <div className="phone-input-grid">
                <div className="phone-prefix-control">
                  <img
                    className="phone-country-flag"
                    src={`https://flagcdn.com/w40/${selectedPhoneCountry.flagCode}.png`}
                    alt={t('locale.flagAlt', { country: selectedPhoneCountry.name })}
                    loading="lazy"
                  />
                  <select name="phone_country_iso" value={reservation.phone_country_iso} onChange={handleChange} aria-label={t('locale.prefixLabel')}>
                    {PHONE_COUNTRIES.map((country) => (
                      <option key={country.iso} value={country.iso}>{country.name} {country.dial}</option>
                    ))}
                  </select>
                </div>
                <input type="tel" name="customer_phone_number" value={reservation.customer_phone_number} onChange={handleChange} placeholder={t('locale.number')} required />
              </div>
            </label>
          </div>

          <label>
            {t('locale.email')} {isEmailConfirmation ? '' : t('common.optional')}
            <input type="email" name="customer_email" value={reservation.customer_email} onChange={handleChange} placeholder={t('locale.emailPlaceholder')} required={isEmailConfirmation} />
          </label>

          <fieldset className="confirmation-channel-fieldset">
            <legend>{t('locale.confirmationLegend')}</legend>
            <div className="confirmation-channel-grid">
              <label className={reservation.confirmation_channel === 'whatsapp' ? 'confirmation-channel-card selected' : 'confirmation-channel-card'}>
                <input type="radio" name="confirmation_channel" value="whatsapp" checked={reservation.confirmation_channel === 'whatsapp'} onChange={handleChange} />
                <span>WhatsApp</span>
                <small>{t('locale.whatsappHelp')}</small>
              </label>
              <label className={reservation.confirmation_channel === 'email' ? 'confirmation-channel-card selected' : 'confirmation-channel-card'}>
                <input type="radio" name="confirmation_channel" value="email" checked={reservation.confirmation_channel === 'email'} onChange={handleChange} />
                <span>{t('locale.email')}</span>
                <small>{t('locale.emailHelp')}</small>
              </label>
            </div>
          </fieldset>

          <p className="form-helper strong">{t('locale.confirmationNotice')}</p>

          <div className="form-row">
            <label>
              {t('locale.date')}
              <input type="date" name="reservation_date" value={reservation.reservation_date} onChange={handleChange} required />
            </label>
            <label>
              {t('locale.time')}
              <select name="reservation_time" value={reservation.reservation_time} onChange={handleChange} disabled={!reservation.reservation_date || isReservationDateClosed} required>
                <option value="">
                  {!reservation.reservation_date ? t('common.selectFirstDate') : isReservationDateClosed ? t('common.closedSundayMonday') : t('common.selectTime')}
                </option>
                {reservationTimeSlots.map((time) => <option key={time} value={time}>{time}</option>)}
              </select>
            </label>
          </div>

          {isReservationDateClosed && <p className="form-message error">{t('locale.closedDay')}</p>}

          <div className="form-row">
            <label>
              {t('locale.people')}
              <div className="guest-stepper">
                <button type="button" onClick={() => adjustGuests(-1)} disabled={reservation.guests <= MIN_GUESTS}>−</button>
                <input type="number" name="guests" min={MIN_GUESTS} max={MAX_GUESTS} value={reservation.guests} onChange={handleChange} required />
                <button type="button" onClick={() => adjustGuests(1)} disabled={reservation.guests >= MAX_GUESTS}>+</button>
              </div>
            </label>

            <label>
              {t('locale.preferredArea')}
              <select name="area_preference" value={reservation.area_preference} onChange={handleChange}>
                <option value="indiferente">{t('locale.indifferent')}</option>
                <option value="terrazza">{t('locale.terrace')}</option>
                <option value="sala">{t('locale.diningRoom')}</option>
                <option value="coworking">{t('locale.coworking')}</option>
              </select>
            </label>
          </div>

          {isCheckingAvailability && <p className="form-message">{t('locale.checkingAvailability')}</p>}

          {!isCheckingAvailability && selectedService && capacityStatus.remainingGuests !== null && !capacityStatus.isCapacityBlocking && (
            <p className="form-message success">
              {t('locale.availability', { service: getServiceLabel(selectedService), spots: capacityStatus.remainingGuests })}
            </p>
          )}

          {!isCheckingAvailability && selectedService && capacityStatus.isCapacityBlocking && <p className="form-message error">{t('locale.full')}</p>}
          {availabilityError && <p className="form-message error">{availabilityError}</p>}

          <label>
            {t('locale.notes')}
            <textarea name="notes" value={reservation.notes} onChange={handleChange} rows="4" placeholder={t('locale.notesPlaceholder')} />
          </label>

          <button className="primary-button" type="submit" disabled={isSubmitting || isCheckingAvailability || isReservationDateClosed || capacityStatus.isCapacityBlocking}>
            {isSubmitting ? t('common.sending') : t('locale.submit')}
          </button>

          {message && <p className="form-message success">{message}</p>}
          {error && <p className="form-message error">{error}</p>}
        </form>
      </section>

      <section className="reviews-section">
        <div>
          <p className="eyebrow">{t('locale.reviewsEyebrow')}</p>
          <h3>{t('locale.reviewsTitle')}</h3>
          <p>{t('locale.reviewsText')}</p>
        </div>

        <a className="primary-button review-button" href="https://g.page/r/CQb-RYyd7PNAEBM/review" target="_blank" rel="noreferrer">
          {t('locale.reviewsButton')}
        </a>
      </section>
    </section>
  )
}
