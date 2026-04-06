import { useRef, useState } from 'react'
import { apiFetch } from '../../api/client'

interface PreviewRow {
  art_nr: string
  name: string
  unit: string
  purchase_price: number | null
  category: string | null
  supplier_name: string | null
  _error?: string
}

interface ImportResult {
  imported: number
  errors: { row: number; message: string }[]
}

export default function ImportScreen() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<PreviewRow[] | null>(null)
  const [fileName, setFileName] = useState('')
  const [rawFile, setRawFile] = useState<File | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState('')
  const [toast, setToast] = useState<string | null>(null)

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 4000)
  }

  async function handleFile(file: File) {
    setRawFile(file)
    setFileName(file.name)
    setPreview(null)
    setResult(null)
    setError('')
    setPreviewing(true)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const rows = await apiFetch('/pwa/admin/import/materials?preview=true', {
        method: 'POST',
        body: formData,
      }) as PreviewRow[]
      setPreview(rows)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fehler beim Lesen der Datei')
    } finally {
      setPreviewing(false)
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  async function handleImport() {
    if (!rawFile) return
    setImporting(true)
    setResult(null)
    setError('')

    const formData = new FormData()
    formData.append('file', rawFile)

    try {
      const res = await apiFetch('/pwa/admin/import/materials', {
        method: 'POST',
        body: formData,
      }) as ImportResult
      setResult(res)
      showToast(`${res.imported} Artikel importiert`)
      if (res.errors.length === 0) {
        setPreview(null)
        setRawFile(null)
        setFileName('')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Import fehlgeschlagen')
    } finally {
      setImporting(false)
    }
  }

  function reset() {
    setPreview(null)
    setRawFile(null)
    setFileName('')
    setResult(null)
    setError('')
    if (fileRef.current) fileRef.current.value = ''
  }

  const hasErrors = preview?.some(r => r._error)
  const validRows = preview?.filter(r => !r._error) ?? []

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Import / Upload</div>
          <div className="admin-page-subtitle">Material-Stammdaten via CSV importieren</div>
        </div>
      </div>

      {/* Format Info */}
      <div className="admin-table-wrap" style={{ padding: 20, marginBottom: 16 }}>
        <div className="admin-section-title">CSV-Format</div>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '10px 0 8px' }}>
          Trennzeichen: Semikolon (<code>;</code>) oder Komma (<code>,</code>). Encoding: UTF-8 oder Latin-1.
        </p>
        <div style={{ background: '#0f1117', borderRadius: 8, padding: '12px 16px', fontFamily: 'monospace', fontSize: 12, color: '#93c5fd', overflowX: 'auto' }}>
          art_nr;name;unit;purchase_price;category;supplier_name<br />
          W-001;Schraube M6×40;Stk;0.12;Befestigung;Würth<br />
          W-002;Dübel 10mm;Stk;0.35;Befestigung;Würth
        </div>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
          Pflichtfelder: <strong>art_nr</strong>, <strong>name</strong>, <strong>unit</strong>. Optionale Felder können leer bleiben.
          Bestehende Artikel werden anhand der <code>art_nr</code> aktualisiert.
        </p>
      </div>

      {/* Drop Zone */}
      {!preview && !previewing && (
        <div
          className="admin-table-wrap"
          style={{
            padding: 40,
            textAlign: 'center',
            border: '2px dashed var(--border)',
            background: 'transparent',
            cursor: 'pointer',
          }}
          onDragOver={e => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
        >
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.4, marginBottom: 12 }}>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>CSV-Datei hier ablegen</div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>oder klicken zum Auswählen</div>
          <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={handleInputChange} />
        </div>
      )}

      {previewing && (
        <div className="admin-loading" style={{ height: 120 }}>
          <div className="admin-spinner" /> Datei wird analysiert…
        </div>
      )}

      {error && (
        <div className="admin-form-error" style={{ margin: '12px 0' }}>{error}</div>
      )}

      {/* Preview Table */}
      {preview && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>
              <strong style={{ color: 'var(--text)' }}>{fileName}</strong>
              {' — '}
              {validRows.length} gültige Zeilen
              {hasErrors && <span style={{ color: '#ef4444', marginLeft: 6 }}>({preview.filter(r => r._error).length} Fehler)</span>}
            </div>
            <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={reset}>Zurücksetzen</button>
          </div>

          <div className="admin-table-wrap" style={{ marginBottom: 16 }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Art.-Nr.</th>
                  <th>Name</th>
                  <th>Einheit</th>
                  <th>EK-Preis</th>
                  <th>Kategorie</th>
                  <th>Lieferant</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {preview.map((row, i) => (
                  <tr key={i} style={row._error ? { background: 'rgba(239,68,68,0.07)' } : undefined}>
                    <td><strong>{row.art_nr || '—'}</strong></td>
                    <td>{row.name || '—'}</td>
                    <td style={{ color: 'var(--muted)' }}>{row.unit || '—'}</td>
                    <td style={{ fontFamily: 'monospace' }}>
                      {row.purchase_price != null ? `CHF ${row.purchase_price.toFixed(2)}` : '—'}
                    </td>
                    <td style={{ color: 'var(--muted)' }}>{row.category || '—'}</td>
                    <td style={{ color: 'var(--muted)' }}>{row.supplier_name || '—'}</td>
                    <td>
                      {row._error
                        ? <span style={{ color: '#ef4444', fontSize: 12 }}>{row._error}</span>
                        : <span className="admin-badge admin-badge-active" style={{ fontSize: 11 }}>OK</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {result && (
            <div style={{
              background: result.errors.length === 0 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
              border: `1px solid ${result.errors.length === 0 ? '#22c55e' : '#ef4444'}`,
              borderRadius: 8,
              padding: '12px 16px',
              marginBottom: 16,
              fontSize: 13,
            }}>
              <strong>{result.imported} Artikel importiert.</strong>
              {result.errors.length > 0 && (
                <ul style={{ margin: '8px 0 0', paddingLeft: 20, color: '#ef4444' }}>
                  {result.errors.map((e, i) => <li key={i}>Zeile {e.row}: {e.message}</li>)}
                </ul>
              )}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button className="admin-btn admin-btn-secondary" onClick={reset}>Abbrechen</button>
            <button
              className="admin-btn admin-btn-primary"
              onClick={handleImport}
              disabled={importing || validRows.length === 0}
            >
              {importing ? 'Importiere…' : `${validRows.length} Artikel importieren`}
            </button>
          </div>
        </>
      )}

      {toast && (
        <div className="admin-toast-container">
          <div className="admin-toast success">{toast}</div>
        </div>
      )}
    </div>
  )
}
