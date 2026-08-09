import React, { useEffect, useState } from 'react'

const WELCOME_POPUP_KEY = 'nonna_welcome_popup_seen'

export default function WelcomePopup({ currentPage, setCurrentPage }) {
  const [isVisible, setIsVisible] = useState(false)

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
    <div className="welcome-popup-backdrop" role="dialog" aria-modal="true" aria-label="Bienvenida Nonna Angela">
      <section className="welcome-popup-card">
        <button className="welcome-popup-close" type="button" onClick={closePopup} aria-label="Cerrar">
          ×
        </button>

        <div className="welcome-popup-mark">NA</div>
        <p className="eyebrow">Benvenuti</p>
        <h3>Nonna Angela, cocina italiana con elegancia y alma familiar.</h3>
        <p>
          Una mesa íntima, sabores italianos auténticos y una experiencia pensada para
          disfrutar sin prisa en Santa Cruz de Tenerife.
        </p>

        <div className="welcome-popup-actions">
          <button className="primary-button" type="button" onClick={goToReservations}>
            Reservar mesa
          </button>
          <button className="ghost-button" type="button" onClick={goToMenu}>
            Ver carta
          </button>
        </div>
      </section>
    </div>
  )
}
