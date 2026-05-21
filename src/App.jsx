import React, { useState } from 'react'
import Navbar from './components/Navbar.jsx'
import Home from './pages/Home.jsx'
import Locale from './pages/Locale.jsx'
import Menu from './pages/Menu.jsx'
import AdminDashboard from './pages/admin/AdminDashboard.jsx'

export default function App() {
  const [currentPage, setCurrentPage] = useState('home')
  const [isAdminMode, setIsAdminMode] = useState(false)

  const renderPage = () => {
    if (currentPage === 'locale') return <Locale />
    if (currentPage === 'menu') return <Menu />
    if (currentPage === 'admin') return <AdminDashboard />
    return <Home />
  }

  return (
    <div className="app-shell">
      <Navbar
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        isAdminMode={isAdminMode}
        setIsAdminMode={setIsAdminMode}
      />

      <main className="main-content">{renderPage()}</main>
    </div>
  )
}