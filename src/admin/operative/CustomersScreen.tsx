import { useEffect, useState } from 'react'
import { apiFetch } from '../../api/client'
import { AddressAutocomplete } from '../components/AddressAutocomplete'
import { CompanySearch } from '../components/CompanySearch'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { formatDateTime } from './projectDetail/tabs'

interface CustomerComment {
  id: string
  author_name: string | null
  text: string
  created_at: string
  updated_at?: string | null
}

function CustomerComments({ customerId }: { customerId: string }) {
  const [comments, setComments] = useState<CustomerComment[]>([])
  const [loading, setLoading] = useState(true)
  const [newComment, setNewComment] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    try {
      const data = await apiFetch(`/pwa/admin/customers/${customerId}/comments`) as CustomerComment[]
      setComments(data)
    } catch {
      setComments([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [customerId])

  async function handleAdd() {
    if (!newComment.trim()) return
    setAdding(true); setError('')
    try {
      await apiFetch(`/pwa/admin/customers/${customerId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ text: newComment.trim() }),
      })
      setNewComment('')
      await load()
    } catch {
      setError('Fehler beim Speichern des Kommentars')
    } finally {
      setAdding(false)
    }
  }

  function startEdit(c: CustomerComment) {
    setEditingId(c.id)
    setEditingText(c.text)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditingText('')
  }

  async function handleSaveEdit() {
    if (!editingId || !editingText.trim()) return
    setSavingEdit(true); setError('')
    try {
      await apiFetch(`/pwa/admin/customers/${customerId}/comments/${editingId}`, {
        method: 'PATCH',
        body: JSON.stringify({ text: editingText.trim() }),
      })
      cancelEdit()
      await load()
    } catch {
      setError('Fehler beim Aktualisieren des Kommentars')
    } finally {
      setSavingEdit(false)
    }
  }

  async function handleDelete() {
    if (!confirmDeleteId) return
    setDeleting(true); setError('')
    try {
      await apiFetch(`/pwa/admin/customers/${customerId}/comments/${confirmDeleteId}`, {
        method: 'DELETE',
      })
      setComments(prev => prev.filter(c => c.id !== confirmDeleteId))
      setConfirmDeleteId(null)
    } catch {
      setError('Fehler beim Löschen des Kommentars')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="admin-form-group">
      <label className="admin-form-label">Kommentare</label>
      {error && <div className="admin-form-error" style={{ marginBottom: 8 }}>{error}</div>}
      {loading ? (
        <div style={{ color: 'var(--muted)', fontSize: 13 }}>Laden…</div>
      ) : (
        <>
          {comments.length === 0 && (
            <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 10 }}>Noch keine Kommentare.</div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
            {comments.map(c => {
              const isEditing = editingId === c.id
              return (
                <div key={c.id} style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{c.author_name || 'Unbekannt'}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                        {formatDateTime(c.created_at)}
                        {c.updated_at ? ' · bearbeitet' : ''}
                      </span>
                      {!isEditing && (
                        <>
                          <button
                            type="button"
                            className="admin-btn admin-btn-sm admin-btn-secondary"
                            onClick={() => startEdit(c)}
                          >Bearbeiten</button>
                          <button
                            type="button"
                            className="admin-btn admin-btn-sm admin-btn-danger"
                            onClick={() => setConfirmDeleteId(c.id)}
                          >Löschen</button>
                        </>
                      )}
                    </div>
                  </div>
                  {isEditing ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <textarea
                        className="admin-form-input"
                        rows={2}
                        value={editingText}
                        onChange={e => setEditingText(e.target.value)}
                        style={{ resize: 'vertical' }}
                      />
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          className="admin-btn admin-btn-sm admin-btn-secondary"
                          onClick={cancelEdit}
                          disabled={savingEdit}
                        >Abbrechen</button>
                        <button
                          type="button"
                          className="admin-btn admin-btn-sm admin-btn-primary"
                          onClick={handleSaveEdit}
                          disabled={savingEdit || !editingText.trim()}
                        >{savingEdit ? 'Speichern…' : 'Speichern'}</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{c.text}</div>
                  )}
                </div>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="admin-form-input"
              style={{ flex: 1 }}
              placeholder="Kommentar hinzufügen…"
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleAdd() } }}
            />
            <button
              type="button"
              className="admin-btn admin-btn-primary"
              disabled={adding || !newComment.trim()}
              onClick={handleAdd}
            >
              {adding ? '…' : 'Senden'}
            </button>
          </div>
        </>
      )}
      {confirmDeleteId && (
        <ConfirmDialog
          title="Kommentar löschen?"
          message={<>Der Kommentar wird dauerhaft entfernt.</>}
          confirmLabel="Ja, löschen"
          busyLabel="Löschen…"
          busy={deleting}
          variant="danger"
          onCancel={() => setConfirmDeleteId(null)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  )
}

export interface Customer {
  id: string
  name: string
  company: string | null
  email: string | null
  phone: string | null
  phone_landline: string | null
  address: string | null
  billing_name: string | null
  billing_address: string | null
  object_address: string | null
  local_contact_name: string | null
  local_contact_phone: string | null
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
  const [company, setCompany] = useState(initial?.company ?? '')
  const [email, setEmail] = useState(initial?.email ?? '')
  const [phone, setPhone] = useState(initial?.phone ?? '')
  const [phoneLandline, setPhoneLandline] = useState(initial?.phone_landline ?? '')
  const [address, setAddress] = useState(initial?.address ?? '')
  const initialBillingDiffers = !!(initial?.billing_name || initial?.billing_address)
  const [billingDiffers, setBillingDiffers] = useState(initialBillingDiffers)
  const [billingName, setBillingName] = useState(initial?.billing_name ?? '')
  const [billingAddress, setBillingAddress] = useState(initial?.billing_address ?? '')
  const [objectAddress, setObjectAddress] = useState(initial?.object_address ?? '')
  const [localContactName, setLocalContactName] = useState(initial?.local_contact_name ?? '')
  const [localContactPhone, setLocalContactPhone] = useState(initial?.local_contact_phone ?? '')
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
          company: company.trim() || null,
          email: email || null,
          phone: phone || null,
          phone_landline: phoneLandline || null,
          address: address || null,
          billing_name: billingDiffers ? (billingName.trim() || null) : null,
          billing_address: billingDiffers ? (billingAddress || null) : null,
          object_address: objectAddress || null,
          local_contact_name: localContactName.trim() || null,
          local_contact_phone: localContactPhone.trim() || null,
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <button
          type="button"
          className="admin-btn admin-btn-secondary admin-btn-sm"
          onClick={onCancel}
          title="Zurück zur Übersicht"
        >
          ← Zurück
        </button>
        <div className="admin-section-title" style={{ margin: 0 }}>
          {isNew ? 'Neuer Kunde' : 'Kunde bearbeiten'}
        </div>
      </div>
      {error && <div className="admin-form-error">{error}</div>}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
        <div className="admin-form-group">
          <label className="admin-form-label">Firma suchen via search.ch</label>
          <CompanySearch
            onSelect={result => {
              if (result.name) setCompany(result.name)
              if (result.address) setAddress(result.address)
              if (result.phone) setPhoneLandline(result.phone)
              if (result.email) setEmail(result.email)
            }}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="admin-form-group">
            <label className="admin-form-label">Name *</label>
            <input className="admin-form-input" value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div className="admin-form-group">
            <label className="admin-form-label">Firma</label>
            <input className="admin-form-input" value={company} onChange={e => setCompany(e.target.value)} />
          </div>
        </div>
        <div className="admin-form-group">
          <label className="admin-form-label">E-Mail</label>
          <input className="admin-form-input" type="email" value={email} onChange={e => setEmail(e.target.value)} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="admin-form-group">
            <label className="admin-form-label">Mobil</label>
            <input className="admin-form-input" value={phone} onChange={e => setPhone(e.target.value)} placeholder="079 123 45 67" />
          </div>
          <div className="admin-form-group">
            <label className="admin-form-label">Festnetz</label>
            <input className="admin-form-input" value={phoneLandline} onChange={e => setPhoneLandline(e.target.value)} placeholder="044 123 45 67" />
          </div>
        </div>
        <div className="admin-form-group">
          <label className="admin-form-label">Adresse (Kontakt / Standard)</label>
          <AddressAutocomplete className="admin-form-input" value={address} onChange={setAddress} />
        </div>

        <div className="admin-form-group">
          <label className="admin-form-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={billingDiffers}
              onChange={e => setBillingDiffers(e.target.checked)}
            />
            Abweichende Rechnungsadresse
          </label>
          {billingDiffers && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 10 }}>
              <div>
                <label className="admin-form-label">Empfänger (Rechnung)</label>
                <input className="admin-form-input" value={billingName} onChange={e => setBillingName(e.target.value)} placeholder={name || 'z.B. Verwaltung AG'} />
              </div>
              <div>
                <label className="admin-form-label">Rechnungsadresse</label>
                <AddressAutocomplete className="admin-form-input" value={billingAddress} onChange={setBillingAddress} />
              </div>
            </div>
          )}
        </div>

        <div className="admin-form-group">
          <label className="admin-form-label">Standard-Objektadresse (optional)</label>
          <AddressAutocomplete className="admin-form-input" value={objectAddress} onChange={setObjectAddress} />
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
            Wird beim Anlegen neuer Projekte als Vorschlag übernommen und kann pro Projekt überschrieben werden.
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="admin-form-group">
            <label className="admin-form-label">Lokaler Kontakt — Name (Default)</label>
            <input className="admin-form-input" value={localContactName} onChange={e => setLocalContactName(e.target.value)} placeholder="z.B. Hauswart" />
          </div>
          <div className="admin-form-group">
            <label className="admin-form-label">Lokaler Kontakt — Telefon</label>
            <input className="admin-form-input" value={localContactPhone} onChange={e => setLocalContactPhone(e.target.value)} />
          </div>
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

        {!isNew && initial && <CustomerComments customerId={initial.id} />}

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

  const filtered = customers.filter(c => {
    const q = search.toLowerCase()
    return (
      c.name.toLowerCase().includes(q) ||
      (c.company ?? '').toLowerCase().includes(q) ||
      (c.email ?? '').toLowerCase().includes(q) ||
      (c.phone ?? '').toLowerCase().includes(q) ||
      (c.phone_landline ?? '').toLowerCase().includes(q) ||
      (c.address ?? '').toLowerCase().includes(q) ||
      (c.billing_address ?? '').toLowerCase().includes(q) ||
      (c.object_address ?? '').toLowerCase().includes(q)
    )
  })

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
                <th>Firma</th>
                <th>E-Mail</th>
                <th>Mobil</th>
                <th>Festnetz</th>
                <th>Rechnungsadresse</th>
                <th>Objektadresse (Default)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 500 }}>{c.name}</td>
                  <td style={{ color: 'var(--muted)' }}>{c.company ?? '—'}</td>
                  <td style={{ color: 'var(--muted)' }}>{c.email ?? '—'}</td>
                  <td style={{ color: 'var(--muted)' }}>{c.phone ?? '—'}</td>
                  <td style={{ color: 'var(--muted)' }}>{c.phone_landline ?? '—'}</td>
                  <td style={{ color: 'var(--muted)', fontSize: 13 }}>{c.billing_address ?? c.address ?? '—'}</td>
                  <td style={{ color: 'var(--muted)', fontSize: 13 }}>{c.object_address ?? '—'}</td>
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
