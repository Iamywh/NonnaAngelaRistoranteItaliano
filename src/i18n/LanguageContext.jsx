import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { translations } from './translations.js'

const LANGUAGE_STORAGE_KEY = 'nonna_language'
const DEFAULT_LANGUAGE = 'es'
const SUPPORTED_LANGUAGES = ['es', 'en', 'fr', 'it']

const TRANSLATION_OVERRIDES = {
  es: {
    'bot.phone': 'Teléfono con o sin prefijo',
    'bot.searchPhone': 'Teléfono usado en la reserva',
    'bot.modificationSaved': 'Modificación enviada correctamente.',
    'bot.modificationPending': 'La reserva vuelve a quedar pendiente hasta que el equipo confirme los cambios.',
    'bot.submitModification': 'Enviar modificación',
    'bot.updating': 'Actualizando...',
    'menu.categories.especialidades_semana': ['Especialidades de temporada', 'Platos especiales de temporada, según mercado y disponibilidad.'],
    'menu.sections.especialidades': ['Especialidades de temporada', 'Platos especiales de temporada']
  },
  en: {
    'bot.phone': 'Phone with or without prefix',
    'bot.searchPhone': 'Phone used for the booking',
    'bot.modificationSaved': 'Modification sent successfully.',
    'bot.modificationPending': 'The booking is pending again until the team confirms the changes.',
    'bot.submitModification': 'Send modification',
    'bot.updating': 'Updating...',
    'menu.categories.especialidades_semana': ['Seasonal specialties', 'Special seasonal dishes, depending on market and availability.'],
    'menu.sections.especialidades': ['Seasonal specialties', 'Special seasonal dishes']
  },
  fr: {
    'bot.phone': 'Téléphone avec ou sans indicatif',
    'bot.searchPhone': 'Téléphone utilisé pour la réservation',
    'bot.modificationSaved': 'Modification envoyée correctement.',
    'bot.modificationPending': 'La réservation redevient en attente jusqu’à confirmation de l’équipe.',
    'bot.submitModification': 'Envoyer la modification',
    'bot.updating': 'Mise à jour...',
    'menu.categories.especialidades_semana': ['Spécialités de saison', 'Plats de saison, selon le marché et la disponibilité.'],
    'menu.sections.especialidades': ['Spécialités de saison', 'Plats spéciaux de saison']
  },
  it: {
    'bot.phone': 'Telefono con o senza prefisso',
    'bot.searchPhone': 'Telefono usato per la prenotazione',
    'bot.modificationSaved': 'Modifica inviata correttamente.',
    'bot.modificationPending': 'La prenotazione torna in attesa finché il team non conferma le modifiche.',
    'bot.submitModification': 'Invia modifica',
    'bot.updating': 'Aggiornamento...',
    'menu.categories.especialidades_semana': ['Specialità di stagione', 'Piatti speciali di stagione, secondo mercato e disponibilità.'],
    'menu.sections.especialidades': ['Specialità di stagione', 'Piatti speciali di stagione']
  }
}

const LanguageContext = createContext(null)

function getInitialLanguage() {
  if (typeof window === 'undefined') return DEFAULT_LANGUAGE

  const savedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY)
  if (SUPPORTED_LANGUAGES.includes(savedLanguage)) return savedLanguage

  const browserLanguage = window.navigator?.language?.slice(0, 2)?.toLowerCase()
  if (SUPPORTED_LANGUAGES.includes(browserLanguage)) return browserLanguage

  return DEFAULT_LANGUAGE
}

function getNestedValue(source, path) {
  return path.split('.').reduce((current, key) => current?.[key], source)
}

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(getInitialLanguage)

  const setLanguage = (nextLanguage) => {
    const safeLanguage = SUPPORTED_LANGUAGES.includes(nextLanguage) ? nextLanguage : DEFAULT_LANGUAGE
    setLanguageState(safeLanguage)
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, safeLanguage)
  }

  const t = (path, variables = {}) => {
    const overrideValue = TRANSLATION_OVERRIDES[language]?.[path]
    const value = overrideValue ?? getNestedValue(translations[language], path) ?? getNestedValue(translations[DEFAULT_LANGUAGE], path) ?? path

    if (typeof value !== 'string') return value

    return Object.entries(variables).reduce(
      (result, [key, replacement]) => result.replaceAll(`{{${key}}}`, String(replacement)),
      value
    )
  }

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  const value = useMemo(() => ({
    language,
    setLanguage,
    t,
    supportedLanguages: SUPPORTED_LANGUAGES
  }), [language])

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const context = useContext(LanguageContext)

  if (!context) {
    throw new Error('useLanguage must be used inside LanguageProvider')
  }

  return context
}
