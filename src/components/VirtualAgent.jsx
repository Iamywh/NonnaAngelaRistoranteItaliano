import React, { useEffect, useState } from 'react'
import botMessages from '../data/bot/botMessages.json'
import nluIntents from '../data/bot/nluIntents.json'
import topicsData from '../data/bot/topics.json'
import flowsData from '../data/bot/flows.json'
import restaurantKnowledge from '../data/bot/restaurantKnowledge.json'
import cocktailKnowledge from '../data/bot/cocktailKnowledge.json'

const CHAT_STORAGE_KEY = 'nonna_angela_virtual_agent_messages'

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
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
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

function buildTopicStartResponse(topicId) {
  const topic = getTopicById(topicId)

  const dynamicAnswer = buildDynamicTopicAnswer(topicId)

  if (dynamicAnswer) {
    return buildSatisfactionResponse(dynamicAnswer)
  }

  if (!topic) {
    return {
      text: botMessages.fallback.unknown,
      options: []
    }
  }

  const flow = getFlowById(topic.flowId)
  const firstStep = getFirstStep(flow)

  if (!flow || !firstStep) {
    return {
      text: topic.entryMessage || botMessages.fallback.unknown,
      options: []
    }
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

  const curiousRules = [
    {
      tokens: ['americano', 'negroni'],
      questionIncludes: 'Americano y un Negroni'
    },
    {
      tokens: ['bellini', 'rossini'],
      questionIncludes: 'Bellini y Rossini'
    },
    {
      tokens: ['aperol', 'sulfit'],
      questionIncludes: 'Aperol Spritz tiene sulfitos'
    },
    {
      tokens: ['hugo', 'italiano'],
      questionIncludes: 'Hugo Spritz es un cóctel italiano'
    },
    {
      tokens: ['mas', 'fuerte'],
      questionIncludes: 'cóctel más fuerte'
    },
    {
      tokens: ['mas', 'suave'],
      questionIncludes: 'más suave'
    }
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
      'Puedo ayudarte a preparar una solicitud de reserva.',
      restaurant.reservationPolicy.message,
      `Necesito: ${restaurant.reservationPolicy.requiredFields.join(', ')}.`
    ].join('\n')
  }

  return null
}

function buildSatisfactionResponse(message) {
  return {
    text: `${message}\n\n${botMessages.satisfactionCheck.message}`,
    options: [
      {
        label: botMessages.satisfactionCheck.yesLabel,
        action: 'satisfaction_yes'
      },
      {
        label: botMessages.satisfactionCheck.noLabel,
        action: 'satisfaction_no'
      }
    ]
  }
}

function buildFlowStepResponse(topicId, stepId) {
  if (topicId === 'cocktail_recommendation') {
    const cocktailAnswer = buildCocktailBranchAnswer(stepId)

    if (cocktailAnswer) {
      return buildSatisfactionResponse(cocktailAnswer)
    }
  }
  const topic = getTopicById(topicId)
  const flow = getFlowById(topic?.flowId)
  const step = getStepById(flow, stepId)

  if (!step) {
    return {
      text: botMessages.fallback.unknown,
      options: []
    }
  }

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
  if (!matchedIntents.length) {
    return botMessages.fallback.noIntentMatched
  }

  const suggestedTopicIds = [
    ...new Set(matchedIntents.flatMap((intent) => intent.suggestedTopics || []))
  ].slice(0, 4)

  const suggestedTopics = suggestedTopicIds
    .map((topicId) => getTopicById(topicId))
    .filter(Boolean)

  if (!suggestedTopics.length) {
    return botMessages.acknowledgements.default
  }

  const topicList = suggestedTopics
    .map((topic, index) => `${index + 1}. ${topic.title}`)
    .join('\n')

  return `${botMessages.acknowledgements.multipleTopics}\n\n${topicList}\n\n${botMessages.topicSuggestion.message}`
}

const quickActions = [
  {
    id: 'recommend',
    label: 'Recomiéndame un plato',
    response:
      'Claro. Si quieres algo muy representativo, empezaría por los Paccheri al ragù napoletano, la Lasagna al ragù bolognese o los Gnocchi alla sorrentina. Son platos con identidad, sabor de casa y alma italiana.'
  },
  {
    id: 'vegetarian',
    label: 'Platos vegetarianos',
    response:
      'Puedo ayudarte. Entre las opciones más adecuadas están los Gnocchi alla sorrentina, Cacio e pepe, Rigatoni al pesto, Caprese, verduras a la parrilla y algunas guarniciones. Para alergias o contaminación cruzada, confirma siempre con el equipo.'
  },
  {
    id: 'gluten-free',
    label: 'Sin gluten / alérgenos',
    response:
      'Puedo orientarte, pero en caso de alergia o celiaquía es imprescindible confirmarlo con el equipo. Muchos platos de pasta contienen gluten. Algunos entrantes, segundos o guarniciones pueden ser más adecuados, pero también hay que verificar la contaminación cruzada.'
  },
  {
    id: 'wine',
    label: 'Recomiéndame vino o cóctel',
    response:
      'Para platos intensos con ragù elegiría un tinto italiano con estructura, como Mastro Rosso Campania, Chianti, Primitivo o Nebbiolo. Para aperitivo: Negroni, Americano, Aperol Spritz o Hugo Spritz, según prefieras algo más intenso o más fresco.'
  },
  {
    id: 'booking',
    label: 'Quiero reservar',
    response:
      'Perfecto. Puedo preparar tu solicitud de reserva. Necesito nombre, fecha, hora, número de personas y teléfono. La reserva solo será válida después de la confirmación del equipo.'
  },
  {
    id: 'restaurant',
    label: 'Info restaurante',
    response:
      'Nonna Angela es un restaurante italiano pensado para diferenciarse de los locales turísticos: cocina auténtica, platos reconocibles, servicio cuidado y una atmósfera cálida. La idea es comer italiano de verdad, con calma, como en una casa de familia pero con atención profesional.'
  }
]

export default function VirtualAgent() {
  const [isOpen, setIsOpen] = useState(false)
  const [userInput, setUserInput] = useState('')
  const [activeOptions, setActiveOptions] = useState([])
  const promotedTopics = [
    { label: 'Platos', topicId: 'dish_recommendation' },
    { label: 'Vinos', topicId: 'wine_pairing' },
    { label: 'Cócteles', topicId: 'cocktail_recommendation' },
    { label: 'Alérgenos', topicId: 'allergen_info' },
    { label: 'Reservas', topicId: 'booking_request' },
    { label: 'Horarios', topicId: 'opening_hours' }
  ]
  const [messages, setMessages] = useState(() => getInitialMessages())

  const [showBookingForm, setShowBookingForm] = useState(false)
  const [bookingForm, setBookingForm] = useState({
    name: '',
    date: '',
    time: '',
    people: '',
    phone: '',
    notes: ''
  })

  useEffect(() => {
    try {
      window.localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages))
    } catch {
      // Local storage may be unavailable in some browsers.
    }
  }, [messages])

  const handleResetChat = () => {
    const initialMessages = [
      {
        role: 'agent',
        text: botMessages.greeting.message
      }
    ]

    setMessages(initialMessages)
    setActiveOptions([])
    setShowBookingForm(false)
    setUserInput('')

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

    const cocktailCuriousAnswer = buildCocktailCuriousAnswer(trimmedInput)

    if (cocktailCuriousAnswer) {
      const response = buildSatisfactionResponse(cocktailCuriousAnswer)

      setMessages((current) => [
        ...current,
        { role: 'user', text: trimmedInput },
        { role: 'agent', text: response.text }
      ])

      setActiveOptions(response.options || [])
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
      suggestedTopics.map((topic) => ({
        label: topic.title,
        topicId: topic.id
      }))
    )

    setMessages((current) => [
      ...current,
      { role: 'user', text: trimmedInput },
      { role: 'agent', text: agentResponse }
    ])

    setUserInput('')
  }

  const handleOptionClick = (option) => {
    if (option.action === 'satisfaction_yes') {
      setMessages((current) => [
        ...current,
        { role: 'user', text: option.label },
        { role: 'agent', text: botMessages.closing.shortMessage }
      ])

      setActiveOptions([])
      setShowBookingForm(false)
      setUserInput('')

      setTimeout(() => {
        setIsOpen(false)
      }, 1200)

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
        {
          role: 'agent',
          text: `${botMessages.fallback.noIntentMatched}\n\n${botMessages.topicSuggestion.message}`
        }
      ])

      setActiveOptions(
        suggestedTopics.map((topic) => ({
          label: topic.title,
          topicId: topic.id
        }))
      )

      return
    }

    const response = option.stepId
      ? buildFlowStepResponse(option.topicId, option.stepId)
      : buildTopicStartResponse(option.topicId)

    if (option.topicId === 'booking_request') {
      setShowBookingForm(true)
    }

    setMessages((current) => [
      ...current,
      { role: 'user', text: option.label },
      { role: 'agent', text: response.text }
    ])

    setActiveOptions(response.options || [])
  }

  const handleQuickAction = (action) => {
    if (action.id === 'booking') {
      setShowBookingForm(true)
    }

    setMessages((current) => [
      ...current,
      { role: 'user', text: action.label },
      { role: 'agent', text: action.response }
    ])
  }

  const handleBookingChange = (event) => {
    const { name, value } = event.target

    setBookingForm((current) => ({
      ...current,
      [name]: value
    }))
  }

  const handleBookingSubmit = (event) => {
    event.preventDefault()

    const summary = `Solicitud de reserva recibida:
Nombre: ${bookingForm.name}
Fecha: ${bookingForm.date}
Hora: ${bookingForm.time}
Personas: ${bookingForm.people}
Teléfono: ${bookingForm.phone}
Notas: ${bookingForm.notes || 'Ninguna'}

La reserva solo será válida después de la confirmación del equipo.`

    setMessages((current) => [
      ...current,
      { role: 'user', text: 'He enviado una solicitud de reserva.' },
      { role: 'agent', text: summary }
    ])

    setShowBookingForm(false)
    setBookingForm({
      name: '',
      date: '',
      time: '',
      people: '',
      phone: '',
      notes: ''
    })
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
              <button
                type="button"
                onClick={handleResetChat}
                aria-label="Reiniciar chat"
                title="Reiniciar chat"
              >
                ↻
              </button>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Cerrar chat"
                title="Cerrar chat"
              >
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
              onFocus={() => setActiveOptions([])}
              onChange={(event) => {
                setUserInput(event.target.value)
                setActiveOptions([])
              }}
              placeholder="Escribe tu pregunta..."
              aria-label="Escribe tu pregunta"
            />
            <button type="submit">Enviar</button>
          </form>

          {activeOptions.length > 0 ? (
            <div className="agent-topic-options">
              {activeOptions.map((option) => (
                <button
                  key={`${option.topicId}-${option.stepId || option.action || 'start'}`}
                  type="button"
                  onClick={() => handleOptionClick(option)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : (
            messages.length === 1 &&
            !userInput && (
              <div className="agent-promoted-topics">
                {promotedTopics.map((topic) => (
                  <button
                    key={topic.topicId}
                    type="button"
                    onClick={() => handleOptionClick(topic)}
                  >
                    {topic.label}
                  </button>
                ))}
              </div>
            )
          )}

          {showBookingForm && (
            <form className="booking-form" onSubmit={handleBookingSubmit}>
              <input
                name="name"
                value={bookingForm.name}
                onChange={handleBookingChange}
                placeholder="Nombre"
                required
              />

              <input
                name="date"
                type="date"
                value={bookingForm.date}
                onChange={handleBookingChange}
                required
              />

              <input
                name="time"
                type="time"
                value={bookingForm.time}
                onChange={handleBookingChange}
                required
              />

              <input
                name="people"
                type="number"
                min="1"
                value={bookingForm.people}
                onChange={handleBookingChange}
                placeholder="Personas"
                required
              />

              <input
                name="phone"
                value={bookingForm.phone}
                onChange={handleBookingChange}
                placeholder="Teléfono"
                required
              />

              <textarea
                name="notes"
                value={bookingForm.notes}
                onChange={handleBookingChange}
                placeholder="Notas opcionales"
                rows="2"
              />

              <button type="submit">Enviar solicitud</button>
            </form>
          )}

          <div className="agent-actions">
            {quickActions.map((action) => (
              <button
                key={action.id}
                type="button"
                onClick={() => handleQuickAction(action)}
              >
                {action.label}
              </button>
            ))}
          </div>
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