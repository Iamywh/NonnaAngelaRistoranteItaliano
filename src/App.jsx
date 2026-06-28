import React, { useEffect, useState } from 'react'
import Navbar from './components/Navbar.jsx'
import Home from './pages/Home.jsx'
import Locale from './pages/Locale.jsx'
import Menu from './pages/Menu.jsx'
import Bebidas from './pages/Bebidas.jsx'
import AdminDashboard from './pages/admin/AdminDashboard.jsx'
import FoodDashboard from './pages/admin/FoodDashboard.jsx'
import BeverageDashboard from './pages/admin/BeverageDashboard.jsx'
import FBControl from './pages/admin/FBControl.jsx'
import Orders from './pages/admin/Orders.jsx'
import Invoices from './pages/admin/Invoices.jsx'
import ReservationsDashboard from './pages/admin/ReservationsDashboard.jsx'
import MusicManager from './pages/admin/MusicManager.jsx'
import VirtualAgent from './components/VirtualAgent.jsx'
import Footer from './components/Footer.jsx'

const pagePaths = {
  home: '/',
  locale: '/restaurante',
  menu: '/menu',
  bebidas: '/bebidas'
}

function getPageFromPath(pathname) {
  const entry = Object.entries(pagePaths).find(([, path]) => path === pathname)

  return entry?.[0] || 'home'
}

export default function App() {
  const [currentPage, setCurrentPage] = useState(() => getPageFromPath(window.location.pathname))
  const [isAdminMode, setIsAdminMode] = useState(false)

  const navigateToPage = (page) => {
    setCurrentPage(page)

    const nextPath = pagePaths[page] || '/'

    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, '', nextPath)
    }
  }

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPage(getPageFromPath(window.location.pathname))
    }

    window.addEventListener('popstate', handlePopState)

    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const renderPage = () => {
    if (currentPage === 'locale') return <Locale />
    if (currentPage === 'menu') return <Menu setCurrentPage={navigateToPage} />
    if (currentPage === 'bebidas') return <Bebidas />
    if (currentPage === 'admin') return <AdminDashboard setCurrentPage={setCurrentPage} />
    if (currentPage === 'admin-food') return <FoodDashboard setCurrentPage={setCurrentPage} />
    if (currentPage === 'admin-beverage') return <BeverageDashboard setCurrentPage={setCurrentPage} />
    if (currentPage === 'admin-fb') return <FBControl setCurrentPage={setCurrentPage} />
    if (currentPage === 'admin-orders') return <Orders setCurrentPage={setCurrentPage} />
    if (currentPage === 'admin-invoices') return <Invoices setCurrentPage={setCurrentPage} />
    if (currentPage === 'admin-reservations') return <ReservationsDashboard setCurrentPage={setCurrentPage} />
    if (currentPage === 'admin-music') return <MusicManager setCurrentPage={setCurrentPage} />
    return <Home setCurrentPage={navigateToPage} />
  }

  return (
    <div className="app-shell">
      <Navbar
        currentPage={currentPage}
        setCurrentPage={navigateToPage}
        isAdminMode={isAdminMode}
        setIsAdminMode={setIsAdminMode}
      />

      <main className="main-content">{renderPage()}</main>

      <Footer setCurrentPage={navigateToPage} />
      <VirtualAgent />
    </div>
  )
}
