import React, { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient.js'

export default function StaffModuleAccess({ permissionRpc, title, deniedMessage, children }) {
  const [userId, setUserId] = useState(undefined)
  const [access, setAccess] = useState(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!userId) {
      setAccess(null)
      return
    }

    let active = true
    const verifyAccess = async () => {
      try {
        const { data, error: accessError } = await supabase.rpc(permissionRpc)
        if (accessError) throw accessError
        if (active) setAccess({ userId, status: data === true ? 'allowed' : 'denied' })
      } catch {
        if (active) setAccess({ userId, status: 'error' })
      }
    }
    verifyAccess()
    return () => { active = false }
  }, [userId, permissionRpc])

  const signIn = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (authError) throw authError
    } catch {
      setError('No se ha podido iniciar sesión. Comprueba tus credenciales e inténtalo de nuevo.')
    } finally {
      setPassword('')
      setBusy(false)
    }
  }

  const signOut = async () => {
    setBusy(true)
    setError('')
    try {
      const { error: authError } = await supabase.auth.signOut({ scope: 'local' })
      if (authError) throw authError
    } catch {
      setError('No se ha podido cerrar la sesión. Inténtalo de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  const status = access?.userId === userId ? access?.status : null
  if (status === 'allowed') {
    return (
      <>
        {error && <p className="manager-error" role="alert">{error}</p>}
        {children({ userId, onSignOut: signOut, authBusy: busy })}
      </>
    )
  }

  return (
    <section className="admin-page">
      <div className="dashboard-panel" style={{ maxWidth: 480 }}>
        <h2>{title}</h2>
        {userId === null ? (
          <form onSubmit={signIn} style={{ display: 'grid', gap: 12 }}>
            <label>Correo electrónico
              <input type="email" autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} required />
            </label>
            <label>Contraseña
              <input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required />
            </label>
            <button className="primary-button" type="submit" disabled={busy}>
              {busy ? 'Accediendo…' : 'Entrar'}
            </button>
          </form>
        ) : status ? (
          <>
            <p role="alert">
              {status === 'denied'
                ? deniedMessage
                : 'No se han podido verificar los permisos. Recarga la página o vuelve a iniciar sesión.'}
            </p>
            <button className="ghost-button" type="button" onClick={signOut} disabled={busy}>
              Usar otra cuenta
            </button>
          </>
        ) : <p role="status">Verificando acceso…</p>}
        {error && <p className="manager-error" role="alert">{error}</p>}
      </div>
    </section>
  )
}
