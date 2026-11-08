import React from 'react'
import { useLanguage } from '../i18n/LanguageContext.jsx'

export default function Navbar({ currentPage, setCurrentPage, isStaff, signedIn }) {
  const { language, setLanguage, supportedLanguages, t } = useLanguage()

  const publicLinks = [
    { id: 'home', label: t('nav.home') },
    { id: 'locale', label: t('nav.locale') },
    { id: 'menu', label: t('nav.menu') },
    { id: 'bebidas', label: t('nav.bebidas') },
    { id: 'famiglia', label: 'La Famiglia' }
  ]

  return (
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

        <button className="nav-link" type="button" onClick={() => setCurrentPage('account')}>
          {t(isStaff ? 'account.staff' : 'account.visitor')} · {t(signedIn ? 'account.title' : 'account.login')}
        </button>
        {isStaff && (
          <button className="admin-toggle active" type="button" onClick={() => setCurrentPage('admin')}>
            {t('common.manager')}
          </button>
        )}
      </div>
    </header>
  )
}
