import { useEffect, useState } from 'react'
import { apiFetch } from '../../api/client'

export interface Customer {
  id: string
  name: string
  email: string | null
  phone: string | null
  address: string | null
  notes: string | null
  created_at: string
}

function CustomerForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: Customer | null
  onSave: () => void
  onCancel: () => void
}) {
  const isNew = !initial
  const [name, setName] = useState(initial?.name ?? '')
  const [email, setEmail] = useState(initial?.email ?? '')
  const [phone, setPhone] = useState(initial?.phone ?? '')
  const [address, setAddress] = useState(initial?.address ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setError('')
    setSaving(true)
    try {
      const method = isNew ? 'POST' : 'PATCH'
      const url = isNew ? '/pwa/admin/customers' : `/pwa/admin/customers/${initial!.id}`
      await apiFetch(url, {
        method,
        body: JSON.stringify({
          name: name.trim(),
          email: email || null,
          phone: phone || null,
          address: address || null,
          notes: notes || null,
        }),
      })
      onSave()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fehler beim Speichern')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="admin-table-wrap" style={{ padding: 24, marginBottom: 20 }}>
      <div className="admin-section-title">{isNew ? 'Neuer Kunde' : 'Kunde bearbeiten'}</div>
      {error && <div className="admin-form-error">{error}</div>}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
        <div className="admin-form-group">
          <label className="admin-form-label">Name *</label>
          <input className="admin-form-input" value={name} onChange={e => setName(e.target.value)} required />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="admin-form-group">
            <label className="admin-form-label">E-Mail</label>
            <input className="admin-form-input" type="email" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="admin-form-group">
            <label className="admin-form-label">Telefon</label>
            <input className="admin-form-input" value={phone} onChange={e => setPhone(e.target.value)} />
          </div>
        </div>
        <div className="admin-form-group">
          <label className="admin-form-label">Adresse</label>
          <input className="admin-form-input" value={address} onChange={e => setAddress(e.target.value)} />
        </div>
        <div className="admin-form-group">
          <label className="admin-form-label">Notizen</label>
          <textarea
            className="admin-form-input"
            rows={2}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            style={{ resize: 'vertical' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" className="admin-btn admin-btn-secondary" onClick={onCancel}>Abbrechen</button>
          <button type="submit" className="admin-btn admin-btn-primary" disabled={saving || !name.trim()}>
            {saving ? 'Speichern…' : 'Speichern'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default function CustomersScreen() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Customer | null | 'new'>(null)
  const [confirmDelete, setConfirmDelete] = useState<Customer | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const data = await apiFetch('/pwa/admin/customers') as Customer[]
      setCustomers(data)
    } catch {
      setCustomers([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  async function handleDelete() {
    if (!confirmDelete) return
    setDeleting(true)
    try {
      await apiFetch(`/pwa/admin/customers/${confirmDelete.id}`, { method: 'DELETE' })
      showToast(`«${confirmDelete.name}» gelöscht`)
      setConfirmDelete(null)
      load()
    } catch {
      showToast('Fehler beim Löschen')
    } finally {
      setDeleting(false)
    }
  }

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.email ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (c.address ?? '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Kundenstamm</div>
          <div className="admin-page-subtitle">{customers.length} Kunden</div>
        </div>
        <button className="admin-btn admin-btn-primary" onClick={() => setEditing('new')}>
          + Neuer Kunde
        </button>
      </div>

      {editing === 'new' && (
        <CustomerForm
          initial={null}
          onSave={() => { setEditing(null); load(); showToast('Kunde gespeichert') }}
          onCancel={() => setEditing(null)}
        />
      )}

      {editing && editing !== 'new' && (
        <CustomerForm
          initial={editing}
          onSave={() => { setEditing(null); load(); showToast('Kunde aktualisiert') }}
          onCancel={() => setEditing(null)}
        />
      )}

      <div style={{ marginBottom: 16 }}>
        <input
          className="admin-form-input"
          placeholder="Suchen…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ maxWidth: 320 }}
        />
      </div>

      {loading ? (
        <div className="admin-loading">Laden…</div>
      ) : filtered.length === 0 ? (
        <div className="admin-table-wrap" style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>
          {search ? 'Kein Kunde gefunden.' : 'Noch keine Kunden angelegt.'}
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>E-Mail</th>
                <th>Telefon</th>
                <th>Adresse</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 500 }}>{c.name}</td>
                  <td style={{ color: 'var(--muted)' }}>{c.email ?? '—'}</td>
                  <td style={{ color: 'var(--muted)' }}>{c.phone ?? '—'}</td>
                  <td style={{ color: 'var(--muted)', fontSize: 13 }}>{c.address ?? '—'}</td>
                  <td style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button
                      className="admin-btn admin-btn-sm admin-btn-secondary"
                      onClick={() => setEditing(c)}
                    >
                      Bearbeiten
                    </button>
                    <button
                      className="admin-btn admin-btn-sm admin-btn-danger"
                      onClick={() => setConfirmDelete(c)}
                    >
                      Löschen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirmDelete && (
        <div className="admin-confirm-overlay">
          <div className="admin-confirm-box">
            <div className="admin-confirm-title">Kunde löschen?</div>
            <div className="admin-confirm-text">
              «{confirmDelete.name}» wird dauerhaft gelöscht. Bestehende Projekte bleiben erhalten.
            </div>
            <div className="admin-confirm-actions">
              <button className="admin-btn admin-btn-secondary" onClick={() => setConfirmDelete(null)}>Abbrechen</button>
              <button className="admin-btn admin-btn-danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Löschen…' : 'Ja, löschen'}
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
