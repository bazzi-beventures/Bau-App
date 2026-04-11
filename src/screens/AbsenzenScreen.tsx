import { useState, useEffect } from 'react'
import { fetchMyAbsences, createAbsenceRequest, UserAbsence, AbsenceCreatePayload } from '../api/chat'
import { ApiError } from '../api/client'

interface Props {
  logoUrl?: string
  onBack: () => void
  onNavHome: () => void
  onNavRapport: () => void
  onNavProfile: () => void
  onLoggedOut: () => void
}

const TYPE_LABELS: Record<string, string> = {
  vacation: 'Urlaub',
  sick: 'Krankheit',
  public_holiday: 'Feiertag',
  other: 'Sonstiges',
}

const STATUS_LABELS: Record<string, string> = {
  requested: 'Pendent',
  approved: 'Genehmigt',
  rejected: 'Abgelehnt',
}

function fmtDate(iso: string): string {
  try {
    const [y, m, d] = iso.split('-')
    return `${d}.${m}.${y}`
  } catch {
    return iso
  }
}

function dayCount(start: string, end: string): string {
  const d = (new Date(end).getTime() - new Date(start).getTime()) / 86400000 + 1
  return d > 1 ? `${Math.round(d)} Tage` : '1 Tag'
}

const today = () => new Date().toISOString().slice(0, 10)

export default function AbsenzenScreen({ logoUrl, onBack, onNavHome, onNavRapport, onNavProfile, onLoggedOut }: Props) {
  const [absences, setAbsences] = useState<UserAbsence[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<AbsenceCreatePayload>({
    absence_type: 'vacation',
    date_start: today(),
    date_end: today(),
    comment: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [msg, setMsg] = useState<{ text: string; isError: boolean } | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      setAbsences(await fetchMyAbsences())
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) { onLoggedOut(); return }
      setError('Fehler beim Laden der Absenzen.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleSubmit() {
    if (!form.date_start || !form.date_end) return
    if (form.date_end < form.date_start) {
      setMsg({ text: 'Enddatum muss nach dem Startdatum liegen.', isError: true })
      return
    }
    setSubmitting(true)
    setMsg(null)
    try {
      await createAbsenceRequest(form)
      setMsg({ text: `${TYPE_LABELS[form.absence_type]} wurde eingereicht.`, isError: false })
      setShowForm(false)
      setForm({ absence_type: 'vacation', date_start: today(), date_end: today(), comment: '' })
      load()
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) { onLoggedOut(); return }
      setMsg({ text: 'Fehler beim Einreichen. Bitte erneut versuchen.', isError: true })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="app-screen">
      {/* Header */}
      <div className="inner-header">
        <div className="back-btn" onClick={onBack}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </div>
        <div className="inner-title">Absenzen</div>
        {logoUrl && <img src={logoUrl} alt="Logo" className="header-logo" />}
      </div>

      {/* Banner */}
      <div className="context-banner context-banner-green">
        <div className="banner-tag banner-tag-green">Absenzen</div>
        <div className="banner-text">Urlaub, Krankheit und andere Abwesenheiten verwalten.</div>
      </div>

      {/* Feedback */}
      {msg && (
        <div className={`action-result${msg.isError ? ' action-result-error' : ''}`}>
          {msg.text}
        </div>
      )}

      {/* Neuer Antrag */}
      <div className="menu-list">
        <div
          className="menu-item"
          onClick={() => { setShowForm(v => !v); setMsg(null) }}
        >
          <div className="menu-icon menu-icon-green">
            <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="1.8">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="16"/>
              <line x1="8" y1="12" x2="16" y2="12"/>
            </svg>
          </div>
          <div className="menu-text">
            <div className="menu-label">Abwesenheit beantragen</div>
            <div className="menu-sub">Urlaub, Krankheit oder Sonstiges</div>
          </div>
          <div className="menu-chevron">{showForm ? '∨' : '›'}</div>
        </div>

        {showForm && (
          <div className="correction-form">
            <div className="corr-row">
              <label className="corr-label">Typ</label>
              <select
                className="corr-input"
                value={form.absence_type}
                onChange={e => setForm(f => ({ ...f, absence_type: e.target.value as AbsenceCreatePayload['absence_type'] }))}
              >
                <option value="vacation">Urlaub</option>
                <option value="sick">Krankheit</option>
                <option value="public_holiday">Feiertag</option>
                <option value="other">Sonstiges</option>
              </select>
            </div>
            <div className="corr-row">
              <label className="corr-label">Von</label>
              <input
                className="corr-input"
                type="date"
                value={form.date_start}
                onChange={e => setForm(f => ({ ...f, date_start: e.target.value }))}
              />
            </div>
            <div className="corr-row">
              <label className="corr-label">Bis</label>
              <input
                className="corr-input"
                type="date"
                value={form.date_end}
                onChange={e => setForm(f => ({ ...f, date_end: e.target.value }))}
              />
            </div>
            <div className="corr-row">
              <label className="corr-label">Bemerkung</label>
              <input
                className="corr-input"
                type="text"
                placeholder="Optional"
                value={form.comment}
                onChange={e => setForm(f => ({ ...f, comment: e.target.value }))}
              />
            </div>
            <div className="corr-actions">
              <button
                className="corr-btn corr-btn-cancel"
                onClick={() => setShowForm(false)}
                disabled={submitting}
              >
                Abbrechen
              </button>
              <button
                className="corr-btn corr-btn-submit"
                onClick={handleSubmit}
                disabled={submitting || !form.date_start || !form.date_end}
              >
                {submitting ? '…' : 'Einreichen'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Absenzenliste */}
      <div className="bericht-scroll" style={{ marginTop: 8 }}>
        {loading && <div className="bericht-loading">Laden…</div>}
        {error && (
          <div className="action-result action-result-error" style={{ margin: '8px 24px' }}>{error}</div>
        )}
        {!loading && !error && absences.length === 0 && (
          <div className="bericht-loading" style={{ color: 'var(--muted)' }}>Keine Absenzen vorhanden.</div>
        )}
        {!loading && !error && absences.length > 0 && (
          <div className="bericht-table-wrap">
            <table className="bericht-table">
              <thead>
                <tr>
                  <th>Typ</th>
                  <th>Von</th>
                  <th>Bis</th>
                  <th>Dauer</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {absences.map((a, i) => (
                  <tr key={a.id ?? i}>
                    <td>{TYPE_LABELS[a.type] ?? a.type}</td>
                    <td className="bericht-mono">{fmtDate(a.date_start)}</td>
                    <td className="bericht-mono">{fmtDate(a.date_end)}</td>
                    <td className="bericht-muted">{dayCount(a.date_start, a.date_end)}</td>
                    <td>
                      <span className={
                        a.status === 'approved' ? 'bericht-positive' :
                        a.status === 'rejected' ? 'bericht-negative' :
                        'bericht-muted'
                      } style={{ fontWeight: 600, fontSize: 13 }}>
                        {STATUS_LABELS[a.status] ?? a.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
