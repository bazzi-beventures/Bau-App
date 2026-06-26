import { useEffect, useRef, useState } from 'react'
import { apiFetch, apiFormFetch } from '../../api/client'

interface Supplier {
  id: string
  name: string
  prefix: string
}

interface FieldDef {
  key: string
  label: string
  required: boolean
}

interface ParseResult {
  columns: string[]
  fields: FieldDef[]
  mapping: Record<string, string | null>
  sample_rows: Record<string, string | number | null>[]
  row_count: number
}

type Action = 'new' | 'update' | 'unchanged'

interface PreviewRow {
  manufacturer_art_nr: string
  art_nr: string
  name: string
  unit: string
  category: string | null
  cost_price: number | null
  old_cost_price: number | null
  unit_price: number
  action: Action
}

interface PreviewResult {
  preview: true
  supplier_name: string
  rows: PreviewRow[]
  errors: { row: number; message: string }[]
  summary: { new: number; update: number; unchanged: number; errors: number }
}

interface ImportResult {
  imported: number
  updated: number
  skipped: number
  errors: { row: number; message: string }[]
}

const fmtChf = (n: number | null) => (n == null ? '—' : `CHF ${n.toFixed(2)}`)

const ACTION_LABEL: Record<Action, string> = {
  new: 'Neu',
  update: 'Update',
  unchanged: 'Unverändert',
}

export default function ImportScreen() {
  const fileRef = useRef<HTMLInputElement>(null)

  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [supplierId, setSupplierId] = useState('')

  const [file, setFile] = useState<File | null>(null)
  const [fileName, setFileName] = useState('')
  const [parsing, setParsing] = useState(false)
  const [parsed, setParsed] = useState<ParseResult | null>(null)
  const [mapping, setMapping] = useState<Record<string, string>>({})

  const [previewing, setPreviewing] = useState(false)
  const [previewData, setPreviewData] = useState<PreviewResult | null>(null)

  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  const [error, setError] = useState('')
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    apiFetch('/pwa/admin/suppliers')
      .then(s => setSuppliers(s as Supplier[]))
      .catch(() => setSuppliers([]))
  }, [])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 4000)
  }

  function resetAll() {
    setFile(null)
    setFileName('')
    setParsed(null)
    setMapping({})
    setPreviewData(null)
    setResult(null)
    setError('')
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleFile(f: File) {
    if (!supplierId) {
      setError('Bitte zuerst einen Lieferanten wählen.')
      return
    }
    setFile(f)
    setFileName(f.name)
    setParsed(null)
    setPreviewData(null)
    setResult(null)
    setError('')
    setParsing(true)

    const fd = new FormData()
    fd.append('file', f)
    try {
      const res = await apiFormFetch('/pwa/admin/import/parse', fd) as ParseResult
      setParsed(res)
      const initial: Record<string, string> = {}
      for (const fld of res.fields) initial[fld.key] = res.mapping[fld.key] ?? ''
      setMapping(initial)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Datei konnte nicht gelesen werden')
    } finally {
      setParsing(false)
    }
  }

  function onMappingChange(field: string, column: string) {
    setMapping(prev => ({ ...prev, [field]: column }))
    setPreviewData(null) // Mapping geändert → Vorschau neu berechnen
    setResult(null)
  }

  function missingRequired(): string | null {
    if (!parsed) return null
    for (const fld of parsed.fields) {
      if (fld.required && !mapping[fld.key]) return fld.label
    }
    return null
  }

  function buildFormData(preview: boolean): FormData {
    const fd = new FormData()
    fd.append('file', file as File)
    fd.append('supplier_id', supplierId)
    fd.append('mapping', JSON.stringify(mapping))
    fd.append('preview', preview ? 'true' : 'false')
    return fd
  }

  async function runPreview() {
    const miss = missingRequired()
    if (miss) { setError(`Pflichtfeld „${miss}" muss einer Spalte zugeordnet werden.`); return }
    setPreviewing(true)
    setError('')
    setResult(null)
    try {
      const res = await apiFormFetch('/pwa/admin/import/materials', buildFormData(true)) as PreviewResult
      setPreviewData(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Vorschau fehlgeschlagen')
    } finally {
      setPreviewing(false)
    }
  }

  async function runImport() {
    setImporting(true)
    setError('')
    try {
      const res = await apiFormFetch('/pwa/admin/import/materials', buildFormData(false)) as ImportResult
      setResult(res)
      showToast(`${res.imported} neu · ${res.updated} aktualisiert`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import fehlgeschlagen')
    } finally {
      setImporting(false)
    }
  }

  const selectedSupplier = suppliers.find(s => s.id === supplierId)

  // Rendert KEIN eigenes `admin-page` — eingebettet als Tab in MaterialsScreen,
  // der den Seitenrahmen + Tab-Leiste liefert (analog UnitsPanel).
  return (
    <>
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Material-Import</div>
          <div className="admin-page-subtitle">Lieferanten-Preisliste (XLSX / CSV) importieren</div>
        </div>
        {(parsed || previewData) && (
          <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={resetAll}>Neu beginnen</button>
        )}
      </div>

      {error && <div className="admin-form-error" style={{ margin: '0 0 14px' }}>{error}</div>}

      {/* Schritt 1: Lieferant + Datei */}
      <div className="admin-table-wrap" style={{ padding: 20, marginBottom: 16 }}>
        <div className="admin-section-title">1 · Lieferant & Datei</div>
        <div className="admin-form-group" style={{ maxWidth: 420, marginTop: 12 }}>
          <label className="admin-form-label">Lieferant *</label>
          <select
            className="admin-form-input"
            value={supplierId}
            onChange={e => { setSupplierId(e.target.value); setPreviewData(null); setResult(null) }}
          >
            <option value="">— Lieferant wählen —</option>
            {suppliers.map(s => (
              <option key={s.id} value={s.id}>{s.name} ({s.prefix})</option>
            ))}
          </select>
          {suppliers.length === 0 && (
            <div className="admin-form-hint">
              Noch keine Lieferanten erfasst — lege zuerst unter <strong>Lieferanten</strong> einen an.
            </div>
          )}
          {selectedSupplier && (
            <div className="admin-form-hint">
              System-Artikelnummern werden als <code>{selectedSupplier.prefix}-&lt;Lieferanten-Nr.&gt;</code> erzeugt.
            </div>
          )}
        </div>

        {!parsed && !parsing && (
          <div
            className="admin-table-wrap"
            style={{
              padding: 32, textAlign: 'center', marginTop: 8,
              border: '2px dashed var(--border)', background: 'transparent',
              cursor: supplierId ? 'pointer' : 'not-allowed', opacity: supplierId ? 1 : 0.5,
            }}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
            onClick={() => { if (supplierId) fileRef.current?.click() }}
          >
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>XLSX- oder CSV-Datei hier ablegen</div>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>
              {supplierId ? 'oder klicken zum Auswählen' : 'zuerst Lieferant wählen'}
            </div>
            <input
              ref={fileRef} type="file"
              accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
            />
          </div>
        )}

        {parsing && (
          <div className="admin-loading" style={{ height: 80 }}>
            <div className="admin-spinner" /> Datei wird analysiert…
          </div>
        )}

        {parsed && (
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 10 }}>
            <strong style={{ color: 'var(--text)' }}>{fileName}</strong> — {parsed.row_count} Zeilen, {parsed.columns.length} Spalten erkannt.
          </div>
        )}
      </div>

      {/* Schritt 2: Spalten-Mapping */}
      {parsed && (
        <div className="admin-table-wrap" style={{ padding: 20, marginBottom: 16 }}>
          <div className="admin-section-title">2 · Spalten zuordnen</div>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: '8px 0 14px' }}>
            Ordne die Spalten deiner Datei den System-Feldern zu. Vorschläge sind bereits gesetzt.
          </p>
          <div style={{ display: 'grid', gap: 10, maxWidth: 520 }}>
            {parsed.fields.map(fld => (
              <div key={fld.key} style={{ display: 'grid', gridTemplateColumns: '180px 1fr', alignItems: 'center', gap: 12 }}>
                <label className="admin-form-label" style={{ margin: 0 }}>
                  {fld.label}{fld.required && <span style={{ color: '#ef4444' }}> *</span>}
                </label>
                <select
                  className="admin-form-input"
                  value={mapping[fld.key] ?? ''}
                  onChange={e => onMappingChange(fld.key, e.target.value)}
                >
                  <option value="">{fld.required ? '— Spalte wählen —' : '— nicht zuordnen —'}</option>
                  {parsed.columns.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            ))}
          </div>

          {parsed.sample_rows.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Beispieldaten:</div>
              <div className="admin-table-wrap" style={{ overflowX: 'auto' }}>
                <table className="admin-table">
                  <thead>
                    <tr>{parsed.columns.map(c => <th key={c}>{c}</th>)}</tr>
                  </thead>
                  <tbody>
                    {parsed.sample_rows.slice(0, 5).map((row, i) => (
                      <tr key={i}>{parsed.columns.map(c => <td key={c} style={{ whiteSpace: 'nowrap' }}>{String(row[c] ?? '')}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="admin-btn admin-btn-primary" onClick={runPreview} disabled={previewing}>
              {previewing ? 'Berechne…' : 'Vorschau anzeigen'}
            </button>
          </div>
        </div>
      )}

      {/* Schritt 3: Vorschau + Import */}
      {previewData && (
        <div className="admin-table-wrap" style={{ padding: 20 }}>
          <div className="admin-section-title">3 · Vorschau & Import</div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, margin: '10px 0 14px' }}>
            <span><strong style={{ color: '#22c55e' }}>{previewData.summary.new}</strong> neu</span>
            <span><strong style={{ color: '#3b82f6' }}>{previewData.summary.update}</strong> Update</span>
            <span><strong style={{ color: 'var(--muted)' }}>{previewData.summary.unchanged}</strong> unverändert</span>
            {previewData.summary.errors > 0 && (
              <span style={{ color: '#ef4444' }}><strong>{previewData.summary.errors}</strong> Fehler</span>
            )}
          </div>

          <div className="admin-table-wrap" style={{ marginBottom: 16, maxHeight: 460, overflowY: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Lieferanten-Nr.</th>
                  <th>System-Nr.</th>
                  <th>Bezeichnung</th>
                  <th>EK-Preis</th>
                  <th>VK (kalk.)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {previewData.rows.map((row, i) => (
                  <tr key={i}>
                    <td style={{ fontFamily: 'var(--mono)' }}>{row.manufacturer_art_nr}</td>
                    <td style={{ fontFamily: 'var(--mono)', color: 'var(--muted)' }}>{row.art_nr}</td>
                    <td>{row.name}</td>
                    <td style={{ fontFamily: 'var(--mono)' }}>
                      {row.action === 'update' && row.old_cost_price != null && row.cost_price != null && Math.abs(row.old_cost_price - row.cost_price) > 0.005 ? (
                        <span><span style={{ color: 'var(--muted)', textDecoration: 'line-through' }}>{fmtChf(row.old_cost_price)}</span> → {fmtChf(row.cost_price)}</span>
                      ) : fmtChf(row.cost_price)}
                    </td>
                    <td style={{ fontFamily: 'var(--mono)', color: 'var(--muted)' }}>{fmtChf(row.unit_price)}</td>
                    <td>
                      <span
                        className="admin-badge"
                        style={{
                          fontSize: 11,
                          background: row.action === 'new' ? 'rgba(34,197,94,0.15)' : row.action === 'update' ? 'rgba(59,130,246,0.15)' : 'rgba(148,163,184,0.15)',
                          color: row.action === 'new' ? '#22c55e' : row.action === 'update' ? '#3b82f6' : 'var(--muted)',
                        }}
                      >
                        {ACTION_LABEL[row.action]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {previewData.errors.length > 0 && (
            <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid #ef4444', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
              <strong>{previewData.errors.length} Zeile(n) übersprungen:</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: 20, color: '#ef4444' }}>
                {previewData.errors.slice(0, 10).map((e, i) => <li key={i}>Zeile {e.row}: {e.message}</li>)}
                {previewData.errors.length > 10 && <li>… und {previewData.errors.length - 10} weitere</li>}
              </ul>
            </div>
          )}

          {result && (
            <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid #22c55e', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 13 }}>
              <strong>Import abgeschlossen:</strong> {result.imported} neu angelegt, {result.updated} aktualisiert
              {result.skipped > 0 && <>, {result.skipped} unverändert</>}.
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button className="admin-btn admin-btn-secondary" onClick={resetAll}>Abbrechen</button>
            <button
              className="admin-btn admin-btn-primary"
              onClick={runImport}
              disabled={importing || !!result || (previewData.summary.new + previewData.summary.update === 0)}
            >
              {importing ? 'Importiere…' : `${previewData.summary.new + previewData.summary.update} Artikel importieren`}
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className="admin-toast-container">
          <div className="admin-toast success">{toast}</div>
        </div>
      )}
    </>
  )
}
