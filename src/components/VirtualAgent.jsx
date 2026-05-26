import React, { useState } from 'react'
import botMessages from '../data/bot/botMessages.json'
import nluIntents from '../data/bot/nluIntents.json'
import topicsData from '../data/bot/topics.json'
import flowsData from '../data/bot/flows.json'

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

  return {
    text: firstStep.message,
    options: []
  }
}

function buildFlowStepResponse(topicId, stepId) {
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

  return {
    text: step.message,
    options: []
  }
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
  const [messages, setMessages] = useState([
    {
      role: 'agent',
      text: botMessages.greeting.message
    }
  ])

  const [showBookingForm, setShowBookingForm] = useState(false)
  const [bookingForm, setBookingForm] = useState({
    name: '',
    date: '',
    time: '',
    people: '',
    phone: '',
    notes: ''
  })

  const handleUserMessageSubmit = (event) => {
    event.preventDefault()

    const trimmedInput = userInput.trim()

    if (!trimmedInput) return

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

            <button type="button" onClick={() => setIsOpen(false)}>
              ×
            </button>
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
              onChange={(event) => setUserInput(event.target.value)}
              placeholder="Escribe tu pregunta..."
              aria-label="Escribe tu pregunta"
            />
            <button type="submit">Enviar</button>
          </form>

          {activeOptions.length > 0 && (
            <div className="agent-topic-options">
              {activeOptions.map((option) => (
                <button
                  key={`${option.topicId}-${option.stepId || 'start'}`}
                  type="button"
                  onClick={() => handleOptionClick(option)}
                >
                  {option.label}
                </button>
              ))}
            </div>
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