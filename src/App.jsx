import React, { useState } from 'react'
import Navbar from './components/Navbar.jsx'
import Home from './pages/Home.jsx'
import Locale from './pages/Locale.jsx'
import Menu from './pages/Menu.jsx'
import AdminDashboard from './pages/admin/AdminDashboard.jsx'
import FoodDashboard from './pages/admin/FoodDashboard.jsx'
import BeverageDashboard from './pages/admin/BeverageDashboard.jsx'
import FBControl from './pages/admin/FBControl.jsx'
import Orders from './pages/admin/Orders.jsx'
import Invoices from './pages/admin/Invoices.jsx'
import VirtualAgent from './components/VirtualAgent.jsx'

export default function App() {
  const [currentPage, setCurrentPage] = useState('home')
  const [isAdminMode, setIsAdminMode] = useState(false)

  const renderPage = () => {
    if (currentPage === 'locale') return <Locale />
    if (currentPage === 'menu') return <Menu />
    if (currentPage === 'admin') return <AdminDashboard setCurrentPage={setCurrentPage} />
    if (currentPage === 'admin-food') return <FoodDashboard setCurrentPage={setCurrentPage} />
    if (currentPage === 'admin-beverage') return <BeverageDashboard setCurrentPage={setCurrentPage} />
    if (currentPage === 'admin-fb') return <FBControl setCurrentPage={setCurrentPage} />
    if (currentPage === 'admin-orders') return <Orders setCurrentPage={setCurrentPage} />
    if (currentPage === 'admin-invoices') return <Invoices setCurrentPage={setCurrentPage} />
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

      <VirtualAgent />
    </div>
  )
}