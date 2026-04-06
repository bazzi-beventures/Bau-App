import { useEffect, useState } from 'react'
import { apiFetch, ApiError } from '../api/client'

interface Props {
  displayName: string
  logoUrl?: string
  role: string
  onNavRapport: () => void
  onNavArbeitszeit: () => void
  onNavProfile: () => void
  onNavKennzahlen: () => void
  onLoggedOut: () => void
}

interface SessionStatus {
  status: 'active' | 'inactive' | 'on_break'
  clock_in: string | null
  since_minutes: number
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 11) return 'Guten Morgen'
  if (h < 17) return 'Guten Tag'
  return 'Guten Abend'
}

function getDateStr() {
  return new Date().toLocaleDateString('de-CH', {
    weekday: 'short', day: 'numeric', month: 'long', year: 'numeric'
  })
}

function formatClockIn(isoUtc: string): string {
  const dt = new Date(isoUtc)
  return dt.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Zurich' })
}

export default function HomeScreen({ displayName, logoUrl, role, onNavRapport, onNavArbeitszeit, onNavProfile, onNavKennzahlen, onLoggedOut }: Props) {
  const firstName = displayName.split(' ')[0]
  const isAdmin = role === 'admin' || role === 'superadmin'
  const [sessionStatus, setSessionStatus] = useState<SessionStatus | null>(null)

  useEffect(() => {
    let cancelled = false
    async function fetchStatus() {
      try {
        const data = await apiFetch('/pwa/status') as SessionStatus
        if (!cancelled) setSessionStatus(data)
      } catch (err) {
        if (!cancelled && err instanceof ApiError && err.status === 401) onLoggedOut()
      }
    }
    fetchStatus()
    const interval = setInterval(fetchStatus, 30_000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  return (
    <div className="app-screen">
      {/* Header */}
      <div className="home-header">
        <div className="home-header-top">
          <div>
            <div className="home-greeting">{getGreeting()}</div>
            <div className="home-name">{firstName}</div>
          </div>
          {logoUrl && <img src={logoUrl} alt="Logo" className="header-logo" />}
        </div>
        <div className="date-chip">
          <div className="date-dot" />
          {getDateStr()}
        </div>
      </div>

      {/* Tiles */}
      <div className={isAdmin ? 'tiles tiles-3col' : 'tiles'}>
        <div className="tile tile-blue" onClick={onNavRapport}>
          <div className="tile-icon tile-icon-blue">
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-blue)" strokeWidth="1.8">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
          </div>
          <div>
            <div className="tile-label">Rapporte</div>
            <div className="tile-desc">Tagesrapport, Fotos &amp; Notizen</div>
          </div>
          <div className="tile-arrow">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 8h10M9 4l4 4-4 4"/>
            </svg>
          </div>
        </div>

        <div className="tile tile-green" onClick={onNavArbeitszeit}>
          <div className="tile-icon tile-icon-green">
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-green)" strokeWidth="1.8">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>
          <div>
            <div className="tile-label">Arbeitszeit</div>
            <div className="tile-desc">Zeiten, Pausen &amp; Absenzen</div>
          </div>
          <div className="tile-arrow">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 8h10M9 4l4 4-4 4"/>
            </svg>
          </div>
        </div>

        {isAdmin && (
          <div className="tile tile-amber" onClick={onNavKennzahlen}>
            <div className="tile-icon tile-icon-amber">
              <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-amber)" strokeWidth="1.8">
                <line x1="18" y1="20" x2="18" y2="10"/>
                <line x1="12" y1="20" x2="12" y2="4"/>
                <line x1="6" y1="20" x2="6" y2="14"/>
              </svg>
            </div>
            <div>
              <div className="tile-label">Kennzahlen</div>
              <div className="tile-desc">KPIs &amp; Dashboards</div>
            </div>
            <div className="tile-arrow">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 8h10M9 4l4 4-4 4"/>
              </svg>
            </div>
          </div>
        )}
      </div>

      {/* Status card */}
      <div className="home-footer">
        <div className="status-card">
          <div className="status-left">
            <div className="status-label">Status</div>
            {sessionStatus?.status === 'active' && (
              <>
                <div className="status-value" style={{ fontSize: 16, color: '#22c55e' }}>
                  {sessionStatus.clock_in ? formatClockIn(sessionStatus.clock_in) : '—'}
                </div>
                <div className="status-label" style={{ marginTop: 2 }}>Eingestempelt</div>
              </>
            )}
            {sessionStatus?.status === 'on_break' && (
              <>
                <div className="status-value" style={{ fontSize: 16, color: '#f59e0b' }}>
                  {sessionStatus.clock_in ? formatClockIn(sessionStatus.clock_in) : '—'}
                </div>
                <div className="status-label" style={{ marginTop: 2 }}>In Pause</div>
              </>
            )}
            {(!sessionStatus || sessionStatus.status === 'inactive') && (
              <>
                <div className="status-value" style={{ fontSize: 16, color: 'var(--muted)' }}>—</div>
                <div className="status-label" style={{ marginTop: 2 }}>Noch nicht eingestempelt</div>
              </>
            )}
          </div>
          {sessionStatus?.status === 'active' && <div className="status-badge-active">Aktiv</div>}
          {sessionStatus?.status === 'on_break' && <div className="status-badge-inactive" style={{ background: '#fef3c7', color: '#92400e' }}>In Pause</div>}
          {(!sessionStatus || sessionStatus.status === 'inactive') && <div className="status-badge-inactive">Inaktiv</div>}
        </div>
      </div>

      {/* Nav bar */}
      <div className="nav-bar">
        <div className="nav-item active">
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-blue)" strokeWidth="1.8">
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
        <div className="nav-item" onClick={onNavArbeitszeit}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
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
