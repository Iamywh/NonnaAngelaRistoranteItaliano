import React from 'react'
import { useLanguage } from '../i18n/LanguageContext.jsx'

const contactLinks = [
  {
    label: 'WhatsApp',
    value: '+34 697 46 76 19',
    href: 'https://wa.me/34697467619'
  },
  {
    label: 'Instagram',
    value: '@nonnaangelaristorante',
    href: 'https://www.instagram.com/nonnaangelaristorante/'
  },
  {
    label: 'Facebook',
    value: 'Nonna Angela Ristorante',
    href: 'https://www.facebook.com/profile.php?id=61589714408634&locale=es_ES'
  }
]

export default function Footer({ setCurrentPage }) {
  const { t } = useLanguage()

  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <p className="brand-kicker">{t('footer.kicker')}</p>
          <h2>Nonna Angela</h2>
          <p>{t('footer.text')}</p>
        </div>

        <div className="footer-block">
          <h3>{t('footer.address')}</h3>
          <p>Calle Méndez Núñez 20</p>
          <p>38002 Santa Cruz de Tenerife</p>
        </div>

        <div className="footer-block">
          <h3>{t('footer.contact')}</h3>
          <ul className="footer-links">
            {contactLinks.map((link) => (
              <li key={link.label}>
                <span>{link.label}</span>
                <a href={link.href} target="_blank" rel="noreferrer">
                  {link.value}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div className="footer-block">
          <h3>{t('footer.carta')}</h3>
          <ul className="footer-links">
            <li>
              <span>{t('footer.menu')}</span>
              <button type="button" onClick={() => setCurrentPage('menu')}>
                {t('footer.foodWine')}
              </button>
            </li>
            <li>
              <span>{t('footer.drinks')}</span>
              <button type="button" onClick={() => setCurrentPage('bebidas')}>
                {t('footer.drinksMenu')}
              </button>
            </li>
          </ul>
        </div>
      </div>

      <div className="footer-menuria">
        <span>{t('footer.powered')}</span>
        <strong>Menuria</strong>
      </div>
    </footer>
  )
}
