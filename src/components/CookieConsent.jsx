import React, { useEffect, useState } from 'react'
import { useLanguage } from '../i18n/LanguageContext.jsx'

const COOKIE_STORAGE_KEY = 'nonna_cookie_consent'

export default function CookieConsent() {
  const [isVisible, setIsVisible] = useState(false)
  const { t } = useLanguage()

  useEffect(() => {
    const savedConsent = localStorage.getItem(COOKIE_STORAGE_KEY)

    if (!savedConsent) {
      const timer = window.setTimeout(() => setIsVisible(true), 700)
      return () => window.clearTimeout(timer)
    }
  }, [])

  const saveConsent = (value) => {
    localStorage.setItem(
      COOKIE_STORAGE_KEY,
      JSON.stringify({ value, acceptedAt: new Date().toISOString() })
    )
    setIsVisible(false)
  }

  if (!isVisible) return null

  return (
    <aside className="cookie-consent" role="dialog" aria-label={t('cookies.aria')}>
      <div>
        <p className="eyebrow">{t('cookies.eyebrow')}</p>
        <h3>{t('cookies.title')}</h3>
        <p>{t('cookies.text')}</p>
      </div>

      <div className="cookie-consent-actions">
        <button className="ghost-button" type="button" onClick={() => saveConsent('essential')}>
          {t('cookies.essentials')}
        </button>
        <button className="primary-button" type="button" onClick={() => saveConsent('accepted')}>
          {t('cookies.accept')}
        </button>
      </div>
    </aside>
  )
}
