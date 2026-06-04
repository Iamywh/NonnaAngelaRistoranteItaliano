import React from 'react'

export default function Navbar({ currentPage, setCurrentPage, isAdminMode, setIsAdminMode }) {
  const publicLinks = [
    { id: 'home', label: 'Inicio' },
    { id: 'locale', label: 'Restaurante' },
    { id: 'menu', label: 'Menú' }
  ]

  const handleAdminToggle = () => {
    if (currentPage === 'admin') {
      setCurrentPage('home')
      setIsAdminMode(false)
      return
    }

    setIsAdminMode(true)
    setCurrentPage('admin')
  }

  return (
    <header className="navbar">
      <div className="brand-block" onClick={() => setCurrentPage('home')}>
        <div className="brand-mark">NA</div>
        <div>
          <p className="brand-kicker">Restaurante Italiano</p>
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

      <button
        className={isAdminMode ? 'admin-toggle active' : 'admin-toggle'}
        type="button"
        onClick={handleAdminToggle}
      >
        Manager
      </button>
    </header>
  )
}