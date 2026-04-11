import { useEffect, useState } from 'react'
import { apiFetch } from '../../api/client'

interface Supplier {
  id: string
  name: string
  prefix: string
}

export default function SuppliersScreen() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [prefix, setPrefix] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      setSuppliers(await apiFetch('/pwa/admin/suppliers') as Supplier[])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function openForm() {
    setName('')
    setPrefix('')
    setError('')
    setShowForm(true)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || prefix.trim().length !== 3) {
      setError('Name Pflichtfeld; Prefix muss genau 3 Zeichen sein (z.B. GRI)')
      return
    }
    setSaving(true)
    setError('')
    try {
      await apiFetch('/pwa/admin/suppliers', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), prefix: prefix.trim().toUpperCase() }),
      })
      setShowForm(false)
      showToast('Lieferant erstellt')
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(s: Supplier) {
    if (!confirm(`Lieferant "${s.name}" wirklich löschen? Zugehörige Preisregeln werden ebenfalls gelöscht.`)) return
    try {
      await apiFetch(`/pwa/admin/suppliers/${s.id}`, { method: 'DELETE' })
      showToast('Lieferant gelöscht')
      load()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Fehler beim Löschen')
    }
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Lieferanten</div>
          <div className="admin-page-subtitle">Lieferantenstamm für Preisregeln und Artikelnummern</div>
        </div>
        <button className="admin-btn admin-btn-primary" onClick={openForm}>
          <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 0 1 1 1v5h5a1 1 0 1 1 0 2h-5v5a1 1 0 1 1-2 0v-5H4a1 1 0 1 1 0-2h5V4a1 1 0 0 1 1-1z" clipRule="evenodd"/></svg>
          Neuer Lieferant
        </button>
      </div>

      <div className="admin-table-wrap">
        {loading ? (
          <div className="admin-loading"><div className="admin-spinner" /> Laden…</div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Prefix</th>
                <th>Artikelnummer-Beispiel</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {suppliers.length === 0 ? (
                <tr><td colSpan={4} className="admin-table-empty">Keine Lieferanten vorhanden.</td></tr>
              ) : suppliers.map(s => (
                <tr key={s.id}>
                  <td><strong>{s.name}</strong></td>
                  <td><code style={{ background: 'var(--surface-alt, #f5f5f5)', padding: '2px 6px', borderRadius: 4 }}>{s.prefix}</code></td>
                  <td style={{ color: 'var(--muted)', fontSize: 13 }}>{s.prefix}-0001</td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      className="admin-btn admin-btn-danger admin-btn-sm"
                      onClick={() => handleDelete(s)}
                    >
                      Löschen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <div className="admin-modal-overlay" onClick={() => setShowForm(false)}>
          <div className="admin-modal" onClick={e => e.stopPropagation()}>
            <div className="admin-modal-header">
              <div className="admin-modal-title">Neuer Lieferant</div>
              <button className="admin-modal-close" onClick={() => setShowForm(false)}>×</button>
            </div>
            <form onSubmit={handleCreate} className="admin-modal-body">
              {error && <div className="admin-form-error">{error}</div>}
              <div className="admin-form-group">
                <label className="admin-form-label">Name *</label>
                <input
                  className="admin-form-input"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="z.B. Griesser"
                  required
                  autoFocus
                />
              </div>
              <div className="admin-form-group">
                <label className="admin-form-label">Prefix * (3 Zeichen)</label>
                <input
                  className="admin-form-input"
                  value={prefix}
                  onChange={e => setPrefix(e.target.value.toUpperCase().slice(0, 3))}
                  placeholder="z.B. GRI"
                  maxLength={3}
                  required
                />
                <div className="admin-form-hint">Wird für Artikelnummern verwendet: {prefix || 'XXX'}-0001</div>
              </div>
            </form>
            <div className="admin-modal-footer">
              <button className="admin-btn admin-btn-secondary" onClick={() => setShowForm(false)}>Abbrechen</button>
              <button
                className="admin-btn admin-btn-primary"
                onClick={e => { (e.currentTarget.closest('div.admin-modal')?.querySelector('form') as HTMLFormElement)?.requestSubmit() }}
                disabled={saving}
              >
                {saving ? 'Erstellen…' : 'Erstellen'}
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
