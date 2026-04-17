import { useState, useEffect, useRef, useCallback } from 'react'
import { zeitAction, ZeitAction, submitCorrectionRequest, getCorrectionStatus, CorrectionPayload } from '../api/chat'
import { ApiError, isOfflineError } from '../api/client'
import { BerichtType } from './BerichtScreen'

const OFFLINE_QUEUE_KEY = 'zeit_offline_queue'

interface QueuedAction {
  action: ZeitAction
  recorded_at: string
}

function loadQueue(): QueuedAction[] {
  try { return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]') } catch { return [] }
}

function saveQueue(q: QueuedAction[]) {
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(q))
}

interface Props {
  displayName: string
  logoUrl?: string
  onNavHome: () => void
  onNavRapport: () => void
  onNavProjekte: () => void
  onNavProfile: () => void
  onLoggedOut: () => void
  onOpenBericht: (type: BerichtType) => void
  onNavAbsenzen: () => void
}

interface Action {
  label: string
  sub: string
  action: ZeitAction
  iconColor: string
  iconClass: string
  icon: React.ReactNode
}

const ACTIONS: Action[] = [
  {
    label: 'Einstempeln',
    sub: 'Arbeitsbeginn erfassen',
    action: 'clock_in',
    iconColor: '#22c55e',
    iconClass: 'menu-icon-green',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="1.8">
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
      </svg>
    ),
  },
  {
    label: 'Ausstempeln',
    sub: 'Arbeitsende erfassen',
    action: 'clock_out',
    iconColor: '#22c55e',
    iconClass: 'menu-icon-green',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="1.8">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
        <line x1="8" y1="17" x2="16" y2="17"/>
      </svg>
    ),
  },
  {
    label: 'Pause starten',
    sub: 'Beginn der Pause',
    action: 'start_break',
    iconColor: '#f59e0b',
    iconClass: 'menu-icon-amber',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.8">
        <path d="M18 8h1a4 4 0 0 1 0 8h-1"/>
        <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/>
        <line x1="6" y1="1" x2="6" y2="4"/>
        <line x1="10" y1="1" x2="10" y2="4"/>
        <line x1="14" y1="1" x2="14" y2="4"/>
      </svg>
    ),
  },
  {
    label: 'Pause beenden',
    sub: 'Ende der Pause',
    action: 'end_break',
    iconColor: '#f59e0b',
    iconClass: 'menu-icon-amber',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.8">
        <path d="M18 8h1a4 4 0 0 1 0 8h-1"/>
        <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/>
        <polyline points="10 13 12 15 16 11"/>
      </svg>
    ),
  },
]

const today = () => new Date().toISOString().slice(0, 10)

export default function ArbeitsZeitScreen({ logoUrl, onNavHome, onNavRapport, onNavProjekte, onNavProfile, onLoggedOut, onOpenBericht, onNavAbsenzen }: Props) {
  const [result, setResult] = useState<{ text: string; isError: boolean } | null>(null)
  const [loadingIdx, setLoadingIdx] = useState<number | null>(null)
  const [reportLoading] = useState(false)
  const [queueSize, setQueueSize] = useState(() => loadQueue().length)
  const [draining, setDraining] = useState(false)
  const [showArtSelector, setShowArtSelector] = useState(false)
  const [selectedArt, setSelectedArt] = useState<string>('Montage')

  const ART_OPTIONS = ['Montage', 'Reparatur', 'Werkstatt']

  const drainQueue = useCallback(async () => {
    const q = loadQueue()
    if (q.length === 0) return
    setDraining(true)
    const remaining: QueuedAction[] = []
    for (const item of q) {
      try {
        await zeitAction(item.action, { recorded_at: item.recorded_at })
      } catch {
        remaining.push(item)
      }
    }
    saveQueue(remaining)
    setQueueSize(remaining.length)
    setDraining(false)
    if (remaining.length === 0) {
      setResult({ text: 'Offline-Aktionen wurden erfolgreich synchronisiert.', isError: false })
    }
  }, [])

  useEffect(() => {
    const onOnline = () => { drainQueue() }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [drainQueue])

  // Korrektur-Formular
  const [showCorrection, setShowCorrection] = useState(false)
  const [corrForm, setCorrForm] = useState<CorrectionPayload>({
    date: today(), clock_in: '', clock_out: '', break_minutes: 0, reason: '',
  })
  const [corrLoading, setCorrLoading] = useState(false)
  const [pendingCorrection, setPendingCorrection] = useState<{ id: string; date: string } | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!pendingCorrection) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
      return
    }
    const check = async () => {
      try {
        const s = await getCorrectionStatus(pendingCorrection.id)
        if (s.status === 'approved') {
          setResult({ text: `Korrektur für ${pendingCorrection.date} wurde genehmigt und angewendet.`, isError: false })
          setPendingCorrection(null)
        } else if (s.status === 'rejected') {
          const note = s.review_note ? ` Grund: ${s.review_note}` : ''
          setResult({ text: `Korrektur für ${pendingCorrection.date} wurde abgelehnt.${note}`, isError: true })
          setPendingCorrection(null)
        }
      } catch {
        // Netzwerkfehler — einfach beim nächsten Intervall neu versuchen
      }
    }
    check()
    pollRef.current = setInterval(check, 15000)
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }
  }, [pendingCorrection])

  async function handleCorrectionSubmit() {
    if (!corrForm.clock_in || !corrForm.clock_out || !corrForm.reason.trim()) return
    setCorrLoading(true)
    setResult(null)
    try {
      const res = await submitCorrectionRequest(corrForm)
      setResult({ text: res.reply, isError: !res.action_taken })
      if (res.correction_id) {
        setPendingCorrection({ id: res.correction_id, date: corrForm.date })
      }
      setShowCorrection(false)
      setCorrForm({ date: today(), clock_in: '', clock_out: '', break_minutes: 0, reason: '' })
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) { onLoggedOut(); return }
      setResult({ text: isOfflineError(err) ? 'Keine Internetverbindung' : 'Fehler beim Einreichen. Bitte erneut versuchen.', isError: true })
    } finally {
      setCorrLoading(false)
    }
  }

  async function sendAction(action: ZeitAction, idx: number, opts: { art_der_arbeit?: string } = {}) {
    setResult(null)
    setLoadingIdx(idx)
    const recorded_at = new Date().toISOString()
    try {
      const res = await zeitAction(action, { recorded_at, ...opts })
      setResult({ text: res.reply, isError: false })
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onLoggedOut()
        return
      }
      if (isOfflineError(err)) {
        const q = loadQueue()
        q.push({ action, recorded_at })
        saveQueue(q)
        setQueueSize(q.length)
        setResult({ text: `Offline gespeichert – wird gesendet sobald Verbindung vorhanden.`, isError: false })
      } else {
        setResult({ text: 'Fehler beim Senden. Bitte erneut versuchen.', isError: true })
      }
    } finally {
      setLoadingIdx(null)
    }
  }

  function handleAction(action: Action, idx: number) {
    if (action.action === 'clock_in') {
      setShowArtSelector(v => !v)
      setResult(null)
    } else {
      sendAction(action.action, idx)
    }
  }


  return (
    <div className="app-screen">
      {/* Header */}
      <div className="inner-header">
        <div className="back-btn" onClick={onNavHome}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </div>
        <div className="inner-title">Arbeitszeit</div>
        {logoUrl && <img src={logoUrl} alt="Logo" className="header-logo" />}
      </div>

      {/* Banner */}
      <div className="context-banner context-banner-green">
        <div className="banner-tag banner-tag-green">HR Assistent</div>
        <div className="banner-text">Hier verwaltest du deine Arbeitszeiten, Pausen und Abwesenheiten.</div>
      </div>

      {/* Result */}
      {result && (
        <div className={`action-result${result.isError ? ' action-result-error' : ''}`}>
          {result.text}
        </div>
      )}

      {/* Offline queue banner */}
      {queueSize > 0 && (
        <div className="action-result" style={{ background: '#1e3a5f', color: '#93c5fd', borderLeft: '3px solid #3b82f6' }}>
          {draining
            ? `${queueSize} Aktion${queueSize > 1 ? 'en' : ''} wird synchronisiert…`
            : `${queueSize} Aktion${queueSize > 1 ? 'en' : ''} offline gespeichert – wird gesendet sobald Verbindung vorhanden.`}
        </div>
      )}

      {/* Pending correction banner */}
      {pendingCorrection && (
        <div className="action-result" style={{ background: '#fef3c7', color: '#92400e', borderLeft: '3px solid #f59e0b' }}>
          Korrekturantrag für {pendingCorrection.date} eingereicht. Warte auf Genehmigung…
        </div>
      )}

      {/* Actions */}
      <div className="menu-list">
        {ACTIONS.map((action, idx) => (
          <div key={action.label}>
            <div
              className="menu-item"
              onClick={() => loadingIdx === null && !reportLoading && handleAction(action, idx)}
              style={{ opacity: (loadingIdx !== null && loadingIdx !== idx) || reportLoading ? 0.5 : 1 }}
            >
              <div className={`menu-icon ${action.iconClass}`}>
                {action.icon}
              </div>
              <div className="menu-text">
                <div className="menu-label">
                  {loadingIdx === idx ? '…' : action.label}
                </div>
                <div className="menu-sub">{action.sub}</div>
              </div>
              <div className="menu-chevron">{action.action === 'clock_in' ? (showArtSelector ? '∨' : '›') : '›'}</div>
            </div>
            {/* Arbeitsart-Auswahl bei Einstempeln */}
            {action.action === 'clock_in' && showArtSelector && (
              <div className="correction-form" style={{ paddingTop: 12, paddingBottom: 12 }}>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 10 }}>Art der Arbeit wählen:</div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  {ART_OPTIONS.map(opt => (
                    <button
                      key={opt}
                      onClick={() => setSelectedArt(opt)}
                      style={{
                        flex: 1, padding: '7px 4px', borderRadius: 8, border: 'none',
                        background: selectedArt === opt ? '#22c55e' : '#1f2937',
                        color: selectedArt === opt ? '#fff' : 'var(--text)',
                        fontWeight: selectedArt === opt ? 600 : 400,
                        fontSize: 13, cursor: 'pointer',
                      }}
                    >{opt}</button>
                  ))}
                </div>
                <div className="corr-actions">
                  <button className="corr-btn corr-btn-cancel" onClick={() => setShowArtSelector(false)}>
                    Abbrechen
                  </button>
                  <button
                    className="corr-btn corr-btn-submit"
                    disabled={loadingIdx === idx}
                    onClick={() => { setShowArtSelector(false); sendAction('clock_in', idx, { art_der_arbeit: selectedArt }) }}
                  >
                    {loadingIdx === idx ? '…' : `Einstempeln (${selectedArt})`}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Arbeitszeitbericht — Monat */}
        <div
          className="menu-item"
          onClick={() => loadingIdx === null && onOpenBericht('monthly')}
          style={{ opacity: loadingIdx !== null ? 0.5 : 1 }}
        >
          <div className="menu-icon menu-icon-green">
            <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="1.8">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <polyline points="8 13 12 17 16 13"/>
              <line x1="12" y1="17" x2="12" y2="9"/>
            </svg>
          </div>
          <div className="menu-text">
            <div className="menu-label">Arbeitszeitbericht</div>
            <div className="menu-sub">Monatszeiten &amp; Überstunden anzeigen</div>
          </div>
          <div className="menu-chevron">›</div>
        </div>

        {/* Wochenansicht — diese Woche */}
        <div
          className="menu-item"
          onClick={() => loadingIdx === null && onOpenBericht('weekly-this')}
          style={{ opacity: loadingIdx !== null ? 0.5 : 1 }}
        >
          <div className="menu-icon menu-icon-green">
            <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="1.8">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
          </div>
          <div className="menu-text">
            <div className="menu-label">Wochenansicht</div>
            <div className="menu-sub">Stundenjournal der aktuellen Woche</div>
          </div>
          <div className="menu-chevron">›</div>
        </div>

        {/* Wochenansicht — letzte Woche */}
        <div
          className="menu-item"
          onClick={() => loadingIdx === null && onOpenBericht('weekly-last')}
          style={{ opacity: loadingIdx !== null ? 0.5 : 1 }}
        >
          <div className="menu-icon menu-icon-green">
            <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="1.8">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
              <polyline points="8 14 10 16 8 18"/>
            </svg>
          </div>
          <div className="menu-text">
            <div className="menu-label">Letzte Woche</div>
            <div className="menu-sub">Stundenjournal der vergangenen Woche</div>
          </div>
          <div className="menu-chevron">›</div>
        </div>

        {/* Absenzen */}
        <div
          className="menu-item"
          onClick={() => loadingIdx === null && onNavAbsenzen()}
          style={{ opacity: loadingIdx !== null ? 0.5 : 1 }}
        >
          <div className="menu-icon menu-icon-amber">
            <svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.8">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
          <div className="menu-text">
            <div className="menu-label">Absenzen</div>
            <div className="menu-sub">Urlaub &amp; Abwesenheiten beantragen</div>
          </div>
          <div className="menu-chevron">›</div>
        </div>

        {/* Arbeitszeit korrigieren */}
        <div
          className="menu-item"
          onClick={() => { setShowCorrection(v => !v); setResult(null) }}
          style={{ opacity: loadingIdx !== null || reportLoading ? 0.5 : 1 }}
        >
          <div className="menu-icon menu-icon-amber">
            <svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.8">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </div>
          <div className="menu-text">
            <div className="menu-label">Arbeitszeit korrigieren</div>
            <div className="menu-sub">Korrekturantrag einreichen</div>
          </div>
          <div className="menu-chevron">{showCorrection ? '∨' : '›'}</div>
        </div>

        {/* Korrektur-Formular */}
        {showCorrection && (
          <div className="correction-form">
            <div className="corr-row">
              <label className="corr-label">Datum</label>
              <input
                className="corr-input"
                type="date"
                value={corrForm.date}
                onChange={e => setCorrForm(f => ({ ...f, date: e.target.value }))}
              />
            </div>
            <div className="corr-row">
              <label className="corr-label">Einstempel</label>
              <input
                className="corr-input"
                type="time"
                value={corrForm.clock_in}
                onChange={e => setCorrForm(f => ({ ...f, clock_in: e.target.value }))}
              />
            </div>
            <div className="corr-row">
              <label className="corr-label">Ausstempel</label>
              <input
                className="corr-input"
                type="time"
                value={corrForm.clock_out}
                onChange={e => setCorrForm(f => ({ ...f, clock_out: e.target.value }))}
              />
            </div>
            <div className="corr-row">
              <label className="corr-label">Pause (Min)</label>
              <input
                className="corr-input"
                type="number"
                min="0"
                value={corrForm.break_minutes}
                onChange={e => setCorrForm(f => ({ ...f, break_minutes: Number(e.target.value) }))}
              />
            </div>
            <div className="corr-row">
              <label className="corr-label">Grund</label>
              <input
                className="corr-input"
                type="text"
                placeholder="Vergessen einzustempeln, etc."
                value={corrForm.reason}
                onChange={e => setCorrForm(f => ({ ...f, reason: e.target.value }))}
              />
            </div>
            <div className="corr-actions">
              <button
                className="corr-btn corr-btn-cancel"
                onClick={() => setShowCorrection(false)}
                disabled={corrLoading}
              >
                Abbrechen
              </button>
              <button
                className="corr-btn corr-btn-submit"
                onClick={handleCorrectionSubmit}
                disabled={corrLoading || !corrForm.clock_in || !corrForm.clock_out || !corrForm.reason.trim()}
              >
                {corrLoading ? '…' : 'Einreichen'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Nav bar */}
      <div className="nav-bar">
        <div className="nav-item" onClick={onNavHome}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          </svg>
          <span>Home</span>
        </div>
        <div className="nav-item" onClick={onNavRapport}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          <span>Rapporte</span>
        </div>
        <div className="nav-item active">
          <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="1.8">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          <span>Arbeitszeit</span>
        </div>
        <div className="nav-item" onClick={onNavProjekte}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <path d="M9 22V12h6v10"/>
          </svg>
          <span>Projekte</span>
        </div>
        <div className="nav-item" onClick={onNavProfile}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
          <span>Profil</span>
        </div>
      </div>
    </div>
  )
}
