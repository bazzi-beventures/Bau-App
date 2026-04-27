import { useMemo, useState } from 'react'

export interface ExtractedProduct {
  name: string
  description: string
  quantity: number
  unit: string
  ek_price: number
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

export interface ConfirmedExtraProduct {
  description: string
  quantity: string
  unit: string
  unit_price: string
  ek_price: number
  margin_factor: number
  supplier_id: string | null
  category: string | null
}

interface RowState {
  name: string
  description: string
  quantity: string
  unit: string
  ek_price: string
  category: string  // '' = keine Kategorie gewählt
  margin_pct: string
}

interface Props {
  data: PdfExtractionResponse
  onCancel: () => void
  onConfirm: (rows: ConfirmedExtraProduct[]) => void
}

function parseNum(v: string): number {
  return parseFloat(v.replace(',', '.')) || 0
}

function fmtCHF(n: number) {
  return `CHF ${n.toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
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
      }
    })
  )

  function updateRow(i: number, patch: Partial<RowState>) {
    setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))
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

  function ceilToHalf(x: number): number {
    return Math.ceil(x * 2) / 2
  }

  function vkOf(row: RowState): number {
    const ek = parseNum(row.ek_price)
    const pct = parseNum(row.margin_pct)
    return ceilToHalf(ek * (1 + pct / 100))
  }

  function handleConfirm() {
    const confirmed: ConfirmedExtraProduct[] = rows.map(row => {
      const ek = parseNum(row.ek_price)
      const pct = parseNum(row.margin_pct)
      const vk = ceilToHalf(ek * (1 + pct / 100))
      const factor = Math.round((1 + pct / 100) * 10000) / 10000
      const fullDescription = row.description ? `${row.name} — ${row.description}` : row.name
      return {
        description: fullDescription,
        quantity: row.quantity || '1',
        unit: row.unit || 'Stk',
        unit_price: String(vk),
        ek_price: ek,
        margin_factor: factor,
        supplier_id: data.supplier_id,
        category: row.category || null,
      }
    })
    onConfirm(confirmed)
  }

  const supplierLabel = data.supplier_label || 'Unbekannt'

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
      onClick={onCancel}
    >
      <div
        style={{ background: 'var(--bg, #fff)', borderRadius: 12, padding: 24, maxWidth: 880, width: '95%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}
        onClick={e => e.stopPropagation()}
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
                  <label style={{ display: 'block', fontSize: 11, color: 'var(--muted, #666)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.4 }}>Produkt</label>
                  <input
                    className="admin-form-input"
                    style={{ fontWeight: 600, fontSize: 14 }}
                    value={row.name}
                    onChange={e => updateRow(i, { name: e.target.value })}
                  />
                </div>

                {/* Zeile 2: Artikeltext */}
                <div style={{ marginBottom: 10 }}>
                  <label style={{ display: 'block', fontSize: 11, color: 'var(--muted, #666)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.4 }}>Artikeltext</label>
                  <textarea
                    className="admin-form-input"
                    rows={2}
                    style={{ resize: 'vertical', minHeight: 50 }}
                    value={row.description}
                    onChange={e => updateRow(i, { description: e.target.value })}
                  />
                </div>

                {/* Zeile 3: Menge / Einheit / EK */}
                <div style={{ display: 'grid', gridTemplateColumns: '90px 100px 1fr', gap: 10, marginBottom: 10 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, color: 'var(--muted, #666)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.4 }}>Menge</label>
                    <input className="admin-form-input" value={row.quantity} onChange={e => updateRow(i, { quantity: e.target.value })} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, color: 'var(--muted, #666)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.4 }}>Einheit</label>
                    <input className="admin-form-input" value={row.unit} onChange={e => updateRow(i, { unit: e.target.value })} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, color: 'var(--muted, #666)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.4 }}>EK / Stk (CHF)</label>
                    <input className="admin-form-input" value={row.ek_price} onChange={e => updateRow(i, { ek_price: e.target.value })} />
                  </div>
                </div>

                {/* Zeile 4: Warengruppe / Aufschlag / VK */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px auto', gap: 10, alignItems: 'end' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, color: 'var(--muted, #666)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.4 }}>Warengruppe</label>
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
                    <label style={{ display: 'block', fontSize: 11, color: 'var(--muted, #666)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.4 }}>Aufschlag %</label>
                    <input className="admin-form-input" value={row.margin_pct} onChange={e => updateRow(i, { margin_pct: e.target.value })} />
                  </div>
                  <div style={{ minWidth: 140, textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: 'var(--muted, #666)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 3 }}>VK / Stk</div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{fmtCHF(vk)}</div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: 12, marginTop: 20, justifyContent: 'flex-end' }}>
          <button className="admin-btn admin-btn-secondary" onClick={onCancel}>Abbrechen</button>
          <button className="admin-btn admin-btn-primary" onClick={handleConfirm}>Übernehmen ({rows.length})</button>
        </div>
      </div>
    </div>
  )
}
