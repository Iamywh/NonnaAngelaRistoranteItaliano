import React from 'react'
import { useLanguage } from '../i18n/LanguageContext.jsx'

export default function Home({ setCurrentPage }) {
  const { t } = useLanguage()

  const goToReservations = () => {
    setCurrentPage('locale')
    setTimeout(() => {
      document.getElementById('reservas')?.scrollIntoView({ behavior: 'smooth' })
    }, 100)
  }

  const days = [
    ['home.monday', t('common.closed')],
    ['home.tuesday', '12:30–15:30 / 19:30–22:45'],
    ['home.wednesday', '12:30–15:30 / 19:30–22:45'],
    ['home.thursday', '12:30–15:30 / 19:30–22:45'],
    ['home.friday', '12:30–15:30 / 19:30–23:00'],
    ['home.saturday', '12:30–15:30 / 19:30–23:00'],
    ['home.sunday', t('common.closed')]
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
        <span>{t('home.bookingTip')}</span>
        <button className="ghost-button" type="button" onClick={goToReservations}>
          {t('home.reserveShort')}
        </button>
      </div>
    </section>
  )
}
