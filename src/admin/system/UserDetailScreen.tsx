import { useState } from 'react'
import { apiFetch } from '../../api/client'
import { AuthUser } from './UsersScreen'

interface Props {
  user: AuthUser | null
  onClose: () => void
  onSaved: () => void
}

const ROLES = ['user', 'admin', 'superadmin']
const PLATFORMS = ['pwa', 'all']

export default function UserDetailScreen({ user, onClose, onSaved }: Props) {
  const isNew = !user
  const [email, setEmail] = useState(user?.email ?? '')
  const [displayName, setDisplayName] = useState(user?.display_name ?? '')
  const [role, setRole] = useState(user?.role ?? 'user')
  const [platform, setPlatform] = useState(user?.platform ?? 'pwa')
  const [isActive, setIsActive] = useState(user?.is_active ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [pin, setPin] = useState<string | null>(null)
  const [pinExpiry, setPinExpiry] = useState('')
  const [generatingPin, setGeneratingPin] = useState(false)

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmAnonymize, setConfirmAnonymize] = useState(false)
  const [acting, setActing] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!displayName.trim() && !email.trim()) return
    setError('')
    setSaving(true)
    try {
      if (isNew) {
        await apiFetch('/pwa/admin/users', {
          method: 'POST',
          body: JSON.stringify({ email: email || null, display_name: displayName || null, role, platform }),
        })
      } else {
        await apiFetch(`/pwa/admin/users/${user!.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ display_name: displayName || null, role, platform, is_active: isActive }),
        })
      }
      onSaved()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fehler beim Speichern')
    } finally {
      setSaving(false)
    }
  }

  async function handleGeneratePin() {
    if (!user) return
    setGeneratingPin(true)
    setPin(null)
    try {
      const res = await apiFetch(`/pwa/admin/users/${user.id}/generate-pin`, { method: 'POST' }) as { pin: string; expires_at: string }
      setPin(res.pin)
      setPinExpiry(res.expires_at)
    } catch {
      setError('PIN-Generierung fehlgeschlagen')
    } finally {
      setGeneratingPin(false)
    }
  }

  async function handleDelete() {
    if (!user) return
    setActing(true)
    try {
      await apiFetch(`/pwa/admin/users/${user.id}`, { method: 'DELETE' })
      showToast('Benutzer gelöscht')
      setTimeout(onSaved, 1000)
    } catch {
      setError('Fehler beim Löschen')
      setActing(false)
    }
    setConfirmDelete(false)
  }

  async function handleAnonymize() {
    if (!user) return
    setActing(true)
    try {
      await apiFetch(`/pwa/admin/users/${user.id}/anonymize`, { method: 'POST' })
      showToast('Benutzer anonymisiert (DSGVO)')
      setTimeout(onSaved, 1000)
    } catch {
      setError('Fehler beim Anonymisieren')
      setActing(false)
    }
    setConfirmAnonymize(false)
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">{isNew ? 'Neuer Benutzer' : (user.display_name || user.email || 'Benutzer')}</div>
          <div className="admin-page-subtitle">{isNew ? 'Benutzerkonto anlegen' : 'Benutzerkonto bearbeiten'}</div>
        </div>
        <button className="admin-btn admin-btn-secondary" onClick={onClose}>← Zurück</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, alignItems: 'start' }}>
        {/* Formular */}
        <form onSubmit={handleSave}>
          <div className="admin-table-wrap" style={{ padding: 24 }}>
            <div className="admin-section-title">Kontodaten</div>
            {error && <div className="admin-form-error" style={{ marginBottom: 12 }}>{error}</div>}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="admin-form-group">
                <label className="admin-form-label">Name</label>
                <input className="admin-form-input" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Max Muster" />
              </div>
              <div className="admin-form-group">
                <label className="admin-form-label">E-Mail{isNew ? ' *' : ''}</label>
                <input
                  className="admin-form-input"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="user@firma.ch"
                  disabled={!isNew}
                />
                {!isNew && <div className="admin-form-hint">E-Mail kann nach Erstellung nicht geändert werden.</div>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="admin-form-group">
                  <label className="admin-form-label">Rolle</label>
                  <select className="admin-form-select" value={role} onChange={e => setRole(e.target.value)}>
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div className="admin-form-group">
                  <label className="admin-form-label">Plattform</label>
                  <select className="admin-form-select" value={platform} onChange={e => setPlatform(e.target.value)}>
                    {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
              {!isNew && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={isActive}
                    onChange={e => setIsActive(e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: 'var(--accent-blue, #3b82f6)', cursor: 'pointer' }}
                  />
                  <label htmlFor="is_active" style={{ fontSize: 13.5, cursor: 'pointer' }}>Benutzer aktiv</label>
                </div>
              )}
            </div>

            <div style={{ marginTop: 20, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="admin-btn admin-btn-secondary" onClick={onClose}>Abbrechen</button>
              <button type="submit" className="admin-btn admin-btn-primary" disabled={saving || (!displayName.trim() && !email.trim())}>
                {saving ? 'Speichern…' : 'Speichern'}
              </button>
            </div>
          </div>
        </form>

        {/* Seitenaktionen */}
        {!isNew && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* PIN */}
            <div className="admin-table-wrap" style={{ padding: 20 }}>
              <div className="admin-section-title">PWA-Zugang</div>
              <p style={{ fontSize: 13, color: 'var(--muted)', margin: '10px 0 14px' }}>
                Generiere einen Einmal-PIN damit der Benutzer die PWA-Registrierung starten kann.
              </p>
              {pin && (
                <div style={{ background: '#0f1117', borderRadius: 9, padding: '14px 16px', textAlign: 'center', marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>Einmal-PIN</div>
                  <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: '0.15em', color: 'var(--accent-blue, #3b82f6)' }}>{pin}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
                    Ablauf: {pinExpiry ? new Date(pinExpiry).toLocaleString('de-CH') : '—'}
                  </div>
                </div>
              )}
              <button
                className="admin-btn admin-btn-secondary"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={handleGeneratePin}
                disabled={generatingPin}
              >
                {generatingPin ? 'Generiere…' : pin ? 'Neuen PIN generieren' : 'PIN generieren'}
              </button>
            </div>

            {/* Gefahrenzone */}
            <div className="admin-table-wrap" style={{ padding: 20 }}>
              <div className="admin-section-title" style={{ color: '#ef4444' }}>Gefahrenzone</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
                <button
                  className="admin-btn admin-btn-danger"
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => setConfirmAnonymize(true)}
                >
                  Anonymisieren (DSGVO)
                </button>
                <div className="admin-form-hint" style={{ textAlign: 'center' }}>
                  Personendaten entfernen, Verlauf bleibt erhalten.
                </div>
                <button
                  className="admin-btn admin-btn-danger"
                  style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}
                  onClick={() => setConfirmDelete(true)}
                >
                  Benutzer löschen
                </button>
                <div className="admin-form-hint" style={{ textAlign: 'center' }}>
                  Vollständige Löschung inkl. aller Daten.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bestätigungen */}
      {confirmAnonymize && (
        <div className="admin-confirm-overlay">
          <div className="admin-confirm-box">
            <div className="admin-confirm-title">Benutzer anonymisieren?</div>
            <div className="admin-confirm-text">
              Name und E-Mail werden durch «[Anonymisiert]» ersetzt. Arbeitsdaten bleiben für die Buchführung erhalten.
            </div>
            <div className="admin-confirm-actions">
              <button className="admin-btn admin-btn-secondary" onClick={() => setConfirmAnonymize(false)}>Abbrechen</button>
              <button className="admin-btn admin-btn-danger" onClick={handleAnonymize} disabled={acting}>
                {acting ? '…' : 'Anonymisieren'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="admin-confirm-overlay">
          <div className="admin-confirm-box">
            <div className="admin-confirm-title">Benutzer unwiderruflich löschen?</div>
            <div className="admin-confirm-text">
              Alle Personendaten, Sitzungen und Absenzen werden gelöscht. Berichte bleiben aus Buchführungsgründen erhalten.
            </div>
            <div className="admin-confirm-actions">
              <button className="admin-btn admin-btn-secondary" onClick={() => setConfirmDelete(false)}>Abbrechen</button>
              <button className="admin-btn admin-btn-danger" onClick={handleDelete} disabled={acting}>
                {acting ? '…' : 'Endgültig löschen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="admin-toast-container">
          <div className="admin-toast success">{toast}</div>
        </div>
      )}
    </div>
  )
}
