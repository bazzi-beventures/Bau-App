import { useEffect, useMemo, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { apiFetch, apiFormFetch, apiUrl } from '../../api/client'
import { PdfExtractionReviewModal, PdfExtractionResponse, ConfirmedExtraProduct, ConfirmedPosition } from './PdfExtractionReviewModal'
import { QUOTE_STATUS_LABELS, QUOTE_STATUS_BADGE } from '../constants/statuses'
import { fmtCHF, fmtDate } from '../utils/format'
import { StatusFilterPopover } from '../components/StatusFilterPopover'
import { ProjektleiterFilter } from '../components/ProjektleiterFilter'
import { DescPriceFieldset, DiscountsFieldset } from './QuoteFormParts'
import { MaterialCombobox } from './MaterialCombobox'
import { SpellcheckTextarea } from './SpellcheckTextarea'
import { getMe } from '../../api/auth'
import { isFeatureEnabled } from '../../api/modules'

// Standard-Bemerkungen, die beim Erstellen einer Offerte vorausgefüllt werden.
// Der verbindliche Text wird pro Mandant unter "Offert-Vorlagen" gepflegt und beim
// Laden des Formulars von /pwa/admin/quote-standard-notes geholt. Diese Konstante
// dient nur noch als Fallback, falls der Abruf fehlschlägt. Echte Zeilenumbrüche (\n) —
// das PDF rendert sie via nl2br als <br>.
const STANDARD_NOTES = `Preise inkl. Montage und Transport.
Lieferfrist nach Absprache, nach def. Massaufnahme.

Diese Offerte basiert auf vorläufigen Richtmassen und steht unter dem Vorbehalt der abschliessenden Massaufnahme vor Ort. Allfällige Abweichungen können zu Anpassungen in Preis und Ausführung führen.

Diese Offerte ist ab Ausstellungsdatum während 2 Monaten gültig.
Nach Ablauf dieser Frist behalten wir uns vor, Preise und Konditionen neu zu prüfen und anzupassen.`

interface Quote {
  id: number
  quote_number: string
  project_name: string
  total_amount: number
  status: string
  created_at: string
  pdf_url: string | null
  xlsx_url: string | null
  reminder_sent_at: string | null
  projektleiter_id: string | null
}

interface ProjektleiterOption {
  id: string
  name: string
}

interface Project {
  id: string
  name: string
  is_closed?: boolean
  distance_km?: number | null
}

// Fahrspesen-Tabelle (Default — Mirror von db/invoices.py _DEFAULT_TRAVEL_COST_TABLE).
// Wird nur zur Preview-Anzeige im Formular verwendet; verbindlich rechnet das Backend.
const TRAVEL_COST_TABLE: [number, number][] = [
  [1, 10], [5, 20], [8, 30], [11, 35], [14, 40],
  [17, 45], [22, 50], [24, 55], [29, 60], [43, 70],
  [Infinity, 75],
]

function computeTravelCost(km: number): number {
  const kmCeil = Math.ceil(km)
  for (const [threshold, price] of TRAVEL_COST_TABLE) {
    if (kmCeil <= threshold) return price
  }
  return TRAVEL_COST_TABLE[TRAVEL_COST_TABLE.length - 1][1]
}

interface StaffRole {
  name: string
  job_title: string | null
  hourly_rate: number
}

export interface QuoteDetail {
  id: number
  quote_number: string
  project_name: string
  labor_items: { description: string; quantity: number; unit: string; unit_price: number; total_price: number; hidden?: boolean }[]
  material_items: { description: string; quantity: number; unit: string; unit_price: number; total_price: number }[]
  travel_items: { description: string; total_price: number }[]
  extra_product_items: { description: string; quantity: number; unit: string; unit_price: number; total_price: number }[]
  extra_charge_items: { description: string; total_price: number }[]
  installation_items: { description: string; quantity: number; unit: string; unit_price: number; total_price: number }[]
  special_items: { description: string; quantity: number; unit: string; unit_price: number; total_price: number }[]
  labor_discount_pct: number
  material_discount_pct: number
  notes: string | null
  product_description: string | null
}

interface Material {
  art_nr: string
  name: string
  unit_price: number
  calc_vk?: number | null
  unit: string
  category?: string
  supplier_id?: string | null
}

interface Supplier {
  id: string
  name: string
}

// `hidden` (Workflow "montage_in_produktpreis"): Stunden dem Kunden nicht als eigene
// Lohnzeile zeigen, sondern als Gesamtbetrag in die Produktpreise einrechnen (Backend
// foldet beim PDF). Intern bleibt die Position als Lohn erhalten (Nachkalkulation).
interface LaborRow { description: string; quantity: string; unit_price: number | null; hidden?: boolean }
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
  positions?: ConfirmedPosition[]  // Stobag: Auswahl-Breakdown der Produktzeile (Metadaten)
}
interface ExtraChargeRow { description: string; total_price: string }
interface InstallationRow { description: string; unit_price: string }
interface InstallationTemplate { id: string; label: string; default_fee: number; notes: string | null }
type SpecialMode = 'pauschal' | 'stunden'
interface SpecialPositionTemplate { id: string; label: string; pricing_mode: SpecialMode; default_fee: number; default_hours: number | null; notes: string | null }
// Sonderpositionen (Demontage/Entsorgung): pauschal → unit_price = Fixbetrag;
// stunden → unit_price = Stundenansatz, hours = Stundenzahl.
interface SpecialRow { description: string; mode: SpecialMode; unit_price: string; hours: string }

// Baut aus einer SpecialRow die Backend-Position {description, quantity, unit, unit_price, total_price}.
function buildSpecialItem(r: SpecialRow) {
  if (r.mode === 'stunden') {
    const h = parseNum(r.hours)
    const rate = parseNum(r.unit_price)
    return { description: r.description, quantity: h, unit: 'h', unit_price: rate, total_price: round2(h * rate) }
  }
  const p = parseNum(r.unit_price)
  return { description: r.description, quantity: 1, unit: 'Pau', unit_price: p, total_price: p }
}

function specialRowValid(r: SpecialRow): boolean {
  if (!r.description) return false
  return r.mode === 'stunden'
    ? parseNum(r.hours) > 0 && parseNum(r.unit_price) > 0
    : parseNum(r.unit_price) > 0
}

const STATUS_LABELS = QUOTE_STATUS_LABELS
const STATUS_BADGE = QUOTE_STATUS_BADGE

function parseNum(v: string): number {
  return parseFloat(v.replace(',', '.')) || 0
}

// ─── Auto-Entwurf (lokaler Zwischenstand) ───────────────────
// Der noch nicht abgeschickte Offert-Entwurf wird laufend in localStorage
// gehalten (pro Projekt ein Slot), damit ein versehentliches Schliessen des
// Fensters die Eingaben nicht verliert. Beim erneuten Öffnen bietet ein Banner
// die Wiederherstellung an. Gelöscht wird beim erfolgreichen Erstellen oder per
// «Verwerfen». Neuer Key → in storageMigrations.isKnownKey whitelisten.
const QUOTE_DRAFT_PREFIX = 'quote-draft:'

// Gibt es für dieses Projekt einen laufenden (noch nicht abgeschickten) Entwurf?
// Genutzt vom Projekt-Offerten-Tab, um den «Entwurf fortsetzen»-Button zu zeigen.
export function hasQuoteDraft(projectName: string): boolean {
  try { return !!localStorage.getItem(QUOTE_DRAFT_PREFIX + projectName) } catch { return false }
}

interface QuoteDraft {
  projectName: string
  laborRows: LaborRow[]
  materialRows: MaterialRow[]
  extraProducts: ExtraProductRow[]
  extraCharges: ExtraChargeRow[]
  includeTravelCost: boolean
  installationRows: InstallationRow[]
  specialRows: SpecialRow[]
  laborDiscount: string
  materialDiscount: string
  notes: string
  productDescription: string
  useStandardNotes: boolean
}

// Hat der Entwurf überhaupt nennenswerten Inhalt? Leere Default-Formulare
// (eine leere Lohn-/Materialzeile, Standard-Bemerkungen) zählen NICHT — so wird
// kein leerer Entwurf gespeichert und das Restore-Banner bleibt aus.
function quoteDraftHasContent(d: QuoteDraft, stdNotes: string): boolean {
  return (
    d.laborRows.some(r => r.description.trim() || r.quantity.trim()) ||
    d.materialRows.some(r => r.art_nr.trim() || r.quantity.trim()) ||
    d.extraProducts.length > 0 ||
    d.extraCharges.length > 0 ||
    d.installationRows.length > 0 ||
    d.specialRows.length > 0 ||
    !!d.productDescription.trim() ||
    !!d.laborDiscount.trim() ||
    !!d.materialDiscount.trim() ||
    (d.notes.trim() !== '' && d.notes !== STANDARD_NOTES && d.notes !== stdNotes)
  )
}

// ─── Create Form ────────────────────────────────────────────

export function QuoteCreateForm({ onDone, onCancel, lockedProjectName, autoRestoreDraft }: { onDone: () => void; onCancel: () => void; lockedProjectName?: string; autoRestoreDraft?: boolean }) {
  const [projects, setProjects] = useState<Project[]>([])
  const [roles, setRoles] = useState<StaffRole[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [materialSupplierFilter, setMaterialSupplierFilter] = useState('')
  const [materialCategoryFilter, setMaterialCategoryFilter] = useState('')
  const [projectName, setProjectName] = useState(lockedProjectName ?? '')
  const [laborRows, setLaborRows] = useState<LaborRow[]>([{ description: '', quantity: '', unit_price: null, hidden: false }])
  const [materialRows, setMaterialRows] = useState<MaterialRow[]>([{ art_nr: '', quantity: '' }])
  const [extraProducts, setExtraProducts] = useState<ExtraProductRow[]>([])
  const [montageEnabled, setMontageEnabled] = useState(false)
  const [extraCharges, setExtraCharges] = useState<ExtraChargeRow[]>([])
  const [includeTravelCost, setIncludeTravelCost] = useState(true)
  const [installationRows, setInstallationRows] = useState<InstallationRow[]>([])
  const [installationTemplates, setInstallationTemplates] = useState<InstallationTemplate[]>([])
  const [specialEnabled, setSpecialEnabled] = useState(false)
  const [specialTemplates, setSpecialTemplates] = useState<SpecialPositionTemplate[]>([])
  const [specialRows, setSpecialRows] = useState<SpecialRow[]>([])
  const [laborDiscount, setLaborDiscount] = useState('')
  const [materialDiscount, setMaterialDiscount] = useState('')
  const [notes, setNotes] = useState(STANDARD_NOTES)
  const [stdNotes, setStdNotes] = useState(STANDARD_NOTES)
  const [productDescription, setProductDescription] = useState('')
  const [useStandardNotes, setUseStandardNotes] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [pdfReview, setPdfReview] = useState<PdfExtractionResponse | null>(null)
  // Gefundener, noch nicht abgeschlossener Entwurf aus einer früheren Sitzung.
  const [pendingDraft, setPendingDraft] = useState<{ savedAt: number; data: QuoteDraft } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // localStorage-Slot pro Projekt — im gesperrten Projekt-Modal konstant, im
  // freien Formular wechselt er mit der Projektauswahl.
  const draftKey = QUOTE_DRAFT_PREFIX + projectName

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
    // Lieferanten nur für den optionalen Material-Filter — Fehler darf das
    // Formular nicht blockieren (Filter bleibt dann einfach leer).
    apiFetch('/pwa/admin/suppliers')
      .then(s => setSuppliers(s as Supplier[]))
      .catch(() => {})
    // Mandanten-spezifischen Standard-Bemerkungstext laden (pflegbar unter Offert-Vorlagen).
    // Fehler darf das Formular nicht blockieren — dann bleibt der Fallback-Default.
    apiFetch('/pwa/admin/quote-standard-notes')
      .then(res => {
        const text = (res as { notes: string }).notes ?? STANDARD_NOTES
        setStdNotes(text)
        // Nur vorausfüllen, solange noch der Fallback-Default unverändert drinsteht
        // (Nutzer hat nichts getippt und die Checkbox nicht abgewählt).
        setNotes(prev => (prev === STANDARD_NOTES ? text : prev))
      })
      .catch(() => {})
    // Sonderpositionen sind tenant-spezifisch (Feature-Flag); Sektion nur laden wenn aktiv.
    getMe().then(me => {
      setMontageEnabled(isFeatureEnabled(me, 'montage_in_produktpreis'))
      if (!isFeatureEnabled(me, 'sonderpositionen')) return
      setSpecialEnabled(true)
      apiFetch('/pwa/admin/special-position-templates')
        .then(t => setSpecialTemplates(t as SpecialPositionTemplate[]))
        .catch(() => {})
    }).catch(() => {})
  }, [])

  // ── Auto-Entwurf: aktuellen Formularstand serialisieren ──
  function serializeDraft(): QuoteDraft {
    return {
      projectName, laborRows, materialRows, extraProducts, extraCharges,
      includeTravelCost, installationRows, specialRows, laborDiscount,
      materialDiscount, notes, productDescription, useStandardNotes,
    }
  }

  const currentDraft = serializeDraft()
  // Banner nur zeigen, solange das Formular noch leer ist — sobald der Nutzer
  // tippt (oder den Entwurf übernimmt), verschwindet es von selbst.
  const formIsPristine = !quoteDraftHasContent(currentDraft, stdNotes)

  // Einen Entwurf in die Formularfelder übernehmen.
  function applyDraft(d: QuoteDraft) {
    if (!lockedProjectName && d.projectName) setProjectName(d.projectName)
    if (d.laborRows?.length) setLaborRows(d.laborRows)
    if (d.materialRows?.length) setMaterialRows(d.materialRows)
    setExtraProducts(d.extraProducts ?? [])
    setExtraCharges(d.extraCharges ?? [])
    setIncludeTravelCost(d.includeTravelCost ?? true)
    setInstallationRows(d.installationRows ?? [])
    setSpecialRows(d.specialRows ?? [])
    setLaborDiscount(d.laborDiscount ?? '')
    setMaterialDiscount(d.materialDiscount ?? '')
    if (d.notes != null) setNotes(d.notes)
    setProductDescription(d.productDescription ?? '')
    setUseStandardNotes(d.useStandardNotes ?? true)
  }

  // Gespeicherten Entwurf für den aktuellen Projekt-Slot laden (Mount + bei
  // Projektwechsel). Defektes JSON wird ignoriert (selbstheilend). Wurde das
  // Formular gezielt über «Entwurf fortsetzen» geöffnet (autoRestoreDraft),
  // wird direkt übernommen statt nur das Banner anzubieten.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey)
      if (!raw) { setPendingDraft(null); return }
      const parsed = JSON.parse(raw)
      if (parsed && parsed.data) {
        if (autoRestoreDraft) { applyDraft(parsed.data); setPendingDraft(null) }
        else setPendingDraft({ savedAt: parsed.savedAt ?? 0, data: parsed.data })
      } else setPendingDraft(null)
    } catch { setPendingDraft(null) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey])

  // Laufend speichern, sobald nennenswerter Inhalt da ist. Leeres Formular wird
  // bewusst NICHT geschrieben/gelöscht — sonst würde der Mount mit Leerstand
  // einen vorhandenen Entwurf vor dem Wiederherstellen überschreiben.
  useEffect(() => {
    const d = serializeDraft()
    if (!quoteDraftHasContent(d, stdNotes)) return
    try {
      localStorage.setItem(draftKey, JSON.stringify({ savedAt: Date.now(), data: d }))
    } catch { /* localStorage voll/blockiert — Entwurf ist Komfort, kein Muss */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey, projectName, laborRows, materialRows, extraProducts, extraCharges,
      includeTravelCost, installationRows, specialRows, laborDiscount,
      materialDiscount, notes, productDescription, useStandardNotes, stdNotes])

  // Esc schliesst das Fenster — ist das PDF-Review-Modal offen, zuerst dieses.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (pdfReview) { setPdfReview(null); return }
      onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pdfReview, onCancel])

  function restoreDraft() {
    if (!pendingDraft) return
    applyDraft(pendingDraft.data)
    setPendingDraft(null)
  }

  function discardDraft() {
    try { localStorage.removeItem(draftKey) } catch { /* egal */ }
    setPendingDraft(null)
  }

  // ── Labor helpers ──
  function updateLabor(i: number, patch: Partial<LaborRow>) {
    setLaborRows(rows => rows.map((r, j) => j === i ? { ...r, ...patch } : r))
  }
  function addLabor() { setLaborRows(r => [...r, { description: '', quantity: '', unit_price: null, hidden: false }]) }
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

  // ── Installation helpers ──
  function addInstallationFromTemplate(tpl: InstallationTemplate) {
    setInstallationRows(r => [...r, { description: tpl.label, unit_price: String(tpl.default_fee) }])
  }
  function updateInstallation(i: number, patch: Partial<InstallationRow>) {
    setInstallationRows(rows => rows.map((r, j) => j === i ? { ...r, ...patch } : r))
  }
  function removeInstallation(i: number) { setInstallationRows(r => r.filter((_, j) => j !== i)) }

  // ── Special position helpers ──
  function addSpecialFromTemplate(tpl: SpecialPositionTemplate) {
    setSpecialRows(r => [...r, {
      description: tpl.label,
      mode: tpl.pricing_mode,
      unit_price: String(tpl.default_fee),
      hours: tpl.default_hours != null ? String(tpl.default_hours) : '',
    }])
  }
  function updateSpecial(i: number, patch: Partial<SpecialRow>) {
    setSpecialRows(rows => rows.map((r, j) => j === i ? { ...r, ...patch } : r))
  }
  function removeSpecial(i: number) { setSpecialRows(r => r.filter((_, j) => j !== i)) }

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
      positions: c.positions,
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
    const selectedProject = projects.find(p => p.name === projectName)
    const projectDistanceKm = selectedProject?.distance_km ?? null
    const hasTravel = includeTravelCost && projectDistanceKm !== null
    const hasSpecial = specialRows.some(specialRowValid)
    if (!hasLabor && !hasMaterial && !hasExtra && !hasCharge && !hasTravel && !hasSpecial) {
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
          hidden: !!r.hidden,
        })),
        material_items: materialRows.filter(r => r.art_nr && parseNum(r.quantity) > 0).map(r => ({
          art_nr: r.art_nr,
          quantity: parseNum(r.quantity),
        })),
        travel_items: [],
        include_travel_cost: includeTravelCost,
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
          if (r.positions) item.positions = r.positions
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
        special_items: specialRows.filter(specialRowValid).map(buildSpecialItem),
        labor_discount_pct: parseNum(laborDiscount),
        material_discount_pct: parseNum(materialDiscount),
        notes: notes || null,
        product_description: productDescription.trim() || null,
      }
      await apiFetch('/pwa/admin/quotes', { method: 'POST', body: JSON.stringify(payload) })
      try { localStorage.removeItem(draftKey) } catch { /* egal */ }
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Erstellen')
    } finally {
      setSaving(false)
    }
  }

  // Lieferanten-Lookup + Kategorien für die optionalen Material-Filter.
  // Kategorien direkt aus dem (vollständig geladenen) Materialstamm ableiten.
  const supplierMap = useMemo(() => Object.fromEntries(suppliers.map(s => [s.id, s.name])), [suppliers])
  const usedSupplierIds = useMemo(() => new Set(materials.map(m => m.supplier_id).filter(Boolean)), [materials])
  const supplierOptions = useMemo(() => suppliers.filter(s => usedSupplierIds.has(s.id)), [suppliers, usedSupplierIds])
  const categories = useMemo(
    () => [...new Set(materials.map(m => m.category).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b)),
    [materials],
  )

  return (
    <div className="admin-table-wrap" style={{ padding: 24, position: 'relative' }}>
      <button
        type="button"
        onClick={onCancel}
        disabled={saving}
        title="Schliessen (Esc)"
        aria-label="Schliessen"
        className="admin-btn admin-btn-secondary admin-btn-sm"
        style={{ position: 'absolute', top: 16, right: 16, lineHeight: 1, padding: '4px 10px', fontSize: 16 }}
      >
        ✕
      </button>
      <h3 style={{ margin: '0 0 20px' }}>Neue Offerte erstellen</h3>

      {pdfReview && (
        <PdfExtractionReviewModal
          data={pdfReview}
          onCancel={() => setPdfReview(null)}
          onConfirm={handlePdfReviewConfirm}
        />
      )}

      {/* Nicht abgeschlossener Entwurf aus einer früheren Sitzung */}
      {pendingDraft && formIsPristine && (
        <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', textAlign: 'left' }}>
          <span style={{ fontSize: 13 }}>
            Es gibt einen nicht abgeschlossenen Entwurf
            {pendingDraft.savedAt ? ` vom ${new Date(pendingDraft.savedAt).toLocaleString('de-CH', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}.
          </span>
          <span style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="admin-btn admin-btn-primary admin-btn-sm" onClick={restoreDraft}>Wiederherstellen</button>
            <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm" onClick={discardDraft}>Verwerfen</button>
          </span>
        </div>
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
            {montageEnabled && (
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, whiteSpace: 'nowrap' }} title="Dem Kunden nicht als eigene Zeile zeigen — in die Produktpreise einrechnen">
                <input type="checkbox" checked={!!row.hidden} onChange={e => updateLabor(i, { hidden: e.target.checked })} />
                verstecken
              </label>
            )}
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
        {/* Optionale Filter — grenzen die Auswahl in allen Material-Comboboxen ein. */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <select
            className="admin-form-select"
            style={{ flex: 1, minWidth: 160 }}
            value={materialSupplierFilter}
            onChange={e => setMaterialSupplierFilter(e.target.value)}
          >
            <option value="">Alle Lieferanten</option>
            {supplierOptions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select
            className="admin-form-select"
            style={{ flex: 1, minWidth: 160 }}
            value={materialCategoryFilter}
            onChange={e => setMaterialCategoryFilter(e.target.value)}
          >
            <option value="">Alle Artikelgruppen</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {materialRows.map((row, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <MaterialCombobox
              materials={materials}
              supplierMap={supplierMap}
              supplierFilter={materialSupplierFilter}
              categoryFilter={materialCategoryFilter}
              value={row.art_nr}
              onChange={artNr => updateMaterial(i, { art_nr: artNr })}
            />
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

      <DescPriceFieldset
        title="Sonderaufwände"
        rows={extraCharges}
        onChange={setExtraCharges}
        addLabel="+ Sonderaufwand"
      />

      {/* Fahrspesen (Auto aus Projekt-Distanz) */}
      {(() => {
        const selectedProject = projects.find(p => p.name === projectName)
        const distanceKm = selectedProject?.distance_km ?? null
        const hasDistance = distanceKm !== null && distanceKm !== undefined
        const travelAmount = hasDistance ? computeTravelCost(Number(distanceKm)) : 0
        return (
          <fieldset style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginBottom: 20 }}>
            <legend style={{ fontWeight: 600, padding: '0 8px' }}>Fahrspesen</legend>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: hasDistance ? 'pointer' : 'not-allowed', opacity: hasDistance ? 1 : 0.6 }}>
              <input
                type="checkbox"
                checked={includeTravelCost && hasDistance}
                disabled={!hasDistance}
                onChange={e => setIncludeTravelCost(e.target.checked)}
              />
              <span>
                Fahrspesen einrechnen
                {hasDistance ? (
                  <span style={{ color: 'var(--muted)', marginLeft: 8 }}>
                    ({distanceKm} km → {fmtCHF(travelAmount)})
                  </span>
                ) : (
                  <span style={{ color: 'var(--muted)', marginLeft: 8 }}>
                    — Distanz beim Projekt fehlt, bitte zuerst dort eintragen
                  </span>
                )}
              </span>
            </label>
          </fieldset>
        )
      })()}

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

      {/* Sonderpositionen (Demontage / Entsorgung) — tenant-spezifisch via Feature-Flag */}
      {specialEnabled && (
        <fieldset style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginBottom: 20 }}>
          <legend style={{ fontWeight: 600, padding: '0 8px' }}>Sonderpositionen</legend>
          {specialRows.map((row, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input className="admin-form-input" style={{ flex: 3, minWidth: 160 }} placeholder="Beschreibung" value={row.description} onChange={e => updateSpecial(i, { description: e.target.value })} />
              <select className="admin-form-select" style={{ flex: 1, minWidth: 120 }} value={row.mode} onChange={e => updateSpecial(i, { mode: e.target.value as SpecialMode })}>
                <option value="pauschal">Pauschale</option>
                <option value="stunden">Stundenansatz</option>
              </select>
              {row.mode === 'stunden' ? (
                <>
                  <input className="admin-form-input" style={{ flex: 1, minWidth: 70 }} placeholder="Stunden" value={row.hours} onChange={e => updateSpecial(i, { hours: e.target.value })} />
                  <input className="admin-form-input" style={{ flex: 1, minWidth: 80 }} placeholder="CHF/h" value={row.unit_price} onChange={e => updateSpecial(i, { unit_price: e.target.value })} />
                </>
              ) : (
                <input className="admin-form-input" style={{ flex: 1, minWidth: 90 }} placeholder="Betrag CHF" value={row.unit_price} onChange={e => updateSpecial(i, { unit_price: e.target.value })} />
              )}
              <button className="admin-btn admin-btn-danger admin-btn-sm" onClick={() => removeSpecial(i)} title="Entfernen">✕</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {specialTemplates.map(tpl => (
              <button key={tpl.id} className="admin-btn admin-btn-secondary admin-btn-sm" onClick={() => addSpecialFromTemplate(tpl)} title={tpl.notes ?? undefined}>
                + {tpl.label} ({tpl.pricing_mode === 'stunden' ? `CHF ${tpl.default_fee}/h` : `CHF ${tpl.default_fee}`})
              </button>
            ))}
            <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={() => setSpecialRows(r => [...r, { description: '', mode: 'pauschal', unit_price: '', hours: '' }])}>+ Manuell</button>
          </div>
        </fieldset>
      )}

      <DiscountsFieldset
        laborDiscount={laborDiscount}
        materialDiscount={materialDiscount}
        onLaborChange={setLaborDiscount}
        onMaterialChange={setMaterialDiscount}
      />

      {/* Product description */}
      <div style={{ marginBottom: 20 }}>
        <label className="admin-form-label">Produktbeschreibung</label>
        <SpellcheckTextarea value={productDescription} onChange={setProductDescription} placeholder="Beschreibung der angebotenen Produkte…" />
      </div>

      {/* Notes */}
      <div style={{ marginBottom: 20 }}>
        <label className="admin-form-label">Bemerkungen</label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontWeight: 'normal', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={useStandardNotes}
            onChange={e => {
              const on = e.target.checked
              setUseStandardNotes(on)
              setNotes(on ? stdNotes : '')
            }}
          />
          <span>Standard-Bemerkungen verwenden</span>
        </label>
        <textarea className="admin-form-input" rows={8} style={{ resize: 'vertical', minHeight: 140 }} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optionale Bemerkungen zur Offerte…" />
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

type EditLaborRow = { description: string; quantity: string; unit_price: string; hidden?: boolean }
type EditFreeRow = { description: string; quantity: string; unit: string; unit_price: string }
type EditChargeRow = { description: string; total_price: string }
type EditTravelRow = { description: string; total_price: string }

export function QuoteEditForm({ quote, onDone, onCancel }: { quote: QuoteDetail; onDone: () => void; onCancel: () => void }) {
  const [roles, setRoles] = useState<StaffRole[]>([])
  const [laborRows, setLaborRows] = useState<EditLaborRow[]>(() =>
    quote.labor_items.map(i => ({ description: i.description, quantity: String(i.quantity), unit_price: String(i.unit_price), hidden: !!i.hidden }))
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
  const [montageEnabled, setMontageEnabled] = useState(false)
  const [specialEnabled, setSpecialEnabled] = useState(false)
  const [specialTemplates, setSpecialTemplates] = useState<SpecialPositionTemplate[]>([])
  const [specialRows, setSpecialRows] = useState<SpecialRow[]>(() =>
    (quote.special_items || []).map(i => ({
      description: i.description,
      mode: i.unit === 'h' ? 'stunden' : 'pauschal',
      unit_price: String(i.unit_price),
      hours: i.unit === 'h' ? String(i.quantity) : '',
    }))
  )
  const [laborDiscount, setLaborDiscount] = useState(String(quote.labor_discount_pct || ''))
  const [materialDiscount, setMaterialDiscount] = useState(String(quote.material_discount_pct || ''))
  const [notes, setNotes] = useState(quote.notes || '')
  const [productDescription, setProductDescription] = useState(quote.product_description || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      apiFetch('/pwa/admin/staff-roles') as Promise<StaffRole[]>,
      apiFetch('/pwa/admin/installation-templates') as Promise<InstallationTemplate[]>,
    ]).then(([r, t]) => { setRoles(r); setInstallationTemplates(t) })
    // Sonderpositionen-Sektion nur wenn Feature für den Tenant aktiv.
    getMe().then(me => {
      setMontageEnabled(isFeatureEnabled(me, 'montage_in_produktpreis'))
      if (!isFeatureEnabled(me, 'sonderpositionen')) return
      setSpecialEnabled(true)
      apiFetch('/pwa/admin/special-position-templates')
        .then(t => setSpecialTemplates(t as SpecialPositionTemplate[]))
        .catch(() => {})
    }).catch(() => {})
  }, [])

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const payload = {
        labor_items: laborRows
          .filter(r => r.description && parseNum(r.quantity) > 0)
          .map(r => ({ description: r.description, quantity: parseNum(r.quantity), unit: 'h', unit_price: parseNum(r.unit_price), total_price: round2(parseNum(r.quantity) * parseNum(r.unit_price)), hidden: !!r.hidden })),
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
        special_items: specialRows.filter(specialRowValid).map(buildSpecialItem),
        labor_discount_pct: parseNum(laborDiscount),
        material_discount_pct: parseNum(materialDiscount),
        notes: notes || null,
        product_description: productDescription.trim() || null,
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
      <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={onCancel} disabled={saving} style={{ marginBottom: 12 }}>← Zurück</button>
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
            {montageEnabled && (
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, whiteSpace: 'nowrap' }} title="Dem Kunden nicht als eigene Zeile zeigen — in die Produktpreise einrechnen">
                <input type="checkbox" checked={!!row.hidden} onChange={e => setLaborRows(rows => rows.map((r, j) => j === i ? { ...r, hidden: e.target.checked } : r))} />
                verstecken
              </label>
            )}
            {laborRows.length > 1 && <button className="admin-btn admin-btn-danger admin-btn-sm" onClick={() => setLaborRows(r => r.filter((_, j) => j !== i))}>✕</button>}
          </div>
        ))}
        <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={() => setLaborRows(r => [...r, { description: '', quantity: '', unit_price: '', hidden: false }])}>+ Lohnposition</button>
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

      <DescPriceFieldset
        title="Sonderaufwände"
        rows={extraCharges}
        onChange={setExtraCharges}
        addLabel="+ Sonderaufwand"
      />

      <DescPriceFieldset
        title="Fahrtkosten"
        rows={travelRows}
        onChange={setTravelRows}
        addLabel="+ Fahrtkosten"
        defaultDescription="Fahrtpauschale"
      />

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

      {/* Sonderpositionen (Demontage / Entsorgung) — rendert wenn Feature aktiv oder bereits Positionen vorhanden */}
      {(specialEnabled || specialRows.length > 0) && (
        <fieldset style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginBottom: 20 }}>
          <legend style={{ fontWeight: 600, padding: '0 8px' }}>Sonderpositionen</legend>
          {specialRows.map((row, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input className="admin-form-input" style={{ flex: 3, minWidth: 160 }} placeholder="Beschreibung" value={row.description}
                onChange={e => setSpecialRows(rows => rows.map((r, j) => j === i ? { ...r, description: e.target.value } : r))} />
              <select className="admin-form-select" style={{ flex: 1, minWidth: 120 }} value={row.mode}
                onChange={e => setSpecialRows(rows => rows.map((r, j) => j === i ? { ...r, mode: e.target.value as SpecialMode } : r))}>
                <option value="pauschal">Pauschale</option>
                <option value="stunden">Stundenansatz</option>
              </select>
              {row.mode === 'stunden' ? (
                <>
                  <input className="admin-form-input" style={{ flex: 1, minWidth: 70 }} placeholder="Stunden" value={row.hours}
                    onChange={e => setSpecialRows(rows => rows.map((r, j) => j === i ? { ...r, hours: e.target.value } : r))} />
                  <input className="admin-form-input" style={{ flex: 1, minWidth: 80 }} placeholder="CHF/h" value={row.unit_price}
                    onChange={e => setSpecialRows(rows => rows.map((r, j) => j === i ? { ...r, unit_price: e.target.value } : r))} />
                </>
              ) : (
                <input className="admin-form-input" style={{ flex: 1, minWidth: 90 }} placeholder="Betrag CHF" value={row.unit_price}
                  onChange={e => setSpecialRows(rows => rows.map((r, j) => j === i ? { ...r, unit_price: e.target.value } : r))} />
              )}
              <button className="admin-btn admin-btn-danger admin-btn-sm" onClick={() => setSpecialRows(r => r.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {specialTemplates.map(tpl => (
              <button key={tpl.id} className="admin-btn admin-btn-secondary admin-btn-sm" title={tpl.notes ?? undefined}
                onClick={() => setSpecialRows(r => [...r, {
                  description: tpl.label,
                  mode: tpl.pricing_mode,
                  unit_price: String(tpl.default_fee),
                  hours: tpl.default_hours != null ? String(tpl.default_hours) : '',
                }])}>
                + {tpl.label} ({tpl.pricing_mode === 'stunden' ? `CHF ${tpl.default_fee}/h` : `CHF ${tpl.default_fee}`})
              </button>
            ))}
            <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={() => setSpecialRows(r => [...r, { description: '', mode: 'pauschal', unit_price: '', hours: '' }])}>+ Manuell</button>
          </div>
        </fieldset>
      )}

      <DiscountsFieldset
        laborDiscount={laborDiscount}
        materialDiscount={materialDiscount}
        onLaborChange={setLaborDiscount}
        onMaterialChange={setMaterialDiscount}
      />

      {/* Product description */}
      <div style={{ marginBottom: 20 }}>
        <label className="admin-form-label">Produktbeschreibung</label>
        <SpellcheckTextarea value={productDescription} onChange={setProductDescription} placeholder="Beschreibung der angebotenen Produkte…" />
      </div>

      {/* Notes */}
      <div style={{ marginBottom: 20 }}>
        <label className="admin-form-label">Bemerkungen</label>
        <textarea className="admin-form-input" rows={8} style={{ resize: 'vertical', minHeight: 140 }} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optionale Bemerkungen…" />
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

interface QuotesScreenProps {
  initialStatus?: string | null
  onConsumed?: () => void
}

export default function QuotesScreen({ initialStatus, onConsumed }: QuotesScreenProps = {}) {
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilters, setStatusFilters] = useState<Set<string>>(() => {
    if (initialStatus && ['entwurf', 'gesendet', 'akzeptiert', 'abgelehnt', 'absage', 'archiviert'].includes(initialStatus)) {
      return new Set([initialStatus])
    }
    return new Set(['entwurf', 'gesendet', 'akzeptiert', 'abgelehnt', 'absage'])
  })

  useEffect(() => {
    if (initialStatus && onConsumed) onConsumed()
  }, [])
  const [search, setSearch] = useState('')
  const [projektleiterFilter, setProjektleiterFilter] = useState<string | null>(null)
  const [projektleiterOptions, setProjektleiterOptions] = useState<ProjektleiterOption[]>([])
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

  useEffect(() => {
    apiFetch('/pwa/admin/staff')
      .then(res => {
        const staff = res as { id: string; name: string; projektleiter: boolean }[]
        setProjektleiterOptions(
          staff
            .filter(s => s.projektleiter)
            .map(s => ({ id: s.id, name: s.name }))
            .sort((a, b) => a.name.localeCompare(b.name))
        )
      })
      .catch(() => setProjektleiterOptions([]))
  }, [])

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

  const ALL_STATUSES = ['entwurf', 'gesendet', 'akzeptiert', 'abgelehnt', 'absage', 'archiviert']

  const filtered = quotes.filter(q => {
    const matchStatus = statusFilters.has(q.status)
    const matchSearch = q.project_name.toLowerCase().includes(search.toLowerCase()) ||
      q.quote_number.toLowerCase().includes(search.toLowerCase())
    const matchPl = !projektleiterFilter || q.projektleiter_id === projektleiterFilter
    return matchStatus && matchSearch && matchPl
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
          <ProjektleiterFilter
            options={projektleiterOptions}
            value={projektleiterFilter}
            onChange={setProjektleiterFilter}
          />
          <StatusFilterPopover
            allStatuses={ALL_STATUSES}
            statusLabels={STATUS_LABELS}
            selected={statusFilters}
            onChange={setStatusFilters}
          />
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
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{q.quote_number}</td>
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
                          href={apiUrl(`/pwa/admin/quotes/${q.id}/pdf`)}
                          target="_blank"
                          rel="noreferrer"
                          className="admin-btn admin-btn-secondary admin-btn-sm"
                          onClick={e => e.stopPropagation()}
                        >
                          PDF
                        </a>
                      )}
                      {q.xlsx_url && (
                        <a
                          href={apiUrl(`/pwa/admin/quotes/${q.id}/xlsx`)}
                          target="_blank"
                          rel="noreferrer"
                          className="admin-btn admin-btn-secondary admin-btn-sm"
                          onClick={e => e.stopPropagation()}
                        >
                          XLSX
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
