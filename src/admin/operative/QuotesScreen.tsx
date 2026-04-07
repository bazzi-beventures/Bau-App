import { useEffect, useState, useRef } from 'react'
import { apiFetch, apiFormFetch } from '../../api/client'

interface Quote {
  id: number
  quote_number: string
  project_name: string
  total_amount: number
  status: string
  created_at: string
  pdf_url: string | null
}

interface Project {
  id: string
  name: string
  customer_name?: string
  is_closed?: boolean
}

interface StaffRole {
  funktion: string
  hourly_rate: number
}

interface Material {
  art_nr: string
  name: string
  unit_price: number
  unit: string
  category?: string
}

interface LaborRow { description: string; quantity: string; unit_price: number | null }
interface MaterialRow { art_nr: string; quantity: string; description?: string; unit_price?: number; unit?: string }
interface ExtraProductRow { description: string; quantity: string; unit: string; unit_price: string }
interface ExtraChargeRow { description: string; total_price: string }
interface TravelRow { description: string; total_price: string }

const STATUS_LABELS: Record<string, string> = {
  entwurf: 'Entwurf',
  gesendet: 'Gesendet',
  akzeptiert: 'Akzeptiert',
  abgelehnt: 'Abgelehnt',
  archiviert: 'Archiviert',
}

const STATUS_BADGE: Record<string, string> = {
  entwurf: 'admin-badge-draft',
  gesendet: 'admin-badge-sent',
  akzeptiert: 'admin-badge-approved',
  abgelehnt: 'admin-badge-rejected',
  archiviert: 'admin-badge-closed',
}

function fmtCHF(amount: number) {
  return `CHF ${amount.toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function parseNum(v: string): number {
  return parseFloat(v.replace(',', '.')) || 0
}

// ─── Create Form ────────────────────────────────────────────

function QuoteCreateForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [projects, setProjects] = useState<Project[]>([])
  const [roles, setRoles] = useState<StaffRole[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [projectName, setProjectName] = useState('')
  const [laborRows, setLaborRows] = useState<LaborRow[]>([{ description: '', quantity: '', unit_price: null }])
  const [materialRows, setMaterialRows] = useState<MaterialRow[]>([{ art_nr: '', quantity: '' }])
  const [extraProducts, setExtraProducts] = useState<ExtraProductRow[]>([])
  const [extraCharges, setExtraCharges] = useState<ExtraChargeRow[]>([])
  const [travelRows, setTravelRows] = useState<TravelRow[]>([])
  const [laborDiscount, setLaborDiscount] = useState('')
  const [materialDiscount, setMaterialDiscount] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    Promise.all([
      apiFetch('/pwa/admin/projects') as Promise<Project[]>,
      apiFetch('/pwa/admin/staff-roles') as Promise<StaffRole[]>,
      apiFetch('/pwa/admin/materials') as Promise<Material[]>,
    ]).then(([p, r, m]) => {
      setProjects(p.filter(x => !x.is_closed))
      setRoles(r)
      setMaterials(m)
    })
  }, [])

  // ── Labor helpers ──
  function updateLabor(i: number, patch: Partial<LaborRow>) {
    setLaborRows(rows => rows.map((r, j) => j === i ? { ...r, ...patch } : r))
  }
  function addLabor() { setLaborRows(r => [...r, { description: '', quantity: '', unit_price: null }]) }
  function removeLabor(i: number) { setLaborRows(r => r.filter((_, j) => j !== i)) }

  // ── Material helpers ──
  function updateMaterial(i: number, patch: Partial<MaterialRow>) {
    setMaterialRows(rows => rows.map((r, j) => j === i ? { ...r, ...patch } : r))
  }
  function addMaterial() { setMaterialRows(r => [...r, { art_nr: '', quantity: '' }]) }
  function removeMaterial(i: number) { setMaterialRows(r => r.filter((_, j) => j !== i)) }

  // ── Extra product helpers ──
  function updateExtraProduct(i: number, patch: Partial<ExtraProductRow>) {
    setExtraProducts(rows => rows.map((r, j) => j === i ? { ...r, ...patch } : r))
  }
  function addExtraProduct() { setExtraProducts(r => [...r, { description: '', quantity: '1', unit: 'Stk', unit_price: '' }]) }
  function removeExtraProduct(i: number) { setExtraProducts(r => r.filter((_, j) => j !== i)) }

  // ── Extra charge helpers ──
  function updateExtraCharge(i: number, patch: Partial<ExtraChargeRow>) {
    setExtraCharges(rows => rows.map((r, j) => j === i ? { ...r, ...patch } : r))
  }
  function addExtraCharge() { setExtraCharges(r => [...r, { description: '', total_price: '' }]) }
  function removeExtraCharge(i: number) { setExtraCharges(r => r.filter((_, j) => j !== i)) }

  // ── Travel helpers ──
  function addTravel() { setTravelRows(r => [...r, { description: 'Fahrtpauschale', total_price: '' }]) }
  function updateTravel(i: number, patch: Partial<TravelRow>) {
    setTravelRows(rows => rows.map((r, j) => j === i ? { ...r, ...patch } : r))
  }
  function removeTravel(i: number) { setTravelRows(r => r.filter((_, j) => j !== i)) }

  // ── PDF Upload ──
  async function handlePdfUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError('')
    try {
      const form = new FormData()
      form.append('file', file)
      const result = await apiFormFetch('/pwa/admin/quotes/extract-pdf', form) as {
        supplier: string
        product_type: string
        material_items: { description: string; quantity: number; unit: string; unit_price: number; total_price: number }[]
        net_total: number
      }
      // Fill material rows from extracted data (as free-form extra products)
      const extracted: ExtraProductRow[] = result.material_items.map(item => ({
        description: `${item.description}${result.supplier ? ` (${result.supplier})` : ''}`,
        quantity: String(item.quantity),
        unit: item.unit || 'Stk',
        unit_price: String(item.unit_price),
      }))
      setExtraProducts(prev => [...prev, ...extracted])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PDF-Extraktion fehlgeschlagen')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  // ── Submit ──
  async function handleSubmit() {
    if (!projectName) { setError('Bitte Projekt auswählen'); return }
    const hasLabor = laborRows.some(r => r.description && parseNum(r.quantity) > 0)
    const hasMaterial = materialRows.some(r => r.art_nr && parseNum(r.quantity) > 0)
    const hasExtra = extraProducts.some(r => r.description)
    const hasCharge = extraCharges.some(r => r.description)
    const hasTravel = travelRows.some(r => parseNum(r.total_price) > 0)
    if (!hasLabor && !hasMaterial && !hasExtra && !hasCharge && !hasTravel) {
      setError('Mindestens eine Position erforderlich')
      return
    }

    setSaving(true)
    setError('')
    try {
      const payload = {
        project_name: projectName,
        labor_items: laborRows.filter(r => r.description && parseNum(r.quantity) > 0).map(r => ({
          description: r.description,
          quantity: parseNum(r.quantity),
          unit_price: r.unit_price,
        })),
        material_items: materialRows.filter(r => r.art_nr && parseNum(r.quantity) > 0).map(r => ({
          art_nr: r.art_nr,
          quantity: parseNum(r.quantity),
        })),
        travel_items: travelRows.filter(r => parseNum(r.total_price) > 0).map(r => ({
          description: r.description,
          distance_km: 0,
          unit_price: parseNum(r.total_price),
          total_price: parseNum(r.total_price),
        })),
        extra_product_items: extraProducts.filter(r => r.description).map(r => ({
          description: r.description,
          quantity: parseNum(r.quantity),
          unit: r.unit,
          unit_price: parseNum(r.unit_price),
          total_price: round2(parseNum(r.quantity) * parseNum(r.unit_price)),
        })),
        extra_charge_items: extraCharges.filter(r => r.description && parseNum(r.total_price) > 0).map(r => ({
          description: r.description,
          total_price: parseNum(r.total_price),
        })),
        labor_discount_pct: parseNum(laborDiscount),
        material_discount_pct: parseNum(materialDiscount),
        notes: notes || null,
      }
      await apiFetch('/pwa/admin/quotes', { method: 'POST', body: JSON.stringify(payload) })
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Erstellen')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="admin-table-wrap" style={{ padding: 24 }}>
      <h3 style={{ margin: '0 0 20px' }}>Neue Offerte erstellen</h3>

      {error && <div className="admin-alert admin-alert-error" style={{ marginBottom: 16 }}>{error}</div>}

      {/* Project */}
      <div style={{ marginBottom: 20 }}>
        <label className="admin-form-label">Projekt *</label>
        <select className="admin-form-select" value={projectName} onChange={e => setProjectName(e.target.value)}>
          <option value="">-- Projekt wählen --</option>
          {projects.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
        </select>
      </div>

      {/* Labor */}
      <fieldset style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginBottom: 20 }}>
        <legend style={{ fontWeight: 600, padding: '0 8px' }}>Lohnpositionen</legend>
        {laborRows.map((row, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <select
              className="admin-form-select"
              style={{ flex: 2 }}
              value={row.description}
              onChange={e => {
                const role = roles.find(r => r.funktion === e.target.value)
                updateLabor(i, { description: e.target.value, unit_price: role?.hourly_rate ?? null })
              }}
            >
              <option value="">Funktion wählen…</option>
              {roles.map(r => <option key={r.funktion} value={r.funktion}>{r.funktion} ({fmtCHF(r.hourly_rate)}/h)</option>)}
            </select>
            <input
              className="admin-form-input"
              style={{ flex: 1 }}
              placeholder="Stunden"
              value={row.quantity}
              onChange={e => updateLabor(i, { quantity: e.target.value })}
            />
            {laborRows.length > 1 && (
              <button className="admin-btn admin-btn-danger admin-btn-sm" onClick={() => removeLabor(i)} title="Entfernen">✕</button>
            )}
          </div>
        ))}
        <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={addLabor}>+ Lohnposition</button>
      </fieldset>

      {/* Materials */}
      <fieldset style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginBottom: 20 }}>
        <legend style={{ fontWeight: 600, padding: '0 8px' }}>Materialpositionen</legend>
        {materialRows.map((row, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <select
              className="admin-form-select"
              style={{ flex: 2 }}
              value={row.art_nr}
              onChange={e => updateMaterial(i, { art_nr: e.target.value })}
            >
              <option value="">Material wählen…</option>
              {materials.map(m => (
                <option key={m.art_nr} value={m.art_nr}>
                  {m.art_nr} — {m.name} ({fmtCHF(m.unit_price)}/{m.unit})
                </option>
              ))}
            </select>
            <input
              className="admin-form-input"
              style={{ flex: 1 }}
              placeholder="Menge"
              value={row.quantity}
              onChange={e => updateMaterial(i, { quantity: e.target.value })}
            />
            {materialRows.length > 1 && (
              <button className="admin-btn admin-btn-danger admin-btn-sm" onClick={() => removeMaterial(i)} title="Entfernen">✕</button>
            )}
          </div>
        ))}
        <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={addMaterial}>+ Materialposition</button>
      </fieldset>

      {/* Extra Products */}
      <fieldset style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginBottom: 20 }}>
        <legend style={{ fontWeight: 600, padding: '0 8px' }}>Weitere Produkte / Freie Positionen</legend>
        {extraProducts.map((row, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input className="admin-form-input" style={{ flex: 3, minWidth: 180 }} placeholder="Beschreibung" value={row.description} onChange={e => updateExtraProduct(i, { description: e.target.value })} />
            <input className="admin-form-input" style={{ flex: 1, minWidth: 60 }} placeholder="Menge" value={row.quantity} onChange={e => updateExtraProduct(i, { quantity: e.target.value })} />
            <input className="admin-form-input" style={{ flex: 1, minWidth: 60 }} placeholder="Einheit" value={row.unit} onChange={e => updateExtraProduct(i, { unit: e.target.value })} />
            <input className="admin-form-input" style={{ flex: 1, minWidth: 80 }} placeholder="Preis/Stk" value={row.unit_price} onChange={e => updateExtraProduct(i, { unit_price: e.target.value })} />
            <button className="admin-btn admin-btn-danger admin-btn-sm" onClick={() => removeExtraProduct(i)} title="Entfernen">✕</button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={addExtraProduct}>+ Freie Position</button>
          <label className="admin-btn admin-btn-secondary admin-btn-sm" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {uploading ? 'Wird extrahiert…' : 'PDF hochladen'}
            <input ref={fileRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={handlePdfUpload} disabled={uploading} />
          </label>
        </div>
      </fieldset>

      {/* Extra Charges */}
      <fieldset style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginBottom: 20 }}>
        <legend style={{ fontWeight: 600, padding: '0 8px' }}>Sonderaufwände</legend>
        {extraCharges.map((row, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <input className="admin-form-input" style={{ flex: 3 }} placeholder="Beschreibung" value={row.description} onChange={e => updateExtraCharge(i, { description: e.target.value })} />
            <input className="admin-form-input" style={{ flex: 1 }} placeholder="Betrag CHF" value={row.total_price} onChange={e => updateExtraCharge(i, { total_price: e.target.value })} />
            <button className="admin-btn admin-btn-danger admin-btn-sm" onClick={() => removeExtraCharge(i)} title="Entfernen">✕</button>
          </div>
        ))}
        <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={addExtraCharge}>+ Sonderaufwand</button>
      </fieldset>

      {/* Travel */}
      <fieldset style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginBottom: 20 }}>
        <legend style={{ fontWeight: 600, padding: '0 8px' }}>Fahrtkosten</legend>
        {travelRows.map((row, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <input className="admin-form-input" style={{ flex: 3 }} placeholder="Beschreibung" value={row.description} onChange={e => updateTravel(i, { description: e.target.value })} />
            <input className="admin-form-input" style={{ flex: 1 }} placeholder="Betrag CHF" value={row.total_price} onChange={e => updateTravel(i, { total_price: e.target.value })} />
            <button className="admin-btn admin-btn-danger admin-btn-sm" onClick={() => removeTravel(i)} title="Entfernen">✕</button>
          </div>
        ))}
        <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={addTravel}>+ Fahrtkosten</button>
      </fieldset>

      {/* Discounts */}
      <fieldset style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginBottom: 20 }}>
        <legend style={{ fontWeight: 600, padding: '0 8px' }}>Rabatte</legend>
        <div style={{ display: 'flex', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <label className="admin-form-label">Rabatt auf Lohn (%)</label>
            <input className="admin-form-input" placeholder="0" value={laborDiscount} onChange={e => setLaborDiscount(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label className="admin-form-label">Rabatt auf Material (%)</label>
            <input className="admin-form-input" placeholder="0" value={materialDiscount} onChange={e => setMaterialDiscount(e.target.value)} />
          </div>
        </div>
      </fieldset>

      {/* Notes */}
      <div style={{ marginBottom: 20 }}>
        <label className="admin-form-label">Bemerkungen</label>
        <textarea className="admin-form-input" rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optionale Bemerkungen zur Offerte…" />
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 12 }}>
        <button className="admin-btn admin-btn-primary" onClick={handleSubmit} disabled={saving}>
          {saving ? 'Wird erstellt…' : 'Offerte erstellen'}
        </button>
        <button className="admin-btn admin-btn-secondary" onClick={onCancel} disabled={saving}>Abbrechen</button>
      </div>
    </div>
  )
}

function round2(n: number) { return Math.round(n * 100) / 100 }

// ─── Main Screen ────────────────────────────────────────────

export default function QuotesScreen() {
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [acting, setActing] = useState<number | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  // Send quote
  const [sendQuote, setSendQuote] = useState<Quote | null>(null)
  const [sendEmail, setSendEmail] = useState('')
  const [sending, setSending] = useState(false)

  async function load() {
    setLoading(true)
    try {
      setQuotes(await apiFetch('/pwa/admin/quotes') as Quote[])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function showToast(msg: string, type: 'success' | 'error') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  async function handleStatus(id: number, status: string) {
    setActing(id)
    try {
      await apiFetch(`/pwa/admin/quotes/${id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      })
      showToast(`Status auf «${STATUS_LABELS[status]}» gesetzt`, 'success')
      load()
    } catch {
      showToast('Fehler beim Aktualisieren', 'error')
    } finally {
      setActing(null)
    }
  }

  async function handleSendQuote() {
    if (!sendQuote || !sendEmail) return
    setSending(true)
    try {
      await apiFetch('/pwa/admin/quotes/send', {
        method: 'POST',
        body: JSON.stringify({ quote_id: sendQuote.id, recipient_email: sendEmail }),
      })
      showToast(`Offerte an ${sendEmail} gesendet`, 'success')
      setSendQuote(null)
      load()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Versand fehlgeschlagen', 'error')
    } finally {
      setSending(false)
    }
  }

  const statuses = ['', 'entwurf', 'gesendet', 'akzeptiert', 'abgelehnt', 'archiviert']

  const filtered = quotes.filter(q => {
    const matchStatus = !statusFilter || q.status === statusFilter
    const matchSearch = q.project_name.toLowerCase().includes(search.toLowerCase()) ||
      q.quote_number.toLowerCase().includes(search.toLowerCase())
    return matchStatus && matchSearch
  })

  if (showCreate) {
    return (
      <div className="admin-page">
        <QuoteCreateForm
          onDone={() => { setShowCreate(false); load(); showToast('Offerte erstellt', 'success') }}
          onCancel={() => setShowCreate(false)}
        />
      </div>
    )
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Offerten</div>
          <div className="admin-page-subtitle">{filtered.length} Einträge</div>
        </div>
        <button className="admin-btn admin-btn-primary" onClick={() => setShowCreate(true)}>
          + Offerte erstellen
        </button>
      </div>

      <div className="admin-table-wrap">
        <div className="admin-filter-bar">
          <input
            className="admin-search"
            placeholder="Projekt oder Offerten-Nr. suchen…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select
            className="admin-form-select"
            style={{ width: 'auto', flexShrink: 0 }}
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            {statuses.map(s => (
              <option key={s} value={s}>{s ? STATUS_LABELS[s] : 'Alle Status'}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="admin-loading"><div className="admin-spinner" /> Laden…</div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Nr.</th>
                <th>Projekt</th>
                <th>Betrag</th>
                <th>Status</th>
                <th>Erstellt</th>
                <th>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="admin-table-empty">Keine Offerten gefunden.</td></tr>
              ) : filtered.map(q => (
                <tr key={q.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{q.quote_number}</td>
                  <td><strong>{q.project_name}</strong></td>
                  <td style={{ fontWeight: 700 }}>{fmtCHF(q.total_amount)}</td>
                  <td>
                    <span className={`admin-badge ${STATUS_BADGE[q.status] || 'admin-badge-draft'}`}>
                      {STATUS_LABELS[q.status] || q.status}
                    </span>
                  </td>
                  <td style={{ color: 'var(--muted)' }}>{fmtDate(q.created_at)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {q.pdf_url && (
                        <a
                          href={q.pdf_url}
                          target="_blank"
                          rel="noreferrer"
                          className="admin-btn admin-btn-secondary admin-btn-sm"
                          onClick={e => e.stopPropagation()}
                        >
                          PDF
                        </a>
                      )}
                      {['entwurf', 'akzeptiert'].includes(q.status) && (
                        <button
                          className="admin-btn admin-btn-primary admin-btn-sm"
                          onClick={() => { setSendEmail(''); setSendQuote(q) }}
                          disabled={acting === q.id}
                        >
                          Senden
                        </button>
                      )}
                      {q.status === 'gesendet' && (
                        <>
                          <button
                            className="admin-btn admin-btn-success admin-btn-sm"
                            onClick={() => handleStatus(q.id, 'akzeptiert')}
                            disabled={acting === q.id}
                          >
                            {acting === q.id ? '…' : 'Akzeptieren'}
                          </button>
                          <button
                            className="admin-btn admin-btn-danger admin-btn-sm"
                            onClick={() => handleStatus(q.id, 'abgelehnt')}
                            disabled={acting === q.id}
                          >
                            {acting === q.id ? '…' : 'Ablehnen'}
                          </button>
                        </>
                      )}
                      {['entwurf', 'gesendet', 'akzeptiert', 'abgelehnt'].includes(q.status) && (
                        <button
                          className="admin-btn admin-btn-secondary admin-btn-sm"
                          onClick={() => handleStatus(q.id, 'archiviert')}
                          disabled={acting === q.id}
                          title="Archivieren"
                        >
                          Archiv
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Dialog: Offerte senden */}
      {sendQuote && (
        <div className="admin-confirm-overlay">
          <div className="admin-confirm-box" style={{ maxWidth: 440 }}>
            <div className="admin-confirm-title">Offerte senden</div>
            <div className="admin-confirm-text" style={{ marginBottom: 12 }}>
              {sendQuote.quote_number} · {fmtCHF(sendQuote.total_amount)}<br />
              Projekt: {sendQuote.project_name}
            </div>
            <div style={{ marginBottom: 12 }}>
              <label className="admin-form-label">Empfänger E-Mail</label>
              <input
                className="admin-form-input"
                type="email"
                value={sendEmail}
                onChange={e => setSendEmail(e.target.value)}
                placeholder="kunde@example.com"
              />
            </div>
            <div className="admin-confirm-actions">
              <button className="admin-btn admin-btn-secondary" onClick={() => setSendQuote(null)} disabled={sending}>Abbrechen</button>
              <button className="admin-btn admin-btn-primary" onClick={handleSendQuote} disabled={!sendEmail || sending}>
                {sending ? 'Wird gesendet…' : 'Offerte senden'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="admin-toast-container">
          <div className={`admin-toast ${toast.type}`}>{toast.msg}</div>
        </div>
      )}
    </div>
  )
}
