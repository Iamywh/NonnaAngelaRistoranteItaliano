import React, { useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { useLanguage } from '../i18n/LanguageContext.jsx'

export default function AccountAccess({ session, staff, privatePage, onSignOut, authBusy }) {
  const { t } = useLanguage()
  const [registering, setRegistering] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const signUp = registering && !privatePage

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const credentials = { email: email.trim(), password }
      const result = signUp
        ? await supabase.auth.signUp({
          ...credentials,
          options: { emailRedirectTo: window.location.origin + '/account' }
        })
        : await supabase.auth.signInWithPassword(credentials)
      if (result.error) throw result.error
      if (signUp && !result.data?.session) setMessage(t('account.confirm'))
    } catch {
      setError(t(signUp ? 'account.registerError' : 'account.loginError'))
    } finally {
      setBusy(false)
      setPassword('')
    }
  }

  return (
    <section className="admin-page">
      <div className="dashboard-panel" style={{ maxWidth: 480 }}>
        <h2>{t(privatePage ? 'account.staffLogin' : 'account.title')}</h2>
        {session === undefined ? <p role="status">{t('account.checking')}</p> : session ? (
          <>
            <p>{t(staff ? 'account.staff' : 'account.visitor')} · {session.user.email}</p>
            <button className="ghost-button" type="button" onClick={onSignOut} disabled={authBusy}>
              {t('account.logout')}
            </button>
          </>
        ) : (
          <>
            <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
              <label>{t('account.email')}
                <input type="email" autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} required />
              </label>
              <label>{t('account.password')}
                <input type="password" autoComplete={signUp ? 'new-password' : 'current-password'}
                  value={password} onChange={event => setPassword(event.target.value)} required />
              </label>
              <button className="primary-button" type="submit" disabled={busy}>
                {t(busy ? 'account.wait' : signUp ? 'account.register' : 'account.login')}
              </button>
            </form>
            {!privatePage && (
              <button className="ghost-button" type="button" disabled={busy} onClick={() => {
                setRegistering(value => !value)
                setError('')
                setMessage('')
              }}>
                {t(signUp ? 'account.login' : 'account.register')}
              </button>
            )}
            {error && <p className="manager-error" role="alert">{error}</p>}
            {message && <p role="status">{message}</p>}
          </>
        )}
      </div>
    </section>
  )
}
