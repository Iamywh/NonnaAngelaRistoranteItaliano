import React, { useEffect, useState } from 'react'
import Navbar from './components/Navbar.jsx'
import Home from './pages/Home.jsx'
import Locale from './pages/Locale.jsx'
import LoyaltyCard from './pages/LoyaltyCard.jsx'
import Menu from './pages/Menu.jsx'
import Bebidas from './pages/Bebidas.jsx'
import AdminDashboard from './pages/admin/AdminDashboard.jsx'
import FoodDashboard from './pages/admin/FoodDashboard.jsx'
import BeverageDashboard from './pages/admin/BeverageDashboard.jsx'
import FBControl from './pages/admin/FBControl.jsx'
import Orders from './pages/admin/Orders.jsx'
import Invoices from './pages/admin/Invoices.jsx'
import ReservationsDashboard from './pages/admin/ReservationsDashboard.jsx'
import AccountAccess from './pages/AccountAccess.jsx'
import { supabase } from './lib/supabaseClient.js'
import MusicManager from './pages/admin/MusicManager.jsx'
import ManualOperativo from './pages/admin/ManualOperativo.jsx'
import Analytics from './pages/admin/Analytics.jsx'
import VirtualAgent from './components/VirtualAgent.jsx'
import Footer from './components/Footer.jsx'
import CookieConsent from './components/CookieConsent.jsx'
import WelcomePopup from './components/WelcomePopup.jsx'
import { LanguageProvider } from './i18n/LanguageContext.jsx'

const pagePaths = {
  home: '/',
  account: '/account',
  locale: '/restaurante',
  famiglia: '/famiglia',
  menu: '/menu',
  bebidas: '/bebidas',
  admin: '/manager',
  'admin-food': '/manager/food',
  'admin-beverage': '/manager/beverage',
  'admin-fb': '/manager/fb-control',
  'admin-orders': '/manager/orders',
  'admin-invoices': '/manager/invoices',
  'admin-reservations': '/manager/reservas',
  'admin-music': '/manager/music',
  'admin-manual': '/manager/manual-operativo',
  'admin-analytics': '/manager/analytics'
}

const staffPagePermissions = {
  admin: 'staff',
  'admin-orders': 'orders',
  'admin-beverage': 'beverage',
  'admin-reservations': 'reservations',
  'admin-food': 'backoffice',
  'admin-fb': 'backoffice',
  'admin-invoices': 'backoffice',
  'admin-music': 'backoffice',
  'admin-manual': 'backoffice',
  'admin-analytics': 'backoffice'
}

function normalizePathname(pathname) {
  if (pathname !== '/' && pathname.endsWith('/')) return pathname.slice(0, -1)
  return pathname
}

function getPageFromPath(pathname) {
  const normalizedPathname = normalizePathname(pathname)
  const entry = Object.entries(pagePaths).find(([, path]) => path === normalizedPathname)

  return entry?.[0] || 'home'
}

export default function App() {
  const [currentPage, setCurrentPage] = useState(() => getPageFromPath(window.location.pathname))
  const [session, setSession] = useState(undefined)
  const [staffResult, setStaffResult] = useState(null)
  const [authBusy, setAuthBusy] = useState(false)
  const [authError, setAuthError] = useState(false)
  const userId = session?.user?.id
  const staffAccess = userId && staffResult?.userId === userId ? staffResult : null
  const permissions = staffAccess?.permissions
  const isStaff = Boolean(permissions?.backoffice || permissions?.orders ||
    permissions?.beverage || permissions?.reservations)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!userId) {
      setStaffResult(null)
      return
    }

    let active = true
    async function loadPermissions() {
      try {
        const { data, error } = await supabase.rpc('staff_portal_access')
        if (error) throw error
        if (active) setStaffResult({ userId, permissions: data || {} })
      } catch {
        if (active) setStaffResult({ userId, error: true })
      }
    }
    loadPermissions()
    return () => { active = false }
  }, [userId])

  const signOut = async () => {
    setAuthBusy(true)
    setAuthError(false)
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' })
      if (error) throw error
    } catch {
      setAuthError(true)
    } finally {
      setAuthBusy(false)
    }
  }

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
    const accountProps = { session, staff: isStaff, onSignOut: signOut, authBusy }
    if (currentPage === 'account') return <AccountAccess {...accountProps} />

    const permission = staffPagePermissions[currentPage]
    if (permission) {
      if (!session) return <AccountAccess privatePage {...accountProps} />
      if (!staffAccess) return <p className="admin-page" role="status">Verificando acceso…</p>
      if (staffAccess.error || (permission === 'staff' ? !isStaff : permissions?.[permission] !== true)) {
        return (
          <section className="admin-page">
            <p role="alert">{staffAccess.error
              ? 'No se han podido verificar los permisos. Recarga la página.'
              : 'Tu cuenta no tiene acceso a esta sección.'}</p>
            <button className="ghost-button" type="button" onClick={() => navigateToPage(isStaff ? 'admin' : 'account')}>
              {isStaff ? 'Volver a Manager' : 'Mi cuenta'}
            </button>
          </section>
        )
      }
    }

    if (currentPage === 'admin-reservations') {
      return <ReservationsDashboard key={userId} onBack={() => navigateToPage('admin')} onSignOut={signOut} authBusy={authBusy} />
    }

    if (currentPage === 'admin-beverage') {
      return <BeverageDashboard key={userId} userId={userId} onBack={() => navigateToPage('admin')} onSignOut={signOut} authBusy={authBusy} />
    }

    if (currentPage === 'locale') return <Locale />
    if (currentPage === 'famiglia') return <LoyaltyCard onOpenAccount={() => navigateToPage('account')} />
    if (currentPage === 'menu') return <Menu setCurrentPage={navigateToPage} />
    if (currentPage === 'bebidas') return <Bebidas />
    if (currentPage === 'admin') return <AdminDashboard setCurrentPage={navigateToPage} permissions={permissions} />
    if (currentPage === 'admin-food') return <FoodDashboard setCurrentPage={navigateToPage} />
    if (currentPage === 'admin-fb') return <FBControl setCurrentPage={navigateToPage} />
    if (currentPage === 'admin-orders') return <Orders key={userId} setCurrentPage={navigateToPage} />
    if (currentPage === 'admin-invoices') return <Invoices setCurrentPage={navigateToPage} />
    if (currentPage === 'admin-music') return <MusicManager setCurrentPage={navigateToPage} />
    if (currentPage === 'admin-manual') return <ManualOperativo setCurrentPage={navigateToPage} />
    if (currentPage === 'admin-analytics') return <Analytics />
    return <Home setCurrentPage={navigateToPage} />
  }

  return (
    <LanguageProvider>
      <div className="app-shell">
        <Navbar
          currentPage={currentPage}
          setCurrentPage={navigateToPage}
          isStaff={isStaff}
          signedIn={Boolean(session)}
        />

        <main className="main-content">
          {authError && <p className="manager-error" role="alert">No se ha podido cerrar la sesión. Inténtalo de nuevo.</p>}
          {renderPage()}
        </main>

        <Footer setCurrentPage={navigateToPage} />
        <VirtualAgent />
        <WelcomePopup currentPage={currentPage} setCurrentPage={navigateToPage} />
        <CookieConsent />
      </div>
    </LanguageProvider>
  )
}
