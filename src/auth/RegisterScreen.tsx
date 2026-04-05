import { useState } from 'react'
import { registerPasskey } from './webauthn'
import { ApiError } from '../api/client'

interface Props {
  tenantSlug: string
  authorizedUserId: string
  displayName: string
  pin: string
  onRegistered: () => void
}

export default function RegisterScreen({ tenantSlug, authorizedUserId, displayName, pin, onRegistered }: Props) {
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
        else if (err.message === 'verification_failed') setError('Fingerabdruck-Verifizierung fehlgeschlagen.')
        else setError(`Fehler: ${err.message}`)
      } else if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setError('Fingerabdruck-Registrierung abgebrochen.')
      } else {
        setError('Unbekannter Fehler. Bitte erneut versuchen.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.icon}>🔐</div>
        <h2 style={styles.title}>Fingerabdruck registrieren</h2>
        <p style={styles.name}>Hallo, <strong>{displayName}</strong></p>
        <p style={styles.desc}>
          Tippe auf den Button und halte deinen Finger auf den Sensor.
          Danach kannst du dich immer mit deinem Fingerabdruck anmelden.
        </p>

        {error && <p style={styles.error}>{error}</p>}

        <button style={styles.button} onClick={handleRegister} disabled={loading}>
          {loading ? '⏳ Warte auf Fingerabdruck...' : '👆 Fingerabdruck registrieren'}
        </button>
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
  icon: { fontSize: '3.5rem', marginBottom: '0.75rem' },
  title: { fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.5rem' },
  name: { fontSize: '1rem', color: '#444', marginBottom: '1rem' },
  desc: { fontSize: '0.9rem', color: '#65676b', lineHeight: 1.5, marginBottom: '1.5rem' },
  error: { color: '#d93025', fontSize: '0.85rem', marginBottom: '0.75rem' },
  button: {
    padding: '1rem',
    background: '#1a73e8',
    color: '#fff',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '1rem',
    fontWeight: 600,
    width: '100%',
  },
}
