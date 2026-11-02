import React, { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient.js'
import DailyRegister from './DailyRegister.jsx'
import ExpensesRegister from './ExpensesRegister.jsx'
import MonthlyInventory from './MonthlyInventory.jsx'
import FinancialDashboard from './FinancialDashboard.jsx'
import { HistoryRegister, MonthlyGoals } from './HistoryTargets.jsx'
import Forecasting from './Forecasting.jsx'
import BreakEven from './BreakEven.jsx'
import MonthlyClose from './MonthlyClose.jsx'
import AnalyticsReports from './AnalyticsReports.jsx'

export default function Analytics() {
  const [session, setSession] = useState(null)
  const [access, setAccess] = useState('checking')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('dashboard')

  useEffect(() => {
    let active = true
    const check = async (nextSession) => {
      if (!active) return
      setSession(nextSession)
      setAccess(nextSession ? 'checking' : 'signed-out')
      if (!nextSession) return
      const { data, error: roleError } = await supabase
        .from('analytics_user_roles')
        .select('role,is_active')
        .eq('user_id', nextSession.user.id)
        .maybeSingle()
      if (!active) return
      if (roleError) {
        setError('No se han podido verificar los permisos. Inténtalo de nuevo.')
        setAccess('error')
      } else {
        setError('')
        setAccess(data?.is_active && ['owner', 'admin'].includes(data.role) ? 'allowed' : 'denied')
      }
    }
    supabase.auth.getSession().then(({ data, error: authError }) => {
      if (!active) return
      if (authError) { setError(authError.message); setAccess('error'); return }
      check(data.session)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      // Defer Supabase queries until after the auth callback has finished.
      setTimeout(() => { if (active) check(nextSession) }, 0)
    })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [])

  const signIn = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (signInError) setError('No se ha podido iniciar sesión. Comprueba tus credenciales.')
    setPassword('')
    setBusy(false)
  }

  const signOut = async () => {
    setBusy(true)
    await supabase.auth.signOut()
    setBusy(false)
  }

  return (
    <section className="admin-page">
      <div className="admin-header">
        <div>
          <p className="eyebrow">Control interno · Acceso privado</p>
          <h2>Analytics</h2>
          <p>Análisis económico y rendimiento del restaurante</p>
        </div>
      </div>
      {access === 'checking' && <div className="dashboard-panel"><p>Verificando acceso…</p></div>}
      {access === 'signed-out' && (
        <div className="dashboard-panel" style={{ maxWidth: 480 }}>
          <h3>Acceso a Analytics</h3>
          <p>Introduce las credenciales de tu cuenta autorizada de Supabase.</p>
          <form onSubmit={signIn} style={{ display: 'grid', gap: 12 }}>
            <label>Correo electrónico<input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></label>
            <label>Contraseña<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label>
            {error && <p role="alert" className="manager-error">{error}</p>}
            <button className="primary-button" disabled={busy} type="submit">{busy ? 'Accediendo…' : 'Entrar'}</button>
          </form>
        </div>
      )}
      {access === 'denied' && (
        <div className="dashboard-panel">
          <h3>Acceso no autorizado</h3>
          <p>La cuenta está autenticada, pero no tiene permiso para consultar Analytics.</p>
          <button className="ghost-button" onClick={signOut} disabled={busy}>Cerrar sesión</button>
        </div>
      )}
      {access === 'error' && (
        <div className="dashboard-panel">
          <p role="alert">{error || 'No se ha podido verificar el acceso.'}</p>
          <button className="ghost-button" onClick={signOut} disabled={busy}>Cerrar sesión y volver a intentar</button>
        </div>
      )}
      {access === 'allowed' && (
        <div className="dashboard-panel">
          <p className="eyebrow">Acceso autorizado</p>
          <h3>Control financiero</h3>
          <p>Ingresos, comensales y gastos del restaurante.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
            <button type="button" className={activeTab === 'dashboard' ? 'primary-button' : 'ghost-button'} onClick={() => setActiveTab('dashboard')}>Dashboard</button>
            <button type="button" className={activeTab === 'daily' ? 'primary-button' : 'ghost-button'} onClick={() => setActiveTab('daily')}>Registro diario</button>
            <button type="button" className={activeTab === 'expenses' ? 'primary-button' : 'ghost-button'} onClick={() => setActiveTab('expenses')}>Gastos</button>
            <button type="button" className={activeTab === 'inventory' ? 'primary-button' : 'ghost-button'} onClick={() => setActiveTab('inventory')}>Inventario</button>
            <button type="button" className={activeTab === 'history' ? 'primary-button' : 'ghost-button'} onClick={() => setActiveTab('history')}>Histórico</button>
            <button type="button" className={activeTab === 'goals' ? 'primary-button' : 'ghost-button'} onClick={() => setActiveTab('goals')}>Objetivos</button>
            <button type="button" className={activeTab === 'forecast' ? 'primary-button' : 'ghost-button'} onClick={() => setActiveTab('forecast')}>Forecasting</button>
            <button type="button" className={activeTab === 'break-even' ? 'primary-button' : 'ghost-button'} onClick={() => setActiveTab('break-even')}>Break-even</button>
            <button type="button" className={activeTab === 'closing' ? 'primary-button' : 'ghost-button'} onClick={() => setActiveTab('closing')}>Cierre mensual</button>
            <button type="button" className={activeTab === 'reports' ? 'primary-button' : 'ghost-button'} onClick={() => setActiveTab('reports')}>Reportes</button>
          </div>
          {activeTab === 'dashboard' ? <FinancialDashboard /> : activeTab === 'daily' ? <DailyRegister /> : activeTab === 'expenses' ? <ExpensesRegister /> : activeTab === 'inventory' ? <MonthlyInventory /> : activeTab === 'history' ? <HistoryRegister /> : activeTab === 'goals' ? <MonthlyGoals /> : activeTab === 'forecast' ? <Forecasting /> : activeTab === 'break-even' ? <BreakEven /> : activeTab === 'closing' ? <MonthlyClose /> : <AnalyticsReports />}
          <button className="ghost-button" onClick={signOut} disabled={busy}>Cerrar sesión</button>
        </div>
      )}
    </section>
  )
}
