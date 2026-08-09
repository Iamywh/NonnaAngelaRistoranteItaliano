import React, { useState } from 'react'
import { useLanguage } from '../i18n/LanguageContext.jsx'

const MANAGER_PASSWORD = import.meta.env.VITE_MANAGER_PASSWORD

export default function Navbar({ currentPage, setCurrentPage, isAdminMode, setIsAdminMode }) {
  const [showManagerModal, setShowManagerModal] = useState(false)
  const [managerPassword, setManagerPassword] = useState('')
  const [managerError, setManagerError] = useState('')
  const { language, setLanguage, supportedLanguages, t } = useLanguage()

  const publicLinks = [
    { id: 'home', label: t('nav.home') },
    { id: 'locale', label: t('nav.locale') },
    { id: 'menu', label: t('nav.menu') },
    { id: 'bebidas', label: t('nav.bebidas') }
  ]

  const openManagerAccess = () => {
    const alreadyUnlocked = sessionStorage.getItem('nonna_manager_unlocked') === 'true'

    if (alreadyUnlocked) {
      setIsAdminMode(true)
      setCurrentPage('admin')
      return
    }

    setManagerPassword('')
    setManagerError('')
    setShowManagerModal(true)
  }

  const handleManagerSubmit = (event) => {
    event.preventDefault()

    const expectedPassword = String(MANAGER_PASSWORD || '').trim()
    const typedPassword = String(managerPassword || '').trim()

    if (!expectedPassword) {
      setManagerError(t('nav.missingPassword'))
      return
    }

    if (typedPassword === expectedPassword) {
      sessionStorage.setItem('nonna_manager_unlocked', 'true')
      setIsAdminMode(true)
      setCurrentPage('admin')
      setShowManagerModal(false)
      setManagerPassword('')
      setManagerError('')
    } else {
      setManagerError(t('nav.wrongPassword'))
    }
  }

  const closeManagerModal = () => {
    setShowManagerModal(false)
    setManagerPassword('')
    setManagerError('')
  }

  return (
    <>
      <header className="navbar">
        <div className="brand-block" onClick={() => setCurrentPage('home')}>
          <div className="brand-mark">NA</div>
          <div>
            <p className="brand-kicker">{t('nav.kicker')}</p>
            <h1>Nonna Angela</h1>
          </div>
        </div>

        <nav className="nav-links">
          {publicLinks.map((link) => (
            <button
              key={link.id}
              className={currentPage === link.id ? 'nav-link active' : 'nav-link'}
              onClick={() => setCurrentPage(link.id)}
              type="button"
            >
              {link.label}
            </button>
          ))}
        </nav>

        <div className="navbar-actions">
          <div className="language-switcher" aria-label="Language selector">
            {supportedLanguages.map((item) => (
              <button
                key={item}
                className={language === item ? 'language-button active' : 'language-button'}
                type="button"
                onClick={() => setLanguage(item)}
              >
                {t(`language.${item}`)}
              </button>
            ))}
          </div>

          <button
            className={isAdminMode ? 'admin-toggle active' : 'admin-toggle'}
            type="button"
            onClick={openManagerAccess}
          >
            {t('common.manager')}
          </button>
        </div>
      </header>

      {showManagerModal && (
        <div className="manager-modal-backdrop">
          <div className="manager-modal">
            <p className="eyebrow">{t('nav.managerAccess')}</p>
            <h3>{t('nav.privateArea')}</h3>
            <p>{t('nav.passwordHelp')}</p>

            <form onSubmit={handleManagerSubmit}>
              <input
                type="password"
                value={managerPassword}
                onChange={(event) => setManagerPassword(event.target.value)}
                placeholder={t('nav.passwordPlaceholder')}
                autoFocus
              />

              {managerError && <span className="manager-error">{managerError}</span>}

              <div className="manager-modal-actions">
                <button className="ghost-button" type="button" onClick={closeManagerModal}>
                  {t('common.cancel')}
                </button>
                <button className="primary-button" type="submit">
                  {t('common.enter')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
