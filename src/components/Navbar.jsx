import React from 'react'

export default function Navbar({ currentPage, setCurrentPage, isAdminMode, setIsAdminMode }) {
  const publicLinks = [
    { id: 'home', label: 'Home' },
    { id: 'locale', label: 'Il locale' },
    { id: 'menu', label: 'Menu' }
  ]

  const allLinks = isAdminMode
    ? [...publicLinks, { id: 'admin', label: 'Admin dashboard' }]
    : publicLinks

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
        {allLinks.map((link) => (
          <button
            key={link.id}
            className={currentPage === link.id ? 'nav-link active' : 'nav-link'}
            onClick={() => setCurrentPage(link.id)}
          >
            {link.label}
          </button>
        ))}
      </nav>

      <button
        className={isAdminMode ? 'admin-toggle active' : 'admin-toggle'}
        onClick={() => {
          setIsAdminMode((value) => !value)
          setCurrentPage('home')
        }}
      >
        {isAdminMode ? 'Admin ON' : 'Admin'}
      </button>
    </header>
  )
}