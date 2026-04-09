import { useState } from 'react'
import { loginWithPassword } from '../api/admin'
import { ApiError } from '../api/client'
import { TenantLogo } from '../App'

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  )
}

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: 16, height: 16, animation: 'spin 0.8s linear infinite', display: 'inline-block', verticalAlign: 'middle', marginRight: 6 }}>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
    </svg>
  )
}

interface Props {
  logoUrl: string
  onLoggedIn: () => void
}

export default function PinScreen({ logoUrl, onLoggedIn }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !password) return
    setError('')
    setLoading(true)
    try {
      const { tenant_slug } = await loginWithPassword(email, password)
      localStorage.setItem('tenantSlug', tenant_slug)
      onLoggedIn()
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) setError('E-Mail oder Passwort falsch.')
        else if (err.status === 429) setError('Zu viele Versuche. Bitte warte 15 Minuten.')
        else setError(`Fehler: ${err.message}`)
      } else {
        setError('Verbindungsfehler.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-screen">
      <TenantLogo logoUrl={logoUrl} />
      <div className="auth-title">Willkommen beim<br />KI Assistent</div>
      <div className="auth-sub">Melde dich mit deinen Zugangsdaten an.</div>

      <form onSubmit={handleSubmit} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>E-Mail</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="name@firma.ch"
            autoComplete="email"
            required
            style={{
              background: 'var(--surface, #1a1f2e)',
              border: '1px solid var(--border, #2a3148)',
              borderRadius: 10,
              padding: '12px 14px',
              fontSize: 15,
              color: 'var(--text)',
              outline: 'none',
              width: '100%',
              boxSizing: 'border-box',
            }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Passwort</label>
          <div style={{ position: 'relative' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
              style={{
                background: 'var(--surface, #1a1f2e)',
                border: '1px solid var(--border, #2a3148)',
                borderRadius: 10,
                padding: '12px 44px 12px 14px',
                fontSize: 15,
                color: 'var(--text)',
                outline: 'none',
                width: '100%',
                boxSizing: 'border-box',
              }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(p => !p)}
              style={{
                position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--muted)', padding: 0, display: 'flex', alignItems: 'center',
              }}
              tabIndex={-1}
              aria-label={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
            >
              <EyeIcon open={showPassword} />
            </button>
          </div>
        </div>

        {error && <p className="error-msg">{error}</p>}

        <button type="submit" className="btn-fingerprint" disabled={loading || !email || !password}>
          {loading ? <><Spinner />Anmelden…</> : 'Anmelden'}
        </button>
      </form>

      <p className="auth-footer">Alle Daten verschlüsselt übertragen</p>
    </div>
  )
}
