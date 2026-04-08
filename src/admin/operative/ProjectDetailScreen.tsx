import { useEffect, useState } from 'react'
import { apiFetch } from '../../api/client'
import { Kontakt, Project, Termin } from './ProjectsScreen'

interface StaffMember {
  id: string
  name: string
}

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
  const [auftraggeber, setAuftraggeber] = useState(project?.auftraggeber ?? '')
  const [eigentuemer, setEigentuemer] = useState(project?.eigentuemer ?? '')
  const [artDerArbeit, setArtDerArbeit] = useState(project?.art_der_arbeit ?? '')
  const [sachbearbeiterId, setSachbearbeiterId] = useState(project?.sachbearbeiter_id ?? '')
  const [monteurIds, setMonteurIds] = useState<string[]>(project?.monteur_ids ?? [])
  const [termine, setTermine] = useState<Termin[]>(project?.termine ?? [])
  const [kontakte, setKontakte] = useState<Kontakt[]>(project?.kontakte ?? [])

  const [staff, setStaff] = useState<StaffMember[]>([])
  const [saving, setSaving] = useState(false)
  const [closing, setClosing] = useState(false)
  const [error, setError] = useState('')
  const [confirmClose, setConfirmClose] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    apiFetch('/pwa/admin/staff').then((data: unknown) => {
      const arr = data as { id: string; name: string }[]
      setStaff(arr.map(s => ({ id: s.id, name: s.name })))
    }).catch(() => {})
  }, [])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
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

  // ── Monteure helpers ─────────────────────────────────────────
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
          customer_name: customerName || null,
          customer_email: customerEmail || null,
          customer_address: customerAddress || null,
          auftraggeber: auftraggeber || null,
          eigentuemer: eigentuemer || null,
          art_der_arbeit: artDerArbeit || null,
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
                </select>
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
