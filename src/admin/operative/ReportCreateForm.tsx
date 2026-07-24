import { useMemo, useState, useEffect } from 'react'
import { apiFetch } from '../../api/client'
import { fmtCHF, fmtDate } from '../utils/format'
import { parseNum } from '../utils/quotePricing'
import { QUOTE_STATUS_LABELS } from '../constants/statuses'
import { InfoHint } from '../components/InfoHint'
import { useBackButton } from '../../shared/backButton'
import { MaterialCombobox, type MaterialOption } from './MaterialCombobox'
import type { ProjectQuote } from './projectDetail/tabs'
import type { QuoteDetail } from './QuotesScreen'

// Schlankes Formular zum manuellen Erfassen eines Rapports durch den Projektleiter
// — bewusst analog zu QuoteCreateForm, aber deutlich reduziert: keine KI, keine
// Unterschrift, keine Draft-Persistenz. Blöcke: Datum, Offerten-Hinweis,
// Mitarbeiter-/Stunden-Zeilen, optionale Materialpositionen, optionale Fixpreis-
// Positionen (aus der Offerte übernommen oder frei erfasst), optionale Klein-/
// Schmiermaterial-Pauschale, Arbeitsbeschrieb. Ein Rapport ohne Material wird
// exakt wie in Phase 1 abgeschickt (Material-/Kleinmaterial-/Fixpreis-Keys
// entfallen dann).

// Minimal-Shapes: strukturell kompatibel mit Project/StaffMember aus dem
// ProjectDetailScreen — beide werden von dort als Prop durchgereicht (nicht neu geladen).
export interface ReportFormProject {
  id: string
  name: string
}

export interface ReportFormStaff {
  id: string
  name: string
}

interface StaffRow {
  staffId: string
  hours: string
}

// Materialzeile: gewählter Katalogartikel (art_nr aus der MaterialCombobox) + Menge.
// Nur Zeilen mit aufgelöstem Artikel UND Menge > 0 werden gesendet ({ art_nr, amount }).
interface MaterialRow {
  artNr: string
  amount: string
}

// Klein-/Schmiermaterial-Pauschale: eine optionale Zeile. Wird nur mitgeschickt,
// wenn ein Betrag (> 0) erfasst ist — die Menge (Default 1) allein löst nichts aus.
interface KleinRow {
  itemName: string
  count: string
  amount: string
}

// Fixpreis-Materialzeile: freie Bezeichnung + Menge/Einheit/Preis (kein Katalog,
// keine art_nr). Entweder aus der Offerte übernommen (material_items) oder von
// Hand erfasst. Wird als `fixed_materials` gesendet und 1:1 verrechnet.
interface FixedMaterialRow {
  itemName: string
  amount: string
  unit: string
  unitPrice: string
  // true = aus der Offerte übernommen. Ein erneuter Import ersetzt nur diese
  // Zeilen; von Hand erfasste (false) bleiben erhalten.
  fromQuote?: boolean
}

// Standard-Offerte für den Hinweis: die akzeptierte (bei mehreren die neueste),
// sonst die insgesamt neueste. Reihenfolge nach created_at.
function pickDefaultQuote(quotes: ProjectQuote[]): ProjectQuote | null {
  if (quotes.length === 0) return null
  const accepted = quotes.filter(q => q.status === 'akzeptiert')
  const pool = accepted.length > 0 ? accepted : quotes
  return [...pool].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )[0]
}

function prefillDescription(q: ProjectQuote | null): string {
  return q ? `Arbeiten gemäss Offerte ${q.quote_number}` : ''
}

function todayISO(): string {
  const d = new Date()
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10)
}

export function ReportCreateForm({
  project,
  staff,
  quotes,
  onDone,
  onCancel,
}: {
  project: ReportFormProject
  staff: ReportFormStaff[]
  quotes: ProjectQuote[]
  onDone: () => void
  onCancel: () => void
}) {
  const defaultQuote = useMemo(() => pickDefaultQuote(quotes), [quotes])

  const [reportDate, setReportDate] = useState(todayISO())
  const [selectedQuoteId, setSelectedQuoteId] = useState<number | null>(defaultQuote?.id ?? null)
  const [description, setDescription] = useState<string>(prefillDescription(defaultQuote))
  // Sobald der Beschrieb von Hand geändert wurde, überschreibt ein Offertenwechsel
  // ihn nicht mehr (sonst verliert man die Eingabe beim Umschalten der Offerte).
  const [descTouched, setDescTouched] = useState(false)
  const [rows, setRows] = useState<StaffRow[]>([{ staffId: '', hours: '' }])
  // Material ist optional: standardmässig keine Zeile. Der Katalog wird erst geladen,
  // wenn der Nutzer die erste Materialposition hinzufügt (lazy) — ein Rapport ohne
  // Material verursacht so keinen Katalog-Fetch (~4'500 Artikel bei Stobag).
  const [materials, setMaterials] = useState<MaterialOption[]>([])
  const [materialsLoaded, setMaterialsLoaded] = useState(false)
  const [materialRows, setMaterialRows] = useState<MaterialRow[]>([])
  const [klein, setKlein] = useState<KleinRow>({ itemName: 'Kleinmaterial', count: '1', amount: '' })
  // Fixpreis-Positionen: aus der Offerte übernommenes Material oder frei erfasst.
  const [fixedRows, setFixedRows] = useState<FixedMaterialRow[]>([])
  const [loadingQuoteMaterial, setLoadingQuoteMaterial] = useState(false)
  const [quoteMaterialError, setQuoteMaterialError] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const selectedQuote = useMemo(
    () => quotes.find(q => q.id === selectedQuoteId) ?? null,
    [quotes, selectedQuoteId],
  )

  // Esc schliesst das Fenster.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  // Android-Hardware-Zurück schliesst das Modal (LIFO), statt zur Hauptmaske zu springen.
  useBackButton(true, onCancel)

  function onQuoteChange(id: number) {
    setSelectedQuoteId(id)
    if (!descTouched) {
      setDescription(prefillDescription(quotes.find(q => q.id === id) ?? null))
    }
  }

  // ── Zeilen-Helfer (analog Lohnpositionen in QuoteCreateForm, aber ohne Ansatz) ──
  function updateRow(i: number, patch: Partial<StaffRow>) {
    setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  }
  function addRow() {
    setRows(rs => [...rs, { staffId: '', hours: '' }])
  }
  function removeRow(i: number) {
    setRows(rs => rs.filter((_, j) => j !== i))
  }

  // ── Material-Zeilen (optional, MaterialCombobox wie in QuoteCreateForm) ──
  // Katalog beim ersten Hinzufügen einer Zeile nachladen. Fehler ist unkritisch —
  // dann bleibt die Combobox leer, der Rest des Formulars funktioniert weiter.
  function ensureMaterialsLoaded() {
    if (materialsLoaded) return
    setMaterialsLoaded(true)
    apiFetch('/pwa/admin/materials')
      .then(m => setMaterials(Array.isArray(m) ? (m as MaterialOption[]) : []))
      // Fehler → Flag zurücksetzen, damit der nächste Klick erneut lädt
      // (sonst bleibt die Combobox nach einem einmaligen Fehler dauerhaft leer).
      .catch(() => setMaterialsLoaded(false))
  }
  function updateMaterialRow(i: number, patch: Partial<MaterialRow>) {
    setMaterialRows(rs => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  }
  function addMaterialRow() {
    ensureMaterialsLoaded()
    setMaterialRows(rs => [...rs, { artNr: '', amount: '' }])
  }
  function removeMaterialRow(i: number) {
    setMaterialRows(rs => rs.filter((_, j) => j !== i))
  }

  // ── Fixpreis-Positionen (aus Offerte übernommen oder frei erfasst) ──
  function updateFixedRow(i: number, patch: Partial<FixedMaterialRow>) {
    setFixedRows(rs => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  }
  function addFixedRow() {
    setFixedRows(rs => [...rs, { itemName: '', amount: '', unit: 'Stk', unitPrice: '', fromQuote: false }])
  }
  function removeFixedRow(i: number) {
    setFixedRows(rs => rs.filter((_, j) => j !== i))
  }

  // Material der gewählten Offerte laden und als bearbeitbare Fixpreis-Zeilen
  // übernehmen. Bewusst NUR material_items (Produkte/Zuschläge/Montage/Spezial
  // werden vom rapportbasierten Rechnungspfad bereits automatisch verrechnet —
  // sie hier zusätzlich zu tragen würde doppelt verrechnen). Eventualpositionen
  // (optional=true) werden übersprungen. Ein erneuter Klick ersetzt nur die zuvor
  // übernommenen Zeilen; von Hand erfasste Positionen bleiben erhalten.
  async function importQuoteMaterial() {
    if (!selectedQuote) return
    setLoadingQuoteMaterial(true)
    setQuoteMaterialError('')
    try {
      const detail = (await apiFetch(`/pwa/admin/quotes/${selectedQuote.id}`)) as QuoteDetail
      const items = Array.isArray(detail.material_items) ? detail.material_items : []
      const carried: FixedMaterialRow[] = items
        .filter(it => !it.optional)
        .map(it => ({
          itemName: it.description ?? '',
          amount: String(it.quantity ?? ''),
          unit: it.unit || 'Stk',
          unitPrice: String(it.unit_price ?? ''),
          fromQuote: true,
        }))
      // Manuell erfasste Zeilen (fromQuote=false) behalten, alte Übernahme ersetzen.
      setFixedRows(rs => [...rs.filter(r => !r.fromQuote), ...carried])
    } catch {
      setQuoteMaterialError('Material der Offerte konnte nicht geladen werden.')
    } finally {
      setLoadingQuoteMaterial(false)
    }
  }

  async function handleSubmit() {
    const filled = rows.filter(r => r.staffId)
    if (filled.length === 0) {
      setError('Mindestens ein Mitarbeiter mit Stunden erforderlich.')
      return
    }
    for (const r of filled) {
      const h = parseNum(r.hours)
      if (!(h > 0 && h <= 24)) {
        setError('Stunden müssen grösser als 0 und höchstens 24 sein.')
        return
      }
    }
    const ids = filled.map(r => r.staffId)
    if (new Set(ids).size !== ids.length) {
      setError('Ein Mitarbeiter ist doppelt erfasst.')
      return
    }
    if (!description.trim()) {
      setError('Arbeitsbeschrieb erforderlich.')
      return
    }

    // Materialpositionen: nur vollständige Zeilen (Artikel + Menge > 0) zählen.
    // Halb ausgefüllte Zeilen sind ein Fehler, komplett leere werden ignoriert.
    for (const r of materialRows) {
      const hasArt = !!r.artNr
      const amt = parseNum(r.amount)
      if (hasArt && !(amt > 0)) {
        setError('Materialposition: Menge muss grösser als 0 sein.')
        return
      }
      if (!hasArt && r.amount.trim() !== '') {
        setError('Materialposition: bitte zuerst einen Artikel wählen.')
        return
      }
    }
    const materialItems = materialRows
      .filter(r => r.artNr && parseNum(r.amount) > 0)
      .map(r => ({ art_nr: r.artNr, amount: parseNum(r.amount) }))

    // Klein-/Schmiermaterial: der Betrag ist der Auslöser (die Menge hat einen
    // Default und aktiviert die Pauschale nicht allein). Ist ein Betrag erfasst,
    // müssen Menge > 0, Betrag > 0 und eine Bezeichnung vorhanden sein.
    const kleinEngaged = klein.amount.trim() !== ''
    const kleinCount = parseNum(klein.count)
    const kleinAmount = parseNum(klein.amount)
    if (kleinEngaged) {
      if (!(kleinCount > 0) || kleinCount !== Math.floor(kleinCount)) {
        setError('Klein-/Schmiermaterial: Menge muss eine ganze Zahl grösser als 0 sein.')
        return
      }
      if (!(kleinAmount > 0)) {
        setError('Klein-/Schmiermaterial: Betrag muss grösser als 0 sein.')
        return
      }
      if (!klein.itemName.trim()) {
        setError('Klein-/Schmiermaterial: Bezeichnung erforderlich.')
        return
      }
    }

    // Fixpreis-Positionen: eine Zeile zählt nur mit Bezeichnung UND Menge > 0.
    // Halb ausgefüllte Zeilen sind ein Fehler, komplett leere werden ignoriert.
    for (const r of fixedRows) {
      const hasName = r.itemName.trim() !== ''
      const amt = parseNum(r.amount)
      if (hasName && !(amt > 0)) {
        setError('Fixposition: Menge muss grösser als 0 sein.')
        return
      }
      if (!hasName && r.amount.trim() !== '') {
        setError('Fixposition: bitte eine Bezeichnung erfassen.')
        return
      }
      if (hasName && parseNum(r.unitPrice) < 0) {
        setError('Fixposition: Preis darf nicht negativ sein.')
        return
      }
    }
    const fixedMaterials = fixedRows
      .filter(r => r.itemName.trim() && parseNum(r.amount) > 0)
      .map(r => ({
        item_name: r.itemName.trim(),
        amount: parseNum(r.amount),
        unit: r.unit.trim() || 'Stk',
        unit_price: parseNum(r.unitPrice),
      }))

    setSaving(true)
    setError('')
    try {
      // Material-/Kleinmaterial-Keys nur setzen, wenn Inhalt da ist — ein Rapport
      // ohne Material bleibt so byte-identisch zur Phase-1-Nutzlast.
      const payload: {
        report_date: string
        description: string
        staff: { staff_id: string; hours: number }[]
        materials?: { art_nr: string; amount: number }[]
        kleinmaterial?: { item_name: string; count: number; amount_chf: number }
        fixed_materials?: { item_name: string; amount: number; unit: string; unit_price: number }[]
      } = {
        report_date: reportDate,
        description: description.trim(),
        staff: filled.map(r => ({ staff_id: r.staffId, hours: parseNum(r.hours) })),
      }
      if (materialItems.length > 0) payload.materials = materialItems
      if (fixedMaterials.length > 0) payload.fixed_materials = fixedMaterials
      if (kleinEngaged && kleinCount > 0 && kleinAmount > 0) {
        payload.kleinmaterial = {
          item_name: klein.itemName.trim(),
          count: kleinCount,
          amount_chf: kleinAmount,
        }
      }
      const res = (await apiFetch(`/pwa/admin/projects/${project.id}/reports`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })) as { report_id?: number; warnings?: unknown } | null
      // 201 kann Warnungen enthalten (z.B. nicht abgebuchtes Lager, unbekannte
      // art_nr). Das ist trotzdem Erfolg — kurz sichtbar machen, dann schliessen.
      const warnings = res && Array.isArray(res.warnings)
        ? (res.warnings as unknown[]).filter((w): w is string => typeof w === 'string')
        : []
      if (warnings.length > 0) {
        window.alert('Rapport gespeichert.\n\nHinweis:\n' + warnings.join('\n'))
      }
      onDone()
    } catch (err) {
      // 400 des Backends liefert eine deutsche Meldung (client.ts liest `error`/`detail`).
      setError(err instanceof Error ? err.message : 'Fehler beim Speichern')
    } finally {
      setSaving(false)
    }
  }

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

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '0 0 8px' }}>
        <h3 style={{ margin: 0 }}>Rapport manuell erfassen</h3>
        <InfoHint text="Der Rapport wird ohne Kundenunterschrift gespeichert und ist sofort verrechenbar." />
      </div>
      <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--muted)' }}>
        Projekt: <strong>{project.name}</strong>
      </p>

      {error && <div className="admin-alert admin-alert-error" style={{ marginBottom: 16 }}>{error}</div>}

      {/* Datum */}
      <div style={{ marginBottom: 20 }}>
        <label className="admin-form-label" htmlFor="report-date">Datum *</label>
        <input
          id="report-date"
          className="admin-form-input"
          type="date"
          value={reportDate}
          onChange={e => setReportDate(e.target.value)}
        />
      </div>

      {/* Offerten-Hinweis (rein informativ; ändert nur den Beschrieb-Vorschlag) */}
      <fieldset style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginBottom: 20 }}>
        <legend style={{ fontWeight: 600, padding: '0 8px' }}>
          Offerte
          <InfoHint text="Nur ein Hinweis, aus welcher Offerte der Rapport entsteht — es wird keine Verknüpfung gespeichert. Der Bezug landet lesbar im Arbeitsbeschrieb." />
        </legend>
        {quotes.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>Keine Offerte für dieses Projekt vorhanden.</div>
        ) : (
          <>
            {quotes.length > 1 && (
              <select
                className="admin-form-select"
                style={{ marginBottom: 12 }}
                value={selectedQuoteId ?? ''}
                onChange={e => onQuoteChange(Number(e.target.value))}
                aria-label="Offerte wählen"
              >
                {quotes.map(q => (
                  <option key={q.id} value={q.id}>
                    {q.quote_number} · {QUOTE_STATUS_LABELS[q.status] ?? q.status} · {fmtCHF(q.total_amount)}
                  </option>
                ))}
              </select>
            )}
            {selectedQuote && (
              <div style={{ fontSize: 13, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{selectedQuote.quote_number}</span>
                <span className="admin-badge admin-badge-open">{QUOTE_STATUS_LABELS[selectedQuote.status] ?? selectedQuote.status}</span>
                <span style={{ color: 'var(--muted)' }}>{fmtDate(selectedQuote.created_at)}</span>
                <span style={{ fontWeight: 600 }}>{fmtCHF(selectedQuote.total_amount)}</span>
              </div>
            )}
          </>
        )}
      </fieldset>

      {/* Mitarbeiter + Stunden */}
      <fieldset style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginBottom: 20 }}>
        <legend style={{ fontWeight: 600, padding: '0 8px' }}>Mitarbeiter &amp; Stunden</legend>
        {rows.map((row, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <select
              className="admin-form-select"
              style={{ flex: 2 }}
              value={row.staffId}
              aria-label={`Mitarbeiter ${i + 1}`}
              onChange={e => updateRow(i, { staffId: e.target.value })}
            >
              <option value="">Mitarbeiter wählen…</option>
              {staff.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <input
              className="admin-form-input"
              style={{ flex: 1 }}
              inputMode="decimal"
              placeholder="Stunden"
              aria-label={`Stunden ${i + 1}`}
              value={row.hours}
              onChange={e => updateRow(i, { hours: e.target.value })}
            />
            {rows.length > 1 && (
              <button
                type="button"
                className="admin-btn admin-btn-danger admin-btn-sm"
                onClick={() => removeRow(i)}
                title="Entfernen"
                aria-label="Zeile entfernen"
              >
                ✕
              </button>
            )}
          </div>
        ))}
        <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm" onClick={addRow}>
          + Zeile
        </button>
      </fieldset>

      {/* Materialpositionen (optional) */}
      <fieldset style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginBottom: 20 }}>
        <legend style={{ fontWeight: 600, padding: '0 8px' }}>
          Material
          <InfoHint text="Optional. Katalogartikel + Menge — der Verkaufspreis wird bei der Verrechnung aus den Stammdaten bestimmt. Zeilen ohne Artikel oder ohne Menge werden ignoriert." />
        </legend>
        {materialRows.length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>Kein Material erfasst.</div>
        )}
        {materialRows.map((row, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <MaterialCombobox
              materials={materials}
              supplierMap={{}}
              supplierFilter=""
              categoryFilter=""
              value={row.artNr}
              onChange={artNr => updateMaterialRow(i, { artNr })}
            />
            <input
              className="admin-form-input"
              style={{ flex: 1 }}
              inputMode="decimal"
              placeholder="Menge"
              aria-label={`Materialmenge ${i + 1}`}
              value={row.amount}
              onChange={e => updateMaterialRow(i, { amount: e.target.value })}
            />
            <button
              type="button"
              className="admin-btn admin-btn-danger admin-btn-sm"
              onClick={() => removeMaterialRow(i)}
              title="Entfernen"
              aria-label="Materialzeile entfernen"
            >
              ✕
            </button>
          </div>
        ))}
        <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm" onClick={addMaterialRow}>
          + Materialposition
        </button>
      </fieldset>

      {/* Material aus Offerte / freie Fixpreis-Positionen (optional) */}
      <fieldset style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginBottom: 20 }}>
        <legend style={{ fontWeight: 600, padding: '0 8px' }}>
          Material aus Offerte
          <InfoHint text="Optional. Übernimmt die Materialpositionen der gewählten Offerte als bearbeitbare Fixpreis-Zeilen (Bezeichnung, Menge, Einheit, Preis) und verrechnet sie 1:1. Produkte, Zuschläge und Montage werden NICHT übernommen — die rechnet der Rapport bereits automatisch. Eventualpositionen werden übersprungen. Freie Zeilen lassen sich auch ohne Offerte hinzufügen." />
        </legend>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <button
            type="button"
            className="admin-btn admin-btn-secondary admin-btn-sm"
            disabled={!selectedQuote || loadingQuoteMaterial}
            onClick={importQuoteMaterial}
            title={selectedQuote ? 'Materialpositionen der Offerte übernehmen' : 'Zuerst oben eine Offerte wählen'}
          >
            {loadingQuoteMaterial ? 'Wird geladen…' : 'Material aus Offerte übernehmen'}
          </button>
          <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm" onClick={addFixedRow}>
            + Position
          </button>
        </div>
        {quoteMaterialError && (
          <div className="admin-alert admin-alert-error" style={{ marginBottom: 12 }}>{quoteMaterialError}</div>
        )}
        {fixedRows.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>Keine Fixpreis-Position erfasst.</div>
        ) : (
          fixedRows.map((row, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                className="admin-form-input"
                style={{ flex: 3, minWidth: 160 }}
                placeholder="Bezeichnung"
                aria-label={`Fixposition Bezeichnung ${i + 1}`}
                value={row.itemName}
                onChange={e => updateFixedRow(i, { itemName: e.target.value })}
              />
              <input
                className="admin-form-input"
                style={{ flex: 1, minWidth: 70 }}
                inputMode="decimal"
                placeholder="Menge"
                aria-label={`Fixposition Menge ${i + 1}`}
                value={row.amount}
                onChange={e => updateFixedRow(i, { amount: e.target.value })}
              />
              <input
                className="admin-form-input"
                style={{ flex: 1, minWidth: 60 }}
                placeholder="Einheit"
                aria-label={`Fixposition Einheit ${i + 1}`}
                value={row.unit}
                onChange={e => updateFixedRow(i, { unit: e.target.value })}
              />
              <input
                className="admin-form-input"
                style={{ flex: 1, minWidth: 110 }}
                inputMode="decimal"
                placeholder="Preis/Einheit"
                aria-label={`Fixposition Preis ${i + 1}`}
                value={row.unitPrice}
                onChange={e => updateFixedRow(i, { unitPrice: e.target.value })}
              />
              <button
                type="button"
                className="admin-btn admin-btn-danger admin-btn-sm"
                onClick={() => removeFixedRow(i)}
                title="Entfernen"
                aria-label="Fixposition entfernen"
              >
                ✕
              </button>
            </div>
          ))
        )}
      </fieldset>

      {/* Klein-/Schmiermaterial-Pauschale (optional, eine Zeile) */}
      <fieldset style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginBottom: 20 }}>
        <legend style={{ fontWeight: 600, padding: '0 8px' }}>
          Klein-/Schmiermaterial (Pauschale)
          <InfoHint text="Optional. Eine Pauschalzeile für nicht einzeln erfasstes Klein- und Schmiermaterial. Wird nur verrechnet, wenn ein Betrag erfasst ist." />
        </legend>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="admin-form-input"
            style={{ flex: 2, minWidth: 160 }}
            placeholder="Bezeichnung"
            aria-label="Kleinmaterial Bezeichnung"
            value={klein.itemName}
            onChange={e => setKlein(k => ({ ...k, itemName: e.target.value }))}
          />
          <input
            className="admin-form-input"
            style={{ flex: 1, minWidth: 70 }}
            inputMode="numeric"
            placeholder="Menge"
            aria-label="Kleinmaterial Menge"
            value={klein.count}
            onChange={e => setKlein(k => ({ ...k, count: e.target.value }))}
          />
          <input
            className="admin-form-input"
            style={{ flex: 1, minWidth: 110 }}
            inputMode="decimal"
            placeholder="Betrag CHF/Einheit"
            aria-label="Kleinmaterial Betrag"
            value={klein.amount}
            onChange={e => setKlein(k => ({ ...k, amount: e.target.value }))}
          />
        </div>
      </fieldset>

      {/* Arbeitsbeschrieb */}
      <div style={{ marginBottom: 20 }}>
        <label className="admin-form-label" htmlFor="report-description">Arbeitsbeschrieb *</label>
        <textarea
          id="report-description"
          className="admin-form-input"
          rows={4}
          style={{ resize: 'vertical' }}
          placeholder="Was wurde gemacht?"
          value={description}
          onChange={e => { setDescription(e.target.value); setDescTouched(true) }}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" className="admin-btn admin-btn-secondary" onClick={onCancel} disabled={saving}>
          Abbrechen
        </button>
        <button type="button" className="admin-btn admin-btn-primary" onClick={handleSubmit} disabled={saving}>
          {saving ? 'Wird gespeichert…' : 'Rapport speichern'}
        </button>
      </div>
    </div>
  )
}
