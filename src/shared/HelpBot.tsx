import { useEffect, useRef, useState } from 'react'
import { askHelp, HelpSource, ReindexStatus, getReindexStatus, triggerReindex } from '../api/help'
import { ApiError, isOfflineError } from '../api/client'

type Role = 'user' | 'assistant'

interface Message {
  id: number
  role: Role
  text: string
  sources?: HelpSource[]
  cached?: boolean
  error?: string
}

interface Props {
  /** Vorschlagsfragen, die als Quick-Action-Buttons angezeigt werden. */
  suggestions?: string[]
  /** Wenn gesetzt: zeigt einen Header mit Titel und optionalem Zurueck-Button. */
  header?: { title: string; onBack?: () => void }
  /** Begrenzt die maximale Breite (z.B. fuer Admin-Desktop). Default: full width. */
  maxWidth?: number
  /** Wenn true: Reindex-Bereich (Drive-Dokumente neu einlesen) sichtbar machen.
      Sollte nur fuer Admins gesetzt werden. */
  showReindex?: boolean
}

const DEFAULT_SUGGESTIONS = [
  'Wie erstelle ich eine neue Offerte?',
  'Wo sehe ich meine Ferientage?',
  'Wie funktioniert die Zeitkorrektur?',
  'Wie melde ich eine Abwesenheit?',
]

let _nextId = 1

export default function HelpBot({ suggestions = DEFAULT_SUGGESTIONS, header, maxWidth, showReindex }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [reindex, setReindex] = useState<ReindexStatus | null>(null)
  const [reindexErr, setReindexErr] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  // Beim Mount + alle 3s (waehrend running) Status pollen
  useEffect(() => {
    if (!showReindex) return
    let cancelled = false
    let timer: number | null = null

    async function tick() {
      try {
        const st = await getReindexStatus()
        if (cancelled) return
        setReindex(st)
        if (st.state === 'running') {
          timer = window.setTimeout(tick, 3000)
        }
      } catch {
        if (!cancelled) timer = window.setTimeout(tick, 10000)
      }
    }
    tick()
    return () => { cancelled = true; if (timer) window.clearTimeout(timer) }
  }, [showReindex])

  async function handleReindex() {
    setReindexErr(null)
    try {
      await triggerReindex()
      // Sofort Status pollen + erneutes Polling starten
      const st = await getReindexStatus()
      setReindex(st)
      const loop = async () => {
        try {
          const s = await getReindexStatus()
          setReindex(s)
          if (s.state === 'running') window.setTimeout(loop, 3000)
        } catch { /* ignore */ }
      }
      window.setTimeout(loop, 3000)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 400) setReindexErr('Drive-Ordner nicht konfiguriert.')
        else if (err.status === 429) setReindexErr('Bitte 5 Minuten warten.')
        else setReindexErr(err.message)
      } else {
        setReindexErr('Re-Index fehlgeschlagen.')
      }
    }
  }

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  async function send(question: string) {
    const q = question.trim()
    if (!q || busy) return

    const userMsg: Message = { id: _nextId++, role: 'user', text: q }
    const botMsg: Message = { id: _nextId++, role: 'assistant', text: '' }
    setMessages(prev => [...prev, userMsg, botMsg])
    setInput('')
    setBusy(true)

    try {
      for await (const ev of askHelp(q)) {
        if (ev.type === 'delta') {
          setMessages(prev => prev.map(m =>
            m.id === botMsg.id ? { ...m, text: m.text + ev.text } : m
          ))
        } else if (ev.type === 'sources') {
          setMessages(prev => prev.map(m =>
            m.id === botMsg.id ? { ...m, sources: ev.sources, cached: ev.cached } : m
          ))
        } else if (ev.type === 'error') {
          setMessages(prev => prev.map(m =>
            m.id === botMsg.id ? { ...m, error: ev.message } : m
          ))
        }
      }
    } catch (err) {
      const msg = isOfflineError(err)
        ? 'Keine Internetverbindung.'
        : err instanceof ApiError && err.status === 429
        ? 'Zu viele Anfragen. Bitte kurz warten.'
        : 'Antwort konnte nicht geladen werden.'
      setMessages(prev => prev.map(m =>
        m.id === botMsg.id ? { ...m, error: msg } : m
      ))
    } finally {
      setBusy(false)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    send(input)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  const wrapperStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    width: '100%',
    maxWidth: maxWidth ? `${maxWidth}px` : undefined,
    margin: maxWidth ? '0 auto' : undefined,
  }

  return (
    <div style={wrapperStyle}>
      {header && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 16px', borderBottom: '1px solid var(--border, #e5e7eb)',
        }}>
          {header.onBack && (
            <button
              onClick={header.onBack}
              aria-label="Zurueck"
              style={{
                width: 36, height: 36, borderRadius: 8, border: 'none',
                background: 'transparent', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 18l-6-6 6-6"/>
              </svg>
            </button>
          )}
          <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>{header.title}</div>
        </div>
      )}

      {showReindex && (
        <div style={{
          padding: '10px 16px', borderBottom: '1px solid var(--border, #e5e7eb)',
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          background: 'var(--surface-muted, #f9fafb)',
          fontSize: '0.85rem',
        }}>
          <button
            onClick={handleReindex}
            disabled={reindex?.state === 'running'}
            style={{
              padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border, #d1d5db)',
              background: reindex?.state === 'running' ? 'var(--surface-muted, #e5e7eb)' : 'var(--surface, #fff)',
              color: 'var(--text, #111)', cursor: reindex?.state === 'running' ? 'not-allowed' : 'pointer',
              fontWeight: 500,
            }}
          >
            {reindex?.state === 'running' ? 'Re-Index läuft…' : 'Drive-Handbücher neu einlesen'}
          </button>

          {reindex && reindex.state !== 'idle' && (
            <div style={{ color: 'var(--muted, #6b7280)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {reindex.state === 'running' && (
                <span>{reindex.files_processed}/{reindex.files_total} Dateien</span>
              )}
              {reindex.state === 'success' && (
                <span style={{ color: '#16a34a' }}>
                  ✓ {reindex.chunks_indexed} Chunks aus {reindex.files_processed} Datei(en)
                  {reindex.files_skipped > 0 && ` (${reindex.files_skipped} übersprungen)`}
                </span>
              )}
              {reindex.state === 'error' && (
                <span style={{ color: '#dc2626' }}>Fehler: {reindex.last_error}</span>
              )}
              {reindex.errors.length > 0 && reindex.state !== 'error' && (
                <span style={{ color: '#dc2626' }}>{reindex.errors.length} Datei-Fehler</span>
              )}
            </div>
          )}

          {reindexErr && (
            <span style={{ color: '#dc2626' }}>{reindexErr}</span>
          )}
        </div>
      )}

      {/* Verlauf */}
      <div ref={scrollRef} style={{
        flex: 1, overflowY: 'auto', padding: 16,
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        {messages.length === 0 && (
          <div style={{ color: 'var(--muted, #6b7280)', textAlign: 'center', marginTop: 32 }}>
            <div style={{ fontSize: '1rem', marginBottom: 8 }}>Stell mir eine Frage zur Bedienung der App.</div>
            <div style={{ fontSize: '0.85rem' }}>Ich antworte auf Basis des Handbuchs.</div>
          </div>
        )}

        {messages.map(m => (
          <div key={m.id} style={{
            alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
            maxWidth: '85%',
            padding: '10px 14px',
            borderRadius: 12,
            background: m.role === 'user'
              ? 'var(--accent-blue, #1e3a5f)'
              : 'var(--surface-muted, #f3f4f6)',
            color: m.role === 'user' ? '#fff' : 'var(--text, #111)',
            fontSize: '0.95rem',
            lineHeight: 1.4,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}>
            {m.text || (m.role === 'assistant' && !m.error && (
              <span style={{ opacity: 0.6, fontStyle: 'italic' }}>denkt nach…</span>
            ))}
            {m.error && (
              <div style={{ color: '#ef4444', fontWeight: 500, marginTop: 4 }}>
                {m.error}
              </div>
            )}
            {m.sources && m.sources.length > 0 && (
              <div style={{
                marginTop: 8, paddingTop: 8,
                borderTop: '1px solid rgba(0,0,0,0.08)',
                fontSize: '0.78rem', opacity: 0.75,
              }}>
                <div style={{ fontWeight: 600, marginBottom: 2 }}>
                  Quellen{m.cached ? ' (aus Cache)' : ''}:
                </div>
                {m.sources.map((s, i) => (
                  <div key={i}>• {s.section}</div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Vorschlaege (nur solange noch keine Nachrichten existieren) */}
      {messages.length === 0 && suggestions.length > 0 && (
        <div style={{
          padding: '0 16px 12px', display: 'flex', flexWrap: 'wrap', gap: 8,
        }}>
          {suggestions.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => send(s)}
              disabled={busy}
              style={{
                padding: '8px 12px', borderRadius: 16, fontSize: '0.85rem',
                background: 'var(--surface-muted, #f3f4f6)', color: 'var(--text, #111)',
                border: '1px solid var(--border, #e5e7eb)', cursor: 'pointer',
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Eingabe */}
      <form onSubmit={handleSubmit} style={{
        display: 'flex', gap: 8, padding: 12,
        borderTop: '1px solid var(--border, #e5e7eb)',
      }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder="Frage zur App stellen…"
          disabled={busy}
          style={{
            flex: 1, padding: '10px 12px',
            borderRadius: 8, border: '1px solid var(--border, #d1d5db)',
            fontSize: '0.95rem', fontFamily: 'inherit', resize: 'none',
            background: 'var(--surface, #fff)', color: 'var(--text, #111)',
          }}
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          style={{
            padding: '0 16px', borderRadius: 8, border: 'none',
            background: 'var(--accent-blue, #1e3a5f)', color: '#fff',
            fontWeight: 600, cursor: busy || !input.trim() ? 'not-allowed' : 'pointer',
            opacity: busy || !input.trim() ? 0.5 : 1,
          }}
        >
          {busy ? '…' : 'Senden'}
        </button>
      </form>
    </div>
  )
}
