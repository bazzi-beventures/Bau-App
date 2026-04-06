import { useState } from 'react'
import { authenticatePasskey } from './webauthn'
import { loginWithPin } from '../api/auth'
import { ApiError } from '../api/client'
import { TenantLogo } from '../App'

interface Props {
  logoUrl: string
  onLoggedIn: () => void
}

export default function LoginScreen({ logoUrl, onLoggedIn }: Props) {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPin, setShowPin] = useState(false)
  const [pin, setPin] = useState('')

  const tenantSlug = localStorage.getItem('tenantSlug') ?? ''
  const authorizedUserId = localStorage.getItem('authorizedUserId') ?? ''
  const displayName = localStorage.getItem('displayName') ?? ''

  async function handleLogin() {
    setError('')
    setLoading(true)
    try {
      await authenticatePasskey(tenantSlug, authorizedUserId)
      onLoggedIn()
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) setError('Anmeldung fehlgeschlagen.')
        else setError(`Fehler: ${err.message}`)
      } else if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setError('Abgebrochen.')
      } else {
        setError('Verbindungsfehler.')
      }
    } finally {
      setLoading(false)
    }
  }

  async function handlePinLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await loginWithPin(tenantSlug, authorizedUserId, pin)
      onLoggedIn()
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401 || err.message === 'invalid_pin') setError('Falsche PIN oder PIN abgelaufen.')
        else setError(`Fehler: ${err.message}`)
      } else {
        setError('Verbindungsfehler.')
      }
    } finally {
      setLoading(false)
    }
  }

  function handleNewDevice() {
    localStorage.removeItem('authorizedUserId')
    localStorage.removeItem('displayName')
    window.location.reload()
  }

  if (showPin) {
    return (
      <div className="auth-screen">
        <TenantLogo logoUrl={logoUrl} />
        <div className="auth-title">Mit PIN<br />anmelden</div>
        <div className="auth-sub">Gib deinen 6-stelligen PIN ein.</div>

        {error && <p className="error-msg">{error}</p>}

        <form onSubmit={handlePinLogin}>
          <div className="field">
            <label className="field-label">PIN</label>
            <input
              className="input input-pin"
              type="tel"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              autoFocus
              required
            />
          </div>

          <button className="btn-primary" type="submit" disabled={loading || pin.length !== 6}>
            {loading ? 'Anmelden…' : 'Anmelden →'}
          </button>
        </form>

        <button className="btn-secondary" onClick={() => { setShowPin(false); setError('') }}>
          Zurück zur Biometrie
        </button>
      </div>
    )
  }

  return (
    <div className="auth-screen">
      <TenantLogo logoUrl={logoUrl} />
      <div className="auth-title">Willkommen zurück{displayName ? `,\n${displayName.split(' ')[0]}` : ''}</div>
      <div className="auth-sub">Bitte melde dich an, um fortzufahren.</div>

      {error && <p className="error-msg">{error}</p>}

      <button className="btn-fingerprint" onClick={handleLogin} disabled={loading}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="2" y="3" width="20" height="18" rx="3"/>
          <circle cx="12" cy="10" r="3"/>
          <path d="M7 20c0-2.76 2.24-5 5-5s5 2.24 5 5"/>
          <path d="M17 3v2M7 3v2"/>
        </svg>
        {loading ? 'Warte auf Biometrie…' : 'Mit Face ID / Fingerabdruck anmelden'}
      </button>

      <button className="btn-secondary" onClick={() => { setShowPin(true); setError('') }}>
        Mit PIN anmelden
      </button>

      <button className="btn-secondary" onClick={handleNewDevice}>
        Anderes Gerät / Neuer Mitarbeiter
      </button>

      <p className="auth-footer">Alle Daten verschlüsselt übertragen</p>
    </div>
  )
}
