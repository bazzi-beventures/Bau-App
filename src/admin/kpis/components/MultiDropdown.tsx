import { useState, useRef, useEffect } from 'react'

interface Props {
  label: string
  options: { value: string; count: number }[]
  selected: Set<string>
  onToggle: (v: string) => void
  onToggleAll: (all: boolean) => void
}

export default function MultiDropdown({ label, options, selected, onToggle, onToggleAll }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  const allSelected = selected.size >= options.length
  const partial = selected.size > 0 && !allSelected

  return (
    <div className="kpi-dropdown" ref={ref}>
      <button
        className={`kpi-dropdown-btn${partial ? ' partial' : ''}`}
        onClick={() => setOpen((o) => !o)}
      >
        {label}
        {partial && <span className="kpi-dropdown-badge">{selected.size}</span>}
        <span className="kpi-dropdown-arrow">▾</span>
      </button>
      {open && (
        <div className="kpi-dropdown-menu">
          <label className="kpi-dropdown-all">
            <input type="checkbox" checked={allSelected} onChange={(e) => onToggleAll(e.target.checked)} />
            Alle
          </label>
          {options.map((o) => (
            <label key={o.value} className="kpi-dropdown-option">
              <input type="checkbox" checked={selected.has(o.value)} onChange={() => onToggle(o.value)} />
              <span className="kpi-dropdown-label">{o.value || '(leer)'}</span>
              <span className="kpi-dropdown-count">{o.count}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
