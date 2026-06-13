import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch, ApiError, apiFormFetch, isOfflineError } from '../api/client'
import { ProjectTask, toggleProjectTaskDone } from '../api/projectTasks'
import { ProjectTimeline } from './projekte/ProjectTimeline'

// Offline-Queue für abgehakte Aufgaben (Monteur ohne Netz auf der Baustelle).
// Siehe ProjektEntwurfScreen für das gleiche Muster (zeit_/projektEntwurf_queue).
const TASK_QUEUE_KEY = 'hinweise_offline_queue'
const MAX_DRAIN_ATTEMPTS = 10

interface QueuedTaskToggle {
  project_id: string
  task_id: string
  is_done: boolean
  queued_at: string
  attempts?: number
}

function loadTaskQueue(): QueuedTaskToggle[] {
  try { return JSON.parse(localStorage.getItem(TASK_QUEUE_KEY) || '[]') } catch { return [] }
}

function saveTaskQueue(q: QueuedTaskToggle[]) {
  localStorage.setItem(TASK_QUEUE_KEY, JSON.stringify(q))
}

// Mehrfaches Togglen derselben Aufgabe kollabiert auf den letzten Stand —
// nur der zuletzt gewünschte is_done-Wert muss synchronisiert werden.
function enqueueTaskToggle(item: QueuedTaskToggle) {
  const q = loadTaskQueue().filter(it => it.task_id !== item.task_id)
  q.push(item)
  saveTaskQueue(q)
}

interface Kontakt {
  name: string
  kommentar: string
  telefon: string
  email: string
  is_site_contact?: boolean
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

type ProjectKind = 'project' | 'teamsitzung' | 'lagerarbeit' | 'werkstatt' | 'sonstiges'

const KIND_LABELS: Record<ProjectKind, string> = {
  project: 'Projekt',
  teamsitzung: 'Teamsitzung',
  lagerarbeit: 'Lagerarbeit',
  werkstatt: 'Werkstatt',
  sonstiges: 'Sonstiges',
}

const KIND_COLORS: Record<ProjectKind, string> = {
  project: 'var(--accent-amber)',
  teamsitzung: '#7c3aed',
  lagerarbeit: '#d97706',
  werkstatt: '#0d9488',
  sonstiges: '#475569',
}

interface Project {
  id: string
  name: string
  kind: ProjectKind
  art_der_arbeit: string[] | null
  customer_id: string | null
  customer: EmbeddedCustomer | null
  object_address: string | null
  start_date: string | null
  end_date: string | null
  start_time: string | null
  end_time: string | null
  kontakte: Kontakt[]
  bemerkung: string | null
  geruestfach: number | null
}

// Kategorien, die ein Mitarbeiter im Feld vergeben darf. Teilmenge der
// Web-View-Kategorien (siehe admin/operative/projectDetail/tabs.tsx) plus
// "lieferschein". Bestellungen/Auftragsbestätigung bleiben dem Admin vorbehalten.
type FileCategory = 'fotos' | 'masse' | 'lieferschein' | 'sonstiges'

const FILE_CATEGORIES: { key: FileCategory; label: string }[] = [
  { key: 'fotos', label: 'Fotos' },
  { key: 'masse', label: 'Masse' },
  { key: 'lieferschein', label: 'Lieferschein' },
  { key: 'sonstiges', label: 'Sonstiges' },
]

const CATEGORY_LABELS: Record<string, string> = {
  fotos: 'Fotos',
  masse: 'Masse',
  lieferschein: 'Lieferschein',
  sonstiges: 'Sonstiges',
  bestellungen: 'Bestellungen',
  auftragsbestaetigung: 'Auftragsbestätigung',
}

interface ProjectFile {
  id: string
  filename: string
  file_url: string | null
  mime_type: string | null
  category: string | null
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

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

function formatTime(t: string | null): string {
  if (!t) return ''
  return t.slice(0, 5)
}

function formatTimeRange(p: { start_time: string | null; end_time: string | null }): string {
  const s = formatTime(p.start_time)
  const e = formatTime(p.end_time)
  if (s && e) return `${s}–${e}`
  return s || e
}

function formatDateRange(p: { start_date: string | null; end_date: string | null }): string {
  if (!p.start_date) return ''
  if (!p.end_date || p.end_date === p.start_date) return formatDate(p.start_date)
  return `${formatDate(p.start_date)} – ${formatDate(p.end_date)}`
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

type ViewMode = 'grid' | 'timeline'

export default function ProjekteScreen({ logoUrl, onNavHome, onNavRapport, onStartRapport, onNavArbeitszeit, onNavProfile, onLoggedOut }: Props) {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Project | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('grid')

  // Detail: Dateien, Kommentare & Aufgaben
  const [files, setFiles] = useState<ProjectFile[]>([])
  const [comments, setComments] = useState<ProjectComment[]>([])
  const [tasks, setTasks] = useState<ProjectTask[]>([])
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadCategory, setUploadCategory] = useState<FileCategory>('fotos')
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
    setTasks([])
    setLoadingDetail(true)
    Promise.all([
      apiFetch(`/pwa/projects/${selected.id}/files`).catch(() => []) as Promise<ProjectFile[]>,
      apiFetch(`/pwa/projects/${selected.id}/comments`).catch(() => []) as Promise<ProjectComment[]>,
      apiFetch(`/pwa/projects/${selected.id}/tasks`).catch(() => []) as Promise<ProjectTask[]>,
    ]).then(([f, c, t]) => {
      setFiles(f)
      setComments(c)
      setTasks(t)
    }).finally(() => setLoadingDetail(false))
  }, [selected?.id])

  // Offline gepufferte Abhak-Aktionen synchronisieren, sobald wieder online.
  const drainTaskQueue = useCallback(async () => {
    const q = loadTaskQueue()
    if (q.length === 0) return
    const remaining: QueuedTaskToggle[] = []
    for (const item of q) {
      try {
        await toggleProjectTaskDone(item.project_id, item.task_id, item.is_done)
      } catch {
        remaining.push({ ...item, attempts: (item.attempts ?? 0) + 1 })
      }
    }
    saveTaskQueue(remaining)
  }, [])

  useEffect(() => {
    if (navigator.onLine) { void drainTaskQueue() }
    const onOnline = () => { void drainTaskQueue() }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [drainTaskQueue])

  // Hakt eine Aufgabe ab: erst optimistisch lokal, dann Server bzw. Offline-Queue.
  async function toggleTask(task: ProjectTask) {
    if (!selected) return
    const next = !task.is_done
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, is_done: next } : t))
    try {
      await toggleProjectTaskDone(selected.id, task.id, next)
    } catch (err) {
      if (isOfflineError(err)) {
        enqueueTaskToggle({ project_id: selected.id, task_id: task.id, is_done: next, queued_at: new Date().toISOString() })
      } else {
        // Echter Fehler → optimistisches Update zurückrollen.
        setTasks(prev => prev.map(t => t.id === task.id ? { ...t, is_done: task.is_done } : t))
      }
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!selected || !e.target.files?.length) return
    const file = e.target.files[0]
    const form = new FormData()
    form.append('file', file)
    form.append('category', uploadCategory)
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
          {(() => {
            const k = (selected.kind || 'project') as ProjectKind
            if (k !== 'project') {
              return (
                <div className="projekte-detail-badge-row">
                  <span
                    className="projekte-detail-badge"
                    style={{ background: KIND_COLORS[k], color: '#fff' }}
                  >
                    {KIND_LABELS[k]}
                  </span>
                </div>
              )
            }
            if (selected.art_der_arbeit?.length) {
              return (
                <div className="projekte-detail-badge-row">
                  {selected.art_der_arbeit.map(art => (
                    <span key={art} className="projekte-detail-badge">{art}</span>
                  ))}
                </div>
              )
            }
            return null
          })()}

          {/* Bemerkung — rot hervorgehoben */}
          {selected.bemerkung && (
            <div className="projekte-detail-card" style={{ background: '#fff0f0', border: '1.5px solid #e53e3e' }}>
              <div className="projekte-detail-title" style={{ color: '#c53030' }}>Hinweis</div>
              <div style={{ fontSize: 14, color: '#c53030', fontWeight: 500, whiteSpace: 'pre-wrap' }}>
                {selected.bemerkung}
              </div>
            </div>
          )}

          {/* Aufgaben — Checkliste vom Büro, vom Monteur abhakbar */}
          {!loadingDetail && tasks.length > 0 && (
            <div className="projekte-detail-card">
              <div className="projekte-detail-title">Aufgaben</div>
              {tasks.map(t => (
                <label
                  key={t.id}
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', cursor: 'pointer' }}
                >
                  <input
                    type="checkbox"
                    checked={t.is_done}
                    onChange={() => void toggleTask(t)}
                    style={{ width: 20, height: 20, marginTop: 1, flexShrink: 0, accentColor: 'var(--accent-blue)' }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 14,
                      whiteSpace: 'pre-wrap',
                      textDecoration: t.is_done ? 'line-through' : 'none',
                      color: t.is_done ? 'var(--text-muted, #888)' : 'var(--text)',
                    }}>
                      {t.text}
                    </div>
                    {t.is_done && t.done_by_name && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted, #888)', marginTop: 2 }}>
                        erledigt von {t.done_by_name}
                      </div>
                    )}
                  </div>
                </label>
              ))}
            </div>
          )}

          {/* Gerüstfach / Lagerort */}
          {selected.geruestfach != null && (
            <div className="projekte-detail-card">
              <div className="projekte-detail-title">Gerüstfach / Lagerort</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>
                {selected.geruestfach}
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
            {!selected.customer && !selected.object_address && (
              <div className="projekte-detail-empty">Keine weiteren Informationen eingetragen.</div>
            )}
          </div>

          {/* Einsatz-Termin */}
          {selected.start_date && (
            <div className="projekte-detail-card projekte-detail-card-accent">
              <div className="projekte-detail-title">Einsatz</div>
              <div className="projekte-detail-termin-date">
                {formatDateRange(selected)}
                {formatTimeRange(selected) && ` · ${formatTimeRange(selected)}`}
              </div>
            </div>
          )}

          {/* Kontakte — Baustellenkontakt zuerst */}
          {(selected.kontakte ?? []).length > 0 && (
            <div className="projekte-detail-card">
              <div className="projekte-detail-title">Kontakte</div>
              {[...selected.kontakte]
                .sort((a, b) => Number(!!b.is_site_contact) - Number(!!a.is_site_contact))
                .map((k, i) => (
                <div
                  key={i}
                  className="projekte-kontakt-item"
                  style={k.is_site_contact ? { background: '#fff8e6', border: '1.5px solid #f5a623', borderRadius: 8, padding: 10, marginBottom: 8 } : undefined}
                >
                  <div className="projekte-kontakt-item-header">
                    <span className="projekte-kontakt-item-name">{k.name}</span>
                    {k.is_site_contact && (
                      <span
                        className="projekte-kontakt-item-rolle"
                        style={{ background: '#f5a623', color: '#fff', fontWeight: 600 }}
                      >
                        ★ Vor Ort
                      </span>
                    )}
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8 }}>
                <div className="projekte-detail-title" style={{ margin: 0 }}>Dokumente & Fotos</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <select
                    value={uploadCategory}
                    onChange={e => setUploadCategory(e.target.value as FileCategory)}
                    disabled={uploading}
                    aria-label="Kategorie"
                    style={{ fontSize: 12, padding: '5px 8px', borderRadius: 8, border: '1px solid var(--card-border, #ddd)', background: 'var(--surface, #fff)', color: 'var(--text)' }}
                  >
                    {FILE_CATEGORIES.map(c => (
                      <option key={c.key} value={c.key}>{c.label}</option>
                    ))}
                  </select>
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
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted, #888)', marginTop: 1 }}>
                      {f.category && CATEGORY_LABELS[f.category] ? `${CATEGORY_LABELS[f.category]} · ` : ''}{formatDateTime(f.created_at)}
                    </span>
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
            const key = p.start_date || noDateKey
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
                      const timeLabel = formatTimeRange(p)
                      const kind = (p.kind || 'project') as ProjectKind
                      const isInternal = kind !== 'project'
                      const tileColor = KIND_COLORS[kind] || KIND_COLORS.project
                      return (
                        <div key={p.id} className="projekte-tile" onClick={() => setSelected(p)}>
                          <div className="projekte-tile-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke={tileColor} strokeWidth="1.8">
                              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                              <path d="M9 22V12h6v10"/>
                            </svg>
                          </div>
                          <div className="projekte-tile-name">{p.name}</div>
                          <div className="projekte-tile-sub" style={isInternal ? { color: tileColor, fontWeight: 600 } : undefined}>
                            {isInternal
                              ? KIND_LABELS[kind]
                              : (p.art_der_arbeit?.length ? p.art_der_arbeit.join(', ') : (p.customer?.billing_name || p.customer?.name || '—'))}
                          </div>
                          {p.bemerkung && (
                            <div style={{ fontSize: 11, color: '#c53030', fontWeight: 600, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              ⚠ {p.bemerkung}
                            </div>
                          )}
                          {p.start_date && (
                            <div className="projekte-tile-termin">
                              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <rect x="1" y="3" width="14" height="12" rx="2"/>
                                <path d="M5 1v3M11 1v3M1 7h14"/>
                              </svg>
                              {timeLabel || formatDate(p.start_date)}
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

        {!loading && projects.length > 0 && viewMode === 'timeline' && (
          <ProjectTimeline projects={projects} onSelect={setSelected} />
        )}
      </div>

      <div className="nav-bar">
        <div className="nav-item" onClick={onNavHome}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          </svg>
          <span>Home</span>
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
