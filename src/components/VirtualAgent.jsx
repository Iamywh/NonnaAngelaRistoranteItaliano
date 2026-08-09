import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import botMessages from '../data/bot/botMessages.json'
import nluIntents from '../data/bot/nluIntents.json'
import topicsData from '../data/bot/topics.json'
import flowsData from '../data/bot/flows.json'
import restaurantKnowledge from '../data/bot/restaurantKnowledge.json'
import cocktailKnowledge from '../data/bot/cocktailKnowledge.json'
import wineKnowledge from '../data/bot/wineknowledge.json'
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

function getInitialMessages() {
  const fallbackMessages = [
    {
      role: 'agent',
      text: botMessages.greeting.message
    }
  ]

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

function detectIntents(userText) {
  const normalizedUserText = normalizeText(userText)

  const matches = nluIntents.intents
    .map((intent) => {
      const keywordScore = intent.keywords.reduce((score, keyword) => {
        const normalizedKeyword = normalizeText(keyword)
        return normalizedUserText.includes(normalizedKeyword) ? score + 2 : score
      }, 0)

      const phraseScore = intent.trainingPhrases.reduce((score, phrase) => {
        const normalizedPhrase = normalizeText(phrase)
        return normalizedUserText.includes(normalizedPhrase) ? score + 4 : score
      }, 0)

      const totalScore = keywordScore + phraseScore + intent.priority / 100

      return {
        ...intent,
        score: totalScore
      }
    })
    .filter((intent) => intent.score >= 2)
    .sort((a, b) => b.score - a.score)

  return matches.slice(0, 3)
}

function getTopicById(topicId) {
  return topicsData.topics.find((topic) => topic.id === topicId)
}

function getFlowById(flowId) {
  return flowsData.flows.find((flow) => flow.id === flowId)
}

function getStepById(flow, stepId) {
  return flow?.steps.find((step) => step.id === stepId)
}

function getFirstStep(flow) {
  return flow?.steps?.[0]
}

function buildCocktailBranchAnswer(stepId) {
  const branchMap = {
    cocktail_fresh: 'fresh_light',
    cocktail_bitter: 'bitter_intense',
    cocktail_soft: 'soft_fruity'
  }

  const branchId = branchMap[stepId]
  const branch = cocktailKnowledge.recommendationBranches?.[branchId]

  return branch?.botAnswer || null
}

function buildCocktailCuriousAnswer(userText) {
  const normalizedUserText = normalizeText(userText)

  if (
    normalizedUserText.includes('vino') ||
    normalizedUserText.includes('vinos') ||
    normalizedUserText.includes('tinto') ||
    normalizedUserText.includes('blanco') ||
    normalizedUserText.includes('rosado')
  ) {
    return null
  }

  const curiousRules = [
    { tokens: ['americano', 'negroni'], questionIncludes: 'Americano y un Negroni' },
    { tokens: ['bellini', 'rossini'], questionIncludes: 'Bellini y Rossini' },
    { tokens: ['aperol', 'sulfit'], questionIncludes: 'Aperol Spritz tiene sulfitos' },
    { tokens: ['hugo', 'italiano'], questionIncludes: 'Hugo Spritz es un cóctel italiano' },
    { tokens: ['mas', 'fuerte'], questionIncludes: 'cóctel más fuerte' },
    { tokens: ['mas', 'suave'], questionIncludes: 'más suave' }
  ]

  const matchedRule = curiousRules.find((rule) =>
    rule.tokens.every((token) => normalizedUserText.includes(token))
  )

  if (!matchedRule) return null

  const matchedQuestion = cocktailKnowledge.curiousQuestions.find((item) =>
    normalizeText(item.question).includes(normalizeText(matchedRule.questionIncludes))
  )

  return matchedQuestion?.answer || null
}

function buildWineAnswer(userText) {
  const normalizedUserText = normalizeText(userText)
  const wines = wineKnowledge.wineKnowledge || []

  const byGlass = normalizedUserText.includes('copa') || normalizedUserText.includes('calice')
  const wantsWhite = normalizedUserText.includes('blanco')
  const wantsRed = normalizedUserText.includes('tinto')
  const wantsRose = normalizedUserText.includes('rosado')
  const wantsSparkling = normalizedUserText.includes('espumoso') || normalizedUserText.includes('prosecco') || normalizedUserText.includes('burbuja')
  const wantsSweet = normalizedUserText.includes('postre') || normalizedUserText.includes('dulce')
  const wantsSoft = normalizedUserText.includes('suave') || normalizedUserText.includes('ligero')
  const wantsBody = normalizedUserText.includes('cuerpo') || normalizedUserText.includes('intenso') || normalizedUserText.includes('fuerte')
  const wantsFresh = normalizedUserText.includes('fresco') || normalizedUserText.includes('fresquito')

  let candidates = wines

  if (byGlass) candidates = candidates.filter((wine) => wine.by_glass)
  if (wantsWhite) candidates = candidates.filter((wine) => wine.category === 'Bianco')
  if (wantsRed) candidates = candidates.filter((wine) => wine.category === 'Rosso')
  if (wantsRose) candidates = candidates.filter((wine) => wine.category === 'Rosato')
  if (wantsSparkling) candidates = candidates.filter((wine) => wine.category === 'Spumante')
  if (wantsSweet) candidates = candidates.filter((wine) => wine.category === 'Dolce')

  if (wantsSoft) {
    candidates = candidates.filter((wine) =>
      normalizeText(`${wine.body} ${wine.tannins} ${(wine.style || []).join(' ')}`).includes('suave') ||
      normalizeText(`${wine.body} ${(wine.style || []).join(' ')}`).includes('ligero')
    )
  }

  if (wantsBody || wantsFresh) {
    candidates = candidates.filter((wine) => {
      const text = normalizeText(`${wine.body} ${wine.acidity} ${(wine.style || []).join(' ')}`)
      if (wantsBody) return text.includes('alto') || text.includes('intenso') || text.includes('estructurado')
      if (wantsFresh) return text.includes('fresco') || text.includes('alta')
      return true
    })
  }

  const pairingKeywords = ['ragu', 'carbonara', 'carne', 'pasta', 'postre', 'queso', 'berenjena', 'porchetta', 'arrosticini']
  const matchedPairing = pairingKeywords.find((keyword) => normalizedUserText.includes(keyword))

  if (matchedPairing) {
    candidates = wines.filter((wine) =>
      (wine.pairings || []).some((pairing) => normalizeText(pairing).includes(matchedPairing))
    )
  }

  const selected = candidates.slice(0, 3)

  if (!selected.length) return null

  return [
    'Te recomendaría estas opciones:',
    '',
    ...selected.map((wine) => {
      const glassText = wine.by_glass ? ' Disponible también por copa.' : ''
      return `• ${wine.name} (${wine.region}) — ${wine.sales_note}${glassText}`
    }),
    '',
    'Si quieres, también puedo explicarte la diferencia técnica entre dos vinos.'
  ].join('\n')
}

function buildWineComparisonAnswer(userText) {
  const normalizedUserText = normalizeText(userText)

  const isComparison =
    normalizedUserText.includes('diferencia') ||
    normalizedUserText.includes('comparar') ||
    normalizedUserText.includes('compara') ||
    normalizedUserText.includes('mejor entre')

  if (!isComparison) return null

  const wines = wineKnowledge.wineKnowledge || []

  const matchedWines = wines.filter((wine) => {
    const searchableText = normalizeText([
      wine.name,
      wine.producer,
      wine.region,
      ...(wine.grapes || []),
      ...(wine.style || [])
    ].filter(Boolean).join(' '))

    return searchableText
      .split(/\s+/)
      .some((token) => token.length > 4 && normalizedUserText.includes(token))
  }).slice(0, 2)

  if (matchedWines.length < 2) {
    return 'Puedo comparar dos vinos de la carta. Por ejemplo: Barolo vs Brunello, Pinot Grigio vs Chardonnay, Valpolicella vs Ripasso, Nero d’Avola vs Primitivo.'
  }

  const [first, second] = matchedWines

  return [
    `La diferencia principal entre ${first.name} y ${second.name} es esta:`,
    '',
    `• ${first.name}: ${first.region}, uva ${first.grapes.join(', ')}, cuerpo ${first.body}, acidez ${first.acidity}, taninos ${first.tannins}. Aromas: ${first.aromas.join(', ')}.`,
    '',
    `• ${second.name}: ${second.region}, uva ${second.grapes.join(', ')}, cuerpo ${second.body}, acidez ${second.acidity}, taninos ${second.tannins}. Aromas: ${second.aromas.join(', ')}.`,
    '',
    `En simple: ${first.sales_note} ${second.sales_note}`
  ].join('\n')
}

function buildWineByGlassAnswer(userText) {
  const normalizedUserText = normalizeText(userText)

  const asksByGlass =
    normalizedUserText.includes('por copa') ||
    normalizedUserText.includes('copa') ||
    normalizedUserText.includes('copas') ||
    normalizedUserText.includes('vino abierto')

  if (!asksByGlass) return null

  const wines = (wineKnowledge.wineKnowledge || []).filter((wine) => wine.by_glass)

  if (!wines.length) {
    return 'Ahora mismo no tengo vinos marcados como disponibles por copa. Puedes consultar al equipo para confirmar las opciones abiertas del día.'
  }

  return [
    'Tenemos estos vinos disponibles por copa:',
    '',
    ...wines.map((wine) => `• ${wine.name} (${wine.region}) — ${wine.category}. ${wine.sales_note || ''}`),
    '',
    'Si me dices si prefieres blanco, tinto, rosado o algo más suave, te recomiendo uno.'
  ].join('\n')
}

function buildWineTechnicalAnswer(userText) {
  const normalizedUserText = normalizeText(userText)

  if (normalizedUserText.includes('tanino') || normalizedUserText.includes('taninos') || normalizedUserText.includes('tannin')) {
    return [
      'Los taninos son una sensación de sequedad y estructura que notas sobre todo en las encías y en la lengua.',
      '',
      'En simple: si un vino “agarra” un poco la boca, tiene tanino.',
      '',
      'Los tintos como Barolo, Brunello, Ripasso o Cabernet suelen tener más tanino. Vinos más suaves como Valpolicella o algunos rosados suelen tener menos.',
      '',
      'Los taninos ayudan a que el vino combine bien con carne, ragù, quesos curados y platos más intensos.'
    ].join('\n')
  }

  if (normalizedUserText.includes('acidez') || normalizedUserText.includes('acido')) {
    return [
      'La acidez es la frescura del vino.',
      '',
      'Un vino con buena acidez limpia la boca, da sensación de vivacidad y combina muy bien con tomate, grasa, fritos, quesos y platos salinos.',
      '',
      'Ejemplo fácil: Pinot Grigio, Ribolla Gialla, Gavi o Greco suelen sentirse más frescos que un tinto cálido y redondo.'
    ].join('\n')
  }

  if (normalizedUserText.includes('cuerpo')) {
    return [
      'El cuerpo es la sensación de peso del vino en boca.',
      '',
      'Un vino ligero se siente fácil y fresco. Un vino con cuerpo se siente más amplio, intenso y persistente.',
      '',
      'Ejemplo: un Pinot Grigio suele ser ligero; un Primitivo, Brunello o Barolo tienen más cuerpo.'
    ].join('\n')
  }

  return null
}

function buildDynamicTopicAnswer(topicId) {
  const restaurant = restaurantKnowledge.restaurant

  if (topicId === 'opening_hours') {
    return restaurant.openingHours.humanReadable
  }

  if (topicId === 'location_contact') {
    return [
      `Estamos en ${restaurant.address.fullAddress}.`,
      `Puedes contactar por WhatsApp al ${restaurant.contact.mobile.value}.`,
      `Instagram: ${restaurant.contact.instagram.handle}`,
      `Facebook: ${restaurant.contact.facebook.name}`
    ].join('\n')
  }

  if (topicId === 'restaurant_concept') {
    return restaurant.concept
  }

  if (topicId === 'booking_request') {
    return [
      'Puedo ayudarte a preparar una solicitud de reserva online.',
      'La reserva será válida únicamente después de recibir confirmación del equipo por WhatsApp o email.',
      'Rellena los datos y guardaré la solicitud para que el equipo la gestione.'
    ].join('\n')
  }

  return null
}

function buildSatisfactionResponse(message) {
  return {
    text: `${message}\n\n${botMessages.satisfactionCheck.message}`,
    options: [
      { label: botMessages.satisfactionCheck.yesLabel, action: 'satisfaction_yes' },
      { label: botMessages.satisfactionCheck.noLabel, action: 'satisfaction_no' }
    ]
  }
}

function buildTopicStartResponse(topicId) {
  const topic = getTopicById(topicId)
  const dynamicAnswer = buildDynamicTopicAnswer(topicId)

  if (dynamicAnswer) {
    return topicId === 'booking_request'
      ? { text: dynamicAnswer, options: [] }
      : buildSatisfactionResponse(dynamicAnswer)
  }

  if (!topic) {
    return { text: botMessages.fallback.unknown, options: [] }
  }

  const flow = getFlowById(topic.flowId)
  const firstStep = getFirstStep(flow)

  if (!flow || !firstStep) {
    return { text: topic.entryMessage || botMessages.fallback.unknown, options: [] }
  }

  if (firstStep.type === 'choice') {
    return {
      text: `${topic.entryMessage}\n\n${firstStep.message}`,
      options: firstStep.options.map((option) => ({
        label: option.label,
        topicId,
        stepId: option.nextStep
      }))
    }
  }

  return buildSatisfactionResponse(firstStep.message)
}

function buildFlowStepResponse(topicId, stepId) {
  if (topicId === 'cocktail_recommendation') {
    const cocktailAnswer = buildCocktailBranchAnswer(stepId)

    if (cocktailAnswer) return buildSatisfactionResponse(cocktailAnswer)
  }

  const topic = getTopicById(topicId)
  const flow = getFlowById(topic?.flowId)
  const step = getStepById(flow, stepId)

  if (!step) return { text: botMessages.fallback.unknown, options: [] }

  if (step.type === 'choice') {
    return {
      text: step.message,
      options: step.options.map((option) => ({
        label: option.label,
        topicId,
        stepId: option.nextStep
      }))
    }
  }

  return buildSatisfactionResponse(step.message)
}

function buildIntentResponse(matchedIntents) {
  if (!matchedIntents.length) return botMessages.fallback.noIntentMatched

  const suggestedTopicIds = [
    ...new Set(matchedIntents.flatMap((intent) => intent.suggestedTopics || []))
  ].slice(0, 4)

  const suggestedTopics = suggestedTopicIds
    .map((topicId) => getTopicById(topicId))
    .filter(Boolean)

  if (!suggestedTopics.length) return botMessages.acknowledgements.default

  const topicList = suggestedTopics
    .map((topic, index) => `${index + 1}. ${topic.title}`)
    .join('\n')

  return `${botMessages.acknowledgements.multipleTopics}\n\n${topicList}\n\n${botMessages.topicSuggestion.message}`
}

function isBookingRequest(userText) {
  const normalized = normalizeText(userText)
  return (
    normalized.includes('reservar') ||
    normalized.includes('reserva') ||
    normalized.includes('mesa') ||
    normalized.includes('book')
  ) && !isModificationRequest(userText)
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
    normalized.includes('mesa')
  )
}

function buildReservationSummary(reservation) {
  return `${formatReservationDateShort(reservation.reservation_date)} · ${reservation.reservation_time || '-'} · ${reservation.guests || '-'} pax`
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

  const promotedTopics = useMemo(() => [
    { label: 'Platos', topicId: 'dish_recommendation' },
    { label: 'Vinos', topicId: 'wine_pairing' },
    { label: 'Cócteles', topicId: 'cocktail_recommendation' },
    { label: 'Reservas', topicId: 'booking_request' },
    { label: 'Modificar reserva', action: 'open_modify_reservation' },
    { label: 'Horarios', topicId: 'opening_hours' }
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

  const openBookingForm = (userText = 'Quiero reservar una mesa') => {
    setShowBookingForm(true)
    setShowModifySearchForm(false)
    setSelectedReservation(null)
    setMatchingReservations([])
    setBookingStatus({ type: '', message: '' })
    setActiveOptions([])
    setShowSuggestions(false)

    appendConversation(
      userText,
      'Perfecto. Rellena estos datos y guardaré la solicitud de reserva para que el equipo la confirme por WhatsApp o email.'
    )
  }

  const openModifyForm = (userText = 'Quiero modificar una reserva') => {
    setShowModifySearchForm(true)
    setShowBookingForm(false)
    setSelectedReservation(null)
    setMatchingReservations([])
    setModifyStatus({ type: '', message: '' })
    setActiveOptions([])
    setShowSuggestions(false)

    appendConversation(
      userText,
      'Claro. Indica el número de teléfono usado en la reserva. Puedo reconocerlo también aunque lo escribas sin prefijo.'
    )
  }

  const handleResetChat = () => {
    const initialMessages = [{ role: 'agent', text: botMessages.greeting.message }]

    setMessages(initialMessages)
    setActiveOptions([])
    setShowBookingForm(false)
    setShowModifySearchForm(false)
    setSelectedReservation(null)
    setMatchingReservations([])
    setUserInput('')
    setShowSuggestions(true)
    setBookingForm(initialBookingForm)
    setModifyForm(initialModifyForm)
    setBookingStatus({ type: '', message: '' })
    setModifyStatus({ type: '', message: '' })

    try {
      window.localStorage.removeItem(CHAT_STORAGE_KEY)
    } catch {
      // Local storage may be unavailable in some browsers.
    }
  }

  const handleUserMessageSubmit = (event) => {
    event.preventDefault()

    const trimmedInput = userInput.trim()
    if (!trimmedInput) return

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

    const directAnswers = [
      buildWineTechnicalAnswer(trimmedInput),
      buildWineByGlassAnswer(trimmedInput),
      buildWineComparisonAnswer(trimmedInput),
      buildWineAnswer(trimmedInput),
      buildCocktailCuriousAnswer(trimmedInput)
    ]

    const matchedDirectAnswer = directAnswers.find(Boolean)

    if (matchedDirectAnswer) {
      const response = buildSatisfactionResponse(matchedDirectAnswer)

      setMessages((current) => [
        ...current,
        { role: 'user', text: trimmedInput },
        { role: 'agent', text: response.text }
      ])

      setActiveOptions(response.options || [])
      setShowSuggestions(true)
      setUserInput('')
      return
    }

    const matchedIntents = detectIntents(trimmedInput)
    const agentResponse = buildIntentResponse(matchedIntents)

    const suggestedTopicIds = [
      ...new Set(matchedIntents.flatMap((intent) => intent.suggestedTopics || []))
    ].slice(0, 4)

    const suggestedTopics = suggestedTopicIds
      .map((topicId) => getTopicById(topicId))
      .filter(Boolean)

    setActiveOptions(
      suggestedTopics.map((topic) => ({ label: topic.title, topicId: topic.id }))
    )
    setShowSuggestions(true)
    setMessages((current) => [
      ...current,
      { role: 'user', text: trimmedInput },
      { role: 'agent', text: agentResponse }
    ])

    setUserInput('')
  }

  const handleOptionClick = (option) => {
    if (option.action === 'open_modify_reservation') {
      openModifyForm(option.label)
      return
    }

    if (option.action === 'satisfaction_yes') {
      setMessages((current) => [
        ...current,
        { role: 'user', text: option.label },
        { role: 'agent', text: botMessages.closing.shortMessage }
      ])
      setShowSuggestions(false)
      setActiveOptions([])
      setShowBookingForm(false)
      setShowModifySearchForm(false)
      setUserInput('')

      setTimeout(() => setIsOpen(false), 1200)
      return
    }

    if (option.action === 'satisfaction_no') {
      const defaultTopics = [
        'dish_recommendation',
        'wine_pairing',
        'cocktail_recommendation',
        'allergen_info',
        'booking_request',
        'contact_staff'
      ]

      const suggestedTopics = defaultTopics
        .map((topicId) => getTopicById(topicId))
        .filter(Boolean)

      setMessages((current) => [
        ...current,
        { role: 'user', text: option.label },
        { role: 'agent', text: `${botMessages.fallback.noIntentMatched}\n\n${botMessages.topicSuggestion.message}` }
      ])

      setActiveOptions(
        suggestedTopics.map((topic) => ({ label: topic.title, topicId: topic.id }))
      )
      setShowSuggestions(true)
      return
    }

    const response = option.stepId
      ? buildFlowStepResponse(option.topicId, option.stepId)
      : buildTopicStartResponse(option.topicId)

    if (option.topicId === 'booking_request') {
      setShowBookingForm(true)
      setShowModifySearchForm(false)
      setSelectedReservation(null)
    }

    setMessages((current) => [
      ...current,
      { role: 'user', text: option.label },
      { role: 'agent', text: response.text }
    ])

    setActiveOptions(response.options || [])
    setShowSuggestions(option.topicId !== 'booking_request')
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

  const handleBookingSubmit = async (event) => {
    event.preventDefault()
    setIsSavingBooking(true)
    setBookingStatus({ type: '', message: '' })

    try {
      const validationError = await validateReservationFields({
        date: bookingForm.date,
        time: bookingForm.time,
        people: bookingForm.people
      })

      if (validationError) {
        setBookingStatus({ type: 'error', message: validationError })
        setIsSavingBooking(false)
        return
      }

      const payload = {
        customer_name: bookingForm.name.trim(),
        customer_phone: bookingForm.phone.trim(),
        customer_email: bookingForm.email.trim() || null,
        confirmation_channel: bookingForm.confirmation_channel,
        reservation_date: bookingForm.date,
        reservation_time: bookingForm.time,
        guests: Number(bookingForm.people || 1),
        area_preference: 'indiferente',
        notes: bookingForm.notes.trim() || null,
        reservation_status: 'pending',
        service_status: 'not_arrived',
        status: 'pending',
        source: 'chatbot'
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
        message: 'No hemos podido guardar la solicitud. Inténtalo de nuevo o contacta directamente con el restaurante.'
      })
    } finally {
      setIsSavingBooking(false)
    }
  }

  const handleModificationSearch = async (event) => {
    event.preventDefault()
    setIsSearchingModification(true)
    setModifyStatus({ type: '', message: '' })
    setMatchingReservations([])
    setSelectedReservation(null)

    try {
      const searchedPhone = modifyPhone.trim()

      if (sanitizePhoneDigits(searchedPhone).length < 6) {
        setModifyStatus({ type: 'error', message: 'Introduce al menos 6 dígitos del número usado en la reserva.' })
        return
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
        .filter((reservation) => !['rejected', 'cancelled'].includes(getReservationStatus(reservation)))
        .filter((reservation) => !['completed', 'no_show'].includes(getServiceStatus(reservation)))
        .slice(0, 5)

      if (!matches.length) {
        setModifyStatus({
          type: 'error',
          message: 'No he encontrado reservas futuras con ese número. Revisa el teléfono o contacta directamente con el restaurante.'
        })
        return
      }

      setMatchingReservations(matches)

      if (matches.length === 1) {
        selectReservationToModify(matches[0])
      } else {
        setModifyStatus({
          type: 'success',
          message: `He encontrado ${matches.length} reservas con ese número. Elige cuál quieres modificar.`
        })
      }
    } catch (error) {
      console.error(error)
      setModifyStatus({
        type: 'error',
        message: 'No hemos podido buscar la reserva. Inténtalo de nuevo o contacta directamente con el restaurante.'
      })
    } finally {
      setIsSearchingModification(false)
    }
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
          notes: modifyForm.notes.trim() || null,
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
        message: 'No hemos podido actualizar la reserva. Inténtalo de nuevo o contacta directamente con el restaurante.'
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
                    key={`${option.topicId || option.action}-${option.stepId || option.action || 'start'}`}
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
                      key={topic.topicId || topic.action}
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
