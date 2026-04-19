import { useEffect, useRef, useState } from 'react'

interface SwisstopoResult {
  id: number
  attrs: {
    label: string
    detail: string
  }
}

interface Props {
  value: string
  onChange: (value: string) => void
  className?: string
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '')
}

export function AddressAutocomplete({ value, onChange, className }: Props) {
  const [suggestions, setSuggestions] = useState<SwisstopoResult[]>([])
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(-1)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (value.length < 3) {
      setSuggestions([])
      setOpen(false)
      return
    }

    debounceRef.current = setTimeout(async () => {
      try {
        const url = `https://api3.geo.admin.ch/rest/services/api/SearchServer?searchText=${encodeURIComponent(value)}&type=locations&limit=6&lang=de`
        const res = await fetch(url)
        const data = await res.json()
        const results: SwisstopoResult[] = data.results ?? []
        setSuggestions(results)
        setOpen(results.length > 0)
        setHighlighted(-1)
      } catch {
        setSuggestions([])
        setOpen(false)
      }
    }, 300)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [value])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function select(result: SwisstopoResult) {
    onChange(stripHtml(result.attrs.label))
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
    <div ref={containerRef} style={{ position: 'relative', zIndex: open ? 1000 : 'auto' }}>
      <input
        className={className}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        autoComplete="off"
      />
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
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
          maxHeight: 240,
          overflowY: 'auto',
        }}>
          {suggestions.map((s, i) => (
            <li
              key={s.id}
              onMouseDown={() => select(s)}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                fontSize: 13,
                color: 'var(--text)',
                background: i === highlighted ? 'var(--surface2)' : 'transparent',
                borderBottom: i < suggestions.length - 1 ? '1px solid var(--border)' : 'none',
              }}
              onMouseEnter={() => setHighlighted(i)}
            >
              {stripHtml(s.attrs.label)}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
