import { useEffect, useRef, useState } from 'react'
import { apiFetch, ApiError, apiFormFetch } from '../api/client'

interface Termin {
  datum: string
  uhrzeit: string
  notiz: string
}

interface Kontakt {
  name: string
  kommentar: string
  telefon: string
  email: string
}

interface EmbeddedCustomer {
  id: string
  name: string | null
  billing_name: string | null
  address: string | null
  billing_address: string | null
  object_address: string | null
  email: string | null
  phone: string | null
}

interface Project {
  id: string
  name: string
  art_der_arbeit: string | null
  auftraggeber: string | null
  eigentuemer: string | null
  customer_id: string | null
  customer: EmbeddedCustomer | null
  object_address: string | null
  local_contact_name: string | null
  local_contact_phone: string | null
  termine: Termin[]
  kontakte: Kontakt[]
  bemerkung: string | null
}

interface ProjectFile {
  id: string
  filename: string
  file_url: string | null
  mime_type: string | null
  created_at: string
}

interface ProjectComment {
  id: string
  author_name: string | null
  text: string
  created_at: string
}

interface Props {
  logoUrl?: string
  onNavHome: () => void
  onNavRapport: () => void
  onStartRapport: (projectName: string) => void
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

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
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
  start: string
  days: string[]
  todayIndex: number
}

interface ProjectSpan {
  project: Project
  firstDatum: string | null
  lastDatum: string | null
  startOffset: number
  length: number
  terminIndices: number[]
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

  spans.sort((a, b) => {
    if (!a.firstDatum && !b.firstDatum) return a.project.name.localeCompare(b.project.name)
    if (!a.firstDatum) return 1
    if (!b.firstDatum) return -1
    return a.firstDatum.localeCompare(b.firstDatum)
  })

  return { info: { start: startISO, days, todayIndex }, spans }
}

export default function ProjekteScreen({ logoUrl, onNavHome, onNavRapport, onStartRapport, onNavArbeitszeit, onNavProfile, onLoggedOut }: Props) {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Project | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('grid')

  // Detail: Dateien & Kommentare
  const [files, setFiles] = useState<ProjectFile[]>([])
  const [comments, setComments] = useState<ProjectComment[]>([])
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [newComment, setNewComment] = useState('')
  const [addingComment, setAddingComment] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  useEffect(() => {
    if (!selected) return
    setFiles([])
    setComments([])
    setLoadingDetail(true)
    Promise.all([
      apiFetch(`/pwa/projects/${selected.id}/files`).catch(() => []) as Promise<ProjectFile[]>,
      apiFetch(`/pwa/projects/${selected.id}/comments`).catch(() => []) as Promise<ProjectComment[]>,
    ]).then(([f, c]) => {
      setFiles(f)
      setComments(c)
    }).finally(() => setLoadingDetail(false))
  }, [selected?.id])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!selected || !e.target.files?.length) return
    const file = e.target.files[0]
    const form = new FormData()
    form.append('file', file)
    setUploading(true)
    try {
      await apiFormFetch(`/pwa/projects/${selected.id}/files`, form)
      const updated = await apiFetch(`/pwa/projects/${selected.id}/files`) as ProjectFile[]
      setFiles(updated)
    } catch {
      // silently ignore upload errors in user view
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleAddComment() {
    if (!selected || !newComment.trim()) return
    setAddingComment(true)
    try {
      await apiFetch(`/pwa/projects/${selected.id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ text: newComment.trim() }),
      })
      const updated = await apiFetch(`/pwa/projects/${selected.id}/comments`) as ProjectComment[]
      setComments(updated)
      setNewComment('')
    } catch {
      // silently ignore
    } finally {
      setAddingComment(false)
    }
  }

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

          {/* Bemerkung — rot hervorgehoben */}
          {selected.bemerkung && (
            <div className="projekte-detail-card" style={{ background: '#fff0f0', border: '1.5px solid #e53e3e' }}>
              <div className="projekte-detail-title" style={{ color: '#c53030' }}>Hinweis</div>
              <div style={{ fontSize: 14, color: '#c53030', fontWeight: 500, whiteSpace: 'pre-wrap' }}>
                {selected.bemerkung}
              </div>
            </div>
          )}

          {/* Rapport erstellen */}
          <button
            type="button"
            onClick={() => onStartRapport(selected.name)}
            style={{
              width: '100%',
              padding: '14px 16px',
              marginBottom: 12,
              borderRadius: 12,
              border: 'none',
              background: 'var(--accent-blue)',
              color: '#fff',
              fontSize: 15,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
            }}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="12" y1="11" x2="12" y2="17"/>
              <line x1="9" y1="14" x2="15" y2="14"/>
            </svg>
            Rapport erstellen
          </button>

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
            {(selected.customer?.billing_name || selected.customer?.name) && (
              <div className="projekte-detail-row">
                <span className="projekte-detail-label">Kunde</span>
                <span className="projekte-detail-value">{selected.customer?.billing_name || selected.customer?.name}</span>
              </div>
            )}
            {selected.object_address && (
              <div className="projekte-detail-row">
                <span className="projekte-detail-label">Objektadresse</span>
                <span className="projekte-detail-value">{selected.object_address}</span>
              </div>
            )}
            {selected.local_contact_name && (
              <div className="projekte-detail-row">
                <span className="projekte-detail-label">Vor Ort</span>
                <span className="projekte-detail-value">
                  {selected.local_contact_name}
                  {selected.local_contact_phone ? ` · ${selected.local_contact_phone}` : ''}
                </span>
              </div>
            )}
            {!selected.auftraggeber && !selected.eigentuemer && !selected.customer && !selected.object_address && !selected.local_contact_name && (
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
                    {k.kommentar && <span className="projekte-kontakt-item-rolle">{k.kommentar}</span>}
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

          {/* Dokumente & Fotos */}
          {!loadingDetail && (
            <div className="projekte-detail-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div className="projekte-detail-title" style={{ margin: 0 }}>Dokumente & Fotos</div>
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    style={{ display: 'none' }}
                    onChange={handleUpload}
                  />
                  <button
                    type="button"
                    className="projekte-kontakt-link-btn"
                    style={{ fontSize: 12 }}
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {uploading ? 'Lädt…' : '+ Hochladen'}
                  </button>
                </div>
              </div>
              {files.length === 0 && (
                <div className="projekte-detail-empty">Noch keine Dateien hochgeladen.</div>
              )}
              {files.map(f => (
                <div key={f.id} className="projekte-detail-row" style={{ alignItems: 'center' }}>
                  <span style={{ fontSize: 16 }}>{f.mime_type === 'application/pdf' ? '📄' : '🖼️'}</span>
                  <span className="projekte-detail-value" style={{ flex: 1 }}>
                    {f.file_url
                      ? <a href={f.file_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-blue)', textDecoration: 'none' }}>{f.filename}</a>
                      : f.filename
                    }
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted, #888)', marginTop: 1 }}>{formatDateTime(f.created_at)}</span>
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Kommentare */}
          {!loadingDetail && (
            <div className="projekte-detail-card">
              <div className="projekte-detail-title">Kommentare</div>
              {comments.length === 0 && (
                <div className="projekte-detail-empty" style={{ marginBottom: 10 }}>Noch keine Kommentare.</div>
              )}
              {comments.map(c => (
                <div key={c.id} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid var(--card-border, #eee)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{c.author_name || 'Unbekannt'}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted, #888)' }}>{formatDateTime(c.created_at)}</span>
                  </div>
                  <div style={{ fontSize: 13 }}>{c.text}</div>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <input
                  style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--card-border, #ddd)', fontSize: 13, background: 'var(--surface, #fff)', color: 'var(--text)' }}
                  placeholder="Kommentar…"
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void handleAddComment() } }}
                />
                <button
                  type="button"
                  disabled={addingComment || !newComment.trim()}
                  onClick={handleAddComment}
                  style={{ padding: '8px 14px', borderRadius: 8, background: 'var(--accent-blue)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: addingComment || !newComment.trim() ? 0.5 : 1 }}
                >
                  {addingComment ? '…' : 'Senden'}
                </button>
              </div>
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
                            {p.art_der_arbeit || p.auftraggeber || p.customer?.billing_name || p.customer?.name || '—'}
                          </div>
                          {p.bemerkung && (
                            <div style={{ fontSize: 11, color: '#c53030', fontWeight: 600, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              ⚠ {p.bemerkung}
                            </div>
                          )}
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
