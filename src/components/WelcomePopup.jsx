import React, { useEffect, useState } from 'react'
import { useLanguage } from '../i18n/LanguageContext.jsx'

const WELCOME_POPUP_KEY = 'nonna_welcome_popup_seen'

export default function WelcomePopup({ currentPage, setCurrentPage }) {
  const [isVisible, setIsVisible] = useState(false)
  const { t } = useLanguage()

  useEffect(() => {
    if (String(currentPage || '').startsWith('admin')) return

    const alreadySeen = sessionStorage.getItem(WELCOME_POPUP_KEY) === 'true'
    if (alreadySeen) return

    const timer = window.setTimeout(() => {
      setIsVisible(true)
      sessionStorage.setItem(WELCOME_POPUP_KEY, 'true')
    }, 1400)

    return () => window.clearTimeout(timer)
  }, [currentPage])

  const closePopup = () => {
    setIsVisible(false)
    sessionStorage.setItem(WELCOME_POPUP_KEY, 'true')
  }

  const goToReservations = () => {
    closePopup()
    setCurrentPage('locale')
    window.setTimeout(() => {
      document.getElementById('reservas')?.scrollIntoView({ behavior: 'smooth' })
    }, 150)
  }

  const goToMenu = () => {
    closePopup()
    setCurrentPage('menu')
  }

  if (!isVisible) return null

  return (
    <div className="welcome-popup-backdrop" role="dialog" aria-modal="true" aria-label={t('popup.aria')}>
      <section className="welcome-popup-card">
        <button className="welcome-popup-close" type="button" onClick={closePopup} aria-label={t('popup.close')}>
          ×
        </button>

        <div className="welcome-popup-mark">NA</div>
        <p className="eyebrow">{t('popup.eyebrow')}</p>
        <h3>{t('popup.title')}</h3>
        <p>{t('popup.text')}</p>

        <div className="welcome-popup-actions">
          <button className="primary-button" type="button" onClick={goToReservations}>
            {t('popup.reserve')}
          </button>
          <button className="ghost-button" type="button" onClick={goToMenu}>
            {t('popup.menu')}
          </button>
        </div>
      </section>
    </div>
  )
}
