import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import botMessages from '../data/bot/botMessages.json'
import restaurantKnowledge from '../data/bot/restaurantKnowledge.json'
import wineKnowledge from '../data/bot/wineknowledge.json'
import cocktailKnowledge from '../data/bot/cocktailKnowledge.json'
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

const RESERVATION_STATUS_LABELS = {
  pending: 'pendiente de confirmación',
  confirmed: 'confirmada',
  rejected: 'rechazada',
  cancelled: 'cancelada'
}

const SERVICE_STATUS_LABELS = {
  not_arrived: 'sin llegar todavía',
  seated: 'cliente sentado',
  completed: 'servicio completado',
  no_show: 'no-show'
}

function getInitialMessages() {
  const fallbackMessages = [{ role: 'agent', text: botMessages.greeting.message }]

  if (typeof window === 'undefined') return fallbackMessages

  try {
    const savedMessages = window.localStorage.getItem(CHAT_STORAGE_KEY)
    if (!savedMessages) return fallbackMessages

    const parsedMessages = JSON.parse(savedMessages)
    return Array.isArray(parsedMessages) && parsedMessages.length > 0
      ? parsedMessages
      : fallbackMessages
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

function formatReservationDate(dateValue) {
  const parsed = parseDateValue(dateValue)
  if (!parsed) return '-'

  return createLocalDate(parsed.year, parsed.month, parsed.day).toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })
}

function formatReservationDateShort(dateValue) {
  const parsed = parseDateValue(dateValue)
  if (!parsed) return '-'

  return createLocalDate(parsed.year, parsed.month, parsed.day).toLocaleDateString('es-ES', {
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
    normalized.includes('confirmada') ||
    normalized.includes('confirmado') ||
    normalized.includes('confirmacion') ||
    normalized.includes('saber mi reserva') ||
    normalized.includes('mi reserva esta') ||
    normalized.includes('check reserva')
  ) && (
    normalized.includes('reserva') ||
    normalized.includes('mesa') ||
    normalized.includes('booking')
  )
}

function isModificationRequest(userText) {
  const normalized = normalizeText(userText)
  return (
    normalized.includes('modificar') ||
    normalized.includes('cambiar') ||
    normalized.includes('cambio') ||
    normalized.includes('editar') ||
    normalized.includes('mover') ||
    normalized.includes('modifica')
  ) && (
    normalized.includes('reserva') ||
    normalized.includes('mesa') ||
    normalized.includes('booking')
  )
}

function isBookingRequest(userText) {
  const normalized = normalizeText(userText)
  return (
    normalized.includes('reservar') ||
    normalized.includes('reserva') ||
    normalized.includes('mesa') ||
    normalized.includes('book')
  ) && !isModificationRequest(userText) && !isStatusRequest(userText)
}

function hasWineIntent(userText) {
  const normalized = normalizeText(userText)
  return [
    'vino', 'vinos', 'copa', 'copas', 'tinto', 'blanco', 'rosado', 'espumoso',
    'barolo', 'brunello', 'valpolicella', 'lambrusco', 'gavi', 'prosecco', 'chianti',
    'maridaje', 'maridar'
  ].some((token) => normalized.includes(token))
}

function hasCocktailIntent(userText) {
  const normalized = normalizeText(userText)
  return [
    'cocktail', 'coctel', 'spritz', 'negroni', 'americano', 'aperol', 'limoncello', 'bellini', 'rossini'
  ].some((token) => normalized.includes(token))
}

function buildWineAnswer(userText) {
  if (!hasWineIntent(userText)) return null

  const normalizedUserText = normalizeText(userText)
  const wines = wineKnowledge.wineKnowledge || []

  const byGlass = normalizedUserText.includes('copa') || normalizedUserText.includes('copas')
  const wantsWhite = normalizedUserText.includes('blanco')
  const wantsRed = normalizedUserText.includes('tinto')
  const wantsRose = normalizedUserText.includes('rosado')
  const wantsSparkling = normalizedUserText.includes('espumoso') || normalizedUserText.includes('prosecco') || normalizedUserText.includes('burbuja')
  const wantsSweet = normalizedUserText.includes('postre') || normalizedUserText.includes('dulce')

  let candidates = wines

  if (byGlass) candidates = candidates.filter((wine) => wine.by_glass)
  if (wantsWhite) candidates = candidates.filter((wine) => wine.category === 'Bianco')
  if (wantsRed) candidates = candidates.filter((wine) => wine.category === 'Rosso')
  if (wantsRose) candidates = candidates.filter((wine) => wine.category === 'Rosato')
  if (wantsSparkling) candidates = candidates.filter((wine) => wine.category === 'Spumante')
  if (wantsSweet) candidates = candidates.filter((wine) => wine.category === 'Dolce')

  const selected = candidates.slice(0, 3)

  if (!selected.length) {
    return 'Puedo ayudarte con la carta de vinos. Dime si prefieres blanco, tinto, rosado, espumoso o vino por copa.'
  }

  return [
    'Te recomendaría estas opciones:',
    '',
    ...selected.map((wine) => {
      const glassText = wine.by_glass ? ' Disponible también por copa.' : ''
      return `• ${wine.name} (${wine.region}) — ${wine.sales_note || wine.category}.${glassText}`
    })
  ].join('\n')
}

function buildCocktailAnswer(userText) {
  if (!hasCocktailIntent(userText)) return null

  const normalized = normalizeText(userText)

  if (normalized.includes('negroni')) {
    return 'El Negroni es intenso, amargo y elegante: gin, bitter rojo y vermut. Perfecto como aperitivo italiano con carácter.'
  }

  if (normalized.includes('limoncello')) {
    return 'El Limoncello Spritz es fresco, cítrico y muy mediterráneo: prosecco, limoncello, soda y basilico.'
  }

  const branches = cocktailKnowledge.recommendationBranches || {}
  const recommended = branches.fresh_light?.botAnswer || branches.bitter_intense?.botAnswer

  return recommended || 'Tenemos cócteles italianos clásicos y aperitivos como Spritz, Negroni y opciones más frescas. Puedo recomendarte uno según si prefieres algo suave, fresco o intenso.'
}

function buildBasicAnswer(userText) {
  const normalized = normalizeText(userText)
  const restaurant = restaurantKnowledge.restaurant

  if (normalized.includes('horario') || normalized.includes('abierto') || normalized.includes('hora')) {
    return restaurant.openingHours?.humanReadable || 'Abrimos de martes a sábado, con servicio de mediodía y cena. Cerramos domingo y lunes.'
  }

  if (normalized.includes('direccion') || normalized.includes('donde') || normalized.includes('ubicacion')) {
    return `Estamos en ${restaurant.address?.fullAddress || 'Calle Méndez Núñez 20, Santa Cruz de Tenerife'}.`
  }

  if (normalized.includes('telefono') || normalized.includes('whatsapp') || normalized.includes('contacto')) {
    return `Puedes contactar por WhatsApp al ${restaurant.contact?.mobile?.value || '+34 613 381 023'}.`
  }

  const wineAnswer = buildWineAnswer(userText)
  if (wineAnswer) return wineAnswer

  const cocktailAnswer = buildCocktailAnswer(userText)
  if (cocktailAnswer) return cocktailAnswer

  return null
}

function buildReservationSummary(reservation) {
  return `${formatReservationDateShort(reservation.reservation_date)} · ${reservation.reservation_time || '-'} · ${reservation.guests || '-'} pax`
}

function buildReservationStatusAnswer(reservation) {
  const reservationStatus = getReservationStatus(reservation)
  const serviceStatus = getServiceStatus(reservation)
  const reservationLabel = RESERVATION_STATUS_LABELS[reservationStatus] || reservationStatus || 'pendiente'
  const serviceLabel = SERVICE_STATUS_LABELS[serviceStatus] || serviceStatus || 'sin llegar'

  const intro = `Tienes una reserva para ${formatReservationDate(reservation.reservation_date)} a las ${reservation.reservation_time || '-'} para ${reservation.guests || '-'} persona${Number(reservation.guests || 0) === 1 ? '' : 's'}.`

  if (reservationStatus === 'confirmed') {
    return `${intro}\n\nEstado: ${reservationLabel}.\nServicio: ${serviceLabel}.\n\nTe esperamos en Nonna Angela.`
  }

  if (reservationStatus === 'pending') {
    return `${intro}\n\nEstado: ${reservationLabel}.\n\nEl equipo todavía debe confirmarla por WhatsApp o email.`
  }

  if (reservationStatus === 'rejected' || reservationStatus === 'cancelled') {
    return `${intro}\n\nEstado: ${reservationLabel}.\n\nEsta reserva no está activa. Contacta directamente con el restaurante si necesitas ayuda.`
  }

  return `${intro}\n\nEstado de reserva: ${reservationLabel}.\nEstado del servicio: ${serviceLabel}.`
}

export default function VirtualAgent() {
  const [isOpen, setIsOpen] = useState(false)
  const [userInput, setUserInput] = useState('')
  const [activeOptions, setActiveOptions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(true)
  const [messages, setMessages] = useState(() => getInitialMessages())

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
    { label: 'Reservas', action: 'open_booking_form' },
    { label: 'Estado reserva', action: 'open_status_reservation' },
    { label: 'Modificar reserva', action: 'open_modify_reservation' },
    { label: 'Vinos', prompt: '¿Qué vinos tenéis por copa?' },
    { label: 'Cócteles', prompt: 'Recomiéndame un cóctel' },
    { label: 'Horarios', prompt: '¿Cuál es vuestro horario?' }
  ], [])

  const bookingTimeSlots = getReservationTimeSlots(bookingForm.date)
  const modifyTimeSlots = getReservationTimeSlots(modifyForm.date)

  useEffect(() => {
    try {
      window.localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages))
    } catch {
      // Local storage may be unavailable in some browsers.
    }
  }, [messages])

  const appendConversation = (userText, agentText) => {
    setMessages((current) => [
      ...current,
      { role: 'user', text: userText },
      { role: 'agent', text: agentText }
    ])
  }

  const addAgentMessage = (agentText) => {
    setMessages((current) => [
      ...current,
      { role: 'agent', text: agentText }
    ])
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

  const openBookingForm = (userText = 'Quiero reservar una mesa') => {
    resetForms()
    setShowBookingForm(true)
    setActiveOptions([])
    setShowSuggestions(false)
    appendConversation(
      userText,
      'Perfecto. Rellena estos datos y guardaré la solicitud para que el equipo de Nonna Angela la confirme por WhatsApp o email.'
    )
  }

  const openModifyForm = (userText = 'Quiero modificar una reserva') => {
    resetForms()
    setShowModifySearchForm(true)
    setActiveOptions([])
    setShowSuggestions(false)
    appendConversation(
      userText,
      'Claro. Escribe aquí el número de teléfono usado en la reserva. Puedo reconocerlo también aunque lo escribas sin prefijo.'
    )
  }

  const openStatusForm = (userText = 'Quiero saber el estado de mi reserva') => {
    resetForms()
    setShowStatusSearchForm(true)
    setActiveOptions([])
    setShowSuggestions(false)
    appendConversation(
      userText,
      'Claro. Escribe el número de teléfono usado en la reserva y buscaré el estado de tus reservas futuras.'
    )
  }

  const handleResetChat = () => {
    const initialMessages = [{ role: 'agent', text: botMessages.greeting.message }]
    setMessages(initialMessages)
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
    if (isClosedReservationDate(date)) {
      return 'El restaurante permanece cerrado los domingos y lunes. Selecciona otra fecha.'
    }

    if (!getReservationTimeSlots(date).includes(time)) {
      return 'Selecciona una hora disponible para la fecha elegida.'
    }

    const bookedGuests = await getBookedGuestsForService(date, time, excludedReservationId)

    if (bookedGuests + Number(people || 0) > SERVICE_CAPACITY) {
      return 'Las reservas online para ese servicio están casi completas. Contacta directamente con el restaurante para comprobar disponibilidad.'
    }

    return ''
  }

  const findReservationsByPhone = async (phoneValue) => {
    const searchedPhone = phoneValue.trim()

    if (sanitizePhoneDigits(searchedPhone).length < 6) {
      return { error: 'Introduce al menos 6 dígitos del número usado en la reserva.', matches: [] }
    }

    const { data, error } = await supabase
      .from('reservations')
      .select('id, customer_name, customer_phone, customer_email, reservation_date, reservation_time, guests, area_preference, notes, status, reservation_status, service_status, confirmation_channel, created_at')
      .gte('reservation_date', getTodayDateValue())
      .order('reservation_date', { ascending: true })
      .order('reservation_time', { ascending: true })

    if (error) throw error

    const matches = (data || [])
      .filter((reservation) => phonesMatch(reservation.customer_phone, searchedPhone))
      .slice(0, 6)

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
        const message = 'No he encontrado reservas futuras activas con ese número. Revisa el teléfono o contacta directamente con el restaurante.'
        setModifyStatus({ type: 'error', message })
        if (shouldAppendUserMessage) appendConversation(searchedPhone, message)
        return
      }

      setMatchingReservations(editableMatches)

      if (editableMatches.length === 1) {
        selectReservationToModify(editableMatches[0])
        if (shouldAppendUserMessage) {
          appendConversation(
            searchedPhone,
            `He encontrado esta reserva: ${buildReservationSummary(editableMatches[0])}. Puedes cambiar los datos en el formulario.`
          )
        }
      } else {
        const message = `He encontrado ${editableMatches.length} reservas activas con ese número. Elige cuál quieres modificar.`
        setModifyStatus({ type: 'success', message })
        if (shouldAppendUserMessage) appendConversation(searchedPhone, message)
      }
    } catch (error) {
      console.error(error)
      const message = `No hemos podido buscar la reserva. Detalle: ${error?.message || 'error desconocido'}`
      setModifyStatus({ type: 'error', message })
      if (shouldAppendUserMessage) appendConversation(searchedPhone, message)
    } finally {
      setIsSearchingModification(false)
    }
  }

  const showReservationStatus = (reservation, shouldAddAgentMessage = true) => {
    const answer = buildReservationStatusAnswer(reservation)
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
        const message = 'No he encontrado reservas futuras con ese número. Revisa el teléfono o contacta directamente con el restaurante.'
        setStatusStatus({ type: 'error', message })
        if (shouldAppendUserMessage) appendConversation(searchedPhone, message)
        return
      }

      setStatusReservations(matches)

      if (matches.length === 1) {
        const answer = buildReservationStatusAnswer(matches[0])
        setStatusStatus({ type: 'success', message: answer })
        if (shouldAppendUserMessage) appendConversation(searchedPhone, answer)
      } else {
        const message = `He encontrado ${matches.length} reservas futuras con ese número. Elige cuál quieres consultar.`
        setStatusStatus({ type: 'success', message })
        if (shouldAppendUserMessage) appendConversation(searchedPhone, message)
      }
    } catch (error) {
      console.error(error)
      const message = `No hemos podido consultar el estado. Detalle: ${error?.message || 'error desconocido'}`
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

    const answer = buildBasicAnswer(trimmedInput)

    if (answer) {
      appendConversation(trimmedInput, `${answer}\n\n¿Quieres que te ayude con algo más?`)
      setActiveOptions([
        { label: 'Reservar mesa', action: 'open_booking_form' },
        { label: 'Estado reserva', action: 'open_status_reservation' },
        { label: 'Modificar reserva', action: 'open_modify_reservation' }
      ])
      setShowSuggestions(true)
      setUserInput('')
      return
    }

    appendConversation(
      trimmedInput,
      'Puedo ayudarte con reservas, estado de una reserva, modificar una reserva existente, horarios, ubicación, vinos y cócteles. ¿Qué necesitas?'
    )
    setActiveOptions(promotedTopics)
    setShowSuggestions(true)
    setUserInput('')
  }

  const handleOptionClick = (option) => {
    if (option.action === 'open_booking_form') {
      openBookingForm(option.label)
      return
    }

    if (option.action === 'open_modify_reservation') {
      openModifyForm(option.label)
      return
    }

    if (option.action === 'open_status_reservation') {
      openStatusForm(option.label)
      return
    }

    if (option.prompt) {
      const answer = buildBasicAnswer(option.prompt) || 'Puedo ayudarte con eso. Escribe tu pregunta y te respondo.'
      appendConversation(option.label, `${answer}\n\n¿Quieres que te ayude con algo más?`)
      setActiveOptions([
        { label: 'Reservar mesa', action: 'open_booking_form' },
        { label: 'Estado reserva', action: 'open_status_reservation' },
        { label: 'Modificar reserva', action: 'open_modify_reservation' }
      ])
      setShowSuggestions(true)
    }
  }

  const handleBookingChange = (event) => {
    const { name, value } = event.target

    setBookingForm((current) => {
      if (name === 'date') {
        const nextSlots = getReservationTimeSlots(value)
        return {
          ...current,
          date: value,
          time: nextSlots.includes(current.time) ? current.time : ''
        }
      }

      return {
        ...current,
        [name]: name === 'people' ? String(clampGuests(value)) : value
      }
    })
  }

  const handleModifyChange = (event) => {
    const { name, value } = event.target

    setModifyForm((current) => {
      if (name === 'date') {
        const nextSlots = getReservationTimeSlots(value)
        return {
          ...current,
          date: value,
          time: nextSlots.includes(current.time) ? current.time : ''
        }
      }

      return {
        ...current,
        [name]: name === 'people' ? String(clampGuests(value)) : value
      }
    })
  }

  const handleBookingSubmit = async (event) => {
    event.preventDefault()
    setIsSavingBooking(true)
    setBookingStatus({ type: '', message: '' })

    try {
      if (bookingForm.confirmation_channel === 'email' && !bookingForm.email.trim()) {
        setBookingStatus({ type: 'error', message: 'Introduce tu email para recibir la confirmación por correo.' })
        return
      }

      const validationError = await validateReservationFields({
        date: bookingForm.date,
        time: bookingForm.time,
        people: bookingForm.people
      })

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

      const { error } = await supabase
        .from('reservations')
        .insert([payload])

      if (error) throw error

      const summary = [
        'Solicitud de reserva guardada correctamente.',
        '',
        `Nombre: ${bookingForm.name}`,
        `Fecha: ${formatReservationDate(bookingForm.date)}`,
        `Hora: ${bookingForm.time}`,
        `Personas: ${bookingForm.people}`,
        `Teléfono: ${bookingForm.phone}`,
        `Confirmación preferida: ${bookingForm.confirmation_channel === 'email' ? 'Email' : 'WhatsApp'}`,
        '',
        'La reserva queda pendiente hasta que el equipo de Nonna Angela la confirme.'
      ].join('\n')

      setMessages((current) => [
        ...current,
        { role: 'user', text: 'He enviado una solicitud de reserva.' },
        { role: 'agent', text: summary }
      ])
      setBookingForm(initialBookingForm)
      setShowBookingForm(false)
    } catch (error) {
      console.error(error)
      setBookingStatus({
        type: 'error',
        message: `No hemos podido guardar la solicitud. Detalle: ${error?.message || 'error desconocido'}`
      })
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
    setModifyForm({
      date: reservation.reservation_date || '',
      time: reservation.reservation_time || '',
      people: String(reservation.guests || 2),
      notes: reservation.notes || ''
    })
    setModifyStatus({
      type: 'success',
      message: `Reserva seleccionada: ${buildReservationSummary(reservation)}. Cambia los datos y envía la modificación.`
    })
  }

  const handleModificationSubmit = async (event) => {
    event.preventDefault()
    if (!selectedReservation) return

    setIsUpdatingReservation(true)
    setModifyStatus({ type: '', message: '' })

    try {
      const validationError = await validateReservationFields(
        {
          date: modifyForm.date,
          time: modifyForm.time,
          people: modifyForm.people
        },
        selectedReservation.id
      )

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
        'Modificación enviada correctamente.',
        '',
        `Nueva fecha: ${formatReservationDate(modifyForm.date)}`,
        `Nueva hora: ${modifyForm.time}`,
        `Personas: ${modifyForm.people}`,
        '',
        'La reserva vuelve a quedar pendiente hasta que el equipo confirme los cambios.'
      ].join('\n')

      setMessages((current) => [
        ...current,
        { role: 'user', text: 'He enviado una modificación de mi reserva.' },
        { role: 'agent', text: summary }
      ])
      setSelectedReservation(null)
      setMatchingReservations([])
      setModifyPhone('')
      setModifyForm(initialModifyForm)
      setShowModifySearchForm(false)
    } catch (error) {
      console.error(error)
      setModifyStatus({
        type: 'error',
        message: `No hemos podido actualizar la reserva. Detalle: ${error?.message || 'error desconocido'}`
      })
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
              <p>Menuria Assistant</p>
              <h3>Nonna Angela</h3>
            </div>

            <div className="agent-header-actions">
              <button type="button" onClick={handleResetChat} aria-label="Reiniciar chat" title="Reiniciar chat">
                ↻
              </button>
              <button type="button" onClick={() => setIsOpen(false)} aria-label="Cerrar chat" title="Cerrar chat">
                ×
              </button>
            </div>
          </div>

          <div className="agent-messages">
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={message.role === 'agent' ? 'agent-message bot' : 'agent-message user'}
              >
                {message.text}
              </div>
            ))}
          </div>

          <form className="agent-input-form" onSubmit={handleUserMessageSubmit}>
            <input
              value={userInput}
              onFocus={() => {
                setShowSuggestions(false)
                setActiveOptions([])
              }}
              onChange={(event) => {
                setUserInput(event.target.value)
                setShowSuggestions(false)
                setActiveOptions([])
              }}
              placeholder="Escribe tu pregunta..."
              aria-label="Escribe tu pregunta"
            />
            <button type="submit">Enviar</button>
          </form>

          {showSuggestions && (
            activeOptions.length > 0 ? (
              <div className="agent-topic-options">
                {activeOptions.map((option) => (
                  <button
                    key={`${option.label}-${option.action || option.prompt || 'topic'}`}
                    type="button"
                    onClick={() => handleOptionClick(option)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ) : (
              messages.length === 1 && !userInput && (
                <div className="agent-promoted-topics">
                  {promotedTopics.map((topic) => (
                    <button
                      key={`${topic.label}-${topic.action || topic.prompt}`}
                      type="button"
                      onClick={() => handleOptionClick(topic)}
                    >
                      {topic.label}
                    </button>
                  ))}
                </div>
              )
            )
          )}

          {showBookingForm && (
            <form className="booking-form agent-reservation-form" onSubmit={handleBookingSubmit}>
              <input name="name" value={bookingForm.name} onChange={handleBookingChange} placeholder="Nombre" required />

              <div className="agent-form-row">
                <input name="date" type="date" min={getTodayDateValue()} value={bookingForm.date} onChange={handleBookingChange} required />
                <select name="time" value={bookingForm.time} onChange={handleBookingChange} disabled={!bookingForm.date || isClosedReservationDate(bookingForm.date)} required>
                  <option value="">
                    {!bookingForm.date
                      ? 'Fecha primero'
                      : isClosedReservationDate(bookingForm.date)
                        ? 'Cerrado dom/lun'
                        : 'Hora'}
                  </option>
                  {bookingTimeSlots.map((time) => <option key={time} value={time}>{time}</option>)}
                </select>
              </div>

              <div className="agent-form-row">
                <input name="people" type="number" min={MIN_GUESTS} max={MAX_GUESTS} value={bookingForm.people} onChange={handleBookingChange} placeholder="Personas" required />
                <input name="phone" value={bookingForm.phone} onChange={handleBookingChange} placeholder="Teléfono con o sin prefijo" required />
              </div>

              <input name="email" type="email" value={bookingForm.email} onChange={handleBookingChange} placeholder="Email opcional" />

              <select name="confirmation_channel" value={bookingForm.confirmation_channel} onChange={handleBookingChange}>
                <option value="whatsapp">Confirmación por WhatsApp</option>
                <option value="email">Confirmación por email</option>
              </select>

              <textarea name="notes" value={bookingForm.notes} onChange={handleBookingChange} placeholder="Notas opcionales" rows="2" />

              {bookingStatus.message && <p className={`agent-inline-status ${bookingStatus.type}`}>{bookingStatus.message}</p>}

              <button type="submit" disabled={isSavingBooking}>
                {isSavingBooking ? 'Guardando...' : 'Enviar solicitud'}
              </button>
            </form>
          )}

          {showModifySearchForm && (
            <div className="agent-modification-box">
              <form className="booking-form agent-reservation-form" onSubmit={handleModificationSearch}>
                <input
                  value={modifyPhone}
                  onChange={(event) => setModifyPhone(event.target.value)}
                  placeholder="Teléfono usado en la reserva"
                  required
                />
                <button type="submit" disabled={isSearchingModification}>
                  {isSearchingModification ? 'Buscando...' : 'Buscar reserva'}
                </button>
              </form>

              {modifyStatus.message && <p className={`agent-inline-status ${modifyStatus.type}`}>{modifyStatus.message}</p>}

              {matchingReservations.length > 1 && !selectedReservation && (
                <div className="reservation-match-list">
                  {matchingReservations.map((reservation) => (
                    <button
                      key={reservation.id}
                      type="button"
                      className="reservation-match-card"
                      onClick={() => selectReservationToModify(reservation)}
                    >
                      <strong>{buildReservationSummary(reservation)}</strong>
                      <span>{reservation.customer_name || 'Cliente'} · {reservation.customer_phone}</span>
                    </button>
                  ))}
                </div>
              )}

              {selectedReservation && (
                <form className="booking-form agent-reservation-form" onSubmit={handleModificationSubmit}>
                  <p className="agent-form-title">Modificar {buildReservationSummary(selectedReservation)}</p>

                  <div className="agent-form-row">
                    <input name="date" type="date" min={getTodayDateValue()} value={modifyForm.date} onChange={handleModifyChange} required />
                    <select name="time" value={modifyForm.time} onChange={handleModifyChange} disabled={!modifyForm.date || isClosedReservationDate(modifyForm.date)} required>
                      <option value="">
                        {!modifyForm.date
                          ? 'Fecha primero'
                          : isClosedReservationDate(modifyForm.date)
                            ? 'Cerrado dom/lun'
                            : 'Hora'}
                      </option>
                      {modifyTimeSlots.map((time) => <option key={time} value={time}>{time}</option>)}
                    </select>
                  </div>

                  <input name="people" type="number" min={MIN_GUESTS} max={MAX_GUESTS} value={modifyForm.people} onChange={handleModifyChange} placeholder="Personas" required />
                  <textarea name="notes" value={modifyForm.notes} onChange={handleModifyChange} placeholder="Notas opcionales" rows="2" />

                  <button type="submit" disabled={isUpdatingReservation}>
                    {isUpdatingReservation ? 'Actualizando...' : 'Enviar modificación'}
                  </button>
                </form>
              )}
            </div>
          )}

          {showStatusSearchForm && (
            <div className="agent-modification-box agent-status-box">
              <form className="booking-form agent-reservation-form" onSubmit={handleStatusSearch}>
                <input
                  value={statusPhone}
                  onChange={(event) => setStatusPhone(event.target.value)}
                  placeholder="Teléfono usado en la reserva"
                  required
                />
                <button type="submit" disabled={isSearchingStatus}>
                  {isSearchingStatus ? 'Buscando...' : 'Consultar estado'}
                </button>
              </form>

              {statusStatus.message && <p className={`agent-inline-status ${statusStatus.type}`}>{statusStatus.message}</p>}

              {statusReservations.length > 1 && (
                <div className="reservation-match-list">
                  {statusReservations.map((reservation) => (
                    <button
                      key={reservation.id}
                      type="button"
                      className="reservation-match-card"
                      onClick={() => showReservationStatus(reservation)}
                    >
                      <strong>{buildReservationSummary(reservation)}</strong>
                      <span>Estado: {RESERVATION_STATUS_LABELS[getReservationStatus(reservation)] || getReservationStatus(reservation)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <button
        className={isOpen ? 'agent-fab active' : 'agent-fab'}
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        aria-label="Abrir asistente virtual"
      >
        {isOpen ? '×' : '💬'}
      </button>
    </div>
  )
}
