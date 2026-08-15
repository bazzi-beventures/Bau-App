import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch, ApiError, apiFormFetch, apiUrl, isNetworkError } from '../api/client'
import { deleteOwnRapport, downloadRapportPdf, fetchProjectReports, ProjectReport } from '../api/chat'
import { ProjectTask, toggleProjectTaskDone } from '../api/projectTasks'
import SignaturePad from '../chat/SignaturePad'
import { SK } from '../api/storageKeys'
import { ProjectTimeline } from './projekte/ProjectTimeline'
import { sortProjectsChronologically } from './projekte/sortProjects'
import { PROJECT_FILE_ACCEPT, projectFileIcon } from '../shared/projectFileTypes'
import { mapsUrl } from '../shared/mapsLink'

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

// Identität eines Queue-Eintrags. task_id allein reicht nicht: wird eine
// Aufgabe während des Drains neu getoggelt, ersetzt enqueueTaskToggle den alten
// Eintrag durch einen mit neuem queued_at — beide unterscheiden sich nur darüber.
const taskKey = (it: QueuedTaskToggle) => `${it.task_id}|${it.queued_at}`

interface Kontakt {
  name: string
  kommentar: string
  telefon: string
  email: string
  is_site_contact?: boolean
  // Vom Backend gesetzt, wenn das Projekt keine eigene Ansprechperson hat und der
  // Kundenstamm eingesprungen ist (db.project_contacts_with_customer_fallback).
  // Nicht persistiert — kommt bei jedem Request frisch aus dem Kunden-Embed.
  from_customer?: boolean
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

type ProjectKind =
  | 'project' | 'teamsitzung' | 'lagerarbeit' | 'werkstatt'
  | 'weiterbildung' | 'reservation' | 'blocker' | 'sonstiges'

const KIND_LABELS: Record<ProjectKind, string> = {
  project: 'Projekt',
  teamsitzung: 'Teamsitzung',
  lagerarbeit: 'Lagerarbeit',
  werkstatt: 'Werkstatt',
  weiterbildung: 'Weiterbildung',
  reservation: 'Reservation',
  blocker: 'Blocker',
  sonstiges: 'Sonstiges',
}

const KIND_COLORS: Record<ProjectKind, string> = {
  project: 'var(--accent-amber)',
  teamsitzung: '#7c3aed',
  lagerarbeit: '#d97706',
  werkstatt: '#0d9488',
  weiterbildung: '#db2777',
  reservation: '#65a30d',
  blocker: '#94a3b8',
  sonstiges: '#475569',
}

interface Project {
  id: string
  name: string
  kind: ProjectKind
  art_der_arbeit: string[] | null
  customer_id: string | null
  customer: EmbeddedCustomer | null
  object_name: string | null
  object_address: string | null
  start_date: string | null
  end_date: string | null
  start_time: string | null
  end_time: string | null
  kontakte: Kontakt[]
  bemerkung: string | null
  geruestfach: number | null
  // Vom Backend gesetzt (Feature rapport_offerten_annahme_pflicht): das Projekt hat
  // mindestens eine nicht-archivierte Offerte, aber keine ist angenommen. Der
  // Rapport-Knopf ist dann gesperrt. Fehlt das Feld (ältere API), gilt "nicht gesperrt".
  rapport_blocked?: boolean
  // Server-seitig aus projektleiter_id aufgelöst — wen der Monteur bei Rückfragen
  // anruft. Null/fehlend, wenn dem Projekt kein Projektleiter zugewiesen ist.
  projektleiter_name?: string | null
}

// Kategorien, die ein Mitarbeiter im Feld vergeben darf — Teilmenge der
// Web-View-Kategorien (siehe admin/operative/projectDetail/tabs.tsx). Aus dem
// Reiter Lieferantendokumente ist nur "lieferschein" dabei; Angebot Lieferant,
// Bestellungen und Auftragsbestätigung bleiben dem Admin vorbehalten.
type FileCategory = 'fotos' | 'masse' | 'lieferschein' | 'rapport' | 'sonstiges'

// Der Lieferschein fehlt hier bewusst: er hat eine eigene Karte mit eigenem
// Hochladen-Knopf (siehe LIEFERSCHEIN_CATEGORY), analog zum Teilordner
// "Lieferschein" im Reiter Lieferantendokumente der Admin-Ansicht.
const FILE_CATEGORIES: { key: FileCategory; label: string }[] = [
  { key: 'fotos', label: 'Fotos' },
  { key: 'masse', label: 'Masse' },
  // Ausgefülltes Papier-Rapport-Blatt direkt auf der Baustelle abfotografieren,
  // statt es zurückzutragen. Landet im Rapporte-Tab des Projektleiters.
  { key: 'rapport', label: 'Rapport' },
  { key: 'sonstiges', label: 'Sonstiges' },
]

// Einziger Teilordner der Lieferantendokumente, den der Monteur sieht: der
// Lieferschein. Angebot Lieferant / Bestellungen / Auftragsbestätigung bleiben
// der Verwaltung vorbehalten (Einkaufspreise) — der Server filtert sie schon aus
// der Liste (ADMIN_ONLY_FILE_CATEGORIES in agents/routers/_deps.py), diese Karte
// zeigt also nie mehr, als die API ohnehin liefert.
const LIEFERSCHEIN_CATEGORY: FileCategory = 'lieferschein'

const CATEGORY_LABELS: Record<string, string> = {
  fotos: 'Fotos',
  masse: 'Masse',
  lieferschein: 'Lieferschein',
  rapport: 'Rapport',
  sonstiges: 'Sonstiges',
  bestellungen: 'Bestellungen',
  auftragsbestaetigung: 'Auftragsbestätigung',
  // Vom Admin im Offerten-Reiter hochgeladen (Papier-/Fremdsystem-Offerte). Der
  // Monteur kann sie nicht hochladen, sieht sie aber in der Dateiliste.
  offerte: 'Offerte',
}

interface ProjectFile {
  id: string
  filename: string
  file_url: string | null
  storage_path?: string | null
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

// Adresse als Kartenlink. Fällt auf reinen Text zurück, wenn nichts Brauchbares
// drinsteht — ein toter Maps-Link wäre schlimmer als gar keiner.
function MapsAddress({ address }: { address: string }) {
  const href = mapsUrl(address)
  if (!href) return <>{address}</>
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${address} in Google Maps öffnen`}
      style={{
        color: 'var(--accent-blue)', textDecoration: 'none',
        display: 'inline-flex', alignItems: 'center', gap: 6,
      }}
    >
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
        <circle cx="12" cy="10" r="3"/>
      </svg>
      {address}
    </a>
  )
}

type ViewMode = 'grid' | 'timeline'

export default function ProjekteScreen({ logoUrl, onNavHome, onNavRapport, onStartRapport, onNavArbeitszeit, onNavProfile, onLoggedOut }: Props) {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Project | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('grid')

  // Detail: Dateien, Kommentare & Aufgaben
  const [files, setFiles] = useState<ProjectFile[]>([])
  // Inline-Umbenennen einer Datei/eines Fotos — auch als zugewiesener Monteur, nicht nur Admin.
  const [renamingFileId, setRenamingFileId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [comments, setComments] = useState<ProjectComment[]>([])
  const [tasks, setTasks] = useState<ProjectTask[]>([])
  // Rapporte des Projekts — nachlesen, was erfasst wurde (auch von Kollegen), das
  // PDF öffnen, und den eigenen Fehleintrag korrigieren, wenn er erst später auffällt
  // (im Chat gibt es den Löschen-Knopf direkt nach dem Speichern).
  const [reports, setReports] = useState<ProjectReport[]>([])
  const [deletingReportId, setDeletingReportId] = useState<number | null>(null)
  const [openingReportId, setOpeningReportId] = useState<number | null>(null)
  // Unterschrift nachtragen: der Kunde ist beim Abschluss auf der Baustelle oft
  // nicht greifbar, im Chat lässt sich der Schritt überspringen — und der Rapport
  // blieb danach unsigniert liegen, also unverrechenbar. Hier ist er wieder
  // erreichbar. Ein Rapport zur Zeit, sonst hat der Monteur zwei Unterschriftsfelder
  // untereinander und weiss nicht mehr, welches zu welchem Tag gehört.
  const [signingReportId, setSigningReportId] = useState<number | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadCategory, setUploadCategory] = useState<FileCategory>('fotos')
  const [newComment, setNewComment] = useState('')
  const [addingComment, setAddingComment] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Eigener Input für die Lieferschein-Karte: die Kategorie steckt im Aufruf, nicht
  // im State — ein gemeinsamer Input müsste uploadCategory vor dem Klick umsetzen
  // und läse beim Change-Event womöglich noch den alten Wert.
  const lieferscheinInputRef = useRef<HTMLInputElement>(null)

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
    setReports([])
    setLoadingDetail(true)
    Promise.all([
      apiFetch(`/pwa/projects/${selected.id}/files`).catch(() => []) as Promise<ProjectFile[]>,
      apiFetch(`/pwa/projects/${selected.id}/comments`).catch(() => []) as Promise<ProjectComment[]>,
      apiFetch(`/pwa/projects/${selected.id}/tasks`).catch(() => []) as Promise<ProjectTask[]>,
      fetchProjectReports(selected.id).catch(() => [] as ProjectReport[]),
    ]).then(([f, c, t, r]) => {
      setFiles(f)
      setComments(c)
      setTasks(t)
      setReports(r)
    }).finally(() => setLoadingDetail(false))
  }, [selected?.id])

  // Re-Entrancy-Schutz: flatterndes Netz darf keine zwei Drains parallel
  // starten. Der Server-Call ist zwar idempotent (Doppel-Toggle schadet nicht),
  // aber der Guard spart überflüssige Requests und hält die Reconcile-Logik sauber.
  const drainingRef = useRef(false)

  // Offline gepufferte Abhak-Aktionen synchronisieren, sobald wieder online.
  const drainTaskQueue = useCallback(async () => {
    if (drainingRef.current) return
    if (!navigator.onLine) return
    const q = loadTaskQueue()
    if (q.length === 0) return
    drainingRef.current = true
    const remaining: QueuedTaskToggle[] = []
    const sent = new Set<string>()
    try {
      for (const item of q) {
        try {
          // queued_at = realer Abhak-Zeitpunkt von der Baustelle, nicht die Sync-Zeit.
          await toggleProjectTaskDone(item.project_id, item.task_id, item.is_done, item.queued_at)
          sent.add(taskKey(item))
        } catch {
          remaining.push({ ...item, attempts: (item.attempts ?? 0) + 1 })
        }
      }
    } finally {
      // Reconcile gegen den aktuellen Stand statt blind zu überschreiben: ein
      // während des Drains erfolgtes Re-Toggle (enqueueTaskToggle) darf nicht
      // verlorengehen, und Fehlversuche müssen ihre attempts behalten.
      const failedByTask = new Map(remaining.map(it => [it.task_id, it]))
      const merged = loadTaskQueue().flatMap(it => {
        if (sent.has(taskKey(it))) return []            // erfolgreich → raus
        const failed = failedByTask.get(it.task_id)
        // Gleicher Eintrag fehlgeschlagen → attempts-erhöhte Version; anderes
        // queued_at heißt: während des Drains neu getoggelt → dieser gilt.
        return [failed && failed.queued_at === it.queued_at ? failed : it]
      })
      saveTaskQueue(merged)
      drainingRef.current = false
    }
  }, [])

  useEffect(() => {
    if (navigator.onLine) { void drainTaskQueue() }
    const onOnline = () => { void drainTaskQueue() }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [drainTaskQueue])

  // Hakt eine Aufgabe ab: erst optimistisch lokal, dann Server bzw. Offline-Queue.
  // checkedAt ist der echte Abhak-Moment — er wird mitgeschickt (auch offline via
  // Queue), damit done_at den Zeitpunkt vom Feld zeigt und nicht die Sync-Zeit.
  async function toggleTask(task: ProjectTask) {
    if (!selected) return
    const next = !task.is_done
    const checkedAt = next ? new Date().toISOString() : null
    const myName = localStorage.getItem(SK.DISPLAY_NAME)
    setTasks(prev => prev.map(t => t.id === task.id
      ? { ...t, is_done: next, done_at: checkedAt, done_by_name: next ? (myName ?? t.done_by_name) : null }
      : t))
    try {
      await toggleProjectTaskDone(selected.id, task.id, next, checkedAt)
    } catch (err) {
      // isNetworkError statt isOfflineError: Funkloch (onLine === true) muss den
      // Abhak-Vorgang queuen, sonst gilt er nur optimistisch und geht bei
      // Reload verloren. Server-Toggle ist idempotent — Doppel-Sync unschädlich.
      if (isNetworkError(err)) {
        enqueueTaskToggle({ project_id: selected.id, task_id: task.id, is_done: next, queued_at: checkedAt ?? new Date().toISOString() })
      } else {
        // Echter Fehler → optimistisches Update vollständig zurückrollen.
        setTasks(prev => prev.map(t => t.id === task.id ? task : t))
      }
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>, category: FileCategory) {
    if (!selected || !e.target.files?.length) return
    const filesToUpload = Array.from(e.target.files)
    const input = e.target
    setUploading(true)
    try {
      // Backend nimmt eine Datei pro Request → sequentiell hochladen
      for (const file of filesToUpload) {
        const form = new FormData()
        form.append('file', file)
        form.append('category', category)
        await apiFormFetch(`/pwa/projects/${selected.id}/files`, form)
      }
      const updated = await apiFetch(`/pwa/projects/${selected.id}/files`) as ProjectFile[]
      setFiles(updated)
    } catch {
      // silently ignore upload errors in user view
    } finally {
      setUploading(false)
      input.value = ''  // gleiche Datei erneut auswählbar machen
    }
  }

  async function handleRenameFile(fileId: string) {
    const name = renameValue.trim()
    if (!selected || !name) { setRenamingFileId(null); return }
    try {
      await apiFetch(`/pwa/projects/${selected.id}/files/${fileId}`, {
        method: 'PATCH',
        body: JSON.stringify({ filename: name }),
      })
      const updated = await apiFetch(`/pwa/projects/${selected.id}/files`) as ProjectFile[]
      setFiles(updated)
    } catch {
      // silently ignore rename errors in user view
    } finally {
      setRenamingFileId(null)
    }
  }

  // Rapport-PDF öffnen. Der Server rendert es frisch (zugriffsgeprüft: eigener
  // Rapport oder eigenes Projekt) — deshalb Blob statt Direkt-URL.
  async function handleOpenReportPdf(report: ProjectReport) {
    setOpeningReportId(report.id)
    try {
      const { blob, filename } = await downloadRapportPdf(report.id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      // Auf dem Handy öffnet der PDF-Viewer die Datei; am Desktop landet sie im
      // Download-Ordner. Ein neues Fenster (window.open) blockiert iOS Safari,
      // weil der await den User-Gesten-Kontext verliert.
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) { onLoggedOut(); return }
      window.alert('Rapport konnte nicht geöffnet werden.')
    } finally {
      setOpeningReportId(null)
    }
  }

  // Eigenen Fehleintrag wegräumen. Der Server lässt nur eigene, unsignierte und
  // unverrechnete Rapporte zu — hier wird der Knopf entsprechend nur dort gezeigt.
  async function handleDeleteOwnReport(report: ProjectReport) {
    if (!window.confirm(
      `Rapport vom ${formatDate(report.report_date)} wirklich löschen? `
      + 'Erfasste Stunden und Material werden mitgelöscht.'
    )) return
    setDeletingReportId(report.id)
    try {
      await deleteOwnRapport(report.id)
      setReports(prev => prev.filter(r => r.id !== report.id))
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) { onLoggedOut(); return }
      window.alert(err instanceof Error && err.message
        ? err.message
        : 'Rapport konnte nicht gelöscht werden. Bitte melde dich beim Projektleiter.')
    } finally {
      setDeletingReportId(null)
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
    const projectId = selected.id
    // Lieferscheine bekommen eine eigene Karte — die Sammelliste zeigt den Rest.
    const lieferscheine = files.filter(f => f.category === LIEFERSCHEIN_CATEGORY)
    const otherFiles = files.filter(f => f.category !== LIEFERSCHEIN_CATEGORY)

    // Eine Datei-Zeile (Icon, Download-Link, Kategorie/Datum, Umbenennen) —
    // identisch in beiden Karten. In der Lieferschein-Karte bleibt die Kategorie
    // weg: sie stünde unter jeder Zeile derselben Karte.
    const renderFileRow = (f: ProjectFile, showCategory = true) => (
      <div key={f.id} className="projekte-detail-row" style={{ alignItems: 'center' }}>
        <span style={{ fontSize: 16 }}>{projectFileIcon(f.mime_type, f.filename)}</span>
        {renamingFileId === f.id ? (
          <span className="projekte-detail-value" style={{ flex: 1, display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              autoFocus
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); void handleRenameFile(f.id) }
                if (e.key === 'Escape') setRenamingFileId(null)
              }}
              style={{ flex: 1, minWidth: 0, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--card-border, #ddd)', fontSize: 13, background: 'var(--surface, #fff)', color: 'var(--text)' }}
            />
            <button type="button" className="projekte-kontakt-link-btn" style={{ fontSize: 12 }} onClick={() => void handleRenameFile(f.id)}>✓</button>
            <button type="button" className="projekte-kontakt-link-btn" style={{ fontSize: 12 }} onClick={() => setRenamingFileId(null)}>✕</button>
          </span>
        ) : (
          <span className="projekte-detail-value" style={{ flex: 1 }}>
            {(f.storage_path || f.file_url)
              ? <a href={apiUrl(`/pwa/projects/${projectId}/files/${f.id}/download`)} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-blue)', textDecoration: 'none' }}>{f.filename}</a>
              : f.filename
            }
            <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted, #888)', marginTop: 1 }}>
              {showCategory && f.category && CATEGORY_LABELS[f.category] ? `${CATEGORY_LABELS[f.category]} · ` : ''}{formatDateTime(f.created_at)}
            </span>
          </span>
        )}
        {/* Der Dateiname öffnet nur — Fotos/PDFs liefert der Proxy `inline` aus.
            Zum Speichern braucht es `?download=1` (erzwingt `attachment`). */}
        {renamingFileId !== f.id && (f.storage_path || f.file_url) && (
          <a
            href={apiUrl(`/pwa/projects/${projectId}/files/${f.id}/download?download=1`)}
            download={f.filename}
            className="projekte-kontakt-link-btn"
            style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center' }}
            title="Herunterladen"
            aria-label={`${f.filename} herunterladen`}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: 'block' }}>
              <path d="M12 3v12" />
              <path d="m7 11 5 5 5-5" />
              <path d="M4 20h16" />
            </svg>
          </a>
        )}
        {renamingFileId !== f.id && (
          <button
            type="button"
            className="projekte-kontakt-link-btn"
            style={{ fontSize: 12 }}
            title="Umbenennen"
            onClick={() => { setRenamingFileId(f.id); setRenameValue(f.filename) }}
          >
            ✏️
          </button>
        )}
      </div>
    )

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
                    {t.is_done && (t.done_by_name || t.done_at) && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted, #888)', marginTop: 2 }}>
                        {t.done_by_name ? `erledigt von ${t.done_by_name}` : 'erledigt'}
                        {t.done_at ? ` · ${formatDateTime(t.done_at)}` : ''}
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

          {/* Rapport erstellen — gesperrt, solange keine Offerte des Projekts
              angenommen ist (Feature rapport_offerten_annahme_pflicht). Die
              eigentliche Durchsetzung liegt im Backend: der Rapport-Chat lehnt das
              Projekt ebenfalls ab, auch wenn es frei im Gespräch gewählt wird. */}
          <button
            type="button"
            onClick={() => onStartRapport(selected.name)}
            disabled={!!selected.rapport_blocked}
            title={selected.rapport_blocked ? 'Offerte noch nicht angenommen' : undefined}
            style={{
              width: '100%',
              padding: '14px 16px',
              marginBottom: selected.rapport_blocked ? 6 : 12,
              borderRadius: 12,
              border: 'none',
              background: selected.rapport_blocked ? 'var(--surface-2, #d4d4d8)' : 'var(--accent-blue)',
              color: selected.rapport_blocked ? 'var(--text-muted, #71717a)' : '#fff',
              fontSize: 15,
              fontWeight: 600,
              cursor: selected.rapport_blocked ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: selected.rapport_blocked ? 'none' : '0 2px 8px rgba(0,0,0,0.12)',
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
          {selected.rapport_blocked && (
            <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--text-muted, #71717a)', textAlign: 'center' }}>
              Die Offerte für dieses Projekt ist noch nicht angenommen. Der Rapport ist
              möglich, sobald der Kunde oder der Projektleiter sie angenommen hat.
            </div>
          )}

          {/* Rapporte des Projekts — was auf diesem Auftrag bereits erfasst wurde,
              inkl. der Einträge von Kollegen (sonst schreibt der zweite Mann
              denselben Tag nochmals). Das PDF holt der Server zugriffsgeprüft.
              Löschen nur beim eigenen Rapport und solange ohne Unterschrift und ohne
              Rechnung — der Server prüft dieselben Regeln nochmals. */}
          {!loadingDetail && reports.length > 0 && (
            <div className="projekte-detail-card">
              <div className="projekte-detail-title">Rapporte</div>
              {reports.map(r => {
                const billed = !!r.invoice_id
                const signed = !!r.signature_timestamp
                const canDelete = r.is_own && !billed && !signed
                // Nachtragen unter denselben Bedingungen wie Löschen: eigener
                // Rapport, noch ohne Unterschrift, noch nicht verrechnet. Der Server
                // prüft dieselben Regeln nochmals (409), der Knopf ist nur die
                // sichtbare Hälfte.
                const canSign = canDelete
                return (
                  <div key={r.id}>
                  <div
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: 10,
                      padding: '8px 0', borderTop: '1px solid var(--border, #e5e7eb)',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>
                        {formatDate(r.report_date)}
                        <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 500, color: 'var(--text-muted, #71717a)' }}>
                          {billed ? 'abgerechnet' : signed ? 'unterschrieben' : 'ohne Unterschrift'}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted, #71717a)', marginTop: 1 }}>
                        {r.is_own ? 'von dir erfasst' : (r.created_by || 'Kollege')}
                      </div>
                      {r.description && (
                        <div style={{ fontSize: 13, color: 'var(--text-muted, #71717a)', whiteSpace: 'pre-wrap' }}>
                          {r.description}
                        </div>
                      )}
                    </div>
                    <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => void handleOpenReportPdf(r)}
                        disabled={openingReportId === r.id}
                        style={{
                          padding: '6px 10px', borderRadius: 8,
                          border: '1px solid var(--accent-blue)', background: 'transparent',
                          color: 'var(--accent-blue)', fontSize: 13, fontWeight: 600,
                          cursor: openingReportId === r.id ? 'default' : 'pointer',
                        }}
                      >
                        {openingReportId === r.id ? '…' : '📄 Ansehen'}
                      </button>
                      {canSign && signingReportId !== r.id && (
                        <button
                          type="button"
                          onClick={() => setSigningReportId(r.id)}
                          style={{
                            padding: '6px 10px', borderRadius: 8,
                            border: '1px solid var(--accent-green, #16a34a)', background: 'transparent',
                            color: 'var(--accent-green, #16a34a)', fontSize: 13, fontWeight: 600,
                            cursor: 'pointer', whiteSpace: 'nowrap',
                          }}
                        >
                          ✍️ Unterschrift
                        </button>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => void handleDeleteOwnReport(r)}
                          disabled={deletingReportId === r.id}
                          style={{
                            padding: '6px 10px', borderRadius: 8,
                            border: '1px solid #e53e3e', background: 'transparent',
                            color: '#e53e3e', fontSize: 13, fontWeight: 600,
                            cursor: deletingReportId === r.id ? 'default' : 'pointer',
                          }}
                        >
                          {deletingReportId === r.id ? '…' : 'Löschen'}
                        </button>
                      )}
                    </div>
                  </div>
                  {signingReportId === r.id && (
                    <SignaturePad
                      reportId={r.id}
                      skipLabel="Abbrechen"
                      onDone={(justSigned) => {
                        setSigningReportId(null)
                        // Die Zeile lokal auf "unterschrieben" setzen: das PDF baut
                        // der Server im Hintergrund, ein Neuladen der Liste käme zu
                        // früh und zeigte den Rapport weiter als unsigniert. Der
                        // Zeitstempel ist damit ein paar Sekunden vor dem in der DB —
                        // sichtbar ist ohnehin nur der Zustand, nicht die Uhrzeit.
                        if (justSigned) {
                          setReports(prev => prev.map(x => x.id === r.id
                            ? { ...x, signature_timestamp: new Date().toISOString() }
                            : x))
                        }
                      }}
                      onLoggedOut={onLoggedOut}
                    />
                  )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Projektinfos. Adressen sind Kartenlinks — antippen führt direkt in die
              Navigation, statt die Adresse abzutippen. Die Kundenadresse steht nur
              dann zusätzlich da, wenn sie sich von der Objektadresse unterscheidet. */}
          {(() => {
            const objectAddress = selected.object_address || selected.customer?.object_address || null
            const customerAddress = selected.customer?.address || null
            const showCustomerAddress = !!customerAddress
              && customerAddress.trim() !== (objectAddress ?? '').trim()
            return (
              <div className="projekte-detail-card">
                <div className="projekte-detail-title">Projektinfos</div>
                {(selected.customer?.billing_name || selected.customer?.name) && (
                  <div className="projekte-detail-row">
                    <span className="projekte-detail-label">Kunde</span>
                    <span className="projekte-detail-value">{selected.customer?.billing_name || selected.customer?.name}</span>
                  </div>
                )}
                {selected.object_name && (
                  <div className="projekte-detail-row">
                    <span className="projekte-detail-label">Objekt</span>
                    <span className="projekte-detail-value">{selected.object_name}</span>
                  </div>
                )}
                {objectAddress && (
                  <div className="projekte-detail-row">
                    <span className="projekte-detail-label">Objektadresse</span>
                    <span className="projekte-detail-value">
                      <MapsAddress address={objectAddress} />
                    </span>
                  </div>
                )}
                {showCustomerAddress && (
                  <div className="projekte-detail-row">
                    <span className="projekte-detail-label">Kundenadresse</span>
                    <span className="projekte-detail-value">
                      <MapsAddress address={customerAddress} />
                    </span>
                  </div>
                )}
                {selected.projektleiter_name && (
                  <div className="projekte-detail-row">
                    <span className="projekte-detail-label">Projektleiter</span>
                    <span className="projekte-detail-value">{selected.projektleiter_name}</span>
                  </div>
                )}
                {!selected.customer && !selected.object_name && !objectAddress
                  && !selected.projektleiter_name && (
                  <div className="projekte-detail-empty">Keine weiteren Informationen eingetragen.</div>
                )}
              </div>
            )
          })()}

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
                    {k.from_customer
                      ? <span className="projekte-kontakt-item-rolle">Kunde (keine Ansprechperson hinterlegt)</span>
                      : k.kommentar && <span className="projekte-kontakt-item-rolle">{k.kommentar}</span>}
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
                    accept={PROJECT_FILE_ACCEPT}
                    multiple
                    aria-label="Datei hochladen"
                    style={{ display: 'none' }}
                    onChange={e => handleUpload(e, uploadCategory)}
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
              {otherFiles.length === 0 && (
                <div className="projekte-detail-empty">Noch keine Dateien hochgeladen.</div>
              )}
              {otherFiles.map(f => renderFileRow(f))}
            </div>
          )}

          {/* Lieferscheine — derselbe Teilordner wie im Reiter Lieferantendokumente
              der Admin-Ansicht, damit der Monteur den vom Büro abgelegten
              Lieferschein auf der Baustelle dabeihat (und den eigenen dort ablegt,
              wo er ihn sucht). Eigene Karte statt einer Zeile in der Sammelliste:
              sonst verschwindet er zwischen den Baustellenfotos. */}
          {!loadingDetail && (
            <div className="projekte-detail-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8 }}>
                <div className="projekte-detail-title" style={{ margin: 0 }}>Lieferscheine</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    ref={lieferscheinInputRef}
                    type="file"
                    accept={PROJECT_FILE_ACCEPT}
                    multiple
                    aria-label="Lieferschein hochladen"
                    style={{ display: 'none' }}
                    onChange={e => handleUpload(e, LIEFERSCHEIN_CATEGORY)}
                  />
                  <button
                    type="button"
                    className="projekte-kontakt-link-btn"
                    style={{ fontSize: 12 }}
                    disabled={uploading}
                    onClick={() => lieferscheinInputRef.current?.click()}
                  >
                    {uploading ? 'Lädt…' : '+ Lieferschein'}
                  </button>
                </div>
              </div>
              {lieferscheine.length === 0 && (
                <div className="projekte-detail-empty">Noch kein Lieferschein vorhanden.</div>
              )}
              {lieferscheine.map(f => renderFileRow(f, false))}
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
            // Innerhalb des Tages nach Startzeit — der Monteur arbeitet die
            // Liste von oben nach unten ab.
            .map(([dateKey, groupProjects]) =>
              [dateKey, sortProjectsChronologically(groupProjects)] as const)

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
                          {/* Eigener Textblock: die Kachel ist eine Zeile über die
                              volle Breite (Icon | Text | Pfeil), nicht mehr eine
                              von zwei Spalten. */}
                          <div className="projekte-tile-body">
                            <div className="projekte-tile-name">{p.name}</div>
                            <div className="projekte-tile-sub" style={isInternal ? { color: tileColor, fontWeight: 600 } : undefined}>
                              {isInternal
                                ? KIND_LABELS[kind]
                                : (p.art_der_arbeit?.length ? p.art_der_arbeit.join(', ') : (p.customer?.billing_name || p.customer?.name || '—'))}
                            </div>
                            {p.bemerkung && (
                              <div className="projekte-tile-hinweis">⚠ {p.bemerkung}</div>
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
                          </div>
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
