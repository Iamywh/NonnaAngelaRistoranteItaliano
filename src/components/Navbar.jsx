import React from 'react'

export default function Navbar({ currentPage, setCurrentPage }) {
  const publicLinks = [
    { id: 'home', label: 'Home' },
    { id: 'locale', label: 'Il locale' },
    { id: 'menu', label: 'Menu' }
  ]

  return (
    <header className="navbar">
      <div className="brand-block" onClick={() => setCurrentPage('home')}>
        <div className="brand-mark">NA</div>
        <div>
          <p className="brand-kicker">Ristorante Italiano</p>
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
    </header>
  )
}