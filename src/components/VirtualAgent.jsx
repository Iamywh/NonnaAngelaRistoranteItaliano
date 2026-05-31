import React, { useEffect, useState } from 'react'
import botMessages from '../data/bot/botMessages.json'
import nluIntents from '../data/bot/nluIntents.json'
import topicsData from '../data/bot/topics.json'
import flowsData from '../data/bot/flows.json'
import restaurantKnowledge from '../data/bot/restaurantKnowledge.json'
import cocktailKnowledge from '../data/bot/cocktailKnowledge.json'
import wineKnowledge from '../data/bot/wineknowledge.json'

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

function findWineByText(userText) {
  const normalizedUserText = normalizeText(userText)
  const wines = wineKnowledge.wineKnowledge || []

  return wines.find((wine) => {
    const searchableText = [
      wine.name,
      wine.producer,
      wine.region,
      wine.denomination,
      ...(wine.grapes || []),
      ...(wine.style || []),
      ...(wine.aromas || []),
      ...(wine.keywords || [])
    ]
      .filter(Boolean)
      .join(' ')

    return normalizeText(searchableText)
      .split(/\s+/)
      .some((token) => token.length > 3 && normalizedUserText.includes(token))
  })
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
      normalizeText(`${wine.body} ${wine.tannins} ${(wine.style || []).join(' ')}`)
        .includes('suave') ||
      normalizeText(`${wine.body} ${wine.style?.join(' ')}`).includes('ligero')
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
      (wine.pairings || []).some((pairing) =>
        normalizeText(pairing).includes(matchedPairing)
      )
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



export default function VirtualAgent() {
  const [isOpen, setIsOpen] = useState(false)
  const [userInput, setUserInput] = useState('')
  const [activeOptions, setActiveOptions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(true)
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
    setShowSuggestions(true)

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


    const wineTechnicalAnswer = buildWineTechnicalAnswer(trimmedInput)

if (wineTechnicalAnswer) {
  const response = buildSatisfactionResponse(wineTechnicalAnswer)

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

const wineByGlassAnswer = buildWineByGlassAnswer(trimmedInput)

if (wineByGlassAnswer) {
  const response = buildSatisfactionResponse(wineByGlassAnswer)

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

const wineComparisonAnswer = buildWineComparisonAnswer(trimmedInput)

if (wineComparisonAnswer) {
  const response = buildSatisfactionResponse(wineComparisonAnswer)

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

const wineAnswer = buildWineAnswer(trimmedInput)

if (wineAnswer) {
  const response = buildSatisfactionResponse(wineAnswer)

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

const cocktailCuriousAnswer = buildCocktailCuriousAnswer(trimmedInput)

if (cocktailCuriousAnswer) {
  const response = buildSatisfactionResponse(cocktailCuriousAnswer)

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
    ...wines.map((wine) =>
      `• ${wine.name} (${wine.region}) — ${wine.category}. ${wine.sales_note || ''}`
    ),
    '',
    'Si me dices si prefieres blanco, tinto, rosado o algo más suave, te recomiendo uno.'
  ].join('\n')
}

function buildWineTechnicalAnswer(userText) {
  const normalizedUserText = normalizeText(userText)

  if (
    normalizedUserText.includes('tanino') ||
    normalizedUserText.includes('taninos') ||
    normalizedUserText.includes('tannin')
  ) {
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
    setShowSuggestions(true)
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
      setShowSuggestions(false)
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
      setShowSuggestions(true)
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