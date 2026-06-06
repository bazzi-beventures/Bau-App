import { useMemo, useRef, useState } from 'react'
import { fmtCHF } from '../utils/format'

export interface ExtractedPosition {
  label: string
  ek_price: number
}

export interface ExtractedProduct {
  name: string
  description: string
  quantity: number
  unit: string
  ek_price: number
  positions?: ExtractedPosition[]
  suggested_category: string | null
  suggested_margin_factor: number | null
  suggested_vk_price: number | null
}

export interface PricingRule {
  category: string
  margin_factor: number
}

export interface PdfExtractionResponse {
  supplier: string
  supplier_label: string
  supplier_id: string | null
  project_ref: string
  products: ExtractedProduct[]
  available_pricing_rules?: PricingRule[]
}

// Metadaten der Positionsauswahl, die an der Produktzeile mitgespeichert werden.
export interface ConfirmedPosition {
  label: string
  ek_price: number
  selected: boolean
  separate: boolean
}

export interface ConfirmedExtraProduct {
  description: string
  quantity: string
  unit: string
  unit_price: string
  ek_price: number
  margin_factor: number
  supplier_id: string | null
  category: string | null
  positions?: ConfirmedPosition[]
}

interface PositionState {
  label: string
  ek_price: string
  selected: boolean   // Häkchen: kommt überhaupt in die Offerte
  separate: boolean   // „separat ausweisen": wird eine eigene Offert-Zeile
}

interface RowState {
  name: string
  description: string
  quantity: string
  unit: string
  ek_price: string  // nur relevant, wenn keine Positionen vorhanden (Griesser/manuell)
  category: string  // '' = keine Kategorie gewählt
  margin_pct: string
  positions: PositionState[]
}

interface Props {
  data: PdfExtractionResponse
  onCancel: () => void
  onConfirm: (rows: ConfirmedExtraProduct[]) => void
}

function parseNum(v: string): number {
  return parseFloat(v.replace(',', '.')) || 0
}

function ceilToHalf(x: number): number {
  return Math.ceil(x * 2) / 2
}

// EK der Produktzeile = Summe der angehakten, NICHT separat ausgewiesenen Positionen.
// Ohne Positionen (Griesser/manuell): das freie EK-Feld.
function productEk(row: RowState): number {
  if (row.positions.length === 0) return parseNum(row.ek_price)
  return row.positions
    .filter(p => p.selected && !p.separate)
    .reduce((sum, p) => sum + parseNum(p.ek_price), 0)
}

// Baut die finalen Offert-Zeilen aus einer Produktkarte:
// 1 Produktzeile (EK = Summe nicht-separater Positionen) + N separate Zeilen.
function buildConfirmed(rows: RowState[], supplierId: string | null): ConfirmedExtraProduct[] {
  const out: ConfirmedExtraProduct[] = []
  for (const row of rows) {
    const pct = parseNum(row.margin_pct)
    const factor = Math.round((1 + pct / 100) * 10000) / 10000
    const hasPositions = row.positions.length > 0
    const category = row.category || null

    // Produktzeile: immer ohne Positionen, sonst nur wenn ≥1 nicht-separate Position gewählt ist.
    const includeProduct = !hasPositions || row.positions.some(p => p.selected && !p.separate)
    if (includeProduct) {
      const ek = productEk(row)
      const vk = ceilToHalf(ek * (1 + pct / 100))
      const fullDescription = row.description ? `${row.name} — ${row.description}` : row.name
      out.push({
        description: fullDescription,
        quantity: row.quantity || '1',
        unit: row.unit || 'Stk',
        unit_price: String(vk),
        ek_price: ek,
        margin_factor: factor,
        supplier_id: supplierId,
        category,
        positions: hasPositions
          ? row.positions.map(p => ({
              label: p.label,
              ek_price: parseNum(p.ek_price),
              selected: p.selected,
              separate: p.separate,
            }))
          : undefined,
      })
    }

    // Separate Zeilen: jede angehakte Position mit „separat ausweisen".
    for (const p of row.positions) {
      if (p.selected && p.separate) {
        const ek = parseNum(p.ek_price)
        const vk = ceilToHalf(ek * (1 + pct / 100))
        out.push({
          description: p.label,
          quantity: '1',
          unit: row.unit || 'Stk',
          unit_price: String(vk),
          ek_price: ek,
          margin_factor: factor,
          supplier_id: supplierId,
          category,
        })
      }
    }
  }
  return out
}

const LABEL_STYLE: React.CSSProperties = {
  display: 'block', fontSize: 11, color: 'var(--muted, #666)',
  marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.4,
}

export function PdfExtractionReviewModal({ data, onCancel, onConfirm }: Props) {
  const rules: PricingRule[] = data.available_pricing_rules ?? []
  const ruleMap = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of rules) m.set(r.category, r.margin_factor)
    return m
  }, [rules])

  const [rows, setRows] = useState<RowState[]>(() =>
    (data.products ?? []).map(p => {
      const factor = p.suggested_margin_factor ?? 1
      return {
        name: p.name,
        description: p.description,
        quantity: String(p.quantity ?? 1),
        unit: p.unit || 'Stk',
        ek_price: String(p.ek_price ?? 0),
        category: p.suggested_category ?? '',
        margin_pct: String(Math.round((factor - 1) * 10000) / 100),
        positions: (p.positions ?? []).map(pos => ({
          label: pos.label,
          ek_price: String(pos.ek_price ?? 0),
          selected: true,
          separate: false,
        })),
      }
    })
  )

  function updateRow(i: number, patch: Partial<RowState>) {
    setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  }

  function updatePosition(i: number, k: number, patch: Partial<PositionState>) {
    setRows(rs => rs.map((r, j) => {
      if (j !== i) return r
      return { ...r, positions: r.positions.map((p, l) => (l === k ? { ...p, ...patch } : p)) }
    }))
  }

  function onCategoryChange(i: number, category: string) {
    const factor = ruleMap.get(category)
    if (factor !== undefined) {
      const pct = Math.round((factor - 1) * 10000) / 100
      updateRow(i, { category, margin_pct: String(pct) })
    } else {
      updateRow(i, { category })
    }
  }

  function vkOf(row: RowState): number {
    const pct = parseNum(row.margin_pct)
    return ceilToHalf(productEk(row) * (1 + pct / 100))
  }

  const confirmed = useMemo(() => buildConfirmed(rows, data.supplier_id), [rows, data.supplier_id])

  function handleConfirm() {
    onConfirm(confirmed)
  }

  const supplierLabel = data.supplier_label || 'Unbekannt'
  const mouseDownOnBackdrop = useRef(false)

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
      onMouseDown={e => { mouseDownOnBackdrop.current = e.target === e.currentTarget }}
      onClick={e => {
        if (e.target === e.currentTarget && mouseDownOnBackdrop.current) onCancel()
        mouseDownOnBackdrop.current = false
      }}
    >
      <div
        style={{ background: 'var(--bg, #fff)', borderRadius: 12, padding: 24, maxWidth: 880, width: '95%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, fontSize: 18 }}>Lieferanten-Offerte prüfen</h3>
          <span className="admin-badge admin-badge-sent" style={{ padding: '2px 10px' }}>{supplierLabel}</span>
          {data.project_ref && (
            <span style={{ color: 'var(--muted, #666)', fontSize: 13 }}>· {data.project_ref}</span>
          )}
        </div>
        <p style={{ marginTop: 0, marginBottom: 16, color: 'var(--muted, #666)', fontSize: 12 }}>
          EK = Netto aus der Lieferanten-Offerte. VK = EK × (1 + Aufschlag). Warengruppe wählen lädt den Aufschlag aus den Lieferanten-Preisregeln.
        </p>

        {rules.length === 0 && (
          <div className="admin-alert admin-alert-warning" style={{ marginBottom: 16, fontSize: 13, padding: '8px 12px' }}>
            Keine Lieferanten-Preisregeln für <strong>{supplierLabel}</strong> hinterlegt — Aufschlag manuell eintragen.
          </div>
        )}

        {/* Karten pro Produkt */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {rows.map((row, i) => {
            const vk = vkOf(row)
            const hasPositions = row.positions.length > 0
            return (
              <div
                key={i}
                style={{
                  border: '1px solid var(--border, #e5e7eb)',
                  borderRadius: 10,
                  padding: 14,
                  background: 'var(--bg-elevated, #fafafa)',
                }}
              >
                {/* Zeile 1: Produktname (gross) */}
                <div style={{ marginBottom: 10 }}>
                  <label style={LABEL_STYLE}>Produkt</label>
                  <input
                    className="admin-form-input"
                    style={{ fontWeight: 600, fontSize: 14 }}
                    value={row.name}
                    onChange={e => updateRow(i, { name: e.target.value })}
                  />
                </div>

                {/* Zeile 2: Artikeltext */}
                <div style={{ marginBottom: 10 }}>
                  <label style={LABEL_STYLE}>Artikeltext</label>
                  <textarea
                    className="admin-form-input"
                    rows={2}
                    style={{ resize: 'vertical', minHeight: 50 }}
                    value={row.description}
                    onChange={e => updateRow(i, { description: e.target.value })}
                  />
                </div>

                {/* Positionsliste (nur Stobag o.ä.): an-/abwählbar, optional separat ausweisen */}
                {hasPositions && (
                  <div style={{ marginBottom: 10 }}>
                    <label style={LABEL_STYLE}>Positionen — anhaken übernimmt in den EK, „separat" wird eigene Zeile</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {row.positions.map((p, k) => (
                        <div
                          key={k}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '24px 1fr 110px 92px',
                            gap: 8,
                            alignItems: 'center',
                            opacity: p.selected ? 1 : 0.45,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={p.selected}
                            onChange={e => updatePosition(i, k, { selected: e.target.checked, separate: e.target.checked ? p.separate : false })}
                            title="In die Offerte übernehmen"
                          />
                          <input
                            className="admin-form-input"
                            style={{ fontSize: 13 }}
                            value={p.label}
                            onChange={e => updatePosition(i, k, { label: e.target.value })}
                            disabled={!p.selected}
                          />
                          <input
                            className="admin-form-input"
                            style={{ fontSize: 13, textAlign: 'right' }}
                            value={p.ek_price}
                            onChange={e => updatePosition(i, k, { ek_price: e.target.value })}
                            disabled={!p.selected}
                            title="Netto / EK dieser Position (CHF)"
                          />
                          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--muted, #666)' }}>
                            <input
                              type="checkbox"
                              checked={p.separate}
                              disabled={!p.selected}
                              onChange={e => updatePosition(i, k, { separate: e.target.checked })}
                            />
                            separat
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Zeile 3: Menge / Einheit / EK */}
                <div style={{ display: 'grid', gridTemplateColumns: '90px 100px 1fr', gap: 10, marginBottom: 10 }}>
                  <div>
                    <label style={LABEL_STYLE}>Menge</label>
                    <input className="admin-form-input" value={row.quantity} onChange={e => updateRow(i, { quantity: e.target.value })} />
                  </div>
                  <div>
                    <label style={LABEL_STYLE}>Einheit</label>
                    <input className="admin-form-input" value={row.unit} onChange={e => updateRow(i, { unit: e.target.value })} />
                  </div>
                  <div>
                    <label style={LABEL_STYLE}>EK / Stk (CHF){hasPositions ? ' — Summe gewählter Positionen' : ''}</label>
                    {hasPositions ? (
                      <div className="admin-form-input" style={{ background: 'transparent', fontWeight: 600 }}>
                        {fmtCHF(productEk(row))}
                      </div>
                    ) : (
                      <input className="admin-form-input" value={row.ek_price} onChange={e => updateRow(i, { ek_price: e.target.value })} />
                    )}
                  </div>
                </div>

                {/* Zeile 4: Warengruppe / Aufschlag / VK */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px auto', gap: 10, alignItems: 'end' }}>
                  <div>
                    <label style={LABEL_STYLE}>Warengruppe</label>
                    <select
                      className="admin-form-select"
                      value={row.category}
                      onChange={e => onCategoryChange(i, e.target.value)}
                      disabled={rules.length === 0}
                    >
                      <option value="">— wählen —</option>
                      {rules.map(r => (
                        <option key={r.category} value={r.category}>{r.category}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={LABEL_STYLE}>Aufschlag %</label>
                    <input className="admin-form-input" value={row.margin_pct} onChange={e => updateRow(i, { margin_pct: e.target.value })} />
                  </div>
                  <div style={{ minWidth: 140, textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: 'var(--muted, #666)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 3 }}>VK / Stk{hasPositions ? ' (Produktzeile)' : ''}</div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{fmtCHF(vk)}</div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: 12, marginTop: 20, justifyContent: 'flex-end', alignItems: 'center' }}>
          <button className="admin-btn admin-btn-secondary" onClick={onCancel}>Abbrechen</button>
          <button className="admin-btn admin-btn-primary" onClick={handleConfirm} disabled={confirmed.length === 0}>
            Übernehmen ({confirmed.length})
          </button>
        </div>
      </div>
    </div>
  )
}
