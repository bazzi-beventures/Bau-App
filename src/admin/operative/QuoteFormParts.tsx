type DescPriceRow = { description: string; total_price: string }

interface DescPriceFieldsetProps<T extends DescPriceRow> {
  title: string
  rows: T[]
  onChange: (rows: T[]) => void
  addLabel: string
  defaultDescription?: string
}

export function DescPriceFieldset<T extends DescPriceRow>({
  title, rows, onChange, addLabel, defaultDescription = '',
}: DescPriceFieldsetProps<T>) {
  function update(i: number, patch: Partial<DescPriceRow>) {
    onChange(rows.map((r, j) => j === i ? { ...r, ...patch } : r))
  }
  function remove(i: number) {
    onChange(rows.filter((_, j) => j !== i))
  }
  function add() {
    onChange([...rows, { description: defaultDescription, total_price: '' } as T])
  }
  return (
    <fieldset style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginBottom: 20 }}>
      <legend style={{ fontWeight: 600, padding: '0 8px' }}>{title}</legend>
      {rows.map((row, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
          <input className="admin-form-input" style={{ flex: 3 }} placeholder="Beschreibung" value={row.description}
            onChange={e => update(i, { description: e.target.value })} />
          <input className="admin-form-input" style={{ flex: 1 }} placeholder="Betrag CHF" value={row.total_price}
            onChange={e => update(i, { total_price: e.target.value })} />
          <button className="admin-btn admin-btn-danger admin-btn-sm" onClick={() => remove(i)} title="Entfernen">✕</button>
        </div>
      ))}
      <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={add}>{addLabel}</button>
    </fieldset>
  )
}

interface DiscountsFieldsetProps {
  laborDiscount: string
  materialDiscount: string
  onLaborChange: (v: string) => void
  onMaterialChange: (v: string) => void
}

export function DiscountsFieldset({ laborDiscount, materialDiscount, onLaborChange, onMaterialChange }: DiscountsFieldsetProps) {
  return (
    <fieldset style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginBottom: 20 }}>
      <legend style={{ fontWeight: 600, padding: '0 8px' }}>Rabatte</legend>
      <div style={{ display: 'flex', gap: 16 }}>
        <div style={{ flex: 1 }}>
          <label className="admin-form-label">Rabatt auf Lohn (%)</label>
          <input className="admin-form-input" placeholder="0" value={laborDiscount} onChange={e => onLaborChange(e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label className="admin-form-label" title="Gilt auf Materialpositionen sowie auf Weitere Produkte / Freie Positionen (inkl. per PDF eingelesene Materialien)">Rabatt auf Material &amp; Produkte (%)</label>
          <input className="admin-form-input" placeholder="0" value={materialDiscount} onChange={e => onMaterialChange(e.target.value)} />
        </div>
      </div>
    </fieldset>
  )
}
