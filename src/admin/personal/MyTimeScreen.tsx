import { useEffect, useRef, useState } from 'react'
import {
  zeitAction,
  ZeitAction,
  submitCorrectionRequest,
  getCorrectionStatus,
  CorrectionPayload,
} from '../../api/chat'
import { apiFetch, ApiError, isOfflineError } from '../../api/client'

interface SessionStatus {
  status: 'active' | 'inactive' | 'on_break'
  clock_in: string | null
  since_minutes: number
}

function formatClockIn(isoUtc: string): string {
  const dt = new Date(isoUtc)
  return dt.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Zurich' })
}

const today = () => new Date().toISOString().slice(0, 10)

interface Toast {
  msg: string
  type: 'success' | 'error' | 'info'
}

const STEMPEL_STATE_KEY = 'my-time-stempel-state'
type StempelState = {
  clockedIn: boolean
  startedAt: number | null
  onBreak: boolean
  breakStartedAt: number | null
}
const DEFAULT_STEMPEL_STATE: StempelState = {
  clockedIn: false,
  startedAt: null,
  onBreak: false,
  breakStartedAt: null,
}

function loadStempelState(): StempelState {
  try {
    const raw = localStorage.getItem(STEMPEL_STATE_KEY)
    if (!raw) return DEFAULT_STEMPEL_STATE
    const parsed = JSON.parse(raw)
    return { ...DEFAULT_STEMPEL_STATE, ...parsed }
  } catch {
    return DEFAULT_STEMPEL_STATE
  }
}

function formatClock(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const IconPlay = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" />
  </svg>
)
const IconStop = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <rect x="9" y="9" width="6" height="6" fill="currentColor" />
  </svg>
)
const IconPause = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="6" y="5" width="4" height="14" />
    <rect x="14" y="5" width="4" height="14" />
  </svg>
)
const IconPauseEnd = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="8 5 19 12 8 19 8 5" />
  </svg>
)

interface Props {
  onLoggedOut: () => void
}

export default function MyTimeScreen({ onLoggedOut }: Props) {
  const [loadingAction, setLoadingAction] = useState<ZeitAction | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const [stempel, setStempel] = useState<StempelState>(() => loadStempelState())
  const [sessionStatus, setSessionStatus] = useState<SessionStatus | null>(null)

  useEffect(() => {
    try { localStorage.setItem(STEMPEL_STATE_KEY, JSON.stringify(stempel)) } catch { /* ignore */ }
  }, [stempel])

  useEffect(() => {
    let cancelled = false
    async function fetchStatus() {
      if (!navigator.onLine) return
      try {
        const data = await apiFetch('/pwa/status') as SessionStatus
        if (!cancelled) {
          setSessionStatus(data)
          setStempel(s => ({
            ...s,
            clockedIn: data.status !== 'inactive',
            onBreak: data.status === 'on_break',
          }))
        }
      } catch (err) {
        if (cancelled) return
        if (isOfflineError(err)) return
        if (err instanceof ApiError && err.status === 401) onLoggedOut()
      }
    }
    fetchStatus()
    const interval = setInterval(fetchStatus, 30_000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  async function refreshStatus() {
    if (!navigator.onLine) return
    try {
      const data = await apiFetch('/pwa/status') as SessionStatus
      setSessionStatus(data)
      setStempel(s => ({
        ...s,
        clockedIn: data.status !== 'inactive',
        onBreak: data.status === 'on_break',
      }))
    } catch {
      /* ignore */
    }
  }

  const [showCorrection, setShowCorrection] = useState(false)
  const [corrForm, setCorrForm] = useState<CorrectionPayload>({
    date: today(),
    clock_in: '',
    clock_out: '',
    break_minutes: 0,
    reason: '',
  })
  const [corrLoading, setCorrLoading] = useState(false)
  const [pendingCorrection, setPendingCorrection] = useState<{ id: string; date: string } | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function showToast(msg: string, type: Toast['type']) {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  useEffect(() => {
    if (!pendingCorrection) {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
      return
    }
    const check = async () => {
      try {
        const s = await getCorrectionStatus(pendingCorrection.id)
        if (s.status === 'approved') {
          showToast(`Korrektur für ${pendingCorrection.date} genehmigt`, 'success')
          setPendingCorrection(null)
        } else if (s.status === 'rejected') {
          const note = s.review_note ? ` Grund: ${s.review_note}` : ''
          showToast(`Korrektur für ${pendingCorrection.date} abgelehnt.${note}`, 'error')
          setPendingCorrection(null)
        }
      } catch {
        /* nächstes Intervall */
      }
    }
    check()
    pollRef.current = setInterval(check, 15000)
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [pendingCorrection])

  async function sendAction(action: ZeitAction, opts: { art_der_arbeit?: string } = {}) {
    setLoadingAction(action)
    try {
      const res = await zeitAction(action, { recorded_at: new Date().toISOString(), ...opts })
      showToast(res.reply, 'success')
      if (action === 'clock_in')     setStempel({ clockedIn: true, startedAt: Date.now(), onBreak: false, breakStartedAt: null })
      if (action === 'clock_out')    setStempel({ clockedIn: false, startedAt: null, onBreak: false, breakStartedAt: null })
      if (action === 'start_break')  setStempel(s => ({ ...s, onBreak: true, breakStartedAt: Date.now() }))
      if (action === 'end_break')    setStempel(s => ({ ...s, onBreak: false, breakStartedAt: null }))
      refreshStatus()
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onLoggedOut()
        return
      }
      showToast(
        isOfflineError(err) ? 'Keine Internetverbindung' : 'Fehler beim Senden',
        'error',
      )
    } finally {
      setLoadingAction(null)
    }
  }

  function handlePrimary() {
    if (loadingAction) return
    sendAction(stempel.clockedIn ? 'clock_out' : 'clock_in')
  }

  function handlePauseToggle() {
    if (loadingAction || !stempel.clockedIn) return
    sendAction(stempel.onBreak ? 'end_break' : 'start_break')
  }

  async function handleCorrectionSubmit() {
    if (!corrForm.clock_in || !corrForm.clock_out || !corrForm.reason.trim()) return
    setCorrLoading(true)
    try {
      const res = await submitCorrectionRequest(corrForm)
      showToast(res.reply, res.action_taken ? 'success' : 'info')
      if (res.correction_id) {
        setPendingCorrection({ id: res.correction_id, date: corrForm.date })
      }
      setShowCorrection(false)
      setCorrForm({ date: today(), clock_in: '', clock_out: '', break_minutes: 0, reason: '' })
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onLoggedOut()
        return
      }
      let msg = 'Fehler beim Einreichen'
      if (isOfflineError(err)) msg = 'Keine Internetverbindung'
      else if (err instanceof ApiError && err.status === 409 && err.message === 'absence_on_date') {
        msg = 'Für diesen Tag ist bereits eine Absenz genehmigt — keine Zeitkorrektur möglich.'
      }
      showToast(msg, 'error')
    } finally {
      setCorrLoading(false)
    }
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Meine Zeiterfassung</div>
          <div className="admin-page-subtitle">Ein-/Ausstempeln, Pausen und Korrekturen für dich persönlich.</div>
        </div>
      </div>

      {pendingCorrection && (
        <div
          style={{
            background: 'var(--warning-soft)',
            border: '1px solid var(--warning)',
            color: 'var(--warning)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--s-3) var(--s-4)',
            marginBottom: 'var(--s-4)',
            fontSize: 13,
          }}
        >
          Korrekturantrag für {pendingCorrection.date} eingereicht – warte auf Genehmigung…
        </div>
      )}

      {/* Hero-Stempelkarte */}
      <div className="admin-kpi-card" style={{ cursor: 'default', marginBottom: 'var(--s-5)', maxWidth: 520 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div className="admin-kpi-label">
              {stempel.clockedIn
                ? (stempel.onBreak ? 'In Pause seit' : 'Eingestempelt um')
                : 'Ausgestempelt'}
            </div>
            <div
              className="admin-kpi-value"
              style={{
                fontFamily: 'DM Mono, ui-monospace, SFMono-Regular, monospace',
                color: stempel.clockedIn
                  ? (stempel.onBreak ? 'var(--warning)' : 'var(--success)')
                  : 'var(--text-muted)',
                marginTop: 4,
              }}
            >
              {stempel.clockedIn
                ? (stempel.onBreak && stempel.breakStartedAt
                    ? formatClock(stempel.breakStartedAt)
                    : sessionStatus?.clock_in
                      ? formatClockIn(sessionStatus.clock_in)
                      : stempel.startedAt
                        ? formatClock(stempel.startedAt)
                        : '--:--')
                : '--:--'}
            </div>
          </div>
          <div
            className={`admin-kpi-icon ${stempel.clockedIn ? 'green' : 'blue'}`}
            style={{ width: 56, height: 56 }}
          >
            {stempel.clockedIn ? <IconStop /> : <IconPlay />}
          </div>
        </div>
      </div>

      {/* Aktions-Buttons */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s-3)', marginBottom: 'var(--s-6)' }}>
        <button
          className={`admin-btn admin-btn-hero ${stempel.clockedIn ? 'admin-btn-danger' : 'admin-btn-success'}`}
          onClick={handlePrimary}
          disabled={loadingAction !== null}
          style={{ minWidth: 220 }}
        >
          {stempel.clockedIn ? <IconStop /> : <IconPlay />}
          {loadingAction === 'clock_in' || loadingAction === 'clock_out'
            ? '…'
            : (stempel.clockedIn ? 'Ausstempeln' : 'Einstempeln')}
        </button>

        <button
          className="admin-btn admin-btn-secondary"
          onClick={handlePauseToggle}
          disabled={loadingAction !== null || !stempel.clockedIn}
          style={{ padding: 'var(--s-3) var(--s-5)' }}
          title={stempel.clockedIn ? undefined : 'Zuerst einstempeln'}
        >
          {stempel.onBreak ? <IconPauseEnd /> : <IconPause />}
          {loadingAction === 'start_break' || loadingAction === 'end_break'
            ? '…'
            : (stempel.onBreak ? 'Pause beenden' : 'Pause')}
        </button>
      </div>

      {/* Korrekturantrag */}
      <div style={{ maxWidth: 520 }}>
        <button
          className="admin-btn admin-btn-secondary"
          onClick={() => setShowCorrection(v => !v)}
          style={{ marginBottom: 14 }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          {showCorrection ? 'Korrekturantrag schliessen' : 'Arbeitszeit korrigieren'}
        </button>

        {showCorrection && (
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--s-4)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--s-3)',
              boxShadow: 'var(--shadow-card)',
            }}
          >
            <div className="admin-form-group">
              <label className="admin-form-label">Datum</label>
              <input
                className="admin-form-input"
                type="date"
                value={corrForm.date}
                onChange={e => setCorrForm(f => ({ ...f, date: e.target.value }))}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="admin-form-group">
                <label className="admin-form-label">Einstempel</label>
                <input
                  className="admin-form-input"
                  type="time"
                  value={corrForm.clock_in}
                  onChange={e => setCorrForm(f => ({ ...f, clock_in: e.target.value }))}
                />
              </div>
              <div className="admin-form-group">
                <label className="admin-form-label">Ausstempel</label>
                <input
                  className="admin-form-input"
                  type="time"
                  value={corrForm.clock_out}
                  onChange={e => setCorrForm(f => ({ ...f, clock_out: e.target.value }))}
                />
              </div>
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label">Pause (Min)</label>
              <input
                className="admin-form-input"
                type="number"
                min="0"
                value={corrForm.break_minutes}
                onChange={e => setCorrForm(f => ({ ...f, break_minutes: Number(e.target.value) }))}
              />
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label">Grund</label>
              <input
                className="admin-form-input"
                type="text"
                placeholder="Vergessen einzustempeln, etc."
                value={corrForm.reason}
                onChange={e => setCorrForm(f => ({ ...f, reason: e.target.value }))}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <button
                className="admin-btn admin-btn-secondary"
                onClick={() => setShowCorrection(false)}
                disabled={corrLoading}
              >
                Abbrechen
              </button>
              <button
                className="admin-btn admin-btn-primary"
                onClick={handleCorrectionSubmit}
                disabled={
                  corrLoading ||
                  !corrForm.clock_in ||
                  !corrForm.clock_out ||
                  !corrForm.reason.trim()
                }
              >
                {corrLoading ? '…' : 'Einreichen'}
              </button>
            </div>
          </div>
        )}
      </div>

      {toast && (
        <div className="admin-toast-container">
          <div className={`admin-toast ${toast.type}`} style={{ pointerEvents: 'auto' }}>
            {toast.msg}
          </div>
        </div>
      )}
    </div>
  )
}
