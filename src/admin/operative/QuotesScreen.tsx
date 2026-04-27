import { useEffect, useState, useRef } from 'react'
import { apiFetch, apiFormFetch } from '../../api/client'
import { PdfExtractionReviewModal, PdfExtractionResponse, ConfirmedExtraProduct } from './PdfExtractionReviewModal'

interface Quote {
  id: number
  quote_number: string
  project_name: string
  total_amount: number
  status: string
  created_at: string
  pdf_url: string | null
  reminder_sent_at: string | null
}

interface Project {
  id: string
  name: string
  is_closed?: boolean
}

interface StaffRole {
  name: string
  job_title: string | null
  hourly_rate: number
}

interface QuoteDetail {
  id: number
  quote_number: string
  project_name: string
  labor_items: { description: string; quantity: number; unit: string; unit_price: number; total_price: number }[]
  material_items: { description: string; quantity: number; unit: string; unit_price: number; total_price: number }[]
  travel_items: { description: string; total_price: number }[]
  extra_product_items: { description: string; quantity: number; unit: string; unit_price: number; total_price: number }[]
  extra_charge_items: { description: string; total_price: number }[]
  installation_items: { description: string; quantity: number; unit: string; unit_price: number; total_price: number }[]
  labor_discount_pct: number
  material_discount_pct: number
  notes: string | null
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
interface ExtraProductRow {
  description: string
  quantity: string
  unit: string
  unit_price: string
  // Optional: gesetzt, wenn Zeile aus einer Lieferanten-PDF-Extraktion stammt.
  ek_price?: number
  margin_factor?: number
  supplier_id?: string | null
  category?: string | null
}
interface ExtraChargeRow { description: string; total_price: string }
interface TravelRow { description: string; total_price: string }
interface InstallationRow { description: string; unit_price: string }
interface InstallationTemplate { id: string; label: string; default_fee: number; notes: string | null }

export const QUOTE_STATUS_LABELS: Record<string, string> = {
  entwurf: 'Entwurf',
  gesendet: 'Gesendet',
  akzeptiert: 'Akzeptiert',
  abgelehnt: 'Abgelehnt',
  absage: 'Absage',
  archiviert: 'Archiviert',
}

export const QUOTE_STATUS_BADGE: Record<string, string> = {
  entwurf: 'admin-badge-draft',
  gesendet: 'admin-badge-sent',
  akzeptiert: 'admin-badge-approved',
  abgelehnt: 'admin-badge-rejected',
  absage: 'admin-badge-rejected',
  archiviert: 'admin-badge-closed',
}

const STATUS_LABELS = QUOTE_STATUS_LABELS
const STATUS_BADGE = QUOTE_STATUS_BADGE

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

export function QuoteCreateForm({ onDone, onCancel, lockedProjectName }: { onDone: () => void; onCancel: () => void; lockedProjectName?: string }) {
  const [projects, setProjects] = useState<Project[]>([])
  const [roles, setRoles] = useState<StaffRole[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [projectName, setProjectName] = useState(lockedProjectName ?? '')
  const [laborRows, setLaborRows] = useState<LaborRow[]>([{ description: '', quantity: '', unit_price: null }])
  const [materialRows, setMaterialRows] = useState<MaterialRow[]>([{ art_nr: '', quantity: '' }])
  const [extraProducts, setExtraProducts] = useState<ExtraProductRow[]>([])
  const [extraCharges, setExtraCharges] = useState<ExtraChargeRow[]>([])
  const [travelRows, setTravelRows] = useState<TravelRow[]>([])
  const [installationRows, setInstallationRows] = useState<InstallationRow[]>([])
  const [installationTemplates, setInstallationTemplates] = useState<InstallationTemplate[]>([])
  const [laborDiscount, setLaborDiscount] = useState('')
  const [materialDiscount, setMaterialDiscount] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [pdfReview, setPdfReview] = useState<PdfExtractionResponse | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    Promise.all([
      apiFetch('/pwa/admin/projects') as Promise<Project[]>,
      apiFetch('/pwa/admin/staff-roles') as Promise<StaffRole[]>,
      apiFetch('/pwa/admin/materials') as Promise<Material[]>,
      apiFetch('/pwa/admin/installation-templates') as Promise<InstallationTemplate[]>,
    ]).then(([p, r, m, t]) => {
      setProjects(p.filter(x => !x.is_closed))
      setRoles(r)
      setMaterials(m)
      setInstallationTemplates(t)
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

  // ── Installation helpers ──
  function addInstallationFromTemplate(tpl: InstallationTemplate) {
    setInstallationRows(r => [...r, { description: tpl.label, unit_price: String(tpl.default_fee) }])
  }
  function updateInstallation(i: number, patch: Partial<InstallationRow>) {
    setInstallationRows(rows => rows.map((r, j) => j === i ? { ...r, ...patch } : r))
  }
  function removeInstallation(i: number) { setInstallationRows(r => r.filter((_, j) => j !== i)) }

  // ── PDF Upload ──
  async function handlePdfUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError('')
    try {
      const form = new FormData()
      form.append('file', file)
      const result = await apiFormFetch('/pwa/admin/quotes/extract-pdf', form) as PdfExtractionResponse
      if (!result.products || result.products.length === 0) {
        setError('Keine Produkte in der PDF erkannt.')
        return
      }
      setPdfReview(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PDF-Extraktion fehlgeschlagen')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function handlePdfReviewConfirm(confirmed: ConfirmedExtraProduct[]) {
    const rows: ExtraProductRow[] = confirmed.map(c => ({
      description: c.description,
      quantity: c.quantity,
      unit: c.unit,
      unit_price: c.unit_price,
      ek_price: c.ek_price,
      margin_factor: c.margin_factor,
      supplier_id: c.supplier_id,
      category: c.category,
    }))
    setExtraProducts(prev => [...prev, ...rows])
    setPdfReview(null)
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
        extra_product_items: extraProducts.filter(r => r.description).map(r => {
          const qty = parseNum(r.quantity)
          const price = parseNum(r.unit_price)
          const item: Record<string, unknown> = {
            description: r.description,
            quantity: qty,
            unit: r.unit,
            unit_price: price,
            total_price: round2(qty * price),
          }
          if (r.ek_price !== undefined) item.ek_price = r.ek_price
          if (r.margin_factor !== undefined) item.margin_factor = r.margin_factor
          if (r.supplier_id) item.supplier_id = r.supplier_id
          if (r.category) item.category = r.category
          return item
        }),
        extra_charge_items: extraCharges.filter(r => r.description && parseNum(r.total_price) > 0).map(r => ({
          description: r.description,
          total_price: parseNum(r.total_price),
        })),
        installation_items: installationRows.filter(r => r.description && parseNum(r.unit_price) > 0).map(r => ({
          description: r.description,
          quantity: 1,
          unit: 'Pau',
          unit_price: parseNum(r.unit_price),
          total_price: parseNum(r.unit_price),
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

      {pdfReview && (
        <PdfExtractionReviewModal
          data={pdfReview}
          onCancel={() => setPdfReview(null)}
          onConfirm={handlePdfReviewConfirm}
        />
      )}

      {error && <div className="admin-alert admin-alert-error" style={{ marginBottom: 16 }}>{error}</div>}

      {/* Project */}
      {!lockedProjectName && (
        <div style={{ marginBottom: 20 }}>
          <label className="admin-form-label">Projekt *</label>
          <select className="admin-form-select" value={projectName} onChange={e => setProjectName(e.target.value)}>
            <option value="">-- Projekt wählen --</option>
            {projects.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
          </select>
        </div>
      )}

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
                const role = roles.find(r => r.name === e.target.value)
                updateLabor(i, { description: e.target.value, unit_price: role?.hourly_rate ?? null })
              }}
            >
              <option value="">Funktion wählen…</option>
              {roles.map(r => (
                <option key={r.name} value={r.name}>
                  {r.name}{r.job_title ? ` — ${r.job_title}` : ''} ({fmtCHF(r.hourly_rate)}/h)
                </option>
              ))}
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

      {/* Installation */}
      <fieldset style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginBottom: 20 }}>
        <legend style={{ fontWeight: 600, padding: '0 8px' }}>Montagepositionen</legend>
        {installationRows.map((row, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <input className="admin-form-input" style={{ flex: 3 }} placeholder="Beschreibung" value={row.description} onChange={e => updateInstallation(i, { description: e.target.value })} />
            <input className="admin-form-input" style={{ flex: 1 }} placeholder="Betrag CHF" value={row.unit_price} onChange={e => updateInstallation(i, { unit_price: e.target.value })} />
            <button className="admin-btn admin-btn-danger admin-btn-sm" onClick={() => removeInstallation(i)} title="Entfernen">✕</button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {installationTemplates.map(tpl => (
            <button key={tpl.id} className="admin-btn admin-btn-secondary admin-btn-sm" onClick={() => addInstallationFromTemplate(tpl)} title={tpl.notes ?? undefined}>
              + {tpl.label} (CHF {tpl.default_fee})
            </button>
          ))}
          <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={() => setInstallationRows(r => [...r, { description: '', unit_price: '' }])}>+ Manuell</button>
        </div>
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

// ─── Edit Form ──────────────────────────────────────────────

type EditLaborRow = { description: string; quantity: string; unit_price: string }
type EditFreeRow = { description: string; quantity: string; unit: string; unit_price: string }
type EditChargeRow = { description: string; total_price: string }
type EditTravelRow = { description: string; total_price: string }

function QuoteEditForm({ quote, onDone, onCancel }: { quote: QuoteDetail; onDone: () => void; onCancel: () => void }) {
  const [roles, setRoles] = useState<StaffRole[]>([])
  const [laborRows, setLaborRows] = useState<EditLaborRow[]>(() =>
    quote.labor_items.map(i => ({ description: i.description, quantity: String(i.quantity), unit_price: String(i.unit_price) }))
  )
  const [materialRows, setMaterialRows] = useState<EditFreeRow[]>(() =>
    quote.material_items.map(i => ({ description: i.description, quantity: String(i.quantity), unit: i.unit, unit_price: String(i.unit_price) }))
  )
  const [extraProducts, setExtraProducts] = useState<EditFreeRow[]>(() =>
    quote.extra_product_items.map(i => ({ description: i.description, quantity: String(i.quantity), unit: i.unit, unit_price: String(i.unit_price) }))
  )
  const [extraCharges, setExtraCharges] = useState<EditChargeRow[]>(() =>
    quote.extra_charge_items.map(i => ({ description: i.description, total_price: String(i.total_price) }))
  )
  const [travelRows, setTravelRows] = useState<EditTravelRow[]>(() =>
    quote.travel_items.map(i => ({ description: i.description, total_price: String(i.total_price) }))
  )
  const [installationRows, setInstallationRows] = useState<InstallationRow[]>(() =>
    quote.installation_items.map(i => ({ description: i.description, unit_price: String(i.unit_price) }))
  )
  const [installationTemplates, setInstallationTemplates] = useState<InstallationTemplate[]>([])
  const [laborDiscount, setLaborDiscount] = useState(String(quote.labor_discount_pct || ''))
  const [materialDiscount, setMaterialDiscount] = useState(String(quote.material_discount_pct || ''))
  const [notes, setNotes] = useState(quote.notes || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      apiFetch('/pwa/admin/staff-roles') as Promise<StaffRole[]>,
      apiFetch('/pwa/admin/installation-templates') as Promise<InstallationTemplate[]>,
    ]).then(([r, t]) => { setRoles(r); setInstallationTemplates(t) })
  }, [])

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const payload = {
        labor_items: laborRows
          .filter(r => r.description && parseNum(r.quantity) > 0)
          .map(r => ({ description: r.description, quantity: parseNum(r.quantity), unit: 'h', unit_price: parseNum(r.unit_price), total_price: round2(parseNum(r.quantity) * parseNum(r.unit_price)) })),
        material_items: materialRows
          .filter(r => r.description && parseNum(r.quantity) > 0)
          .map(r => ({ description: r.description, quantity: parseNum(r.quantity), unit: r.unit, unit_price: parseNum(r.unit_price), total_price: round2(parseNum(r.quantity) * parseNum(r.unit_price)) })),
        travel_items: travelRows
          .filter(r => parseNum(r.total_price) > 0)
          .map(r => ({ description: r.description, total_price: parseNum(r.total_price) })),
        extra_product_items: extraProducts
          .filter(r => r.description)
          .map(r => ({ description: r.description, quantity: parseNum(r.quantity), unit: r.unit, unit_price: parseNum(r.unit_price), total_price: round2(parseNum(r.quantity) * parseNum(r.unit_price)) })),
        extra_charge_items: extraCharges
          .filter(r => r.description && parseNum(r.total_price) > 0)
          .map(r => ({ description: r.description, total_price: parseNum(r.total_price) })),
        installation_items: installationRows
          .filter(r => r.description && parseNum(r.unit_price) > 0)
          .map(r => ({ description: r.description, quantity: 1, unit: 'Pau', unit_price: parseNum(r.unit_price), total_price: parseNum(r.unit_price) })),
        labor_discount_pct: parseNum(laborDiscount),
        material_discount_pct: parseNum(materialDiscount),
        notes: notes || null,
      }
      await apiFetch(`/pwa/admin/quotes/${quote.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Speichern')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="admin-table-wrap" style={{ padding: 24 }}>
      <h3 style={{ margin: '0 0 4px' }}>Offerte bearbeiten</h3>
      <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 20 }}>{quote.quote_number} · {quote.project_name}</div>

      {error && <div className="admin-alert admin-alert-error" style={{ marginBottom: 16 }}>{error}</div>}

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
                const role = roles.find(r => r.name === e.target.value)
                setLaborRows(rows => rows.map((r, j) => j === i ? { ...r, description: e.target.value, unit_price: role ? String(role.hourly_rate) : r.unit_price } : r))
              }}
            >
              <option value="">Funktion wählen…</option>
              {roles.map(r => (
                <option key={r.name} value={r.name}>
                  {r.name}{r.job_title ? ` — ${r.job_title}` : ''} ({fmtCHF(r.hourly_rate)}/h)
                </option>
              ))}
            </select>
            <input className="admin-form-input" style={{ flex: 1 }} placeholder="Stunden" value={row.quantity}
              onChange={e => setLaborRows(rows => rows.map((r, j) => j === i ? { ...r, quantity: e.target.value } : r))} />
            <input className="admin-form-input" style={{ flex: 1 }} placeholder="CHF/h" value={row.unit_price}
              onChange={e => setLaborRows(rows => rows.map((r, j) => j === i ? { ...r, unit_price: e.target.value } : r))} />
            {laborRows.length > 1 && <button className="admin-btn admin-btn-danger admin-btn-sm" onClick={() => setLaborRows(r => r.filter((_, j) => j !== i))}>✕</button>}
          </div>
        ))}
        <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={() => setLaborRows(r => [...r, { description: '', quantity: '', unit_price: '' }])}>+ Lohnposition</button>
      </fieldset>

      {/* Materials */}
      <fieldset style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginBottom: 20 }}>
        <legend style={{ fontWeight: 600, padding: '0 8px' }}>Materialpositionen</legend>
        {materialRows.map((row, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input className="admin-form-input" style={{ flex: 3, minWidth: 180 }} placeholder="Bezeichnung" value={row.description}
              onChange={e => setMaterialRows(rows => rows.map((r, j) => j === i ? { ...r, description: e.target.value } : r))} />
            <input className="admin-form-input" style={{ flex: 1, minWidth: 60 }} placeholder="Menge" value={row.quantity}
              onChange={e => setMaterialRows(rows => rows.map((r, j) => j === i ? { ...r, quantity: e.target.value } : r))} />
            <input className="admin-form-input" style={{ flex: 1, minWidth: 60 }} placeholder="Einheit" value={row.unit}
              onChange={e => setMaterialRows(rows => rows.map((r, j) => j === i ? { ...r, unit: e.target.value } : r))} />
            <input className="admin-form-input" style={{ flex: 1, minWidth: 80 }} placeholder="CHF/Stk" value={row.unit_price}
              onChange={e => setMaterialRows(rows => rows.map((r, j) => j === i ? { ...r, unit_price: e.target.value } : r))} />
            <button className="admin-btn admin-btn-danger admin-btn-sm" onClick={() => setMaterialRows(r => r.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
        <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={() => setMaterialRows(r => [...r, { description: '', quantity: '', unit: 'Stk', unit_price: '' }])}>+ Materialposition</button>
      </fieldset>

      {/* Extra Products */}
      <fieldset style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginBottom: 20 }}>
        <legend style={{ fontWeight: 600, padding: '0 8px' }}>Weitere Produkte / Freie Positionen</legend>
        {extraProducts.map((row, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input className="admin-form-input" style={{ flex: 3, minWidth: 180 }} placeholder="Beschreibung" value={row.description}
              onChange={e => setExtraProducts(rows => rows.map((r, j) => j === i ? { ...r, description: e.target.value } : r))} />
            <input className="admin-form-input" style={{ flex: 1, minWidth: 60 }} placeholder="Menge" value={row.quantity}
              onChange={e => setExtraProducts(rows => rows.map((r, j) => j === i ? { ...r, quantity: e.target.value } : r))} />
            <input className="admin-form-input" style={{ flex: 1, minWidth: 60 }} placeholder="Einheit" value={row.unit}
              onChange={e => setExtraProducts(rows => rows.map((r, j) => j === i ? { ...r, unit: e.target.value } : r))} />
            <input className="admin-form-input" style={{ flex: 1, minWidth: 80 }} placeholder="Preis/Stk" value={row.unit_price}
              onChange={e => setExtraProducts(rows => rows.map((r, j) => j === i ? { ...r, unit_price: e.target.value } : r))} />
            <button className="admin-btn admin-btn-danger admin-btn-sm" onClick={() => setExtraProducts(r => r.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
        <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={() => setExtraProducts(r => [...r, { description: '', quantity: '1', unit: 'Stk', unit_price: '' }])}>+ Freie Position</button>
      </fieldset>

      {/* Extra Charges */}
      <fieldset style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginBottom: 20 }}>
        <legend style={{ fontWeight: 600, padding: '0 8px' }}>Sonderaufwände</legend>
        {extraCharges.map((row, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <input className="admin-form-input" style={{ flex: 3 }} placeholder="Beschreibung" value={row.description}
              onChange={e => setExtraCharges(rows => rows.map((r, j) => j === i ? { ...r, description: e.target.value } : r))} />
            <input className="admin-form-input" style={{ flex: 1 }} placeholder="Betrag CHF" value={row.total_price}
              onChange={e => setExtraCharges(rows => rows.map((r, j) => j === i ? { ...r, total_price: e.target.value } : r))} />
            <button className="admin-btn admin-btn-danger admin-btn-sm" onClick={() => setExtraCharges(r => r.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
        <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={() => setExtraCharges(r => [...r, { description: '', total_price: '' }])}>+ Sonderaufwand</button>
      </fieldset>

      {/* Travel */}
      <fieldset style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginBottom: 20 }}>
        <legend style={{ fontWeight: 600, padding: '0 8px' }}>Fahrtkosten</legend>
        {travelRows.map((row, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <input className="admin-form-input" style={{ flex: 3 }} placeholder="Beschreibung" value={row.description}
              onChange={e => setTravelRows(rows => rows.map((r, j) => j === i ? { ...r, description: e.target.value } : r))} />
            <input className="admin-form-input" style={{ flex: 1 }} placeholder="Betrag CHF" value={row.total_price}
              onChange={e => setTravelRows(rows => rows.map((r, j) => j === i ? { ...r, total_price: e.target.value } : r))} />
            <button className="admin-btn admin-btn-danger admin-btn-sm" onClick={() => setTravelRows(r => r.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
        <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={() => setTravelRows(r => [...r, { description: 'Fahrtpauschale', total_price: '' }])}>+ Fahrtkosten</button>
      </fieldset>

      {/* Installation */}
      <fieldset style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginBottom: 20 }}>
        <legend style={{ fontWeight: 600, padding: '0 8px' }}>Montagepositionen</legend>
        {installationRows.map((row, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <input className="admin-form-input" style={{ flex: 3 }} placeholder="Beschreibung" value={row.description}
              onChange={e => setInstallationRows(rows => rows.map((r, j) => j === i ? { ...r, description: e.target.value } : r))} />
            <input className="admin-form-input" style={{ flex: 1 }} placeholder="Betrag CHF" value={row.unit_price}
              onChange={e => setInstallationRows(rows => rows.map((r, j) => j === i ? { ...r, unit_price: e.target.value } : r))} />
            <button className="admin-btn admin-btn-danger admin-btn-sm" onClick={() => setInstallationRows(r => r.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {installationTemplates.map(tpl => (
            <button key={tpl.id} className="admin-btn admin-btn-secondary admin-btn-sm" title={tpl.notes ?? undefined}
              onClick={() => setInstallationRows(r => [...r, { description: tpl.label, unit_price: String(tpl.default_fee) }])}>
              + {tpl.label} (CHF {tpl.default_fee})
            </button>
          ))}
          <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={() => setInstallationRows(r => [...r, { description: '', unit_price: '' }])}>+ Manuell</button>
        </div>
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
        <textarea className="admin-form-input" rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optionale Bemerkungen…" />
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <button className="admin-btn admin-btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Wird gespeichert…' : 'Änderungen speichern'}
        </button>
        <button className="admin-btn admin-btn-secondary" onClick={onCancel} disabled={saving}>Abbrechen</button>
      </div>
    </div>
  )
}

// ─── Main Screen ────────────────────────────────────────────

export default function QuotesScreen() {
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [acting, setActing] = useState<number | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [editQuote, setEditQuote] = useState<QuoteDetail | null>(null)
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

  async function handleEdit(id: number) {
    try {
      const detail = await apiFetch(`/pwa/admin/quotes/${id}`) as QuoteDetail
      setEditQuote(detail)
    } catch {
      showToast('Offerte konnte nicht geladen werden', 'error')
    }
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

  const statuses = ['', 'entwurf', 'gesendet', 'akzeptiert', 'abgelehnt', 'absage', 'archiviert']

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

  if (editQuote) {
    return (
      <div className="admin-page">
        <QuoteEditForm
          quote={editQuote}
          onDone={() => { setEditQuote(null); load(); showToast('Offerte gespeichert', 'success') }}
          onCancel={() => setEditQuote(null)}
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
                    {q.reminder_sent_at && (
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
                        Erinnerung gesendet {fmtDate(q.reminder_sent_at)}
                      </div>
                    )}
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
                      {['entwurf', 'gesendet'].includes(q.status) && (
                        <button
                          className="admin-btn admin-btn-secondary admin-btn-sm"
                          onClick={() => handleEdit(q.id)}
                          disabled={acting === q.id}
                        >
                          Bearbeiten
                        </button>
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
                      {['entwurf', 'gesendet', 'akzeptiert'].includes(q.status) && (
                        <button
                          className="admin-btn admin-btn-danger admin-btn-sm"
                          onClick={() => handleStatus(q.id, 'absage')}
                          disabled={acting === q.id}
                        >
                          {acting === q.id ? '…' : 'Absage'}
                        </button>
                      )}
                      {['entwurf', 'gesendet', 'akzeptiert', 'abgelehnt', 'absage'].includes(q.status) && (
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
