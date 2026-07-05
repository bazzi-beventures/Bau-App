import { useEffect, useRef, useState } from 'react'
import { Project } from './ProjectsScreen'
import {
  getSwissHolidays, getWeekDays, getMonthDays, toDateStr, isToday,
  parseDateStr, diffDays, hhmmToMin, minToHHMM,
} from '../utils/calendarHelpers'

// Drag-Transfer payload format: "<projectId>|<grabDayISO>|<grabOffsetY>"
// grabOffsetY = Y-Position des Mauszeigers innerhalb der gegriffenen Pille (px),
// damit beim Drop in das Zeitraster der Block-Anfang dort landet, wo der Block
// (nicht der Cursor) hingehört.
const DRAG_MIME = 'application/x-bau-project'

interface StaffLite {
  id: string
  name: string
}

interface Props {
  projects: Project[]
  staff: StaffLite[]
  loading: boolean
  canton?: string
  onSelect: (p: Project) => void
  // Verschiebt einen Einsatz im Kalender. deltaDays = Tagesversatz; startTime
  // steuert die Uhrzeit: undefined = Zeit beibehalten (Monat / Ganztägig-Strip),
  // 'HH:MM' = neue Startzeit (Drop ins Zeitraster), null = Zeit löschen (ganztägig).
  onReschedule: (id: string, deltaDays: number, startTime?: string | null) => Promise<void> | void
  // Meldet die aktuell sichtbare Kalenderwoche (Mo, ISO-Datum) hoch — für PDF-Export.
  onVisibleWeekChange?: (mondayIso: string) => void
  // Meldet die aktuell im Filter aktiven Staff-IDs hoch (alle ohne Hide-Flag).
  // Wenn null gemeldet wird, ist kein Filter aktiv (Default = alle Monteure).
  onVisibleStaffChange?: (visibleIds: string[] | null) => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function projectCoversDay(p: Project, day: Date): boolean {
  if (!p.start_date || !p.end_date) return false
  const s = toDateStr(day)
  return s >= p.start_date.slice(0, 10) && s <= p.end_date.slice(0, 10)
}

function fmtRange(p: Project): string {
  if (!p.start_date || !p.end_date) return ''
  const s = parseDateStr(p.start_date).toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit' })
  const e = parseDateStr(p.end_date).toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit' })
  const datePart = s === e ? s : `${s} – ${e}`
  const timePart = fmtTimeRange(p)
  return timePart ? `${datePart} · ${timePart}` : datePart
}

function fmtTime(t: string | null | undefined): string {
  return t ? t.slice(0, 5) : ''
}

function fmtTimeRange(p: Project): string {
  const s = fmtTime(p.start_time), e = fmtTime(p.end_time)
  if (s && e) return `${s}–${e}`
  if (s) return `ab ${s}`
  if (e) return `bis ${e}`
  return ''
}

function pillLabel(p: Project): string {
  const t = fmtTime(p.start_time)
  return t ? `${t} ${p.name}` : p.name
}

// Pill-Farbe je Einsatz-Art. Kundenprojekte bleiben Brand-Blau, interne
// Einsätze unterscheiden sich farblich klar davon.
const KIND_COLORS: Record<string, string> = {
  project:     'var(--primary)',
  teamsitzung: 'var(--kind-teamsitzung, #7c3aed)',  // Lila
  lagerarbeit: 'var(--kind-lagerarbeit, #d97706)',  // Bernstein
  werkstatt:   'var(--kind-werkstatt, #0d9488)',    // Türkis
  sonstiges:   'var(--kind-sonstiges, #475569)',    // Slate
}

function pillBg(p: Project): string {
  return KIND_COLORS[p.kind || 'project'] ?? KIND_COLORS.project
}

function projectMonteurNames(p: Project, staff: StaffLite[]): string {
  if (!p.monteur_ids || p.monteur_ids.length === 0) return ''
  const byId = new Map(staff.map(s => [s.id, s.name]))
  return p.monteur_ids.map(id => byId.get(id) || '').filter(Boolean).join(', ')
}

// ─── Drag-Handlers ────────────────────────────────────────────────────────────

function setDragPayload(e: React.DragEvent, projectId: string, grabDayISO: string) {
  const grabOffsetY = Math.round(e.nativeEvent.offsetY) || 0
  const raw = `${projectId}|${grabDayISO}|${grabOffsetY}`
  e.dataTransfer.setData(DRAG_MIME, raw)
  e.dataTransfer.setData('text/plain', raw)
  e.dataTransfer.effectAllowed = 'move'
}

function readDragPayload(e: React.DragEvent): { projectId: string; grabDayISO: string; grabOffsetY: number } | null {
  const raw = e.dataTransfer.getData(DRAG_MIME) || e.dataTransfer.getData('text/plain')
  if (!raw || !raw.includes('|')) return null
  const [projectId, grabDayISO, grabOffsetY] = raw.split('|')
  return { projectId, grabDayISO, grabOffsetY: Number(grabOffsetY) || 0 }
}

// ─── Legend ───────────────────────────────────────────────────────────────────

function CalendarLegend({ canton }: { canton: string }) {
  return (
    <div className="absence-cal-legend">
      <div className="absence-cal-legend-item">
        <span className="absence-cal-legend-dot absence-cal-legend-dot--holiday" />
        Feiertag {canton.toUpperCase()}
      </div>
      <div className="absence-cal-legend-item" style={{ color: 'var(--muted)' }}>
        Tipp: Einsatz greifen und auf einen anderen Tag ziehen — in der Wochenansicht auch auf eine andere Uhrzeit.
      </div>
    </div>
  )
}

// ─── Month View ───────────────────────────────────────────────────────────────

function MonthView({
  projects, currentDate, onSelect, onReschedule, holidays,
}: {
  projects: Project[]
  currentDate: Date
  onSelect: (p: Project) => void
  onReschedule: (id: string, deltaDays: number, startTime?: string | null) => void
  holidays: Map<string, string>
}) {
  const days = getMonthDays(currentDate)
  const DOW = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
  const [hoverDay, setHoverDay] = useState<string | null>(null)
  const projById = new Map(projects.map(p => [p.id, p]))

  function handleDrop(e: React.DragEvent, dropDay: Date) {
    e.preventDefault()
    setHoverDay(null)
    const payload = readDragPayload(e)
    if (!payload) return
    const proj = projById.get(payload.projectId)
    if (!proj) return
    // Monatsansicht kennt keine Uhrzeit — nur Tagesversatz, Zeit bleibt erhalten.
    const delta = diffDays(payload.grabDayISO, toDateStr(dropDay))
    if (delta !== 0) onReschedule(proj.id, delta)
  }

  return (
    <div>
      <div className="absence-cal-month-grid" style={{ marginBottom: 1 }}>
        {DOW.map(d => (
          <div key={d} className="absence-cal-day-header">{d}</div>
        ))}
      </div>

      <div className="absence-cal-month-grid">
        {days.map((day, i) => {
          if (!day) {
            return <div key={i} className="absence-cal-day-cell outside-month" />
          }
          const dayISO = toDateStr(day)
          const today = isToday(day)
          const holidayName = holidays.get(dayISO)
          const dayProjects = projects.filter(p => projectCoversDay(p, day))

          return (
            <div
              key={i}
              className={`absence-cal-day-cell${today ? ' today' : ''}${holidayName ? ' holiday' : ''}${hoverDay === dayISO ? ' project-cal-drop-hover' : ''}`}
              onDragOver={e => { e.preventDefault(); setHoverDay(dayISO) }}
              onDragLeave={() => setHoverDay(prev => prev === dayISO ? null : prev)}
              onDrop={e => handleDrop(e, day)}
            >
              <div className="absence-cal-day-top">
                <span className="absence-cal-day-num">{day.getDate()}</span>
                {holidayName && (
                  <span className="absence-cal-holiday-label" title={holidayName}>
                    {holidayName}
                  </span>
                )}
              </div>
              {dayProjects.map((p, j) => (
                <div
                  key={j}
                  className="absence-cal-pill project-cal-pill"
                  draggable
                  onDragStart={e => setDragPayload(e, p.id, dayISO)}
                  title={`${p.name} · ${fmtRange(p)}`}
                  style={{ background: pillBg(p) }}
                  onClick={() => onSelect(p)}
                >
                  {pillLabel(p)}
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Week View (Zeitraster: Stunden links, Tage als Spalten) ─────────────────

const WEEK_HOURS_START = 6
const WEEK_HOURS_END = 20
const WEEK_HOUR_HEIGHT = 38

function timeOffsetPx(t: string): number {
  const [h, m] = t.slice(0, 5).split(':').map(Number)
  const mins = (h - WEEK_HOURS_START) * 60 + m
  return Math.max(0, (mins / 60) * WEEK_HOUR_HEIGHT)
}

function blockHeightPx(start: string, end: string): number {
  return Math.max(22, timeOffsetPx(end) - timeOffsetPx(start))
}

// Raster für Drop-Uhrzeiten: auf 15-Minuten runden.
const WEEK_SNAP_MIN = 15

// Wandelt eine spaltenrelative Y-Position (px ab Rasteroberkante = WEEK_HOURS_START)
// in eine gerundete, auf das sichtbare Raster begrenzte Startzeit 'HH:MM'.
function yToSnappedTime(topPx: number): string {
  const minsFromTop = (topPx / WEEK_HOUR_HEIGHT) * 60
  const abs = WEEK_HOURS_START * 60 + minsFromTop
  const snapped = Math.round(abs / WEEK_SNAP_MIN) * WEEK_SNAP_MIN
  const clamped = Math.max(WEEK_HOURS_START * 60, Math.min(WEEK_HOURS_END * 60, snapped))
  return minToHHMM(clamped)
}

// Spalten-Layout für überlappende Events (Cluster-basiert, wie Google Calendar):
// Events, die sich in der Zeit überlappen, werden auf parallele Lanes verteilt.
function computeLanes(events: Project[]): Map<string, { col: number; total: number }> {
  const result = new Map<string, { col: number; total: number }>()
  const sorted = [...events].sort((a, b) => hhmmToMin(a.start_time!) - hhmmToMin(b.start_time!))

  let cluster: Project[] = []
  let clusterEnd = -1

  function flush() {
    if (cluster.length === 0) return
    const colEnds: number[] = []
    const assigns: number[] = []
    for (const ev of cluster) {
      const s = hhmmToMin(ev.start_time!)
      const e = ev.end_time ? hhmmToMin(ev.end_time) : s + 60
      let placed = -1
      for (let i = 0; i < colEnds.length; i++) {
        if (colEnds[i] <= s) { colEnds[i] = e; placed = i; break }
      }
      if (placed === -1) { colEnds.push(e); placed = colEnds.length - 1 }
      assigns.push(placed)
    }
    const total = colEnds.length
    cluster.forEach((ev, i) => result.set(ev.id, { col: assigns[i], total }))
    cluster = []
    clusterEnd = -1
  }

  for (const ev of sorted) {
    const s = hhmmToMin(ev.start_time!)
    const e = ev.end_time ? hhmmToMin(ev.end_time) : s + 60
    if (cluster.length === 0 || s >= clusterEnd) {
      flush()
      cluster.push(ev)
      clusterEnd = e
    } else {
      cluster.push(ev)
      clusterEnd = Math.max(clusterEnd, e)
    }
  }
  flush()
  return result
}

function WeekView({
  projects, staff, currentDate, onSelect, onReschedule, holidays,
}: {
  projects: Project[]
  staff: StaffLite[]
  currentDate: Date
  onSelect: (p: Project) => void
  onReschedule: (id: string, deltaDays: number, startTime?: string | null) => void
  holidays: Map<string, string>
}) {
  const days = getWeekDays(currentDate)
  const [hoverDayISO, setHoverDayISO] = useState<string | null>(null)
  // Live-Vorschau beim Ziehen ins Zeitraster: an welchem Tag/Höhe der Block landet.
  const [dropPreview, setDropPreview] = useState<{ dayISO: string; topPx: number; time: string } | null>(null)
  // Greif-Offset (px ab Block-Oberkante) des laufenden Drags. dataTransfer ist
  // während dragover nicht lesbar, darum hier zwischengespeichert.
  const dragGrabYRef = useRef(0)
  const projById = new Map(projects.map(p => [p.id, p]))

  const hours: number[] = []
  for (let h = WEEK_HOURS_START; h <= WEEK_HOURS_END; h++) hours.push(h)
  const gridHeight = (WEEK_HOURS_END - WEEK_HOURS_START) * WEEK_HOUR_HEIGHT

  const projectsByDay: Project[][] = days.map(d => projects.filter(p => projectCoversDay(p, d)))

  // Drop auf den Ganztägig-Strip: Tag verschieben, Uhrzeit löschen (→ ganztägig).
  function handleAllDayDrop(e: React.DragEvent, dropDay: Date) {
    e.preventDefault()
    setHoverDayISO(null)
    const payload = readDragPayload(e)
    if (!payload) return
    const proj = projById.get(payload.projectId)
    if (!proj) return
    const delta = diffDays(payload.grabDayISO, toDateStr(dropDay))
    onReschedule(proj.id, delta, null)
  }

  // Drop ins Zeitraster: Tag verschieben + Startzeit aus der Y-Position setzen.
  function handleTimedDrop(e: React.DragEvent, dropDay: Date) {
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    setDropPreview(null)
    const payload = readDragPayload(e)
    if (!payload) return
    const proj = projById.get(payload.projectId)
    if (!proj) return
    const delta = diffDays(payload.grabDayISO, toDateStr(dropDay))
    const time = yToSnappedTime(e.clientY - rect.top - payload.grabOffsetY)
    onReschedule(proj.id, delta, time)
  }

  function renderBlock(
    p: Project,
    dayISO: string,
    allDay: boolean,
    lane?: { col: number; total: number },
  ) {
    const monteurs = projectMonteurNames(p, staff)
    const timeLabel = fmtTimeRange(p)
    const laneStyle: React.CSSProperties = {}
    if (!allDay && lane && lane.total > 1) {
      // Gleichverteilte Lanes mit kleinem Spalt; left/right der CSS-Defaults
      // werden ueberschrieben (right: auto), damit width greift.
      const widthPct = 100 / lane.total
      laneStyle.left = `calc(${lane.col * widthPct}% + 2px)`
      laneStyle.width = `calc(${widthPct}% - 4px)`
      laneStyle.right = 'auto'
    }
    return (
      <div
        key={p.id}
        className={`project-cal-week-event${allDay ? ' allday' : ''}`}
        draggable
        onDragStart={e => { dragGrabYRef.current = Math.round(e.nativeEvent.offsetY) || 0; setDragPayload(e, p.id, dayISO) }}
        onClick={() => onSelect(p)}
        title={`${p.name}${timeLabel ? ' · ' + timeLabel : ''}${monteurs ? ' · ' + monteurs : ''}`}
        style={
          allDay
            ? { background: pillBg(p) }
            : {
                background: pillBg(p),
                top: timeOffsetPx(p.start_time!),
                height: p.end_time
                  ? blockHeightPx(p.start_time!, p.end_time)
                  : Math.max(WEEK_HOUR_HEIGHT, 44),
                ...laneStyle,
              }
        }
      >
        {timeLabel && !allDay && (
          <div className="project-cal-week-event-time">{timeLabel}</div>
        )}
        <div className="project-cal-week-event-name">{p.name}</div>
      </div>
    )
  }

  return (
    <div className="project-cal-week">
      {/* Header */}
      <div className="project-cal-week-header">
        <div className="project-cal-week-corner" />
        {days.map((d, i) => {
          const holidayName = holidays.get(toDateStr(d))
          return (
            <div key={i} className={`project-cal-week-day-head${isToday(d) ? ' today' : ''}`}>
              <div className="project-cal-week-day-wd">{d.toLocaleDateString('de-CH', { weekday: 'short' })}</div>
              <div className="project-cal-week-day-num">{d.getDate()}.{d.getMonth() + 1}.</div>
              {holidayName && <div className="project-cal-week-day-holiday">{holidayName}</div>}
            </div>
          )
        })}
      </div>

      {/* Ganztägig-Strip (Projekte ohne Startzeit) */}
      {projectsByDay.some(list => list.some(p => !p.start_time)) && (
        <div className="project-cal-week-allday-row">
          <div className="project-cal-week-allday-label">Ganztägig</div>
          {days.map((d, i) => {
            const dayISO = toDateStr(d)
            const allDayProjects = projectsByDay[i].filter(p => !p.start_time)
            return (
              <div
                key={i}
                className={`project-cal-week-allday-cell${hoverDayISO === dayISO ? ' project-cal-drop-hover' : ''}`}
                onDragOver={e => { e.preventDefault(); setHoverDayISO(dayISO) }}
                onDragLeave={() => setHoverDayISO(prev => prev === dayISO ? null : prev)}
                onDrop={e => handleAllDayDrop(e, d)}
              >
                {allDayProjects.map(p => renderBlock(p, dayISO, true))}
              </div>
            )
          })}
        </div>
      )}

      {/* Zeitraster */}
      <div className="project-cal-week-body" style={{ height: gridHeight + 1 }}>
        <div className="project-cal-week-hours">
          {hours.slice(0, -1).map(h => (
            <div key={h} className="project-cal-week-hour-label" style={{ height: WEEK_HOUR_HEIGHT }}>
              {String(h).padStart(2, '0')}:00
            </div>
          ))}
        </div>

        {days.map((d, i) => {
          const dayISO = toDateStr(d)
          const timed = projectsByDay[i].filter(p => p.start_time)
          const lanes = computeLanes(timed)
          return (
            <div
              key={i}
              className={`project-cal-week-day-col${dropPreview?.dayISO === dayISO ? ' project-cal-drop-hover' : ''}`}
              onDragOver={e => {
                e.preventDefault()
                const rect = e.currentTarget.getBoundingClientRect()
                const topPx = e.clientY - rect.top - dragGrabYRef.current
                setDropPreview({ dayISO, topPx, time: yToSnappedTime(topPx) })
              }}
              onDragLeave={e => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setDropPreview(prev => prev?.dayISO === dayISO ? null : prev)
                }
              }}
              onDrop={e => handleTimedDrop(e, d)}
            >
              {hours.slice(0, -1).map(h => (
                <div key={h} className="project-cal-week-hour-cell" style={{ height: WEEK_HOUR_HEIGHT }} />
              ))}
              {timed.map(p => renderBlock(p, dayISO, false, lanes.get(p.id)))}
              {dropPreview?.dayISO === dayISO && (
                <div
                  className="project-cal-week-drop-line"
                  style={{ top: Math.max(0, Math.min(gridHeight, dropPreview.topPx)) }}
                >
                  <span className="project-cal-week-drop-time">{dropPreview.time}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ProjectScheduleCalendar({
  projects, staff, loading, canton = 'ZH', onSelect, onReschedule,
  onVisibleWeekChange, onVisibleStaffChange,
}: Props) {
  const [viewMode, setViewMode] = useState<'month' | 'week' | 'staff'>('month')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [hiddenStaff, setHiddenStaff] = useState<Set<string>>(new Set())
  // Mitarbeiteransicht: Index des aktuell fokussierten Mitarbeiters (in staff).
  const [staffIndex, setStaffIndex] = useState(0)
  // Index bei geänderter Staff-Liste in gültige Grenzen ziehen.
  const curStaffIndex = staff.length ? Math.min(staffIndex, staff.length - 1) : 0
  const focusedStaff = staff[curStaffIndex] ?? null

  function stepStaff(delta: number) {
    if (staff.length === 0) return
    setStaffIndex(((curStaffIndex + delta) % staff.length + staff.length) % staff.length)
  }

  // Wochenstart der aktuell sichtbaren Ansicht nach oben melden, damit der
  // PDF-Export-Button im Screen-Header weiß, welche Woche er anfordern muss.
  useEffect(() => {
    if (!onVisibleWeekChange) return
    onVisibleWeekChange(toDateStr(getWeekDays(currentDate)[0]))
  }, [currentDate, onVisibleWeekChange])

  // Filter-Auswahl an den Screen melden: null = kein Filter (alle), sonst Liste der sichtbaren IDs.
  // In der Mitarbeiteransicht ist das genau der fokussierte Mitarbeiter → dessen
  // Woche landet auch im Wochenplan-PDF.
  useEffect(() => {
    if (!onVisibleStaffChange) return
    if (viewMode === 'staff') {
      onVisibleStaffChange(focusedStaff ? [focusedStaff.id] : [])
      return
    }
    if (hiddenStaff.size === 0) onVisibleStaffChange(null)
    else onVisibleStaffChange(staff.filter(s => !hiddenStaff.has(s.id)).map(s => s.id))
  }, [hiddenStaff, staff, onVisibleStaffChange, viewMode, focusedStaff])

  function toggleStaff(id: string) {
    setHiddenStaff(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // Filter: Projekt sichtbar, wenn kein Filter aktiv oder mind. ein zugewiesener
  // Monteur nicht ausgeblendet ist. Projekte ohne Monteure verschwinden, sobald
  // ein Filter gesetzt ist — sonst würden sie das "Alle ausblenden" ignorieren.
  // Stale monteur_ids (nicht mehr in staff) werden ignoriert, sonst könnten sie
  // das Filter aushebeln (hiddenStaff enthält nur bekannte Staff-IDs).
  const staffIds = new Set(staff.map(s => s.id))
  const visibleProjects = projects.filter(p => {
    // Mitarbeiteransicht: nur Einsätze des fokussierten Mitarbeiters — als
    // Monteur zugewiesen oder als Projektleiter verantwortlich.
    if (viewMode === 'staff') {
      if (!focusedStaff) return false
      return (p.monteur_ids?.includes(focusedStaff.id) ?? false) || p.projektleiter_id === focusedStaff.id
    }
    if (hiddenStaff.size === 0) return true
    if (!p.monteur_ids || p.monteur_ids.length === 0) return false
    return p.monteur_ids.some(id => staffIds.has(id) && !hiddenStaff.has(id))
  })

  const year = currentDate.getFullYear()
  const holidays = new Map<string, string>([
    ...getSwissHolidays(year - 1, canton),
    ...getSwissHolidays(year, canton),
    ...getSwissHolidays(year + 1, canton),
  ])

  function handlePrev() {
    if (viewMode === 'month') {
      setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))
    } else {
      setCurrentDate(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n })
    }
  }

  function handleNext() {
    if (viewMode === 'month') {
      setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))
    } else {
      setCurrentDate(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n })
    }
  }

  const title = viewMode === 'month'
    ? currentDate.toLocaleDateString('de-CH', { month: 'long', year: 'numeric' })
    : (() => {
        const days = getWeekDays(currentDate)
        const from = days[0].toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit' })
        const to = days[6].toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })
        return `${from} – ${to}`
      })()

  return (
    <div>
      <div className="absence-cal-toolbar">
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            className={`admin-btn admin-btn-sm ${viewMode === 'month' ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
            onClick={() => setViewMode('month')}
          >Monat</button>
          <button
            className={`admin-btn admin-btn-sm ${viewMode === 'week' ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
            onClick={() => setViewMode('week')}
          >Woche</button>
          <button
            className={`admin-btn admin-btn-sm ${viewMode === 'staff' ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
            onClick={() => setViewMode('staff')}
          >Mitarbeiter</button>
        </div>

        <div className="absence-cal-title">{title}</div>

        <div style={{ display: 'flex', gap: 6 }}>
          <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={handlePrev}>←</button>
          <button
            className="admin-btn admin-btn-secondary admin-btn-sm"
            onClick={() => setCurrentDate(new Date())}
          >Heute</button>
          <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={handleNext}>→</button>
        </div>
      </div>

      {!loading && viewMode === 'staff' && staff.length > 0 && (
        <div className="project-cal-staff-switcher">
          <span className="project-cal-filter-label">Mitarbeiter</span>
          <div className="project-cal-staff-switcher-nav">
            <button
              type="button"
              className="admin-btn admin-btn-secondary admin-btn-sm"
              onClick={() => stepStaff(-1)}
              title="Vorheriger Mitarbeiter"
            >←</button>
            <select
              className="admin-input project-cal-staff-switcher-select"
              value={focusedStaff?.id ?? ''}
              onChange={e => {
                const idx = staff.findIndex(s => s.id === e.target.value)
                if (idx >= 0) setStaffIndex(idx)
              }}
            >
              {staff.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <button
              type="button"
              className="admin-btn admin-btn-secondary admin-btn-sm"
              onClick={() => stepStaff(1)}
              title="Nächster Mitarbeiter"
            >→</button>
          </div>
          <span className="project-cal-filter-count">{curStaffIndex + 1} / {staff.length}</span>
        </div>
      )}

      {!loading && viewMode !== 'staff' && staff.length > 0 && (
        <div className="project-cal-filter">
          <div className="project-cal-filter-head">
            <span>
              <span className="project-cal-filter-label">Monteure</span>
              <span className="project-cal-filter-count">
                {staff.length - hiddenStaff.size} von {staff.length} sichtbar
              </span>
            </span>
            <button
              type="button"
              className="project-schedule-mini-btn"
              onClick={() => {
                const allHidden = hiddenStaff.size === staff.length
                setHiddenStaff(allHidden ? new Set() : new Set(staff.map(s => s.id)))
              }}
            >
              {hiddenStaff.size === staff.length ? 'Alle anzeigen' : 'Alle ausblenden'}
            </button>
          </div>
          <div className="absence-cal-staff-filter">
            {staff.map(s => (
              <button
                key={s.id}
                className={`absence-cal-staff-chip${hiddenStaff.has(s.id) ? ' hidden' : ''}`}
                onClick={() => toggleStaff(s.id)}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="admin-loading"><div className="admin-spinner" /> Laden…</div>
      ) : viewMode === 'month' ? (
        <MonthView
          projects={visibleProjects}
          currentDate={currentDate}
          onSelect={onSelect}
          onReschedule={(id, d, t) => { void onReschedule(id, d, t) }}
          holidays={holidays}
        />
      ) : viewMode === 'staff' && !focusedStaff ? (
        <div className="admin-empty">Keine Mitarbeiter verfügbar.</div>
      ) : (
        <WeekView
          projects={visibleProjects}
          staff={staff}
          currentDate={currentDate}
          onSelect={onSelect}
          onReschedule={(id, d, t) => { void onReschedule(id, d, t) }}
          holidays={holidays}
        />
      )}

      {!loading && <CalendarLegend canton={canton} />}
    </div>
  )
}
