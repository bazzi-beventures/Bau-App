import { useEffect, useState } from 'react'
import { apiFetch } from '../../api/client'

interface Material {
  id: string
  art_nr: string
  name: string
  manufacturer: string | null
  category: string | null
  unit: string | null
  unit_price: number | null
  cost_price: number | null
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

function MaterialModal({ material, onClose, onSaved }: { material: Material | null; onClose: () => void; onSaved: () => void }) {
  const isNew = !material
  const [artNr, setArtNr] = useState(material?.art_nr ?? '')
  const [name, setName] = useState(material?.name ?? '')
  const [category, setCategory] = useState(material?.category ?? '')
  const [unit, setUnit] = useState(material?.unit ?? '')
  const [unitPrice, setUnitPrice] = useState(material?.unit_price?.toString() ?? '')
  const [manufacturer, setManufacturer] = useState(material?.manufacturer ?? '')
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
          unit_price: unitPrice ? parseFloat(unitPrice) : null,
          manufacturer: manufacturer || null,
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
            <input className="admin-form-input" value={artNr} onChange={e => setArtNr(e.target.value)} required disabled={!isNew} />
          </div>
          <div className="admin-form-group">
            <label className="admin-form-label">Bezeichnung *</label>
            <input className="admin-form-input" value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="admin-form-group">
              <label className="admin-form-label">Kategorie</label>
              <input className="admin-form-input" value={category} onChange={e => setCategory(e.target.value)} />
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label">Einheit</label>
              <input className="admin-form-input" value={unit} onChange={e => setUnit(e.target.value)} placeholder="Stk, m, kg…" />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="admin-form-group">
              <label className="admin-form-label">VK-Preis (CHF)</label>
              <input className="admin-form-input" type="number" step="0.01" min="0" value={unitPrice} onChange={e => setUnitPrice(e.target.value)} />
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label">Hersteller</label>
              <input className="admin-form-input" value={manufacturer} onChange={e => setManufacturer(e.target.value)} />
            </div>
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

type MaterialSortKey = 'art_nr' | 'name' | 'category' | 'unit' | 'unit_price' | 'stock'
type SortDir = 'asc' | 'desc'

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <span style={{ marginLeft: 4, opacity: active ? 1 : 0.3, fontSize: 11 }}>
      {active && dir === 'desc' ? '↓' : '↑'}
    </span>
  )
}

export default function MaterialsScreen() {
  const [materials, setMaterials] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [manufacturerFilter, setManufacturerFilter] = useState('')
  const [sortKey, setSortKey] = useState<MaterialSortKey>('art_nr')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [editMaterial, setEditMaterial] = useState<Material | null | 'new'>()
  const [stockMaterial, setStockMaterial] = useState<Material | null>(null)

  async function load() {
    setLoading(true)
    try {
      setMaterials(await apiFetch('/pwa/admin/materials') as Material[])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function toggleSort(key: MaterialSortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const categories = Array.from(new Set(materials.map(m => m.category).filter(Boolean))).sort() as string[]
  const manufacturers = Array.from(new Set(materials.map(m => m.manufacturer).filter(Boolean))).sort() as string[]

  const filtered = materials.filter(m => {
    const q = search.toLowerCase()
    const matchSearch = m.name.toLowerCase().includes(q) || m.art_nr.toLowerCase().includes(q) || (m.manufacturer || '').toLowerCase().includes(q)
    const matchCat = !categoryFilter || m.category === categoryFilter
    const matchMfr = !manufacturerFilter || m.manufacturer === manufacturerFilter
    return matchSearch && matchCat && matchMfr
  }).sort((a, b) => {
    let aVal: string | number
    let bVal: string | number
    switch (sortKey) {
      case 'art_nr':   aVal = a.art_nr; bVal = b.art_nr; break
      case 'name':     aVal = a.name; bVal = b.name; break
      case 'category': aVal = a.category ?? ''; bVal = b.category ?? ''; break
      case 'unit':     aVal = a.unit ?? ''; bVal = b.unit ?? ''; break
      case 'unit_price': aVal = a.unit_price ?? -1; bVal = b.unit_price ?? -1; break
      case 'stock':    aVal = a.inventory[0]?.quantity ?? -1; bVal = b.inventory[0]?.quantity ?? -1; break
    }
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
    }
    return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number)
  })

  const thStyle: React.CSSProperties = { cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Material / Lager</div>
          <div className="admin-page-subtitle">{materials.length} Artikel</div>
        </div>
        <button className="admin-btn admin-btn-primary" onClick={() => setEditMaterial('new')}>
          <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 0 1 1 1v5h5a1 1 0 1 1 0 2h-5v5a1 1 0 1 1-2 0v-5H4a1 1 0 1 1 0-2h5V4a1 1 0 0 1 1-1z" clipRule="evenodd"/></svg>
          Neues Material
        </button>
      </div>

      <div className="admin-table-wrap">
        <div className="admin-filter-bar">
          <input className="admin-search" placeholder="Art.-Nr., Bezeichnung oder Hersteller…" value={search} onChange={e => setSearch(e.target.value)} />
          <select className="admin-form-select" style={{ width: 'auto', flexShrink: 0 }} value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
            <option value="">Alle Kategorien</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="admin-form-select" style={{ width: 'auto', flexShrink: 0 }} value={manufacturerFilter} onChange={e => setManufacturerFilter(e.target.value)}>
            <option value="">Alle Hersteller</option>
            {manufacturers.map(m => <option key={m} value={m}>{m}</option>)}
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
                <th style={thStyle} onClick={() => toggleSort('unit_price')}>
                  VK-Preis <SortIcon active={sortKey === 'unit_price'} dir={sortDir} />
                </th>
                <th style={thStyle} onClick={() => toggleSort('stock')}>
                  Bestand <SortIcon active={sortKey === 'stock'} dir={sortDir} />
                </th>
                <th>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="admin-table-empty">Keine Materialien gefunden.</td></tr>
              ) : filtered.map(m => {
                const stock = m.inventory[0]?.quantity ?? null
                const minStock = m.inventory[0]?.min_quantity ?? null
                const stockLow = stock !== null && minStock !== null && stock <= minStock
                return (
                  <tr key={m.id} onClick={() => setEditMaterial(m)}>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{m.art_nr}</td>
                    <td><strong>{m.name}</strong>{m.manufacturer ? <span style={{ color: 'var(--muted)', marginLeft: 6, fontSize: 12 }}>{m.manufacturer}</span> : null}</td>
                    <td style={{ color: 'var(--muted)' }}>{m.category || '—'}</td>
                    <td>{m.unit || '—'}</td>
                    <td>{m.unit_price != null ? `CHF ${m.unit_price.toFixed(2)}` : '—'}</td>
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
      </div>

      {editMaterial !== undefined && (
        <MaterialModal
          material={editMaterial === 'new' ? null : (editMaterial as Material)}
          onClose={() => setEditMaterial(undefined)}
          onSaved={() => { setEditMaterial(undefined); load() }}
        />
      )}

      {stockMaterial && (
        <StockModal
          material={stockMaterial}
          onClose={() => setStockMaterial(null)}
          onSaved={() => { setStockMaterial(null); load() }}
        />
      )}
    </div>
  )
}
