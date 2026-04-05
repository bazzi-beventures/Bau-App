import { useState } from 'react'
import { authenticatePasskey } from './webauthn'
import { ApiError } from '../api/client'

interface Props {
  onLoggedIn: () => void
}

export default function LoginScreen({ onLoggedIn }: Props) {
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
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.icon}>🏗️</div>
        <h1 style={styles.appName}>Bau-App</h1>
        {displayName && <p style={styles.greeting}>Hallo, <strong>{displayName}</strong></p>}

        {error && <p style={styles.error}>{error}</p>}

        <button style={styles.button} onClick={handleLogin} disabled={loading}>
          {loading ? '⏳ Warte...' : '👆 Mit Fingerabdruck anmelden'}
        </button>

        <button style={styles.secondaryButton} onClick={handleNewDevice}>
          Anderes Gerät / Neuer Mitarbeiter
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
  icon: { fontSize: '3rem', marginBottom: '0.25rem' },
  appName: { fontSize: '1.8rem', fontWeight: 700, color: '#1a73e8', marginBottom: '0.5rem' },
  greeting: { fontSize: '1rem', color: '#444', marginBottom: '1.5rem' },
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
    marginBottom: '0.75rem',
  },
  secondaryButton: {
    padding: '0.75rem',
    background: 'transparent',
    color: '#65676b',
    border: 'none',
    fontSize: '0.85rem',
    width: '100%',
    textDecoration: 'underline',
  },
}
