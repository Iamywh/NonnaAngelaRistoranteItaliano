import React from 'react'

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

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <p className="brand-kicker">Ristorante Italiano</p>
          <h2>Nonna Angela</h2>
          <p>
            Cocina italiana auténtica, menú digital, vinos, cócteles y reservas
            con confirmación del equipo.
          </p>
        </div>

        <div className="footer-block">
          <h3>Dirección</h3>
          <p>Calle Méndez Núñez 20</p>
          <p>38002 Santa Cruz de Tenerife</p>
        </div>

        <div className="footer-block">
          <h3>Contacto</h3>
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
      </div>

      <div className="footer-menuria">
        <span>Powered by</span>
        <strong>Menuria</strong>
      </div>
    </footer>
  )
}
