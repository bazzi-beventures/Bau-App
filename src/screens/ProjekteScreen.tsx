import { useEffect, useState } from 'react'
import { apiFetch, ApiError } from '../api/client'

interface Termin {
  datum: string
  uhrzeit: string
  notiz: string
}

interface Kontakt {
  name: string
  rolle: string
  telefon: string
  email: string
}

interface Project {
  id: string
  name: string
  art_der_arbeit: string | null
  auftraggeber: string | null
  eigentuemer: string | null
  customer_name: string | null
  customer_address: string | null
  termine: Termin[]
  kontakte: Kontakt[]
}

interface Props {
  logoUrl?: string
  onNavHome: () => void
  onNavRapport: () => void
  onNavProfile: () => void
  onLoggedOut: () => void
}

function nextTermin(termine: Termin[]): Termin | null {
  const today = new Date().toISOString().slice(0, 10)
  const upcoming = termine.filter(t => t.datum >= today).sort((a, b) => a.datum.localeCompare(b.datum))
  return upcoming[0] ?? null
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

export default function ProjekteScreen({ logoUrl, onNavHome, onNavRapport, onNavProfile, onLoggedOut }: Props) {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const data = await apiFetch('/pwa/projects') as Project[]
        if (!cancelled) setProjects(data)
      } catch (err) {
        if (!cancelled && err instanceof ApiError && err.status === 401) onLoggedOut()
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  return (
    <div className="app-screen">
      {/* Header */}
      <div className="inner-header">
        <div className="inner-title">Projekte</div>
        {logoUrl && <img src={logoUrl} alt="Logo" className="header-logo" />}
      </div>

      {/* Content */}
      <div className="projekte-scroll">
        {loading && (
          <div className="bericht-loading">Projekte werden geladen…</div>
        )}

        {!loading && projects.length === 0 && (
          <div className="projekte-empty">Keine offenen Projekte vorhanden.</div>
        )}

        {!loading && projects.map(p => {
          const termin = nextTermin(p.termine ?? [])
          const isOpen = expanded === p.id

          return (
            <div
              key={p.id}
              className={`projekt-card${isOpen ? ' projekt-card-open' : ''}`}
              onClick={() => setExpanded(isOpen ? null : p.id)}
            >
              <div className="projekt-card-header">
                <div className="projekt-card-title">{p.name}</div>
                <div className="projekt-card-meta">
                  {p.art_der_arbeit && (
                    <span className="projekt-badge">{p.art_der_arbeit}</span>
                  )}
                  <svg
                    className={`projekt-chevron${isOpen ? ' projekt-chevron-open' : ''}`}
                    viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"
                  >
                    <path d="M4 6l4 4 4-4"/>
                  </svg>
                </div>
              </div>

              {isOpen && (
                <div className="projekt-card-body">
                  {p.auftraggeber && (
                    <div className="projekt-row">
                      <span className="projekt-row-label">Auftraggeber</span>
                      <span className="projekt-row-value">{p.auftraggeber}</span>
                    </div>
                  )}
                  {p.eigentuemer && (
                    <div className="projekt-row">
                      <span className="projekt-row-label">Eigentümer</span>
                      <span className="projekt-row-value">{p.eigentuemer}</span>
                    </div>
                  )}
                  {p.customer_name && (
                    <div className="projekt-row">
                      <span className="projekt-row-label">Kunde</span>
                      <span className="projekt-row-value">{p.customer_name}</span>
                    </div>
                  )}
                  {p.customer_address && (
                    <div className="projekt-row">
                      <span className="projekt-row-label">Adresse</span>
                      <span className="projekt-row-value">{p.customer_address}</span>
                    </div>
                  )}

                  {termin && (
                    <div className="projekt-row projekt-row-highlight">
                      <span className="projekt-row-label">Nächster Termin</span>
                      <span className="projekt-row-value">
                        {formatDate(termin.datum)}
                        {termin.uhrzeit && ` ${termin.uhrzeit}`}
                        {termin.notiz && ` — ${termin.notiz}`}
                      </span>
                    </div>
                  )}

                  {(p.kontakte ?? []).length > 0 && (
                    <div className="projekt-kontakte">
                      <div className="projekt-row-label" style={{ marginBottom: 6 }}>Kontakte</div>
                      {p.kontakte.map((k, i) => (
                        <div key={i} className="projekt-kontakt">
                          <div className="projekt-kontakt-name">{k.name} <span className="projekt-kontakt-rolle">({k.rolle})</span></div>
                          <div className="projekt-kontakt-links">
                            {k.telefon && (
                              <a className="projekt-kontakt-link" href={`tel:${k.telefon}`} onClick={e => e.stopPropagation()}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.62 3.38 2 2 0 0 1 3.62 1.22h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.82a16 16 0 0 0 6.29 6.29l.95-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
                                </svg>
                                {k.telefon}
                              </a>
                            )}
                            {k.email && (
                              <a className="projekt-kontakt-link" href={`mailto:${k.email}`} onClick={e => e.stopPropagation()}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                                  <polyline points="22,6 12,13 2,6"/>
                                </svg>
                                {k.email}
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
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
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-blue)" strokeWidth="1.8">
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
