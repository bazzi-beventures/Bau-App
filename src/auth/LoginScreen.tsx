import { useState } from 'react'
import { authenticatePasskey } from './webauthn'
import { ApiError } from '../api/client'
import { TenantLogo } from '../App'

interface Props {
  logoUrl: string
  onLoggedIn: () => void
}

export default function LoginScreen({ logoUrl, onLoggedIn }: Props) {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

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

  function handleNewDevice() {
    localStorage.removeItem('authorizedUserId')
    localStorage.removeItem('displayName')
    window.location.reload()
  }

  return (
    <div className="auth-screen">
      <TenantLogo logoUrl={logoUrl} />
      <div className="auth-title">Willkommen zurück{displayName ? `,\n${displayName.split(' ')[0]}` : ''}</div>
      <div className="auth-sub">Bitte melde dich an, um fortzufahren.</div>

      {error && <p className="error-msg">{error}</p>}

      <button className="btn-fingerprint" onClick={handleLogin} disabled={loading}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" opacity="0.3"/>
          <path d="M12 6c-3.31 0-6 2.69-6 6"/>
          <path d="M12 8c-2.21 0-4 1.79-4 4"/>
          <path d="M12 10c-1.1 0-2 .9-2 2"/>
          <circle cx="12" cy="12" r="1"/>
          <path d="M12 14v4"/>
          <path d="M10 16h4"/>
        </svg>
        {loading ? 'Warte auf Fingerabdruck…' : 'Mit Fingerabdruck anmelden'}
      </button>

      <button className="btn-secondary" onClick={handleNewDevice}>
        Anderes Gerät / Neuer Mitarbeiter
      </button>

      <p className="auth-footer">Alle Daten verschlüsselt übertragen</p>
    </div>
  )
}
