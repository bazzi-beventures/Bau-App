import { useEffect, useRef, useState } from 'react'
import { apiFetch, apiFormFetch } from '../../api/client'
import { Kontakt, Project, ProjectStatus, PROJECT_STATUS_LABELS, PROJECT_STATUS_BADGE, Termin } from './ProjectsScreen'
import { Customer } from './CustomersScreen'

interface StaffMember {
  id: string
  name: string
}

interface ProjectFile {
  id: string
  filename: string
  file_url: string | null
  mime_type: string | null
  created_at: string
}

interface ProjectComment {
  id: string
  author_name: string | null
  text: string
  created_at: string
}

interface Props {
  project: Project | null
  onClose: () => void
  onSaved: () => void
}

const STATUS_SEQUENCE: ProjectStatus[] = ['offen', 'bestellung_ausgeloest', 'demontage', 'abgeschlossen']

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function ProjectDetailScreen({ project, onClose, onSaved }: Props) {
  const isNew = !project

  const [name, setName] = useState(project?.name ?? '')
  const [customerId, setCustomerId] = useState(project?.customer_id ?? '')
  const [customerName, setCustomerName] = useState(project?.customer_name ?? '')
  const [customerEmail, setCustomerEmail] = useState(project?.customer_email ?? '')
  const [customerAddress, setCustomerAddress] = useState(project?.customer_address ?? '')
  const [auftraggeber, setAuftraggeber] = useState(project?.auftraggeber ?? '')
  const [eigentuemer, setEigentuemer] = useState(project?.eigentuemer ?? '')
  const [artDerArbeit, setArtDerArbeit] = useState(project?.art_der_arbeit ?? '')
  const [bemerkung, setBemerkung] = useState(project?.bemerkung ?? '')
  const [sachbearbeiterId, setSachbearbeiterId] = useState(project?.sachbearbeiter_id ?? '')
  const [monteurIds, setMonteurIds] = useState<string[]>(project?.monteur_ids ?? [])
  const [termine, setTermine] = useState<Termin[]>(project?.termine ?? [])
  const [kontakte, setKontakte] = useState<Kontakt[]>(project?.kontakte ?? [])

  const [customers, setCustomers] = useState<Customer[]>([])
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [saving, setSaving] = useState(false)
  const [settingStatus, setSettingStatus] = useState(false)
  const [error, setError] = useState('')
  const [confirmClose, setConfirmClose] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  // Wiedereröffnen
  const [confirmReopen, setConfirmReopen] = useState(false)
  const [reopenReason, setReopenReason] = useState<'fehler' | 'garantiefall'>('fehler')
  const [reopening, setReopening] = useState(false)

  // Dateien
  const [files, setFiles] = useState<ProjectFile[]>([])
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Kommentare
  const [comments, setComments] = useState<ProjectComment[]>([])
  const [newComment, setNewComment] = useState('')
  const [addingComment, setAddingComment] = useState(false)

  const effectiveStatus: ProjectStatus = project?.status ?? (project?.is_closed ? 'abgeschlossen' : 'offen')
  const isClosed = effectiveStatus === 'abgeschlossen'

  useEffect(() => {
    apiFetch('/pwa/admin/staff').then((data: unknown) => {
      const arr = data as { id: string; name: string }[]
      setStaff(arr.map(s => ({ id: s.id, name: s.name })))
    }).catch(() => {})
    apiFetch('/pwa/admin/customers').then((data: unknown) => {
      setCustomers(data as Customer[])
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!project) return
    apiFetch(`/pwa/admin/projects/${project.id}/files`).then(d => setFiles(d as ProjectFile[])).catch(() => {})
    apiFetch(`/pwa/admin/projects/${project.id}/comments`).then(d => setComments(d as ProjectComment[])).catch(() => {})
  }, [project?.id])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  function handleSelectCustomer(id: string) {
    setCustomerId(id)
    if (!id) return
    const c = customers.find(x => x.id === id)
    if (!c) return
    setCustomerName(c.name)
    setCustomerEmail(c.email ?? '')
    setCustomerAddress(c.address ?? '')
  }

  // ── Termine helpers ──────────────────────────────────────────
  function addTermin() {
    setTermine(prev => [...prev, { datum: '', uhrzeit: '', notiz: '' }])
  }
  function updateTermin(i: number, field: keyof Termin, value: string) {
    setTermine(prev => prev.map((t, idx) => idx === i ? { ...t, [field]: value } : t))
  }
  function removeTermin(i: number) {
    setTermine(prev => prev.filter((_, idx) => idx !== i))
  }

  // ── Kontakte helpers ─────────────────────────────────────────
  function addKontakt() {
    setKontakte(prev => [...prev, { name: '', rolle: 'Objekt', telefon: '', email: '' }])
  }
  function updateKontakt(i: number, field: keyof Kontakt, value: string) {
    setKontakte(prev => prev.map((k, idx) => idx === i ? { ...k, [field]: value } : k))
  }
  function removeKontakt(i: number) {
    setKontakte(prev => prev.filter((_, idx) => idx !== i))
  }

  function toggleMonteur(id: string) {
    setMonteurIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
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
          customer_id: customerId || null,
          customer_name: customerName || null,
          customer_email: customerEmail || null,
          customer_address: customerAddress || null,
          auftraggeber: auftraggeber || null,
          eigentuemer: eigentuemer || null,
          art_der_arbeit: artDerArbeit || null,
          bemerkung: bemerkung || null,
          sachbearbeiter_id: sachbearbeiterId || null,
          monteur_ids: monteurIds,
          termine,
          kontakte,
        }),
      })
      onSaved()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fehler beim Speichern')
    } finally {
      setSaving(false)
    }
  }

  async function handleSetStatus(newStatus: ProjectStatus) {
    if (!project) return
    if (newStatus === 'abgeschlossen') {
      setConfirmClose(true)
      return
    }
    setSettingStatus(true)
    try {
      await apiFetch(`/pwa/admin/projects/${encodeURIComponent(project.name)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      })
      showToast(`Status: ${PROJECT_STATUS_LABELS[newStatus]}`)
      setTimeout(onSaved, 1000)
    } catch {
      setError('Fehler beim Setzen des Status')
    } finally {
      setSettingStatus(false)
    }
  }

  async function handleClose() {
    if (!project) return
    setSettingStatus(true)
    try {
      await apiFetch(`/pwa/admin/projects/${encodeURIComponent(project.name)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'abgeschlossen' }),
      })
      showToast('Projekt geschlossen')
      setTimeout(onSaved, 1000)
    } catch {
      setError('Fehler beim Schliessen')
    } finally {
      setSettingStatus(false)
      setConfirmClose(false)
    }
  }

  async function handleReopen() {
    if (!project) return
    setReopening(true)
    try {
      await apiFetch(`/pwa/admin/projects/${project.id}/reopen`, { method: 'POST' })
      if (reopenReason === 'garantiefall') {
        await apiFetch(`/pwa/admin/projects/${project.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ name: project.name, art_der_arbeit: 'Garantiefall' }),
        })
      }
      showToast('Projekt wiedereröffnet')
      setTimeout(onSaved, 1000)
    } catch {
      setError('Fehler beim Wiedereröffnen')
    } finally {
      setReopening(false)
      setConfirmReopen(false)
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!project || !e.target.files?.length) return
    const file = e.target.files[0]
    const form = new FormData()
    form.append('file', file)
    setUploading(true)
    try {
      await apiFormFetch(`/pwa/admin/projects/${project.id}/files`, form)
      const updated = await apiFetch(`/pwa/admin/projects/${project.id}/files`) as ProjectFile[]
      setFiles(updated)
      showToast('Datei hochgeladen')
    } catch {
      setError('Fehler beim Hochladen')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleDeleteFile(fileId: string) {
    if (!project) return
    try {
      await apiFetch(`/pwa/admin/projects/${project.id}/files/${fileId}`, { method: 'DELETE' })
      setFiles(prev => prev.filter(f => f.id !== fileId))
    } catch {
      setError('Fehler beim Löschen')
    }
  }

  async function handleAddComment() {
    if (!project || !newComment.trim()) return
    setAddingComment(true)
    try {
      await apiFetch(`/pwa/admin/projects/${project.id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ text: newComment.trim() }),
      })
      const updated = await apiFetch(`/pwa/admin/projects/${project.id}/comments`) as ProjectComment[]
      setComments(updated)
      setNewComment('')
    } catch {
      setError('Fehler beim Speichern des Kommentars')
    } finally {
      setAddingComment(false)
    }
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">{isNew ? 'Neues Projekt' : project.name}</div>
          <div className="admin-page-subtitle">
            {isNew ? 'Projekt anlegen' : (
              <span className={`admin-badge ${PROJECT_STATUS_BADGE[effectiveStatus]}`} style={{ fontSize: 12 }}>
                {PROJECT_STATUS_LABELS[effectiveStatus]}
              </span>
            )}
          </div>
        </div>
        <button className="admin-btn admin-btn-secondary" onClick={onClose}>← Zurück</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20, alignItems: 'start' }}>
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {error && <div className="admin-form-error">{error}</div>}

          {/* ── Projektdaten ─────────────────────────────────── */}
          <div className="admin-table-wrap" style={{ padding: 24 }}>
            <div className="admin-section-title">Projektdaten</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="admin-form-group">
                <label className="admin-form-label">Projektname *</label>
                <input className="admin-form-input" value={name} onChange={e => setName(e.target.value)} required />
              </div>
              <div className="admin-form-group">
                <label className="admin-form-label">Art der Arbeit</label>
                <select className="admin-form-select" value={artDerArbeit} onChange={e => setArtDerArbeit(e.target.value)}>
                  <option value="">— auswählen —</option>
                  <option value="Reparatur">Reparatur</option>
                  <option value="Neumontage">Neumontage</option>
                  <option value="Garantiefall">Garantiefall</option>
                </select>
              </div>
              <div className="admin-form-group">
                <label className="admin-form-label">
                  Bemerkung
                  <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--danger)', fontWeight: 600 }}>
                    wird für Monteure rot hervorgehoben
                  </span>
                </label>
                <textarea
                  className="admin-form-input"
                  value={bemerkung}
                  onChange={e => setBemerkung(e.target.value)}
                  placeholder="Wichtiger Hinweis für Monteure…"
                  rows={3}
                  style={{ resize: 'vertical' }}
                />
              </div>
            </div>
          </div>

          {/* ── Auftraggeber & Eigentümer ─────────────────────── */}
          <div className="admin-table-wrap" style={{ padding: 24 }}>
            <div className="admin-section-title">Auftraggeber & Eigentümer</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="admin-form-group">
                <label className="admin-form-label">Auftraggeber</label>
                <input className="admin-form-input" value={auftraggeber} onChange={e => setAuftraggeber(e.target.value)} />
              </div>
              <div className="admin-form-group">
                <label className="admin-form-label">Eigentümer</label>
                <input className="admin-form-input" value={eigentuemer} onChange={e => setEigentuemer(e.target.value)} />
              </div>
            </div>
          </div>

          {/* ── Kundenkontakt ─────────────────────────────────── */}
          <div className="admin-table-wrap" style={{ padding: 24 }}>
            <div className="admin-section-title">Kundenkontakt</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
          </div>

          {/* ── Termine ──────────────────────────────────────── */}
          <div className="admin-table-wrap" style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div className="admin-section-title" style={{ margin: 0 }}>Termine</div>
              <button type="button" className="admin-btn admin-btn-sm admin-btn-secondary" onClick={addTermin}>
                + Termin hinzufügen
              </button>
            </div>
            {termine.length === 0 && (
              <div style={{ color: 'var(--muted)', fontSize: 13 }}>Keine Termine eingetragen.</div>
            )}
            {termine.map((t, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr auto', gap: 10, marginBottom: 10, alignItems: 'end' }}>
                <div className="admin-form-group" style={{ margin: 0 }}>
                  <label className="admin-form-label">Datum</label>
                  <input className="admin-form-input" type="date" value={t.datum} onChange={e => updateTermin(i, 'datum', e.target.value)} />
                </div>
                <div className="admin-form-group" style={{ margin: 0 }}>
                  <label className="admin-form-label">Uhrzeit</label>
                  <input className="admin-form-input" type="time" value={t.uhrzeit} onChange={e => updateTermin(i, 'uhrzeit', e.target.value)} />
                </div>
                <div className="admin-form-group" style={{ margin: 0 }}>
                  <label className="admin-form-label">Notiz</label>
                  <input className="admin-form-input" value={t.notiz} onChange={e => updateTermin(i, 'notiz', e.target.value)} placeholder="optional" />
                </div>
                <button type="button" className="admin-btn admin-btn-sm admin-btn-danger" style={{ marginBottom: 1 }} onClick={() => removeTermin(i)}>
                  ✕
                </button>
              </div>
            ))}
          </div>

          {/* ── Ansprechpersonen ──────────────────────────────── */}
          <div className="admin-table-wrap" style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div className="admin-section-title" style={{ margin: 0 }}>Ansprechpersonen</div>
              <button type="button" className="admin-btn admin-btn-sm admin-btn-secondary" onClick={addKontakt}>
                + Kontakt hinzufügen
              </button>
            </div>
            {kontakte.length === 0 && (
              <div style={{ color: 'var(--muted)', fontSize: 13 }}>Keine Ansprechpersonen eingetragen.</div>
            )}
            {kontakte.map((k, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 2fr auto', gap: 10, marginBottom: 10, alignItems: 'end' }}>
                <div className="admin-form-group" style={{ margin: 0 }}>
                  <label className="admin-form-label">Name</label>
                  <input className="admin-form-input" value={k.name} onChange={e => updateKontakt(i, 'name', e.target.value)} />
                </div>
                <div className="admin-form-group" style={{ margin: 0 }}>
                  <label className="admin-form-label">Rolle</label>
                  <select className="admin-form-select" value={k.rolle} onChange={e => updateKontakt(i, 'rolle', e.target.value)}>
                    <option value="Objekt">Objekt</option>
                    <option value="Auftraggeber">Auftraggeber</option>
                  </select>
                </div>
                <div className="admin-form-group" style={{ margin: 0 }}>
                  <label className="admin-form-label">Telefon</label>
                  <input className="admin-form-input" value={k.telefon} onChange={e => updateKontakt(i, 'telefon', e.target.value)} />
                </div>
                <div className="admin-form-group" style={{ margin: 0 }}>
                  <label className="admin-form-label">E-Mail</label>
                  <input className="admin-form-input" type="email" value={k.email} onChange={e => updateKontakt(i, 'email', e.target.value)} />
                </div>
                <button type="button" className="admin-btn admin-btn-sm admin-btn-danger" style={{ marginBottom: 1 }} onClick={() => removeKontakt(i)}>
                  ✕
                </button>
              </div>
            ))}
          </div>

          {/* ── Zuständigkeiten ───────────────────────────────── */}
          <div className="admin-table-wrap" style={{ padding: 24 }}>
            <div className="admin-section-title">Zuständigkeiten</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="admin-form-group">
                <label className="admin-form-label">Sachbearbeiter</label>
                <select className="admin-form-select" value={sachbearbeiterId} onChange={e => setSachbearbeiterId(e.target.value)}>
                  <option value="">— auswählen —</option>
                  {staff.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="admin-form-group">
                <label className="admin-form-label">Monteure</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                  {staff.length === 0 && (
                    <span style={{ color: 'var(--muted)', fontSize: 13 }}>Keine Mitarbeiter gefunden.</span>
                  )}
                  {staff.map(s => (
                    <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, padding: '4px 10px', borderRadius: 6, background: monteurIds.includes(s.id) ? 'var(--primary)' : 'var(--surface-2)', color: monteurIds.includes(s.id) ? '#fff' : 'var(--text)', border: '1px solid', borderColor: monteurIds.includes(s.id) ? 'var(--primary)' : 'var(--border)' }}>
                      <input
                        type="checkbox"
                        style={{ display: 'none' }}
                        checked={monteurIds.includes(s.id)}
                        onChange={() => toggleMonteur(s.id)}
                      />
                      {s.name}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" className="admin-btn admin-btn-secondary" onClick={onClose}>Abbrechen</button>
            <button type="submit" className="admin-btn admin-btn-primary" disabled={saving || !name.trim()}>
              {saving ? 'Speichern…' : 'Speichern'}
            </button>
          </div>
        </form>

        {/* ── Seitenleiste ──────────────────────────────────── */}
        {!isNew && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="admin-table-wrap" style={{ padding: 20 }}>
              <div className="admin-section-title">Status</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                {STATUS_SEQUENCE.filter(s => s !== 'abgeschlossen').map(s => {
                  const isCurrent = effectiveStatus === s
                  return (
                    <button
                      key={s}
                      type="button"
                      disabled={isCurrent || settingStatus || isClosed}
                      className="admin-btn admin-btn-secondary"
                      style={{ width: '100%', justifyContent: 'center', fontWeight: isCurrent ? 700 : undefined, outline: isCurrent ? '2px solid var(--primary)' : undefined, outlineOffset: isCurrent ? '2px' : undefined }}
                      onClick={() => handleSetStatus(s)}
                    >
                      {isCurrent && '● '}{PROJECT_STATUS_LABELS[s]}
                    </button>
                  )
                })}
                {!isClosed && (
                  <button
                    type="button"
                    disabled={settingStatus}
                    className="admin-btn admin-btn-danger"
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={() => setConfirmClose(true)}
                  >
                    Abschliessen
                  </button>
                )}
                {isClosed && (
                  <button
                    type="button"
                    disabled={reopening}
                    className="admin-btn admin-btn-secondary"
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={() => setConfirmReopen(true)}
                  >
                    Wiedereröffnen
                  </button>
                )}
              </div>
              <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 14 }}>
                Abgeschlossene Projekte werden für Mitarbeiter ausgeblendet.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Dateien ──────────────────────────────────────────── */}
      {!isNew && (
        <div className="admin-table-wrap" style={{ padding: 24, marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div className="admin-section-title" style={{ margin: 0 }}>Dokumente & Fotos</div>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                style={{ display: 'none' }}
                onChange={handleUpload}
              />
              <button
                type="button"
                className="admin-btn admin-btn-sm admin-btn-secondary"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? 'Wird hochgeladen…' : '+ Datei hochladen'}
              </button>
            </div>
          </div>
          {files.length === 0 && (
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>Noch keine Dateien hochgeladen.</div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {files.map(f => (
              <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: 18 }}>{f.mime_type === 'application/pdf' ? '📄' : '🖼️'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {f.file_url
                    ? <a href={f.file_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, fontWeight: 500, color: 'var(--primary)', textDecoration: 'none', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.filename}</a>
                    : <span style={{ fontSize: 13, fontWeight: 500 }}>{f.filename}</span>
                  }
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{formatDateTime(f.created_at)}</div>
                </div>
                <button
                  type="button"
                  className="admin-btn admin-btn-sm admin-btn-danger"
                  onClick={() => handleDeleteFile(f.id)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Kommentare ───────────────────────────────────────── */}
      {!isNew && (
        <div className="admin-table-wrap" style={{ padding: 24, marginTop: 20 }}>
          <div className="admin-section-title" style={{ marginBottom: 14 }}>Kommentare</div>
          {comments.length === 0 && (
            <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>Noch keine Kommentare.</div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
            {comments.map(c => (
              <div key={c.id} style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{c.author_name || 'Unbekannt'}</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>{formatDateTime(c.created_at)}</span>
                </div>
                <div style={{ fontSize: 13 }}>{c.text}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="admin-form-input"
              style={{ flex: 1 }}
              placeholder="Kommentar hinzufügen…"
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleAddComment() } }}
            />
            <button
              type="button"
              className="admin-btn admin-btn-primary"
              disabled={addingComment || !newComment.trim()}
              onClick={handleAddComment}
            >
              {addingComment ? '…' : 'Senden'}
            </button>
          </div>
        </div>
      )}

      {/* ── Dialoge ──────────────────────────────────────────── */}
      {confirmClose && (
        <div className="admin-confirm-overlay">
          <div className="admin-confirm-box">
            <div className="admin-confirm-title">Projekt abschliessen?</div>
            <div className="admin-confirm-text">
              «{project?.name}» wird für Mitarbeiter ausgeblendet. Berichte bleiben erhalten.
            </div>
            <div className="admin-confirm-actions">
              <button className="admin-btn admin-btn-secondary" onClick={() => setConfirmClose(false)}>Abbrechen</button>
              <button className="admin-btn admin-btn-danger" onClick={handleClose} disabled={settingStatus}>
                {settingStatus ? 'Schliessen…' : 'Ja, abschliessen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmReopen && (
        <div className="admin-confirm-overlay">
          <div className="admin-confirm-box">
            <div className="admin-confirm-title">Projekt wiedereröffnen?</div>
            <div className="admin-confirm-text">
              Grund für die Wiedereröffnung von «{project?.name}»:
            </div>
            <div style={{ margin: '12px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
                <input
                  type="radio"
                  name="reopenReason"
                  value="fehler"
                  checked={reopenReason === 'fehler'}
                  onChange={() => setReopenReason('fehler')}
                />
                Fehler beim Abschluss
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
                <input
                  type="radio"
                  name="reopenReason"
                  value="garantiefall"
                  checked={reopenReason === 'garantiefall'}
                  onChange={() => setReopenReason('garantiefall')}
                />
                Garantiefall <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 4 }}>(setzt Art der Arbeit auf «Garantiefall»)</span>
              </label>
            </div>
            <div className="admin-confirm-actions">
              <button className="admin-btn admin-btn-secondary" onClick={() => setConfirmReopen(false)}>Abbrechen</button>
              <button className="admin-btn admin-btn-primary" onClick={handleReopen} disabled={reopening}>
                {reopening ? 'Wird geöffnet…' : 'Wiedereröffnen'}
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
