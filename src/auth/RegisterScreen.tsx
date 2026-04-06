import { useState } from 'react'
import { registerPasskey } from './webauthn'
import { ApiError } from '../api/client'
import { TenantLogo } from '../App'

interface Props {
  tenantSlug: string
  authorizedUserId: string
  displayName: string
  pin: string
  logoUrl: string
  onRegistered: () => void
}

export default function RegisterScreen({ tenantSlug, authorizedUserId, displayName, pin, logoUrl, onRegistered }: Props) {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleRegister() {
    setError('')
    setLoading(true)
    try {
      await registerPasskey(tenantSlug, authorizedUserId, pin, navigator.userAgent.slice(0, 50))
      onRegistered()
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.message === 'invalid_pin') setError('PIN ungültig oder abgelaufen.')
        else if (err.message === 'verification_failed') setError('Biometrie-Verifizierung fehlgeschlagen.')
        else setError(`Fehler: ${err.message}`)
      } else if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setError('Biometrie-Registrierung abgebrochen.')
      } else {
        setError('Unbekannter Fehler. Bitte erneut versuchen.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-screen">
      <TenantLogo logoUrl={logoUrl} />
      <div className="auth-title">Biometrie<br />registrieren</div>
      <div className="auth-sub">
        Hallo {displayName.split(' ')[0]}! Registriere Face ID oder Fingerabdruck für zukünftige Anmeldungen.
      </div>

      {error && <p className="error-msg">{error}</p>}

      <button className="btn-fingerprint" onClick={handleRegister} disabled={loading}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="2" y="3" width="20" height="18" rx="3"/>
          <circle cx="12" cy="10" r="3"/>
          <path d="M7 20c0-2.76 2.24-5 5-5s5 2.24 5 5"/>
          <path d="M17 3v2M7 3v2"/>
        </svg>
        {loading ? 'Warte auf Biometrie…' : 'Biometrie jetzt registrieren'}
      </button>

      <p className="auth-footer" style={{ marginTop: 16 }}>
        Tippe auf den Button und bestätige mit Face ID oder Fingerabdruck.
      </p>
    </div>
  )
}
