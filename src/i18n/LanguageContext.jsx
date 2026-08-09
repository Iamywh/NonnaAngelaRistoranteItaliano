import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { translations } from './translations.js'

const LANGUAGE_STORAGE_KEY = 'nonna_language'
const DEFAULT_LANGUAGE = 'es'
const SUPPORTED_LANGUAGES = ['es', 'en', 'fr', 'it']

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
    const value = getNestedValue(translations[language], path) ?? getNestedValue(translations[DEFAULT_LANGUAGE], path) ?? path

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
