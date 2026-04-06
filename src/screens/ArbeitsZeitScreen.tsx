import { useState } from 'react'
import { zeitAction, ZeitAction, submitCorrectionRequest, CorrectionPayload } from '../api/chat'
import { ApiError, apiBlobFetch } from '../api/client'

interface Props {
  displayName: string
  logoUrl?: string
  onNavHome: () => void
  onNavRapport: () => void
  onNavProfile: () => void
  onLoggedOut: () => void
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
  {
    label: 'Absenz melden',
    sub: 'Krankheit, Unfall, etc.',
    action: 'report_sick',
    iconColor: '#f87171',
    iconClass: 'menu-icon-red',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="1.8">
        <rect x="3" y="4" width="18" height="18" rx="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    ),
  },
  {
    label: 'Absenz stornieren',
    sub: 'Krankmeldung zurückziehen',
    action: 'cancel_sick',
    iconColor: '#f87171',
    iconClass: 'menu-icon-red',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="1.8">
        <rect x="3" y="4" width="18" height="18" rx="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
        <line x1="9" y1="14" x2="15" y2="20"/>
        <line x1="15" y1="14" x2="9" y2="20"/>
      </svg>
    ),
  },
]

const today = () => new Date().toISOString().slice(0, 10)

export default function ArbeitsZeitScreen({ logoUrl, onNavHome, onNavRapport, onNavProfile, onLoggedOut }: Props) {
  const [result, setResult] = useState<{ text: string; isError: boolean } | null>(null)
  const [loadingIdx, setLoadingIdx] = useState<number | null>(null)
  const [reportLoading, setReportLoading] = useState(false)

  // Korrektur-Formular
  const [showCorrection, setShowCorrection] = useState(false)
  const [corrForm, setCorrForm] = useState<CorrectionPayload>({
    date: today(), clock_in: '', clock_out: '', break_minutes: 0, reason: '',
  })
  const [corrLoading, setCorrLoading] = useState(false)

  async function handleCorrectionSubmit() {
    if (!corrForm.clock_in || !corrForm.clock_out || !corrForm.reason.trim()) return
    setCorrLoading(true)
    setResult(null)
    try {
      const res = await submitCorrectionRequest(corrForm)
      setResult({ text: res.reply, isError: !res.action_taken })
      setShowCorrection(false)
      setCorrForm({ date: today(), clock_in: '', clock_out: '', break_minutes: 0, reason: '' })
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) { onLoggedOut(); return }
      setResult({ text: 'Fehler beim Einreichen. Bitte erneut versuchen.', isError: true })
    } finally {
      setCorrLoading(false)
    }
  }

  async function handleAction(action: Action, idx: number) {
    setResult(null)
    setLoadingIdx(idx)
    try {
      const res = await zeitAction(action.action)
      setResult({ text: res.reply, isError: false })
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onLoggedOut()
        return
      }
      setResult({ text: 'Fehler beim Senden. Bitte erneut versuchen.', isError: true })
    } finally {
      setLoadingIdx(null)
    }
  }

  async function handlePdfDownload(url: string) {
    setResult(null)
    setReportLoading(true)
    try {
      const { blob, filename } = await apiBlobFetch(url)
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = filename
      a.click()
      URL.revokeObjectURL(blobUrl)
      setResult({ text: 'Bericht wird heruntergeladen…', isError: false })
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onLoggedOut()
        return
      }
      const detail = err instanceof ApiError && err.status === 404
        ? 'Keine Daten für diesen Zeitraum gefunden.'
        : 'Bericht konnte nicht erstellt werden. Bitte erneut versuchen.'
      setResult({ text: detail, isError: true })
    } finally {
      setReportLoading(false)
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

      {/* Actions */}
      <div className="menu-list">
        {ACTIONS.map((action, idx) => (
          <div
            key={action.label}
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
            <div className="menu-chevron">›</div>
          </div>
        ))}

        {/* Wochen-Stundenjournal — Diese Woche */}
        <div
          className="menu-item"
          onClick={() => !reportLoading && loadingIdx === null && handlePdfDownload('/pwa/report/weekly-pdf?period=this_week')}
          style={{ opacity: reportLoading || loadingIdx !== null ? 0.5 : 1 }}
        >
          <div className="menu-icon menu-icon-blue">
            <svg viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.8">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <polyline points="8 13 12 17 16 13"/>
              <line x1="12" y1="17" x2="12" y2="9"/>
            </svg>
          </div>
          <div className="menu-text">
            <div className="menu-label">{reportLoading ? '…' : 'Diese Woche'}</div>
            <div className="menu-sub">Stundenjournal der laufenden Woche</div>
          </div>
          <div className="menu-chevron">›</div>
        </div>

        {/* Wochen-Stundenjournal — Letzte Woche */}
        <div
          className="menu-item"
          onClick={() => !reportLoading && loadingIdx === null && handlePdfDownload('/pwa/report/weekly-pdf?period=last_week')}
          style={{ opacity: reportLoading || loadingIdx !== null ? 0.5 : 1 }}
        >
          <div className="menu-icon menu-icon-blue">
            <svg viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.8">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <polyline points="8 13 12 17 16 13"/>
              <line x1="12" y1="17" x2="12" y2="9"/>
            </svg>
          </div>
          <div className="menu-text">
            <div className="menu-label">{reportLoading ? '…' : 'Letzte Woche'}</div>
            <div className="menu-sub">Stundenjournal der vergangenen Woche</div>
          </div>
          <div className="menu-chevron">›</div>
        </div>

        {/* Arbeitszeitbericht — Monats-PDF */}
        <div
          className="menu-item"
          onClick={() => !reportLoading && loadingIdx === null && handlePdfDownload('/pwa/report/monthly-pdf')}
          style={{ opacity: reportLoading || loadingIdx !== null ? 0.5 : 1 }}
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
            <div className="menu-label">{reportLoading ? '…' : 'Arbeitszeitbericht'}</div>
            <div className="menu-sub">Monatszeiten &amp; Überstunden als PDF</div>
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
