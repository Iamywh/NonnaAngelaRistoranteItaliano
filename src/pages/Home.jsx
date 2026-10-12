import React from 'react'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import { isEmergencyScheduleWindowActive } from '../lib/scheduleExceptions.js'

export default function Home({ setCurrentPage }) {
  const { t, language } = useLanguage()
  const emergencyScheduleActive = isEmergencyScheduleWindowActive()
  const emergencyCopy = {
    es: {
      closed: 'Cerrado excepcionalmente · 13/10',
      open: 'Abierto excepcionalmente · 15/10',
      tip: 'Cambio excepcional: martes 13 cerrado · jueves 15 abierto con horario habitual del martes.'
    },
    en: {
      closed: 'Exceptionally closed · 13/10',
      open: 'Exceptionally open · 15/10',
      tip: 'Exceptional change: Tuesday 13 closed · Thursday 15 open with Tuesday hours.'
    },
    fr: {
      closed: 'Fermé exceptionnellement · 13/10',
      open: 'Ouvert exceptionnellement · 15/10',
      tip: 'Changement exceptionnel : mardi 13 fermé · jeudi 15 ouvert aux horaires du mardi.'
    },
    it: {
      closed: 'Chiuso eccezionalmente · 13/10',
      open: 'Aperto eccezionalmente · 15/10',
      tip: 'Cambio eccezionale: martedì 13 chiuso · giovedì 15 aperto con gli orari del martedì.'
    }
  }[language] || {
    closed: 'Cerrado excepcionalmente · 13/10',
    open: 'Abierto excepcionalmente · 15/10',
    tip: 'Cambio excepcional: martes 13 cerrado · jueves 15 abierto con horario habitual del martes.'
  }

  const goToReservations = () => {
    setCurrentPage('locale')
    setTimeout(() => {
      document.getElementById('reservas')?.scrollIntoView({ behavior: 'smooth' })
    }, 100)
  }

  const days = [
    ['home.monday', '12:30–15:30 / 19:30–22:45'],
    ['home.tuesday', emergencyScheduleActive ? emergencyCopy.closed : '12:30–15:30 / 19:30–22:45'],
    ['home.wednesday', t('common.closed')],
    ['home.thursday', emergencyScheduleActive ? `12:30–15:30 / 19:30–22:45 · ${emergencyCopy.open}` : t('common.closed')],
    ['home.friday', '12:30–15:30 / 19:30–23:00'],
    ['home.saturday', '12:30–15:30 / 19:30–23:00'],
    ['home.sunday', '12:30–15:30 / 19:30–22:45']
  ]

  return (
    <section className="hero-page">
      <div className="hero-copy">
        <p className="eyebrow">{t('home.eyebrow')}</p>
        <h2>{t('home.title')}</h2>
        <p>{t('home.intro')}</p>

        <div className="hero-actions">
          <button className="primary-button" type="button" onClick={goToReservations}>
            {t('home.reserve')}
          </button>

          <button className="primary-button" type="button" onClick={() => setCurrentPage('menu')}>
            {t('home.menu')}
          </button>

          <button className="ghost-button" type="button" onClick={() => setCurrentPage('locale')}>
            {t('home.discover')}
          </button>
        </div>
      </div>

      <div className="hero-card">
        <p>{t('home.hours')}</p>
        <div className="hero-hours">
          {days.map(([labelKey, value]) => (
            <div key={labelKey}>
              <strong>{t(labelKey)}</strong>
              <span>{value}</span>
            </div>
          ))}
        </div>
        <span>{emergencyScheduleActive ? emergencyCopy.tip : t('home.bookingTip')}</span>
        <button className="ghost-button" type="button" onClick={goToReservations}>
          {t('home.reserveShort')}
        </button>
      </div>
    </section>
  )
}
