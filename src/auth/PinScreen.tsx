import { useState } from 'react'
import { lookupUser, validatePin } from '../api/auth'
import { ApiError } from '../api/client'

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
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.logo}>🏗️</div>
        <h1 style={styles.title}>Bau-App</h1>
        <p style={styles.subtitle}>Erstmalige Anmeldung</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>Firmen-Kürzel</label>
          <input
            style={styles.input}
            type="text"
            value={tenantSlug}
            onChange={e => setTenantSlug(e.target.value)}
            placeholder="z.B. gehlhaar"
            autoCapitalize="none"
            required
          />

          <label style={styles.label}>Dein Name</label>
          <input
            style={styles.input}
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="z.B. Hans Muster"
            required
          />

          <label style={styles.label}>PIN (vom Admin erhalten)</label>
          <input
            style={{ ...styles.input, letterSpacing: '0.3em', textAlign: 'center', fontSize: '1.4rem' }}
            type="tel"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            value={pin}
            onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            required
          />

          {error && <p style={styles.error}>{error}</p>}

          <button style={styles.button} type="submit" disabled={loading}>
            {loading ? 'Prüfe...' : 'Weiter →'}
          </button>
        </form>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100dvh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1rem',
    background: '#f0f2f5',
  },
  card: {
    background: '#fff',
    borderRadius: '1rem',
    padding: '2rem 1.5rem',
    width: '100%',
    maxWidth: '380px',
    boxShadow: '0 2px 12px rgba(0,0,0,0.1)',
    textAlign: 'center',
  },
  logo: { fontSize: '3rem', marginBottom: '0.5rem' },
  title: { fontSize: '1.8rem', fontWeight: 700, color: '#1a73e8' },
  subtitle: { color: '#65676b', marginBottom: '1.5rem', fontSize: '0.9rem' },
  form: { display: 'flex', flexDirection: 'column', gap: '0.5rem', textAlign: 'left' },
  label: { fontSize: '0.85rem', fontWeight: 600, color: '#444', marginTop: '0.5rem' },
  input: {
    padding: '0.75rem 1rem',
    border: '1.5px solid #ddd',
    borderRadius: '0.5rem',
    fontSize: '1rem',
    outline: 'none',
    width: '100%',
  },
  error: { color: '#d93025', fontSize: '0.85rem', marginTop: '0.25rem' },
  button: {
    marginTop: '1rem',
    padding: '0.9rem',
    background: '#1a73e8',
    color: '#fff',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '1rem',
    fontWeight: 600,
    width: '100%',
  },
}
