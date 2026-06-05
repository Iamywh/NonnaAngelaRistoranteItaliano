import React, { useState } from 'react'

const MANAGER_PASSWORD = import.meta.env.VITE_MANAGER_PASSWORD

export default function Navbar({ currentPage, setCurrentPage, isAdminMode, setIsAdminMode }) {
  const [showManagerModal, setShowManagerModal] = useState(false)
  const [managerPassword, setManagerPassword] = useState('')
  const [managerError, setManagerError] = useState('')

  const publicLinks = [
    { id: 'home', label: 'Inicio' },
    { id: 'locale', label: 'Restaurante' },
    { id: 'menu', label: 'Menú' }
  ]

  const openManagerAccess = () => {
    console.log('Manager clicked')

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

    console.log('Manager env loaded:', Boolean(expectedPassword))
    console.log('Typed length:', typedPassword.length)
    console.log('Expected length:', expectedPassword.length)

    if (!expectedPassword) {
      setManagerError('Password manager non configurata.')
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
      setManagerError('Contraseña incorrecta')
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
          onClick={openManagerAccess}
        >
          Manager
        </button>
      </header>

      {showManagerModal && (
        <div className="manager-modal-backdrop">
          <div className="manager-modal">
            <p className="eyebrow">Acceso manager</p>
            <h3>Área privada</h3>
            <p>Introduce la contraseña para acceder al panel de gestión.</p>

            <form onSubmit={handleManagerSubmit}>
              <input
                type="password"
                value={managerPassword}
                onChange={(event) => setManagerPassword(event.target.value)}
                placeholder="Contraseña"
                autoFocus
              />

              {managerError && <span className="manager-error">{managerError}</span>}

              <div className="manager-modal-actions">
                <button className="ghost-button" type="button" onClick={closeManagerModal}>
                  Cancelar
                </button>
                <button className="primary-button" type="submit">
                  Entrar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}