import React, { useEffect, useState } from 'react'

const COOKIE_STORAGE_KEY = 'nonna_cookie_consent'

export default function CookieConsent() {
  const [isVisible, setIsVisible] = useState(false)

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
    <aside className="cookie-consent" role="dialog" aria-label="Aviso de cookies">
      <div>
        <p className="eyebrow">Privacidad</p>
        <h3>Una experiencia más cuidada</h3>
        <p>
          Utilizamos cookies esenciales para que el sitio funcione correctamente y cookies
          de experiencia para mejorar la navegación de Nonna Angela.
        </p>
      </div>

      <div className="cookie-consent-actions">
        <button className="ghost-button" type="button" onClick={() => saveConsent('essential')}>
          Solo esenciales
        </button>
        <button className="primary-button" type="button" onClick={() => saveConsent('accepted')}>
          Aceptar
        </button>
      </div>
    </aside>
  )
}
