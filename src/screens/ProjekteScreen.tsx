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
  onNavArbeitszeit: () => void
  onNavProfile: () => void
  onLoggedOut: () => void
}

function nextTermin(termine: Termin[]): Termin | null {
  const today = new Date().toISOString().slice(0, 10)
  const upcoming = (termine ?? []).filter(t => t.datum >= today).sort((a, b) => a.datum.localeCompare(b.datum))
  return upcoming[0] ?? null
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

export default function ProjekteScreen({ logoUrl, onNavHome, onNavRapport, onNavArbeitszeit, onNavProfile, onLoggedOut }: Props) {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Project | null>(null)

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

  // ── Detail-Ansicht ──────────────────────────────────────────
  if (selected) {
    const termin = nextTermin(selected.termine)
    return (
      <div className="app-screen">
        <div className="inner-header">
          <div className="back-btn" onClick={() => setSelected(null)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
          </div>
          <div className="inner-title">{selected.name}</div>
          {logoUrl && <img src={logoUrl} alt="Logo" className="header-logo" />}
        </div>

        <div className="projekte-detail-scroll">
          {selected.art_der_arbeit && (
            <div className="projekte-detail-badge-row">
              <span className="projekte-detail-badge">{selected.art_der_arbeit}</span>
            </div>
          )}

          {/* Projektinfos */}
          <div className="projekte-detail-card">
            <div className="projekte-detail-title">Projektinfos</div>
            {selected.auftraggeber && (
              <div className="projekte-detail-row">
                <span className="projekte-detail-label">Auftraggeber</span>
                <span className="projekte-detail-value">{selected.auftraggeber}</span>
              </div>
            )}
            {selected.eigentuemer && (
              <div className="projekte-detail-row">
                <span className="projekte-detail-label">Eigentümer</span>
                <span className="projekte-detail-value">{selected.eigentuemer}</span>
              </div>
            )}
            {selected.customer_name && (
              <div className="projekte-detail-row">
                <span className="projekte-detail-label">Kunde</span>
                <span className="projekte-detail-value">{selected.customer_name}</span>
              </div>
            )}
            {selected.customer_address && (
              <div className="projekte-detail-row">
                <span className="projekte-detail-label">Adresse</span>
                <span className="projekte-detail-value">{selected.customer_address}</span>
              </div>
            )}
            {!selected.auftraggeber && !selected.eigentuemer && !selected.customer_name && !selected.customer_address && (
              <div className="projekte-detail-empty">Keine weiteren Informationen eingetragen.</div>
            )}
          </div>

          {/* Nächster Termin */}
          {termin && (
            <div className="projekte-detail-card projekte-detail-card-accent">
              <div className="projekte-detail-title">Nächster Termin</div>
              <div className="projekte-detail-termin-date">
                {formatDate(termin.datum)}{termin.uhrzeit ? ` · ${termin.uhrzeit}` : ''}
              </div>
              {termin.notiz && <div className="projekte-detail-termin-notiz">{termin.notiz}</div>}
            </div>
          )}

          {/* Alle Termine */}
          {(selected.termine ?? []).length > 1 && (
            <div className="projekte-detail-card">
              <div className="projekte-detail-title">Alle Termine</div>
              {selected.termine.map((t, i) => (
                <div key={i} className="projekte-detail-row">
                  <span className="projekte-detail-label">{formatDate(t.datum)}{t.uhrzeit ? ` ${t.uhrzeit}` : ''}</span>
                  <span className="projekte-detail-value">{t.notiz || '—'}</span>
                </div>
              ))}
            </div>
          )}

          {/* Kontakte */}
          {(selected.kontakte ?? []).length > 0 && (
            <div className="projekte-detail-card">
              <div className="projekte-detail-title">Kontakte</div>
              {selected.kontakte.map((k, i) => (
                <div key={i} className="projekte-kontakt-item">
                  <div className="projekte-kontakt-item-header">
                    <span className="projekte-kontakt-item-name">{k.name}</span>
                    <span className="projekte-kontakt-item-rolle">{k.rolle}</span>
                  </div>
                  <div className="projekte-kontakt-item-links">
                    {k.telefon && (
                      <a className="projekte-kontakt-link-btn" href={`tel:${k.telefon}`}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.62 3.38 2 2 0 0 1 3.62 1.22h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.82a16 16 0 0 0 6.29 6.29l.95-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
                        </svg>
                        {k.telefon}
                      </a>
                    )}
                    {k.email && (
                      <a className="projekte-kontakt-link-btn" href={`mailto:${k.email}`}>
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
          <div className="nav-item" onClick={onNavArbeitszeit}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            <span>Arbeitszeit</span>
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

  // ── Kachel-Übersicht ────────────────────────────────────────
  return (
    <div className="app-screen">
      <div className="inner-header">
        <div className="inner-title">Meine Projekte</div>
        {logoUrl && <img src={logoUrl} alt="Logo" className="header-logo" />}
      </div>

      <div className="projekte-grid-scroll">
        {loading && (
          <div className="bericht-loading">Projekte werden geladen…</div>
        )}

        {!loading && projects.length === 0 && (
          <div className="projekte-empty">Du bist keinem Projekt zugewiesen.</div>
        )}

        {!loading && projects.length > 0 && (
          <div className="projekte-grid">
            {projects.map(p => {
              const termin = nextTermin(p.termine)
              return (
                <div key={p.id} className="projekte-tile" onClick={() => setSelected(p)}>
                  <div className="projekte-tile-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-amber)" strokeWidth="1.8">
                      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                      <path d="M9 22V12h6v10"/>
                    </svg>
                  </div>
                  <div className="projekte-tile-name">{p.name}</div>
                  <div className="projekte-tile-sub">
                    {p.art_der_arbeit || p.auftraggeber || p.customer_name || '—'}
                  </div>
                  {termin && (
                    <div className="projekte-tile-termin">
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="1" y="3" width="14" height="12" rx="2"/>
                        <path d="M5 1v3M11 1v3M1 7h14"/>
                      </svg>
                      {formatDate(termin.datum)}
                    </div>
                  )}
                  <div className="projekte-tile-arrow">
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 8h10M9 4l4 4-4 4"/>
                    </svg>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

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
        <div className="nav-item" onClick={onNavArbeitszeit}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          <span>Arbeitszeit</span>
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
