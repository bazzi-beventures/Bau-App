import { useEffect, useRef, useState } from 'react'

const SEARCH_CH_KEY = 'ad290fc75be73fc2834dac1ed6cc3176'

interface SearchChEntry {
  id: string
  name: string
  street?: string
  streetno?: string
  zip?: string
  city?: string
  phone?: string
  email?: string
}

interface SearchChResponse {
  result?: SearchChEntry[]
}

export interface CompanyResult {
  name: string
  address: string
  phone: string
  email: string
}

interface Props {
  onSelect: (result: CompanyResult) => void
}

export function CompanySearch({ onSelect }: Props) {
  const [query, setQuery] = useState('')
  const [ort, setOrt] = useState('')
  const [suggestions, setSuggestions] = useState<SearchChEntry[]>([])
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(-1)
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (query.length < 2) {
      setSuggestions([])
      setOpen(false)
      return
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams({
          key: SEARCH_CH_KEY,
          was: query,
          maxnum: '6',
          lang: 'de',
        })
        if (ort.trim()) params.set('wo', ort.trim())

        const res = await fetch(`https://tel.search.ch/api/?${params}`)
        const data: SearchChResponse = await res.json()
        const results = data.result ?? []
        setSuggestions(results)
        setOpen(results.length > 0)
        setHighlighted(-1)
      } catch {
        setSuggestions([])
        setOpen(false)
      } finally {
        setLoading(false)
      }
    }, 350)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, ort])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function select(entry: SearchChEntry) {
    const street = [entry.street, entry.streetno].filter(Boolean).join(' ')
    const city = [entry.zip, entry.city].filter(Boolean).join(' ')
    const address = [street, city].filter(Boolean).join(', ')

    onSelect({
      name: entry.name,
      address,
      phone: entry.phone ?? '',
      email: entry.email ?? '',
    })

    setQuery('')
    setOrt('')
    setOpen(false)
    setSuggestions([])
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || suggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted(h => Math.min(h + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted(h => Math.max(h - 1, 0))
    } else if (e.key === 'Enter' && highlighted >= 0) {
      e.preventDefault()
      select(suggestions[highlighted])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
        <input
          className="admin-form-input"
          placeholder="Firmaname oder Name…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          autoComplete="off"
        />
        <input
          className="admin-form-input"
          placeholder="Ort"
          value={ort}
          onChange={e => setOrt(e.target.value)}
          style={{ width: 140 }}
          autoComplete="off"
        />
      </div>
      {loading && (
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Suche…</div>
      )}
      {open && (
        <ul style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          zIndex: 1000,
          margin: 0,
          padding: 0,
          listStyle: 'none',
          background: 'var(--card-bg, #1e2a3a)',
          border: '1px solid var(--border, rgba(255,255,255,0.1))',
          borderRadius: 6,
          boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
          maxHeight: 260,
          overflowY: 'auto',
        }}>
          {suggestions.map((s, i) => {
            const street = [s.street, s.streetno].filter(Boolean).join(' ')
            const city = [s.zip, s.city].filter(Boolean).join(' ')
            return (
              <li
                key={s.id}
                onMouseDown={() => select(s)}
                onMouseEnter={() => setHighlighted(i)}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  background: i === highlighted ? 'var(--hover-bg, rgba(255,255,255,0.07))' : 'transparent',
                  borderBottom: i < suggestions.length - 1 ? '1px solid var(--border, rgba(255,255,255,0.06))' : 'none',
                }}
              >
                <div style={{ fontWeight: 500, fontSize: 13, color: 'var(--text, #e2e8f0)' }}>{s.name}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                  {[street, city].filter(Boolean).join(' · ')}
                  {s.phone ? ` · ${s.phone}` : ''}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
