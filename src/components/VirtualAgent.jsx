import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import restaurantKnowledge from '../data/bot/restaurantKnowledge.json'
import { buildAdvancedRestaurantAnswer } from '../data/bot/advancedMenuAssistant.js'
import '../styles/chatbot-reservations.css'

const CHAT_STORAGE_KEY = 'nonna_angela_virtual_agent_messages'
const SERVICE_CAPACITY = 50
const CLOSED_RESERVATION_DAYS = [0, 1]
const CLOSED_RESERVATION_STATUSES_FOR_CAPACITY = ['rejected', 'cancelled']
const CLOSED_SERVICE_STATUSES_FOR_CAPACITY = ['completed', 'no_show']
const MIN_GUESTS = 1
const MAX_GUESTS = 20

const initialBookingForm = {
  name: '',
  date: '',
  time: '',
  people: '2',
  phone: '',
  email: '',
  confirmation_channel: 'whatsapp',
  notes: ''
}

const initialModifyForm = {
  date: '',
  time: '',
  people: '2',
  notes: ''
}

const LANGUAGE_LOCALES = {
  es: 'es-ES',
  en: 'en-GB',
  fr: 'fr-FR',
  it: 'it-IT'
}

function buildGreeting(t) {
  return {
    role: 'agent',
    text: `${t('bot.title')} — ${t('bot.help')}`
  }
}

function getInitialMessages(t) {
  const fallbackMessages = [buildGreeting(t)]

  if (typeof window === 'undefined') return fallbackMessages

  try {
    const savedMessages = window.localStorage.getItem(CHAT_STORAGE_KEY)
    if (!savedMessages) return fallbackMessages

    const parsedMessages = JSON.parse(savedMessages)
    return Array.isArray(parsedMessages) && parsedMessages.length > 0 ? parsedMessages : fallbackMessages
  } catch {
    return fallbackMessages
  }
}

function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

function sanitizePhoneDigits(phone) {
  return String(phone || '').replace(/\D/g, '')
}

function phonesMatch(storedPhone, requestedPhone) {
  const storedDigits = sanitizePhoneDigits(storedPhone)
  const requestedDigits = sanitizePhoneDigits(requestedPhone)

  if (requestedDigits.length < 6 || storedDigits.length < 6) return false
  if (storedDigits === requestedDigits) return true
  if (storedDigits.endsWith(requestedDigits)) return true
  if (requestedDigits.endsWith(storedDigits)) return true

  const requestedTail = requestedDigits.slice(-7)
  const storedTail = storedDigits.slice(-7)
  return requestedTail.length >= 7 && requestedTail === storedTail
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

function parseDateValue(value) {
  if (!value) return null
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return null
  return { year, month, day }
}

function createLocalDate(year, month, day) {
  return new Date(year, month - 1, day)
}

function getTodayDateValue() {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getDayFromDateValue(dateValue) {
  const parsed = parseDateValue(dateValue)
  if (!parsed) return null
  return createLocalDate(parsed.year, parsed.month, parsed.day).getDay()
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
    ...buildTimeSlots('19:30', lastDinnerSlot)
  ]
}

function getReservationService(timeValue) {
  if (!timeValue) return null
  const [hours, minutes] = String(timeValue).split(':').map(Number)
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

function formatReservationDate(dateValue, language = 'es') {
  const parsed = parseDateValue(dateValue)
  if (!parsed) return '-'

  return createLocalDate(parsed.year, parsed.month, parsed.day).toLocaleDateString(LANGUAGE_LOCALES[language] || 'es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })
}

function formatReservationDateShort(dateValue, language = 'es') {
  const parsed = parseDateValue(dateValue)
  if (!parsed) return '-'

  return createLocalDate(parsed.year, parsed.month, parsed.day).toLocaleDateString(LANGUAGE_LOCALES[language] || 'es-ES', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
}

async function getBookedGuestsForService(dateValue, timeValue, excludedReservationId = null) {
  const service = getReservationService(timeValue)
  if (!dateValue || !service) return 0

  const { data, error } = await supabase
    .from('reservations')
    .select('id, reservation_time, guests, status, reservation_status, service_status')
    .eq('reservation_date', dateValue)

  if (error) throw error

  return (data || [])
    .filter((booking) => !excludedReservationId || booking.id !== excludedReservationId)
    .filter((booking) => getReservationService(booking.reservation_time) === service)
    .filter((booking) => countsForServiceCapacity(booking))
    .reduce((total, booking) => total + Number(booking.guests || 0), 0)
}

function buildNotesWithOrigin(notes, originText) {
  const cleanNotes = String(notes || '').trim()
  return cleanNotes ? `${originText}\n${cleanNotes}` : originText
}

function isStatusRequest(userText) {
  const normalized = normalizeText(userText)
  return (
    normalized.includes('estado') ||
    normalized.includes('status') ||
    normalized.includes('confirm') ||
    normalized.includes('etat') ||
    normalized.includes('état') ||
    normalized.includes('stato') ||
    normalized.includes('booking') ||
    normalized.includes('prenotazione')
  ) && (
    normalized.includes('reserva') ||
    normalized.includes('mesa') ||
    normalized.includes('booking') ||
    normalized.includes('reservation') ||
    normalized.includes('prenotazione')
  )
}

function isModificationRequest(userText) {
  const normalized = normalizeText(userText)
  return (
    normalized.includes('modificar') ||
    normalized.includes('cambiar') ||
    normalized.includes('editar') ||
    normalized.includes('mover') ||
    normalized.includes('modify') ||
    normalized.includes('change') ||
    normalized.includes('modifier') ||
    normalized.includes('changer') ||
    normalized.includes('modifica') ||
    normalized.includes('cambiare')
  ) && (
    normalized.includes('reserva') ||
    normalized.includes('mesa') ||
    normalized.includes('booking') ||
    normalized.includes('reservation') ||
    normalized.includes('prenotazione')
  )
}

function isBookingRequest(userText) {
  const normalized = normalizeText(userText)
  return (
    normalized.includes('reservar') ||
    normalized.includes('reserva') ||
    normalized.includes('mesa') ||
    normalized.includes('book') ||
    normalized.includes('booking') ||
    normalized.includes('réserver') ||
    normalized.includes('reserver') ||
    normalized.includes('prenotare') ||
    normalized.includes('prenota') ||
    normalized.includes('table') ||
    normalized.includes('tavolo')
  ) && !isModificationRequest(userText) && !isStatusRequest(userText)
}

function buildBasicAnswer(userText, language) {
  const normalized = normalizeText(userText)
  const restaurant = restaurantKnowledge.restaurant

  if (normalized.includes('horario') || normalized.includes('abierto') || normalized.includes('opening') || normalized.includes('hours') || normalized.includes('horaire') || normalized.includes('orari')) {
    return {
      es: restaurant.openingHours?.humanReadable || 'Abrimos de martes a sábado. Cerramos domingo y lunes.',
      en: 'We are open Tuesday to Saturday for lunch and dinner. Closed Sunday and Monday.',
      fr: 'Nous sommes ouverts du mardi au samedi, midi et soir. Fermé dimanche et lundi.',
      it: 'Siamo aperti da martedì a sabato, a pranzo e cena. Chiuso domenica e lunedì.'
    }[language]
  }

  if (normalized.includes('direccion') || normalized.includes('donde') || normalized.includes('ubicacion') || normalized.includes('address') || normalized.includes('location') || normalized.includes('adresse') || normalized.includes('indirizzo')) {
    return `${restaurant.address?.fullAddress || 'Calle Méndez Núñez 20, Santa Cruz de Tenerife'}.`
  }

  if (normalized.includes('telefono') || normalized.includes('phone') || normalized.includes('whatsapp') || normalized.includes('contacto') || normalized.includes('contact')) {
    return `${restaurant.contact?.mobile?.value || '+34 613 381 023'}`
  }

  return buildAdvancedRestaurantAnswer(userText, language)
}

function buildReservationSummary(reservation, language) {
  return `${formatReservationDateShort(reservation.reservation_date, language)} · ${reservation.reservation_time || '-'} · ${reservation.guests || '-'} pax`
}

function buildReservationStatusAnswer(reservation, t, language) {
  const reservationStatus = getReservationStatus(reservation)
  const statusLabel = t(`bot.statusLabels.${reservationStatus}`)
  const summary = buildReservationSummary(reservation, language)

  return t('bot.selectedStatus', { summary, status: statusLabel })
}

export default function VirtualAgent() {
  const { language, t } = useLanguage()
  const [isOpen, setIsOpen] = useState(false)
  const [userInput, setUserInput] = useState('')
  const [activeOptions, setActiveOptions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(true)
  const [messages, setMessages] = useState(() => getInitialMessages(t))

  const [showBookingForm, setShowBookingForm] = useState(false)
  const [bookingForm, setBookingForm] = useState(initialBookingForm)
  const [bookingStatus, setBookingStatus] = useState({ type: '', message: '' })
  const [isSavingBooking, setIsSavingBooking] = useState(false)

  const [showModifySearchForm, setShowModifySearchForm] = useState(false)
  const [modifyPhone, setModifyPhone] = useState('')
  const [matchingReservations, setMatchingReservations] = useState([])
  const [selectedReservation, setSelectedReservation] = useState(null)
  const [modifyForm, setModifyForm] = useState(initialModifyForm)
  const [modifyStatus, setModifyStatus] = useState({ type: '', message: '' })
  const [isSearchingModification, setIsSearchingModification] = useState(false)
  const [isUpdatingReservation, setIsUpdatingReservation] = useState(false)

  const [showStatusSearchForm, setShowStatusSearchForm] = useState(false)
  const [statusPhone, setStatusPhone] = useState('')
  const [statusReservations, setStatusReservations] = useState([])
  const [statusStatus, setStatusStatus] = useState({ type: '', message: '' })
  const [isSearchingStatus, setIsSearchingStatus] = useState(false)

  const promotedTopics = useMemo(() => [
    { label: t('bot.topics.booking'), action: 'open_booking_form' },
    { label: t('bot.topics.status'), action: 'open_status_reservation' },
    { label: t('bot.topics.modify'), action: 'open_modify_reservation' },
    { label: t('bot.topics.wines'), prompt: 'wine by glass' },
    { label: t('bot.topics.cocktails'), prompt: 'negroni cocktail' },
    { label: t('bot.topics.hours'), prompt: 'opening hours' },
    { label: t('bot.topics.location'), prompt: 'location address' }
  ], [t])

  const bookingTimeSlots = getReservationTimeSlots(bookingForm.date)
  const modifyTimeSlots = getReservationTimeSlots(modifyForm.date)

  useEffect(() => {
    try {
      window.localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages))
    } catch {
      // Local storage may be unavailable in some browsers.
    }
  }, [messages])

  useEffect(() => {
    setMessages((current) => {
      if (current.length !== 1) return current
      return [buildGreeting(t)]
    })
  }, [language, t])

  const appendConversation = (userText, agentText) => {
    setMessages((current) => [...current, { role: 'user', text: userText }, { role: 'agent', text: agentText }])
  }

  const addAgentMessage = (agentText) => {
    setMessages((current) => [...current, { role: 'agent', text: agentText }])
  }

  const resetForms = () => {
    setShowBookingForm(false)
    setShowModifySearchForm(false)
    setShowStatusSearchForm(false)
    setSelectedReservation(null)
    setMatchingReservations([])
    setStatusReservations([])
    setBookingStatus({ type: '', message: '' })
    setModifyStatus({ type: '', message: '' })
    setStatusStatus({ type: '', message: '' })
  }

  const openBookingForm = (userText = t('bot.topics.booking')) => {
    resetForms()
    setShowBookingForm(true)
    setActiveOptions([])
    setShowSuggestions(false)
    appendConversation(userText, t('bot.bookingPrompt'))
  }

  const openModifyForm = (userText = t('bot.topics.modify')) => {
    resetForms()
    setShowModifySearchForm(true)
    setActiveOptions([])
    setShowSuggestions(false)
    appendConversation(userText, t('bot.modifyPrompt'))
  }

  const openStatusForm = (userText = t('bot.topics.status')) => {
    resetForms()
    setShowStatusSearchForm(true)
    setActiveOptions([])
    setShowSuggestions(false)
    appendConversation(userText, t('bot.statusPrompt'))
  }

  const handleResetChat = () => {
    setMessages([buildGreeting(t)])
    setActiveOptions([])
    setUserInput('')
    setShowSuggestions(true)
    setBookingForm(initialBookingForm)
    setModifyForm(initialModifyForm)
    setModifyPhone('')
    setStatusPhone('')
    resetForms()

    try {
      window.localStorage.removeItem(CHAT_STORAGE_KEY)
    } catch {
      // Local storage may be unavailable in some browsers.
    }
  }

  const validateReservationFields = async ({ date, time, people }, excludedReservationId = null) => {
    if (isClosedReservationDate(date)) return t('locale.closedDay')
    if (!getReservationTimeSlots(date).includes(time)) return t('locale.timeRequired')

    const bookedGuests = await getBookedGuestsForService(date, time, excludedReservationId)
    if (bookedGuests + Number(people || 0) > SERVICE_CAPACITY) return t('locale.full')
    return ''
  }

  const findReservationsByPhone = async (phoneValue) => {
    const searchedPhone = phoneValue.trim()
    if (sanitizePhoneDigits(searchedPhone).length < 6) return { error: t('bot.phoneMin'), matches: [] }

    const { data, error } = await supabase
      .from('reservations')
      .select('id, customer_name, customer_phone, customer_email, reservation_date, reservation_time, guests, area_preference, notes, status, reservation_status, service_status, confirmation_channel, created_at')
      .gte('reservation_date', getTodayDateValue())
      .order('reservation_date', { ascending: true })
      .order('reservation_time', { ascending: true })

    if (error) throw error

    const matches = (data || []).filter((reservation) => phonesMatch(reservation.customer_phone, searchedPhone)).slice(0, 6)
    return { error: '', matches }
  }

  const searchReservationsForModification = async (phoneValue, shouldAppendUserMessage = false) => {
    const searchedPhone = phoneValue.trim()
    setIsSearchingModification(true)
    setModifyStatus({ type: '', message: '' })
    setMatchingReservations([])
    setSelectedReservation(null)

    try {
      const { error, matches } = await findReservationsByPhone(searchedPhone)
      if (error) {
        setModifyStatus({ type: 'error', message: error })
        if (shouldAppendUserMessage) appendConversation(searchedPhone, error)
        return
      }

      const editableMatches = matches
        .filter((reservation) => !['rejected', 'cancelled'].includes(getReservationStatus(reservation)))
        .filter((reservation) => !['completed', 'no_show'].includes(getServiceStatus(reservation)))
        .slice(0, 5)

      if (!editableMatches.length) {
        const message = t('bot.noBooking')
        setModifyStatus({ type: 'error', message })
        if (shouldAppendUserMessage) appendConversation(searchedPhone, message)
        return
      }

      setMatchingReservations(editableMatches)

      if (editableMatches.length === 1) {
        selectReservationToModify(editableMatches[0])
        if (shouldAppendUserMessage) appendConversation(searchedPhone, t('bot.foundOneModify', { summary: buildReservationSummary(editableMatches[0], language) }))
      } else {
        const message = t('bot.foundManyModify', { count: editableMatches.length })
        setModifyStatus({ type: 'success', message })
        if (shouldAppendUserMessage) appendConversation(searchedPhone, message)
      }
    } catch (error) {
      console.error(error)
      const message = `${t('bot.searchError')} ${error?.message || ''}`.trim()
      setModifyStatus({ type: 'error', message })
      if (shouldAppendUserMessage) appendConversation(searchedPhone, message)
    } finally {
      setIsSearchingModification(false)
    }
  }

  const showReservationStatus = (reservation, shouldAddAgentMessage = true) => {
    const answer = buildReservationStatusAnswer(reservation, t, language)
    setStatusStatus({ type: 'success', message: answer })
    if (shouldAddAgentMessage) addAgentMessage(answer)
  }

  const searchReservationsForStatus = async (phoneValue, shouldAppendUserMessage = false) => {
    const searchedPhone = phoneValue.trim()
    setIsSearchingStatus(true)
    setStatusStatus({ type: '', message: '' })
    setStatusReservations([])

    try {
      const { error, matches } = await findReservationsByPhone(searchedPhone)
      if (error) {
        setStatusStatus({ type: 'error', message: error })
        if (shouldAppendUserMessage) appendConversation(searchedPhone, error)
        return
      }

      if (!matches.length) {
        const message = t('bot.noBooking')
        setStatusStatus({ type: 'error', message })
        if (shouldAppendUserMessage) appendConversation(searchedPhone, message)
        return
      }

      setStatusReservations(matches)

      if (matches.length === 1) {
        const answer = buildReservationStatusAnswer(matches[0], t, language)
        setStatusStatus({ type: 'success', message: answer })
        if (shouldAppendUserMessage) appendConversation(searchedPhone, answer)
      } else {
        const message = t('bot.foundManyStatus', { count: matches.length })
        setStatusStatus({ type: 'success', message })
        if (shouldAppendUserMessage) appendConversation(searchedPhone, message)
      }
    } catch (error) {
      console.error(error)
      const message = `${t('bot.searchError')} ${error?.message || ''}`.trim()
      setStatusStatus({ type: 'error', message })
      if (shouldAppendUserMessage) appendConversation(searchedPhone, message)
    } finally {
      setIsSearchingStatus(false)
    }
  }

  const handleUserMessageSubmit = async (event) => {
    event.preventDefault()
    const trimmedInput = userInput.trim()
    if (!trimmedInput) return

    if (showModifySearchForm && !selectedReservation && sanitizePhoneDigits(trimmedInput).length >= 6) {
      setModifyPhone(trimmedInput)
      setUserInput('')
      await searchReservationsForModification(trimmedInput, true)
      return
    }

    if (showStatusSearchForm && sanitizePhoneDigits(trimmedInput).length >= 6) {
      setStatusPhone(trimmedInput)
      setUserInput('')
      await searchReservationsForStatus(trimmedInput, true)
      return
    }

    if (isStatusRequest(trimmedInput)) {
      setUserInput('')
      openStatusForm(trimmedInput)
      return
    }

    if (isModificationRequest(trimmedInput)) {
      setUserInput('')
      openModifyForm(trimmedInput)
      return
    }

    if (isBookingRequest(trimmedInput)) {
      setUserInput('')
      openBookingForm(trimmedInput)
      return
    }

    const answer = buildBasicAnswer(trimmedInput, language)
    if (answer) {
      appendConversation(trimmedInput, `${answer}\n\n${t('bot.anythingElse')}`)
      setActiveOptions([
        { label: t('bot.topics.booking'), action: 'open_booking_form' },
        { label: t('bot.topics.status'), action: 'open_status_reservation' },
        { label: t('bot.topics.modify'), action: 'open_modify_reservation' }
      ])
      setShowSuggestions(true)
      setUserInput('')
      return
    }

    appendConversation(trimmedInput, t('bot.help'))
    setActiveOptions(promotedTopics)
    setShowSuggestions(true)
    setUserInput('')
  }

  const handleOptionClick = (option) => {
    if (option.action === 'open_booking_form') return openBookingForm(option.label)
    if (option.action === 'open_modify_reservation') return openModifyForm(option.label)
    if (option.action === 'open_status_reservation') return openStatusForm(option.label)

    if (option.prompt) {
      const answer = buildBasicAnswer(option.prompt, language) || t('bot.help')
      appendConversation(option.label, `${answer}\n\n${t('bot.anythingElse')}`)
      setActiveOptions([
        { label: t('bot.topics.booking'), action: 'open_booking_form' },
        { label: t('bot.topics.status'), action: 'open_status_reservation' },
        { label: t('bot.topics.modify'), action: 'open_modify_reservation' }
      ])
      setShowSuggestions(true)
    }
  }

  const handleBookingChange = (event) => {
    const { name, value } = event.target
    setBookingForm((current) => {
      if (name === 'date') {
        const nextSlots = getReservationTimeSlots(value)
        return { ...current, date: value, time: nextSlots.includes(current.time) ? current.time : '' }
      }
      return { ...current, [name]: name === 'people' ? String(clampGuests(value)) : value }
    })
  }

  const handleModifyChange = (event) => {
    const { name, value } = event.target
    setModifyForm((current) => {
      if (name === 'date') {
        const nextSlots = getReservationTimeSlots(value)
        return { ...current, date: value, time: nextSlots.includes(current.time) ? current.time : '' }
      }
      return { ...current, [name]: name === 'people' ? String(clampGuests(value)) : value }
    })
  }

  const handleBookingSubmit = async (event) => {
    event.preventDefault()
    setIsSavingBooking(true)
    setBookingStatus({ type: '', message: '' })

    try {
      if (bookingForm.confirmation_channel === 'email' && !bookingForm.email.trim()) {
        setBookingStatus({ type: 'error', message: t('locale.emailRequired') })
        return
      }

      const validationError = await validateReservationFields({ date: bookingForm.date, time: bookingForm.time, people: bookingForm.people })
      if (validationError) {
        setBookingStatus({ type: 'error', message: validationError })
        return
      }

      const payload = {
        customer_name: bookingForm.name.trim(),
        customer_phone: bookingForm.phone.trim(),
        customer_email: bookingForm.email.trim() || null,
        phone_country_code: '+34',
        phone_country_iso: 'ES',
        confirmation_channel: bookingForm.confirmation_channel,
        reservation_date: bookingForm.date,
        reservation_time: bookingForm.time,
        guests: Number(bookingForm.people || 1),
        area_preference: 'indiferente',
        notes: buildNotesWithOrigin(bookingForm.notes, 'Solicitud creada desde Menuria Assistant.'),
        reservation_status: 'pending',
        service_status: 'not_arrived',
        status: 'pending',
        source: 'website'
      }

      const { error } = await supabase.from('reservations').insert([payload])
      if (error) throw error

      const summary = [
        t('bot.bookingSaved'), '',
        `${t('locale.name')}: ${bookingForm.name}`,
        `${t('locale.date')}: ${formatReservationDate(bookingForm.date, language)}`,
        `${t('locale.time')}: ${bookingForm.time}`,
        `${t('locale.people')}: ${bookingForm.people}`,
        `${t('locale.phone')}: ${bookingForm.phone}`,
        '',
        t('bot.bookingPending')
      ].join('\n')

      setMessages((current) => [...current, { role: 'user', text: t('bot.submitBooking') }, { role: 'agent', text: summary }])
      setBookingForm(initialBookingForm)
      setShowBookingForm(false)
    } catch (error) {
      console.error(error)
      setBookingStatus({ type: 'error', message: t('bot.saveError', { detail: error?.message || 'error' }) })
    } finally {
      setIsSavingBooking(false)
    }
  }

  const handleModificationSearch = async (event) => {
    event.preventDefault()
    await searchReservationsForModification(modifyPhone, false)
  }

  const handleStatusSearch = async (event) => {
    event.preventDefault()
    await searchReservationsForStatus(statusPhone, false)
  }

  const selectReservationToModify = (reservation) => {
    setSelectedReservation(reservation)
    setModifyForm({ date: reservation.reservation_date || '', time: reservation.reservation_time || '', people: String(reservation.guests || 2), notes: reservation.notes || '' })
    setModifyStatus({ type: 'success', message: t('bot.selectedModify', { summary: buildReservationSummary(reservation, language) }) })
  }

  const handleModificationSubmit = async (event) => {
    event.preventDefault()
    if (!selectedReservation) return

    setIsUpdatingReservation(true)
    setModifyStatus({ type: '', message: '' })

    try {
      const validationError = await validateReservationFields({ date: modifyForm.date, time: modifyForm.time, people: modifyForm.people }, selectedReservation.id)
      if (validationError) {
        setModifyStatus({ type: 'error', message: validationError })
        return
      }

      const { error } = await supabase
        .from('reservations')
        .update({
          reservation_date: modifyForm.date,
          reservation_time: modifyForm.time,
          guests: Number(modifyForm.people || 1),
          notes: buildNotesWithOrigin(modifyForm.notes, 'Reserva modificada por el cliente desde Menuria Assistant.'),
          reservation_status: 'pending',
          service_status: 'not_arrived',
          status: 'pending',
          confirmed_at: null,
          confirmation_channel_used: null
        })
        .eq('id', selectedReservation.id)

      if (error) throw error

      const summary = [
        t('bot.modificationSaved'), '',
        `${t('locale.date')}: ${formatReservationDate(modifyForm.date, language)}`,
        `${t('locale.time')}: ${modifyForm.time}`,
        `${t('locale.people')}: ${modifyForm.people}`,
        '',
        t('bot.modificationPending')
      ].join('\n')

      setMessages((current) => [...current, { role: 'user', text: t('bot.submitModification') }, { role: 'agent', text: summary }])
      setSelectedReservation(null)
      setMatchingReservations([])
      setModifyPhone('')
      setModifyForm(initialModifyForm)
      setShowModifySearchForm(false)
    } catch (error) {
      console.error(error)
      setModifyStatus({ type: 'error', message: t('bot.updateError', { detail: error?.message || 'error' }) })
    } finally {
      setIsUpdatingReservation(false)
    }
  }

  return (
    <div className="virtual-agent">
      {isOpen && (
        <div className="agent-window">
          <div className="agent-header">
            <div>
              <p>{t('bot.header')}</p>
              <h3>{t('bot.title')}</h3>
            </div>

            <div className="agent-header-actions">
              <button type="button" onClick={handleResetChat} aria-label={t('bot.reset')} title={t('bot.reset')}>↻</button>
              <button type="button" onClick={() => setIsOpen(false)} aria-label={t('bot.close')} title={t('bot.close')}>×</button>
            </div>
          </div>

          <div className="agent-messages">
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={message.role === 'agent' ? 'agent-message bot' : 'agent-message user'}>
                {message.text}
              </div>
            ))}
          </div>

          <form className="agent-input-form" onSubmit={handleUserMessageSubmit}>
            <input
              value={userInput}
              onFocus={() => { setShowSuggestions(false); setActiveOptions([]) }}
              onChange={(event) => { setUserInput(event.target.value); setShowSuggestions(false); setActiveOptions([]) }}
              placeholder={t('bot.placeholder')}
              aria-label={t('bot.placeholder')}
            />
            <button type="submit">{t('bot.send')}</button>
          </form>

          {showSuggestions && (
            activeOptions.length > 0 ? (
              <div className="agent-topic-options">
                {activeOptions.map((option) => (
                  <button key={`${option.label}-${option.action || option.prompt || 'topic'}`} type="button" onClick={() => handleOptionClick(option)}>
                    {option.label}
                  </button>
                ))}
              </div>
            ) : (
              messages.length === 1 && !userInput && (
                <div className="agent-promoted-topics">
                  {promotedTopics.map((topic) => (
                    <button key={`${topic.label}-${topic.action || topic.prompt}`} type="button" onClick={() => handleOptionClick(topic)}>
                      {topic.label}
                    </button>
                  ))}
                </div>
              )
            )
          )}

          {showBookingForm && (
            <form className="booking-form agent-reservation-form" onSubmit={handleBookingSubmit}>
              <input name="name" value={bookingForm.name} onChange={handleBookingChange} placeholder={t('bot.formName')} required />

              <div className="agent-form-row">
                <input name="date" type="date" min={getTodayDateValue()} value={bookingForm.date} onChange={handleBookingChange} required />
                <select name="time" value={bookingForm.time} onChange={handleBookingChange} disabled={!bookingForm.date || isClosedReservationDate(bookingForm.date)} required>
                  <option value="">{!bookingForm.date ? t('bot.formDate') : isClosedReservationDate(bookingForm.date) ? t('bot.closedShort') : t('bot.formTime')}</option>
                  {bookingTimeSlots.map((time) => <option key={time} value={time}>{time}</option>)}
                </select>
              </div>

              <div className="agent-form-row">
                <input name="people" type="number" min={MIN_GUESTS} max={MAX_GUESTS} value={bookingForm.people} onChange={handleBookingChange} placeholder={t('bot.people')} required />
                <input name="phone" value={bookingForm.phone} onChange={handleBookingChange} placeholder={t('bot.phone')} required />
              </div>

              <input name="email" type="email" value={bookingForm.email} onChange={handleBookingChange} placeholder={t('bot.email')} />

              <select name="confirmation_channel" value={bookingForm.confirmation_channel} onChange={handleBookingChange}>
                <option value="whatsapp">{t('bot.confirmationWhatsapp')}</option>
                <option value="email">{t('bot.confirmationEmail')}</option>
              </select>

              <textarea name="notes" value={bookingForm.notes} onChange={handleBookingChange} placeholder={t('bot.notes')} rows="2" />
              {bookingStatus.message && <p className={`agent-inline-status ${bookingStatus.type}`}>{bookingStatus.message}</p>}
              <button type="submit" disabled={isSavingBooking}>{isSavingBooking ? t('bot.saving') : t('bot.submitBooking')}</button>
            </form>
          )}

          {showModifySearchForm && (
            <div className="agent-modification-box">
              <form className="booking-form agent-reservation-form" onSubmit={handleModificationSearch}>
                <input value={modifyPhone} onChange={(event) => setModifyPhone(event.target.value)} placeholder={t('bot.searchPhone')} required />
                <button type="submit" disabled={isSearchingModification}>{isSearchingModification ? t('bot.searching') : t('bot.searchBooking')}</button>
              </form>
              {modifyStatus.message && <p className={`agent-inline-status ${modifyStatus.type}`}>{modifyStatus.message}</p>}
              {matchingReservations.length > 1 && !selectedReservation && (
                <div className="reservation-match-list">
                  {matchingReservations.map((reservation) => (
                    <button key={reservation.id} type="button" className="reservation-match-card" onClick={() => selectReservationToModify(reservation)}>
                      <strong>{buildReservationSummary(reservation, language)}</strong>
                      <span>{reservation.customer_name || 'Cliente'} · {reservation.customer_phone}</span>
                    </button>
                  ))}
                </div>
              )}
              {selectedReservation && (
                <form className="booking-form agent-reservation-form" onSubmit={handleModificationSubmit}>
                  <p className="agent-form-title">{t('bot.modifyTitle', { summary: buildReservationSummary(selectedReservation, language) })}</p>
                  <div className="agent-form-row">
                    <input name="date" type="date" min={getTodayDateValue()} value={modifyForm.date} onChange={handleModifyChange} required />
                    <select name="time" value={modifyForm.time} onChange={handleModifyChange} disabled={!modifyForm.date || isClosedReservationDate(modifyForm.date)} required>
                      <option value="">{!modifyForm.date ? t('bot.formDate') : isClosedReservationDate(modifyForm.date) ? t('bot.closedShort') : t('bot.formTime')}</option>
                      {modifyTimeSlots.map((time) => <option key={time} value={time}>{time}</option>)}
                    </select>
                  </div>
                  <input name="people" type="number" min={MIN_GUESTS} max={MAX_GUESTS} value={modifyForm.people} onChange={handleModifyChange} placeholder={t('bot.people')} required />
                  <textarea name="notes" value={modifyForm.notes} onChange={handleModifyChange} placeholder={t('bot.notes')} rows="2" />
                  <button type="submit" disabled={isUpdatingReservation}>{isUpdatingReservation ? t('bot.updating') : t('bot.submitModification')}</button>
                </form>
              )}
            </div>
          )}

          {showStatusSearchForm && (
            <div className="agent-modification-box agent-status-box">
              <form className="booking-form agent-reservation-form" onSubmit={handleStatusSearch}>
                <input value={statusPhone} onChange={(event) => setStatusPhone(event.target.value)} placeholder={t('bot.searchPhone')} required />
                <button type="submit" disabled={isSearchingStatus}>{isSearchingStatus ? t('bot.searching') : t('bot.topics.status')}</button>
              </form>
              {statusStatus.message && <p className={`agent-inline-status ${statusStatus.type}`}>{statusStatus.message}</p>}
              {statusReservations.length > 1 && (
                <div className="reservation-match-list">
                  {statusReservations.map((reservation) => (
                    <button key={reservation.id} type="button" className="reservation-match-card" onClick={() => showReservationStatus(reservation)}>
                      <strong>{buildReservationSummary(reservation, language)}</strong>
                      <span>{t('bot.statusLabels.' + getReservationStatus(reservation))}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <button className={isOpen ? 'agent-fab active' : 'agent-fab'} type="button" onClick={() => setIsOpen((value) => !value)} aria-label={t('bot.header')}>
        {isOpen ? '×' : '💬'}
      </button>
    </div>
  )
}
