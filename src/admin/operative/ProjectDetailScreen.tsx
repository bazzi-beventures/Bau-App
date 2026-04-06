import { useState } from 'react'
import { apiFetch } from '../../api/client'
import { Project } from './ProjectsScreen'

interface Props {
  project: Project | null
  onClose: () => void
  onSaved: () => void
}

export default function ProjectDetailScreen({ project, onClose, onSaved }: Props) {
  const isNew = !project
  const [name, setName] = useState(project?.name ?? '')
  const [customerName, setCustomerName] = useState(project?.customer_name ?? '')
  const [customerEmail, setCustomerEmail] = useState(project?.customer_email ?? '')
  const [customerAddress, setCustomerAddress] = useState(project?.customer_address ?? '')
  const [saving, setSaving] = useState(false)
  const [closing, setClosing] = useState(false)
  const [error, setError] = useState('')
  const [confirmClose, setConfirmClose] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setError('')
    setSaving(true)
    try {
      const method = isNew ? 'POST' : 'PATCH'
      const url = isNew ? '/pwa/admin/projects' : `/pwa/admin/projects/${project!.id}`
      await apiFetch(url, {
        method,
        body: JSON.stringify({
          name: name.trim(),
          customer_name: customerName || null,
          customer_email: customerEmail || null,
          customer_address: customerAddress || null,
        }),
      })
      onSaved()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fehler beim Speichern')
    } finally {
      setSaving(false)
    }
  }

  async function handleClose() {
    if (!project) return
    setClosing(true)
    try {
      await apiFetch(`/pwa/admin/projects/${encodeURIComponent(project.name)}/close`, { method: 'POST' })
      showToast('Projekt geschlossen')
      setTimeout(onSaved, 1000)
    } catch {
      setError('Fehler beim Schliessen')
    } finally {
      setClosing(false)
      setConfirmClose(false)
    }
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">{isNew ? 'Neues Projekt' : project.name}</div>
          <div className="admin-page-subtitle">
            {isNew ? 'Projekt anlegen' : project.is_closed ? 'Geschlossen' : 'Offen'}
          </div>
        </div>
        <button className="admin-btn admin-btn-secondary" onClick={onClose}>← Zurück</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20, alignItems: 'start' }}>
        <form onSubmit={handleSave}>
          <div className="admin-table-wrap" style={{ padding: 24 }}>
            <div className="admin-section-title">Projektdaten</div>
            {error && <div className="admin-form-error" style={{ marginBottom: 12 }}>{error}</div>}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="admin-form-group">
                <label className="admin-form-label">Projektname *</label>
                <input className="admin-form-input" value={name} onChange={e => setName(e.target.value)} required />
              </div>
              <div className="admin-form-group">
                <label className="admin-form-label">Kundenname</label>
                <input className="admin-form-input" value={customerName} onChange={e => setCustomerName(e.target.value)} />
              </div>
              <div className="admin-form-group">
                <label className="admin-form-label">Kunden-E-Mail</label>
                <input className="admin-form-input" type="email" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} />
              </div>
              <div className="admin-form-group">
                <label className="admin-form-label">Kundenadresse</label>
                <input className="admin-form-input" value={customerAddress} onChange={e => setCustomerAddress(e.target.value)} />
              </div>
            </div>

            <div style={{ marginTop: 20, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="admin-btn admin-btn-secondary" onClick={onClose}>Abbrechen</button>
              <button type="submit" className="admin-btn admin-btn-primary" disabled={saving || !name.trim()}>
                {saving ? 'Speichern…' : 'Speichern'}
              </button>
            </div>
          </div>
        </form>

        {!isNew && !project.is_closed && (
          <div className="admin-table-wrap" style={{ padding: 20 }}>
            <div className="admin-section-title">Aktionen</div>
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: '10px 0 16px' }}>
              Ein geschlossenes Projekt wird für Mitarbeiter ausgeblendet und kann nicht mehr bebucht werden.
            </p>
            <button
              className="admin-btn admin-btn-danger"
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={() => setConfirmClose(true)}
            >
              Projekt schliessen
            </button>
          </div>
        )}
      </div>

      {confirmClose && (
        <div className="admin-confirm-overlay">
          <div className="admin-confirm-box">
            <div className="admin-confirm-title">Projekt schliessen?</div>
            <div className="admin-confirm-text">
              «{project?.name}» wird für Mitarbeiter ausgeblendet. Berichte bleiben erhalten.
            </div>
            <div className="admin-confirm-actions">
              <button className="admin-btn admin-btn-secondary" onClick={() => setConfirmClose(false)}>Abbrechen</button>
              <button className="admin-btn admin-btn-danger" onClick={handleClose} disabled={closing}>
                {closing ? 'Schliessen…' : 'Ja, schliessen'}
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
