import { useState } from 'react'
import { createPortal } from 'react-dom'
import HelpBot from './HelpBot'

interface Props {
  /** Vorschlagsfragen, die im Chat als Quick-Action-Buttons erscheinen. */
  suggestions?: string[]
  /** Wenn gesetzt: FAB/Panel werden auf eine zentrierte Spalte dieser Breite
   *  ausgerichtet (Mitarbeiter-PWA, max-width 480). Ohne Wert: echte Ecke
   *  unten rechts (Admin-Layout über volle Breite). */
  columnMaxWidth?: number
}

/**
 * Schwebende Hilfe-Blase: ein runder Button (FAB) unten rechts, der ein
 * Chat-Panel öffnet. Das Panel rendert den bestehenden <HelpBot> (ohne Header,
 * ohne manuellen Reindex — die Drive-Dokumente werden nächtlich automatisch
 * eingelesen). Wird global gerendert und ist überall in der App erreichbar.
 *
 * Modul-Gating macht der Aufrufer (nur rendern wenn hasModule(user,'help_bot')).
 */
export default function HelpBubble({ suggestions, columnMaxWidth }: Props) {
  const [open, setOpen] = useState(false)

  // Horizontale Verankerung: an der zentrierten Spalte (PWA) oder echter Ecke (Admin)
  const right = columnMaxWidth
    ? `max(16px, calc((100vw - ${columnMaxWidth}px) / 2 + 16px))`
    : '24px'
  // Über der Bottom-Nav-Bar (~56px) + Safe-Area halten
  const fabBottom = 'calc(72px + env(safe-area-inset-bottom, 0px))'
  const panelBottom = 'calc(140px + env(safe-area-inset-bottom, 0px))'

  return createPortal(
    <>
      {open && (
        <div
          role="dialog"
          aria-label="Hilfe-Chat"
          style={{
            position: 'fixed',
            right,
            bottom: panelBottom,
            width: 'min(380px, calc(100vw - 32px))',
            height: 'min(540px, calc(100dvh - 220px))',
            background: 'var(--surface, #fff)',
            color: 'var(--text, #111)',
            borderRadius: 16,
            border: '1px solid var(--border, #e5e7eb)',
            boxShadow: '0 12px 40px rgba(0,0,0,0.22)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            zIndex: 1001,
          }}
        >
          {/* Panel-Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', borderBottom: '1px solid var(--border, #e5e7eb)',
            flexShrink: 0,
          }}>
            <div style={{ fontSize: '1.05rem', fontWeight: 600 }}>Hilfe</div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Hilfe schliessen"
              style={{
                width: 32, height: 32, borderRadius: 8, border: 'none',
                background: 'transparent', cursor: 'pointer', color: 'var(--text, #111)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Chat füllt den Rest */}
          <div style={{ flex: 1, minHeight: 0 }}>
            <HelpBot suggestions={suggestions} />
          </div>
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Hilfe schliessen' : 'Hilfe öffnen'}
        aria-expanded={open}
        style={{
          position: 'fixed',
          right,
          bottom: fabBottom,
          width: 56, height: 56, borderRadius: '50%',
          border: 'none', cursor: 'pointer',
          background: 'var(--accent-blue, #1e3a5f)', color: '#fff',
          boxShadow: '0 6px 20px rgba(0,0,0,0.28)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000,
        }}
      >
        {open ? (
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        ) : (
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
        )}
      </button>
    </>,
    document.body,
  )
}
