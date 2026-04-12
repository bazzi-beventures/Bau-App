import { useState } from 'react'
import { apiFetch } from '../../api/client'
import { AuthUser } from './UsersScreen'

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

interface Props {
  user: AuthUser | null
  onClose: () => void
  onSaved: () => void
}

const ROLES = ['user_light', 'user', 'admin', 'management', 'superadmin']
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

  const [newPassword, setNewPassword] = useState('')
  const [settingPassword, setSettingPassword] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

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

  async function handleDelete() {
    if (!user) return
    setActing(true)
    try {
      await apiFetch(`/pwa/admin/users/${user.id}`, { method: 'DELETE' })
      showToast('Benutzer gelöscht')
      setTimeout(onSaved, 1000)
    } catch (e: unknown) {
      const status = (e as { status?: number })?.status
      setError(status === 403 ? 'Keine Berechtigung – nur Management-Rolle kann Benutzer löschen' : 'Fehler beim Löschen')
      setActing(false)
    }
    setConfirmDelete(false)
  }

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault()
    if (!user || newPassword.length < 8) return
    setSettingPassword(true)
    try {
      await apiFetch(`/pwa/admin/users/${user.id}/set-password`, {
        method: 'POST',
        body: JSON.stringify({ new_password: newPassword }),
      })
      setNewPassword('')
      showToast('Passwort gesetzt')
    } catch {
      setError('Fehler beim Setzen des Passworts')
    } finally {
      setSettingPassword(false)
    }
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
            {/* Passwort setzen */}
            <div className="admin-table-wrap" style={{ padding: 20 }}>
              <div className="admin-section-title">Passwort</div>
              <p style={{ fontSize: 13, color: 'var(--muted)', margin: '10px 0 14px' }}>
                Setzt ein neues Login-Passwort für diesen Benutzer (min. 8 Zeichen).
              </p>
              <form onSubmit={handleSetPassword} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ position: 'relative' }}>
                  <input
                    className="admin-form-input"
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    minLength={8}
                    style={{ width: '100%', paddingRight: 44, boxSizing: 'border-box' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    tabIndex={-1}
                    aria-label={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
                    style={{
                      position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--muted)', padding: 0, display: 'flex', alignItems: 'center',
                    }}
                  >
                    <EyeIcon open={showPassword} />
                  </button>
                </div>
                <button
                  type="submit"
                  className="admin-btn admin-btn-secondary"
                  style={{ width: '100%', justifyContent: 'center' }}
                  disabled={settingPassword || newPassword.length < 8}
                >
                  {settingPassword ? 'Speichere…' : 'Passwort setzen'}
                </button>
              </form>
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
