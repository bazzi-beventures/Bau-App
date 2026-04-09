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

// ── Timeline-Utilities ──────────────────────────────────────
type ViewMode = 'grid' | 'timeline'

const WEEKDAY_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
const MONTH_SHORT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function toISO(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function addDays(iso: string, days: number): string {
  const d = parseISO(iso)
  d.setDate(d.getDate() + days)
  return toISO(d)
}

function diffDays(startISO: string, endISO: string): number {
  const ms = parseISO(endISO).getTime() - parseISO(startISO).getTime()
  return Math.round(ms / 86400000)
}

interface TimelineInfo {
  start: string            // erster Tag der Achse
  days: string[]           // alle Tage im Fenster (ISO)
  todayIndex: number       // Index von heute in days (-1 falls außerhalb)
}

interface ProjectSpan {
  project: Project
  firstDatum: string | null
  lastDatum: string | null
  startOffset: number      // Index in days
  length: number           // Anzahl Tage
  terminIndices: number[]  // Indices der einzelnen Termine
}

function buildTimeline(projects: Project[]): { info: TimelineInfo; spans: ProjectSpan[] } {
  const today = toISO(new Date())
  const allDates: string[] = []
  projects.forEach(p => (p.termine ?? []).forEach(t => { if (t.datum) allDates.push(t.datum) }))

  let startISO = today
  let endISO = addDays(today, 13)
  if (allDates.length > 0) {
    const minDate = allDates.reduce((a, b) => a < b ? a : b)
    const maxDate = allDates.reduce((a, b) => a > b ? a : b)
    startISO = minDate < today ? minDate : today
    endISO = maxDate > addDays(today, 13) ? maxDate : addDays(today, 13)
  }

  // Mindestens ein paar Tage Puffer am Ende
  endISO = addDays(endISO, 1)

  const dayCount = diffDays(startISO, endISO) + 1
  const days: string[] = []
  for (let i = 0; i < dayCount; i++) days.push(addDays(startISO, i))
  const todayIndex = days.indexOf(today)

  const spans: ProjectSpan[] = projects.map(p => {
    const sorted = (p.termine ?? [])
      .map(t => t.datum)
      .filter((d): d is string => !!d)
      .sort()
    if (sorted.length === 0) {
      return { project: p, firstDatum: null, lastDatum: null, startOffset: -1, length: 0, terminIndices: [] }
    }
    const first = sorted[0]
    const last = sorted[sorted.length - 1]
    const startOffset = diffDays(startISO, first)
    const length = diffDays(first, last) + 1
    const terminIndices = Array.from(new Set(sorted.map(d => diffDays(startISO, d))))
    return { project: p, firstDatum: first, lastDatum: last, startOffset, length, terminIndices }
  })

  // Projekte ohne Termine ans Ende, sonst chronologisch nach erstem Termin
  spans.sort((a, b) => {
    if (!a.firstDatum && !b.firstDatum) return a.project.name.localeCompare(b.project.name)
    if (!a.firstDatum) return 1
    if (!b.firstDatum) return -1
    return a.firstDatum.localeCompare(b.firstDatum)
  })

  return { info: { start: startISO, days, todayIndex }, spans }
}

export default function ProjekteScreen({ logoUrl, onNavHome, onNavRapport, onNavArbeitszeit, onNavProfile, onLoggedOut }: Props) {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Project | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('grid')

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
  const timeline = viewMode === 'timeline' ? buildTimeline(projects) : null

  return (
    <div className="app-screen">
      <div className="inner-header">
        <div className="inner-title">Meine Projekte</div>
        {logoUrl && <img src={logoUrl} alt="Logo" className="header-logo" />}
      </div>

      {!loading && projects.length > 0 && (
        <div className="projekte-view-toggle">
          <button
            type="button"
            className={`projekte-view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
            onClick={() => setViewMode('grid')}
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="2" y="2" width="5" height="5" rx="1"/>
              <rect x="9" y="2" width="5" height="5" rx="1"/>
              <rect x="2" y="9" width="5" height="5" rx="1"/>
              <rect x="9" y="9" width="5" height="5" rx="1"/>
            </svg>
            Kacheln
          </button>
          <button
            type="button"
            className={`projekte-view-toggle-btn ${viewMode === 'timeline' ? 'active' : ''}`}
            onClick={() => setViewMode('timeline')}
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M2 4h12M2 8h9M2 12h6"/>
            </svg>
            Zeitstrahl
          </button>
        </div>
      )}

      <div className="projekte-grid-scroll">
        {loading && (
          <div className="bericht-loading">Projekte werden geladen…</div>
        )}

        {!loading && projects.length === 0 && (
          <div className="projekte-empty">Du bist keinem Projekt zugewiesen.</div>
        )}

        {!loading && projects.length > 0 && viewMode === 'grid' && (() => {
          // Gruppiere Projekte nach nächstem Termin (Datum). Projekte ohne
          // kommenden Termin landen in einer Fallback-Gruppe am Ende.
          const groupMap = new Map<string, Project[]>()
          const noDateKey = '__none__'
          projects.forEach(p => {
            const t = nextTermin(p.termine)
            const key = t ? t.datum : noDateKey
            const arr = groupMap.get(key) ?? []
            arr.push(p)
            groupMap.set(key, arr)
          })
          const groups = Array.from(groupMap.entries())
            .sort(([a], [b]) => {
              if (a === noDateKey) return 1
              if (b === noDateKey) return -1
              return a.localeCompare(b)
            })

          return (
            <div className="projekte-grouped">
              {groups.map(([dateKey, groupProjects]) => (
                <div key={dateKey} className="projekte-group">
                  <div className="projekte-group-header">
                    <span className="projekte-group-date">
                      {dateKey === noDateKey ? 'Ohne Termin' : formatDate(dateKey)}
                    </span>
                    <span className="projekte-group-line" />
                  </div>
                  <div className="projekte-group-tiles">
                    {groupProjects.map(p => {
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
                              {termin.uhrzeit || formatDate(termin.datum)}
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
                </div>
              ))}
            </div>
          )
        })()}

        {!loading && projects.length > 0 && viewMode === 'timeline' && timeline && (() => {
          const DAY_WIDTH = 36
          const { info, spans } = timeline
          const totalWidth = info.days.length * DAY_WIDTH
          return (
            <div className="projekte-timeline">
              <div className="projekte-timeline-scroll">
                <div className="projekte-timeline-inner" style={{ width: totalWidth }}>
                  {/* Header mit Tagen */}
                  <div className="projekte-timeline-header">
                    {info.days.map((iso, idx) => {
                      const d = parseISO(iso)
                      const isToday = idx === info.todayIndex
                      const isWeekend = d.getDay() === 0 || d.getDay() === 6
                      const showMonth = idx === 0 || d.getDate() === 1
                      return (
                        <div
                          key={iso}
                          className={`projekte-timeline-day ${isToday ? 'today' : ''} ${isWeekend ? 'weekend' : ''}`}
                          style={{ width: DAY_WIDTH }}
                        >
                          <div className="projekte-timeline-day-wd">{WEEKDAY_SHORT[d.getDay()]}</div>
                          <div className="projekte-timeline-day-num">{d.getDate()}</div>
                          {showMonth && (
                            <div className="projekte-timeline-day-month">{MONTH_SHORT[d.getMonth()]}</div>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* Zeilen */}
                  <div className="projekte-timeline-body">
                    {/* Heute-Linie */}
                    {info.todayIndex >= 0 && (
                      <div
                        className="projekte-timeline-today-line"
                        style={{ left: info.todayIndex * DAY_WIDTH + DAY_WIDTH / 2 }}
                      />
                    )}
                    {spans.map(span => (
                      <div
                        key={span.project.id}
                        className="projekte-timeline-row"
                        onClick={() => setSelected(span.project)}
                      >
                        <div className="projekte-timeline-row-grid">
                          {info.days.map(iso => {
                            const d = parseISO(iso)
                            const isWeekend = d.getDay() === 0 || d.getDay() === 6
                            return (
                              <div
                                key={iso}
                                className={`projekte-timeline-cell ${isWeekend ? 'weekend' : ''}`}
                                style={{ width: DAY_WIDTH }}
                              />
                            )
                          })}
                        </div>
                        {span.firstDatum && (
                          <div
                            className="projekte-timeline-bar"
                            style={{
                              left: span.startOffset * DAY_WIDTH + 4,
                              width: Math.max(span.length * DAY_WIDTH - 8, DAY_WIDTH - 8),
                            }}
                          >
                            <span className="projekte-timeline-bar-label">{span.project.name}</span>
                            {span.terminIndices.map(i => (
                              <div
                                key={i}
                                className="projekte-timeline-bar-dot"
                                style={{ left: (i - span.startOffset) * DAY_WIDTH + DAY_WIDTH / 2 - 4 }}
                              />
                            ))}
                          </div>
                        )}
                        {!span.firstDatum && (
                          <div className="projekte-timeline-bar projekte-timeline-bar-empty" style={{ left: 4, width: 120 }}>
                            <span className="projekte-timeline-bar-label">{span.project.name} · keine Termine</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )
        })()}
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
