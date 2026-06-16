import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../../api/client'

interface Supplier {
  id: string
  name: string
  prefix: string
}

interface Material {
  id: string
  art_nr: string
  name: string
  supplier_id: string | null
  category: string | null
  unit: string | null
  unit_price: number | null   // manueller VK-Override (0/leer = automatisch)
  cost_price: number | null   // EK (Einkaufspreis)
  calc_vk: number | null      // berechneter VK (EK x Aufschlag bzw. Override)
  is_active: boolean
  inventory: { quantity: number; min_quantity: number | null }[]
}

interface StockModalProps {
  material: Material
  onClose: () => void
  onSaved: () => void
}

function StockModal({ material, onClose, onSaved }: StockModalProps) {
  const [delta, setDelta] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const currentStock = material.inventory[0]?.quantity ?? 0

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const num = parseFloat(delta)
    if (isNaN(num) || num === 0) return
    setSaving(true)
    setError('')
    try {
      await apiFetch('/pwa/admin/inventory/adjust', {
        method: 'POST',
        body: JSON.stringify({ art_nr: material.art_nr, quantity_delta: num, movement_type: 'adjustment', note: note || null }),
      })
      onSaved()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal" onClick={e => e.stopPropagation()}>
        <div className="admin-modal-header">
          <div className="admin-modal-title">Lager anpassen — {material.name}</div>
          <button className="admin-modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit} className="admin-modal-body">
          <div style={{ background: '#0f1117', borderRadius: 9, padding: '12px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>Aktueller Bestand</div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{currentStock} {material.unit || ''}</div>
          </div>
          {error && <div className="admin-form-error">{error}</div>}
          <div className="admin-form-group">
            <label className="admin-form-label">Änderung (+ Zugang / − Abgang)</label>
            <input
              className="admin-form-input"
              type="number"
              step="any"
              value={delta}
              onChange={e => setDelta(e.target.value)}
              placeholder="z.B. 10 oder -3"
              required
            />
            <div className="admin-form-hint">
              Neuer Bestand: {isNaN(parseFloat(delta)) ? currentStock : (currentStock + parseFloat(delta)).toFixed(2)} {material.unit || ''}
            </div>
          </div>
          <div className="admin-form-group">
            <label className="admin-form-label">Notiz (optional)</label>
            <input className="admin-form-input" value={note} onChange={e => setNote(e.target.value)} placeholder="z.B. Inventur" />
          </div>
        </form>
        <div className="admin-modal-footer">
          <button className="admin-btn admin-btn-secondary" onClick={onClose}>Abbrechen</button>
          <button className="admin-btn admin-btn-primary" onClick={e => { e.preventDefault(); (e.currentTarget.closest('div.admin-modal')?.querySelector('form') as HTMLFormElement)?.requestSubmit() }} disabled={saving || !delta}>
            {saving ? 'Speichern…' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  )
}

function MaterialModal({ material, onClose, onSaved, existingCategories, suppliers, suggestedArtNr }: { material: Material | null; onClose: () => void; onSaved: () => void; existingCategories: string[]; suppliers: Supplier[]; suggestedArtNr: string }) {
  const isNew = !material
  const [artNr, setArtNr] = useState(material?.art_nr ?? suggestedArtNr)
  const [name, setName] = useState(material?.name ?? '')
  const [category, setCategory] = useState(material?.category ?? '')
  const [isNewCategory, setIsNewCategory] = useState(!!(material?.category && !existingCategories.includes(material.category)))
  const [unit, setUnit] = useState(material?.unit ?? '')
  const [unitPrice, setUnitPrice] = useState(material?.unit_price?.toString() ?? '')
  const [costPrice, setCostPrice] = useState(material?.cost_price?.toString() ?? '')
  const [supplierId, setSupplierId] = useState(material?.supplier_id ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!artNr.trim() || !name.trim()) return
    setSaving(true)
    setError('')
    try {
      const method = isNew ? 'POST' : 'PATCH'
      const url = isNew ? '/pwa/admin/materials' : `/pwa/admin/materials/${encodeURIComponent(artNr)}`
      await apiFetch(url, {
        method,
        body: JSON.stringify({
          art_nr: artNr.trim(),
          name: name.trim(),
          category: category || null,
          unit: unit || null,
          unit_price: unitPrice ? parseFloat(unitPrice) : 0,
          cost_price: costPrice ? parseFloat(costPrice) : null,
          supplier_id: supplierId || null,
        }),
      })
      onSaved()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal" onClick={e => e.stopPropagation()}>
        <div className="admin-modal-header">
          <div className="admin-modal-title">{isNew ? 'Neues Material' : material.name}</div>
          <button className="admin-modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit} className="admin-modal-body">
          {error && <div className="admin-form-error">{error}</div>}
          <div className="admin-form-group">
            <label className="admin-form-label">Art.-Nr. *</label>
            <input className="admin-form-input" value={artNr} onChange={e => setArtNr(e.target.value)} required disabled />
            {isNew && <div className="admin-form-hint">Automatisch vergeben</div>}
          </div>
          <div className="admin-form-group">
            <label className="admin-form-label">Bezeichnung *</label>
            <input className="admin-form-input" value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="admin-form-group">
              <label className="admin-form-label">Kategorie</label>
              {isNewCategory ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <input className="admin-form-input" value={category} onChange={e => setCategory(e.target.value)} placeholder="Neue Kategorie…" autoFocus />
                  <button type="button" className="admin-btn admin-btn-secondary" style={{ flexShrink: 0, padding: '6px 10px' }} onClick={() => { setIsNewCategory(false); setCategory('') }}>×</button>
                </div>
              ) : (
                <select className="admin-form-select" value={category} onChange={e => {
                  if (e.target.value === '__new__') { setIsNewCategory(true); setCategory('') }
                  else setCategory(e.target.value)
                }}>
                  <option value="">— Keine —</option>
                  {existingCategories.map(c => <option key={c} value={c}>{c}</option>)}
                  <option value="__new__">+ Neue Kategorie…</option>
                </select>
              )}
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label">Einheit</label>
              <input className="admin-form-input" value={unit} onChange={e => setUnit(e.target.value)} placeholder="Stk, m, kg…" />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="admin-form-group">
              <label className="admin-form-label">EK-Preis (CHF)</label>
              <input className="admin-form-input" type="number" step="0.01" min="0" value={costPrice} onChange={e => setCostPrice(e.target.value)} placeholder="Einkaufspreis" />
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label">VK-Preis (manuell)</label>
              <input className="admin-form-input" type="number" step="0.01" min="0" value={unitPrice} onChange={e => setUnitPrice(e.target.value)} placeholder="leer = automatisch" />
              <div className="admin-form-hint">
                Leer = VK wird bei Offerte/Rechnung aus EK × Lieferanten-Aufschlag berechnet
                {material?.calc_vk != null && !unitPrice ? ` (aktuell CHF ${material.calc_vk.toFixed(2)})` : ''}
              </div>
            </div>
          </div>
          <div className="admin-form-group">
            <label className="admin-form-label">Lieferant</label>
            <select className="admin-form-select" value={supplierId} onChange={e => setSupplierId(e.target.value)}>
              <option value="">— Kein —</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </form>
        <div className="admin-modal-footer">
          <button className="admin-btn admin-btn-secondary" onClick={onClose}>Abbrechen</button>
          <button className="admin-btn admin-btn-primary" onClick={e => { (e.currentTarget.closest('div.admin-modal')?.querySelector('form') as HTMLFormElement)?.requestSubmit() }} disabled={saving}>
            {saving ? 'Speichern…' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Nur echte DB-Spalten sind serverseitig sortierbar. VK-Preis (berechnet) und
// Bestand (separate inventory-Tabelle) sind es nicht — siehe MaterialsListResponse.
type MaterialSortKey = 'art_nr' | 'name' | 'category' | 'unit' | 'cost_price'
type SortDir = 'asc' | 'desc'

interface MaterialsListResponse {
  rows: Material[]
  total: number
  page: number
  page_size: number
}

const PAGE_SIZE = 50

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <span style={{ marginLeft: 4, opacity: active ? 1 : 0.3, fontSize: 11 }}>
      {active && dir === 'desc' ? '↓' : '↑'}
    </span>
  )
}

export default function MaterialsScreen() {
  const [data, setData] = useState<MaterialsListResponse>({ rows: [], total: 0, page: 1, page_size: PAGE_SIZE })
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [nextArtNr, setNextArtNr] = useState('1')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [supplierFilter, setSupplierFilter] = useState('')
  const [sortKey, setSortKey] = useState<MaterialSortKey>('art_nr')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [page, setPage] = useState(1)
  const [editMaterial, setEditMaterial] = useState<Material | null | 'new'>()
  const [stockMaterial, setStockMaterial] = useState<Material | null>(null)

  // Lieferanten, Kategorien-Dropdown und naechste Art.-Nr. sind nicht aus der
  // (paginierten) Liste ableitbar → separat laden, nach jedem Speichern auffrischen.
  const loadMeta = useCallback(async () => {
    try {
      const [sups, meta] = await Promise.all([
        apiFetch('/pwa/admin/suppliers') as Promise<Supplier[]>,
        apiFetch('/pwa/admin/materials/meta') as Promise<{ categories: string[]; next_art_nr: string }>,
      ])
      setSuppliers(sups)
      setCategories(meta.categories ?? [])
      setNextArtNr(meta.next_art_nr ?? '1')
    } catch { /* nicht blockierend */ }
  }, [])

  useEffect(() => { loadMeta() }, [loadMeta])

  // Suche: 300ms Debounce, damit nicht jeder Tastendruck einen Roundtrip ausloest.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  // Filter/Suche/Sort aendern → zurueck auf Seite 1.
  useEffect(() => { setPage(1) }, [debouncedSearch, categoryFilter, supplierFilter, sortKey, sortDir])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        sort: sortKey,
        dir: sortDir,
        page: String(page),
        page_size: String(PAGE_SIZE),
      })
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (categoryFilter) params.set('category', categoryFilter)
      if (supplierFilter) params.set('supplier_id', supplierFilter)
      const res = await apiFetch(`/pwa/admin/materials/list?${params.toString()}`) as MaterialsListResponse
      setData(res)
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, categoryFilter, supplierFilter, sortKey, sortDir, page])

  useEffect(() => { load() }, [load])

  // Nach Speichern/Lager-Anpassung: aktuelle Seite + Meta neu laden.
  const reload = useCallback(() => { load(); loadMeta() }, [load, loadMeta])

  function toggleSort(key: MaterialSortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const supplierMap = Object.fromEntries(suppliers.map(s => [s.id, s.name]))
  const { rows, total } = data
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(page * PAGE_SIZE, total)

  const thStyle: React.CSSProperties = { cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }
  const thStaticStyle: React.CSSProperties = { whiteSpace: 'nowrap' }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Material / Lager</div>
          <div className="admin-page-subtitle">{total} Artikel</div>
        </div>
        <button className="admin-btn admin-btn-primary" onClick={() => setEditMaterial('new')}>
          <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 0 1 1 1v5h5a1 1 0 1 1 0 2h-5v5a1 1 0 1 1-2 0v-5H4a1 1 0 1 1 0-2h5V4a1 1 0 0 1 1-1z" clipRule="evenodd"/></svg>
          Neues Material
        </button>
      </div>

      <div className="admin-table-wrap">
        <div className="admin-filter-bar">
          <input className="admin-search" placeholder="Art.-Nr., Bezeichnung oder Lieferant…" value={search} onChange={e => setSearch(e.target.value)} />
          <select className="admin-form-select" style={{ width: 'auto', flexShrink: 0 }} value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
            <option value="">Alle Kategorien</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="admin-form-select" style={{ width: 'auto', flexShrink: 0 }} value={supplierFilter} onChange={e => setSupplierFilter(e.target.value)}>
            <option value="">Alle Lieferanten</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="admin-loading"><div className="admin-spinner" /> Laden…</div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th style={thStyle} onClick={() => toggleSort('art_nr')}>
                  Art.-Nr. <SortIcon active={sortKey === 'art_nr'} dir={sortDir} />
                </th>
                <th style={thStyle} onClick={() => toggleSort('name')}>
                  Bezeichnung <SortIcon active={sortKey === 'name'} dir={sortDir} />
                </th>
                <th style={thStyle} onClick={() => toggleSort('category')}>
                  Kategorie <SortIcon active={sortKey === 'category'} dir={sortDir} />
                </th>
                <th style={thStyle} onClick={() => toggleSort('unit')}>
                  Einheit <SortIcon active={sortKey === 'unit'} dir={sortDir} />
                </th>
                <th style={thStyle} onClick={() => toggleSort('cost_price')}>
                  EK-Preis <SortIcon active={sortKey === 'cost_price'} dir={sortDir} />
                </th>
                <th style={thStaticStyle}>VK-Preis</th>
                <th style={thStaticStyle}>Bestand</th>
                <th>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={8} className="admin-table-empty">Keine Materialien gefunden.</td></tr>
              ) : rows.map(m => {
                const stock = m.inventory[0]?.quantity ?? null
                const minStock = m.inventory[0]?.min_quantity ?? null
                const stockLow = stock !== null && minStock !== null && stock <= minStock
                const supplierName = m.supplier_id ? (supplierMap[m.supplier_id] ?? null) : null
                return (
                  <tr key={m.id} onClick={() => setEditMaterial(m)}>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{m.art_nr}</td>
                    <td><strong>{m.name}</strong>{supplierName ? <span style={{ color: 'var(--muted)', marginLeft: 6, fontSize: 12 }}>{supplierName}</span> : null}</td>
                    <td style={{ color: 'var(--muted)' }}>{m.category || '—'}</td>
                    <td>{m.unit || '—'}</td>
                    <td>{m.cost_price != null ? `CHF ${m.cost_price.toFixed(2)}` : '—'}</td>
                    <td>
                      {m.calc_vk != null && m.calc_vk > 0 ? `CHF ${m.calc_vk.toFixed(2)}` : '—'}
                      {m.unit_price != null && m.unit_price > 0 && (
                        <span style={{ color: 'var(--muted)', marginLeft: 4, fontSize: 11 }} title="Manueller VK-Override">✎</span>
                      )}
                    </td>
                    <td>
                      {stock !== null
                        ? <span style={{ color: stockLow ? '#ef4444' : 'inherit', fontWeight: stockLow ? 700 : undefined }}>{stock} {m.unit || ''}</span>
                        : <span style={{ color: 'var(--muted)' }}>—</span>
                      }
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <button
                        className="admin-btn admin-btn-secondary admin-btn-sm"
                        onClick={() => setStockMaterial(m)}
                      >
                        Lager
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        {total > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid var(--border)', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>
              {rangeStart}–{rangeEnd} von {total}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                className="admin-btn admin-btn-sm admin-btn-secondary"
                disabled={page <= 1 || loading}
                onClick={() => setPage(p => Math.max(1, p - 1))}
              >
                ← Zurück
              </button>
              <span style={{ fontSize: 13, color: 'var(--muted)', minWidth: 90, textAlign: 'center' }}>
                Seite {page} / {totalPages}
              </span>
              <button
                className="admin-btn admin-btn-sm admin-btn-secondary"
                disabled={page >= totalPages || loading}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              >
                Weiter →
              </button>
            </div>
          </div>
        )}
      </div>

      {editMaterial !== undefined && (
        <MaterialModal
          material={editMaterial === 'new' ? null : (editMaterial as Material)}
          onClose={() => setEditMaterial(undefined)}
          onSaved={() => { setEditMaterial(undefined); reload() }}
          existingCategories={categories}
          suppliers={suppliers}
          suggestedArtNr={nextArtNr}
        />
      )}

      {stockMaterial && (
        <StockModal
          material={stockMaterial}
          onClose={() => setStockMaterial(null)}
          onSaved={() => { setStockMaterial(null); reload() }}
        />
      )}
    </div>
  )
}
