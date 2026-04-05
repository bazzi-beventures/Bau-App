import { useState } from 'react'
import { lookupUser, validatePin } from '../api/auth'
import { ApiError } from '../api/client'
import { LogoSvg } from '../App'

interface Props {
  onPinValid: (tenantSlug: string, authorizedUserId: string, displayName: string, pin: string) => void
}

export default function PinScreen({ onPinValid }: Props) {
  const [tenantSlug, setTenantSlug] = useState(() => localStorage.getItem('tenantSlug') ?? '')
  const [name, setName] = useState(() => localStorage.getItem('displayName') ?? '')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const user = await lookupUser(tenantSlug.trim(), name.trim())
      await validatePin(tenantSlug.trim(), user.authorized_user_id, pin.trim())
      localStorage.setItem('tenantSlug', tenantSlug.trim())
      localStorage.setItem('displayName', user.display_name)
      localStorage.setItem('authorizedUserId', user.authorized_user_id)
      onPinValid(tenantSlug.trim(), user.authorized_user_id, user.display_name, pin.trim())
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 404) setError('Name nicht gefunden. Bitte Admin kontaktieren.')
        else if (err.message === 'invalid_pin') setError('Falsche PIN oder PIN abgelaufen.')
        else setError(`Fehler: ${err.message}`)
      } else {
        setError('Verbindungsfehler. Bitte erneut versuchen.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-logo">
        <LogoSvg />
      </div>
      <div className="auth-title">Willkommen zur<br />Bau-App</div>
      <div className="auth-sub">Erstmalige Anmeldung mit PIN.</div>

      <form onSubmit={handleSubmit}>
        <div className="field">
          <label className="field-label">Firmen-Kürzel</label>
          <input
            className="input"
            type="text"
            value={tenantSlug}
            onChange={e => setTenantSlug(e.target.value)}
            placeholder="z.B. gehlhaar"
            autoCapitalize="none"
            autoCorrect="off"
            required
          />
        </div>

        <div className="field">
          <label className="field-label">Dein Name</label>
          <input
            className="input"
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="z.B. Hans Muster"
            required
          />
        </div>

        <div className="field">
          <label className="field-label">PIN (vom Admin erhalten)</label>
          <input
            className="input input-pin"
            type="tel"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            value={pin}
            onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            required
          />
        </div>

        {error && <p className="error-msg">{error}</p>}

        <button className="btn-primary" type="submit" disabled={loading}>
          {loading ? 'Prüfe…' : 'Weiter →'}
        </button>
      </form>

      <p className="auth-footer">Alle Daten verschlüsselt übertragen</p>
    </div>
  )
}
