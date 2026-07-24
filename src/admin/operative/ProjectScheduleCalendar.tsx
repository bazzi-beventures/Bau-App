import { useEffect, useRef, useState } from 'react'
import { Project, projectCustomerName } from './ProjectsScreen'
import type { SchedulingConfig } from '../../api/admin'
import { useIsMobile } from '../useIsMobile'
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

// Kalender-Eintrag = EIN Termin (project_appointments). Der Screen spreadet das
// Projekt und überlagert die Terminfelder; `id` ist die TERMIN-ID — dadurch sind
// Keys/Lanes/Drag&Drop je Termin eindeutig, auch bei mehreren Terminen desselben
// Projekts. termin_badge: Typ-Label (z.B. "Aufmass"), leer beim Standardfall.
export type CalendarEntry = Project & { termin_badge?: string }

interface Props {
  projects: CalendarEntry[]
  staff: StaffLite[]
  loading: boolean
  canton?: string
  onSelect: (p: Project) => void
  // Verschiebt einen Einsatz im Kalender. deltaDays = Tagesversatz; startTime
  // steuert die Uhrzeit: undefined = Zeit beibehalten (Monat / Ganztägig-Strip),
  // 'HH:MM' = neue Startzeit (Drop ins Zeitraster), null = Zeit löschen (ganztägig).
  onReschedule: (id: string, deltaDays: number, startTime?: string | null) => Promise<void> | void
  // Neuer Termin per Aufziehen im Wochen-Zeitraster. monteurId ist in der
  // Mitarbeiteransicht der fokussierte Mitarbeiter (vorausgewählt), sonst null.
  onCreateSlot?: (dateISO: string, startTime: string, endTime: string, monteurId: string | null) => void
  // Meldet die aktuell sichtbare Kalenderwoche (Mo, ISO-Datum) hoch — für PDF-Export.
  onVisibleWeekChange?: (mondayIso: string) => void
  // Meldet die aktuell im Filter aktiven Staff-IDs hoch (alle ohne Hide-Flag).
  // Wenn null gemeldet wird, ist kein Filter aktiv (Default = alle Monteure).
  onVisibleStaffChange?: (visibleIds: string[] | null) => void
  // Tenant-Anzeige-Config: Einsatz-Art-Farben + optionale Kachel-Felder.
  schedulingConfig?: SchedulingConfig
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
// Die --kind-*-Variablen setzt der Kalender-Root aus der Tenant-Config (scheduling_config).
// Fehlt eine Variable, greift der hier hinterlegte Default.
const KIND_COLORS: Record<string, string> = {
  project:     'var(--kind-project, var(--primary))',
  teamsitzung: 'var(--kind-teamsitzung, #7c3aed)',  // Lila
  lagerarbeit: 'var(--kind-lagerarbeit, #d97706)',  // Bernstein
  werkstatt:   'var(--kind-werkstatt, #0d9488)',    // Türkis
  sonstiges:   'var(--kind-sonstiges, #475569)',    // Slate
}

function pillBg(p: Project): string {
  return KIND_COLORS[p.kind || 'project'] ?? KIND_COLORS.project
}

// Optionale Zusatz-Zeilen auf der Kachel, gesteuert per Tenant-Config (scheduling_config.fields).
function pillExtraLines(p: Project, staff: StaffLite[], fields?: Record<string, boolean>): string[] {
  if (!fields) return []
  const lines: string[] = []
  if (fields.address && p.object_address) lines.push(p.object_address)
  if (fields.projektleiter && p.projektleiter_id) {
    const pl = staff.find(s => s.id === p.projektleiter_id)?.name
    if (pl) lines.push(`PL: ${pl}`)
  }
  if (fields.customer) { const c = projectCustomerName(p); if (c) lines.push(c) }
  if (fields.bemerkung && p.bemerkung) lines.push(p.bemerkung)
  return lines
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
        Tipp: Einsatz greifen und auf einen anderen Tag ziehen — in der Wochenansicht auch auf eine andere Uhrzeit. Auf freier Fläche einen Zeitraum aufziehen, um einen neuen Termin zu planen.
      </div>
    </div>
  )
}

// ─── Month View ───────────────────────────────────────────────────────────────

function MonthView({
  projects, staff, fields, currentDate, onSelect, onReschedule, holidays,
}: {
  projects: CalendarEntry[]
  staff: StaffLite[]
  fields?: Record<string, boolean>
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
              {dayProjects.map((p, j) => {
                const extra = pillExtraLines(p, staff, fields)
                return (
                  <div
                    key={j}
                    className={`absence-cal-pill project-cal-pill${extra.length ? ' has-extra' : ''}`}
                    draggable
                    onDragStart={e => setDragPayload(e, p.id, dayISO)}
                    title={`${p.name}${p.termin_badge ? ` (${p.termin_badge})` : ''} · ${fmtRange(p)}`}
                    style={{ background: pillBg(p) }}
                    onClick={() => onSelect(p)}
                  >
                    {p.termin_badge && <span className="project-cal-termin-badge">{p.termin_badge}</span>}
                    {pillLabel(p)}
                    {extra.map((line, k) => (
                      <div key={k} className="project-cal-pill-extra">{line}</div>
                    ))}
                  </div>
                )
              })}
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

// Effektive Block-Unterkante in Minuten für die Overlap-Erkennung. Blöcke werden
// mindestens so hoch gerendert wie in renderBlock (22px-Floor, 44px ohne Endzeit, plus
// Zusatzfelder); diese Mindesthöhe rechnen wir in Minuten zurück, damit zeitlich knappe,
// aber visuell überlappende Blöcke getrennte Spalten bekommen statt sich zu überlagern.
function effectiveEndMin(ev: Project, staff: StaffLite[], fields?: Record<string, boolean>): number {
  const s = hhmmToMin(ev.start_time!)
  const actualEnd = ev.end_time ? hhmmToMin(ev.end_time) : s + 60
  const extra = pillExtraLines(ev, staff, fields)
  const extraMinHeight = extra.length ? 30 + extra.length * 14 : 0
  const heightPx = ev.end_time
    ? Math.max(blockHeightPx(ev.start_time!, ev.end_time), extraMinHeight)
    : Math.max(WEEK_HOUR_HEIGHT, 44, extraMinHeight)
  return Math.max(actualEnd, s + (heightPx / WEEK_HOUR_HEIGHT) * 60)
}

// Spalten-Layout für überlappende Events (Cluster-basiert, wie Google Calendar):
// Events, die sich zeitlich ODER visuell (Mindesthöhe) überlappen, kommen auf parallele
// Lanes. Overlap-Ende = effectiveEndMin (nicht die reine Endzeit).
function computeLanes(events: Project[], staff: StaffLite[], fields?: Record<string, boolean>): Map<string, { col: number; total: number }> {
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
      const e = effectiveEndMin(ev, staff, fields)
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
    const e = effectiveEndMin(ev, staff, fields)
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
  projects, staff, fields, currentDate, onSelect, onReschedule, onCreateSlot, holidays, greyAfter, greyUntil,
}: {
  projects: CalendarEntry[]
  staff: StaffLite[]
  fields?: Record<string, boolean>
  currentDate: Date
  onSelect: (p: Project) => void
  onReschedule: (id: string, deltaDays: number, startTime?: string | null) => void
  onCreateSlot?: (dayISO: string, startTime: string, endTime: string) => void
  holidays: Map<string, string>
  // Nicht-Arbeitszeit-Fenster: ab greyAfter grau ('' = aus), bis greyUntil
  // ('' = bis Rasterende). Nur Werktage, rein visuell.
  greyAfter?: string
  greyUntil?: string
}) {
  const days = getWeekDays(currentDate)
  const [hoverDayISO, setHoverDayISO] = useState<string | null>(null)
  // Live-Vorschau beim Ziehen ins Zeitraster: an welchem Tag/Höhe der Block landet.
  const [dropPreview, setDropPreview] = useState<{ dayISO: string; topPx: number; time: string } | null>(null)
  // Greif-Offset (px ab Block-Oberkante) des laufenden Drags. dataTransfer ist
  // während dragover nicht lesbar, darum hier zwischengespeichert.
  const dragGrabYRef = useRef(0)
  // Neuen Termin aufziehen: laufender Zug (Ref, für die Fenster-Listener) +
  // sichtbare Vorschaubox (State). colTop = Rasteroberkante der gegriffenen Spalte.
  const createRef = useRef<{ dayISO: string; colTop: number; startPx: number; endPx: number } | null>(null)
  const [createBox, setCreateBox] = useState<{ dayISO: string; topPx: number; heightPx: number; startTime: string; endTime: string } | null>(null)
  const projById = new Map(projects.map(p => [p.id, p]))

  const hours: number[] = []
  for (let h = WEEK_HOURS_START; h <= WEEK_HOURS_END; h++) hours.push(h)
  const gridHeight = (WEEK_HOURS_END - WEEK_HOURS_START) * WEEK_HOUR_HEIGHT

  // Ausgrau-Fenster (Nicht-Arbeitszeit): Y-Positionen des grauen Bereichs an
  // Werktagen (Mo–Fr). greyTopPx = Fenster-Start (null = aus). greyBottomPx =
  // Fenster-Ende; greyUntil leer/ungültig => bis Rasterende (Feierabend).
  // Beide auf das sichtbare Raster begrenzt.
  const greyTopPx = greyAfter && /^\d{2}:\d{2}$/.test(greyAfter)
    ? Math.max(0, Math.min(gridHeight, timeOffsetPx(greyAfter)))
    : null
  const greyBottomPx = greyUntil && /^\d{2}:\d{2}$/.test(greyUntil)
    ? Math.max(0, Math.min(gridHeight, timeOffsetPx(greyUntil)))
    : gridHeight

  const projectsByDay: CalendarEntry[][] = days.map(d => projects.filter(p => projectCoversDay(p, d)))

  // Vorschaubox aus dem laufenden Zug berechnen (auf das Raster begrenzt).
  function createBoxFrom(c: { dayISO: string; startPx: number; endPx: number }) {
    const a = Math.max(0, Math.min(gridHeight, Math.min(c.startPx, c.endPx)))
    const b = Math.max(0, Math.min(gridHeight, Math.max(c.startPx, c.endPx)))
    return { dayISO: c.dayISO, topPx: a, heightPx: b - a, startTime: yToSnappedTime(a), endTime: yToSnappedTime(b) }
  }

  // Aufziehen starten — nur auf leerer Rasterfläche, nicht auf einem Block
  // (dort greift der native Drag zum Verschieben). Fenster-Listener, damit das
  // Ziehen auch ausserhalb der Spalte weiterläuft.
  function beginCreate(e: React.MouseEvent, dayISO: string) {
    if (!onCreateSlot || e.button !== 0) return
    if ((e.target as HTMLElement).closest('.project-cal-week-event')) return
    const rect = e.currentTarget.getBoundingClientRect()
    const y = e.clientY - rect.top
    createRef.current = { dayISO, colTop: rect.top, startPx: y, endPx: y }
    setCreateBox(createBoxFrom(createRef.current))
    window.addEventListener('mousemove', onCreateMove)
    window.addEventListener('mouseup', onCreateUp)
    e.preventDefault()
  }
  function onCreateMove(e: MouseEvent) {
    const c = createRef.current
    if (!c) return
    c.endPx = e.clientY - c.colTop
    setCreateBox(createBoxFrom(c))
  }
  function onCreateUp() {
    window.removeEventListener('mousemove', onCreateMove)
    window.removeEventListener('mouseup', onCreateUp)
    const c = createRef.current
    createRef.current = null
    setCreateBox(null)
    if (!c || !onCreateSlot) return
    const a = Math.max(0, Math.min(gridHeight, Math.min(c.startPx, c.endPx)))
    const b = Math.max(0, Math.min(gridHeight, Math.max(c.startPx, c.endPx)))
    const startTime = yToSnappedTime(a)
    let endTime = yToSnappedTime(b)
    // Klick oder winziger Zug → 1-Stunden-Default ab Startzeit.
    if (hhmmToMin(endTime) - hhmmToMin(startTime) < WEEK_SNAP_MIN) {
      endTime = minToHHMM(Math.min(WEEK_HOURS_END * 60, hhmmToMin(startTime) + 60))
    }
    onCreateSlot(c.dayISO, startTime, endTime)
  }

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
    p: CalendarEntry,
    dayISO: string,
    allDay: boolean,
    lane?: { col: number; total: number },
  ) {
    const monteurs = projectMonteurNames(p, staff)
    const timeLabel = fmtTimeRange(p)
    const extra = pillExtraLines(p, staff, fields)
    const laneStyle: React.CSSProperties = {}
    if (!allDay && lane && lane.total > 1) {
      // Gleichverteilte Lanes mit kleinem Spalt; left/right der CSS-Defaults
      // werden ueberschrieben (right: auto), damit width greift.
      const widthPct = 100 / lane.total
      laneStyle.left = `calc(${lane.col * widthPct}% + 2px)`
      laneStyle.width = `calc(${widthPct}% - 4px)`
      laneStyle.right = 'auto'
    }
    // Getaktete Blöcke sind höhenbegrenzt (Dauer). Bei aktiven Zusatzfeldern eine
    // Mindesthöhe erzwingen, damit die Infos sichtbar bleiben statt weggeschnitten
    // zu werden — auch bei kurzen Einsätzen.
    const extraMinHeight = extra.length ? 30 + extra.length * 14 : 0
    return (
      <div
        key={p.id}
        className={`project-cal-week-event${allDay ? ' allday' : ''}${extra.length ? ' has-extra' : ''}`}
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
                minHeight: extraMinHeight || undefined,
                ...laneStyle,
              }
        }
      >
        {timeLabel && !allDay && (
          <div className="project-cal-week-event-time">{timeLabel}</div>
        )}
        <div className="project-cal-week-event-name">
          {p.termin_badge && <span className="project-cal-termin-badge">{p.termin_badge}</span>}
          {p.name}
        </div>
        {extra.map((line, k) => (
          <div key={k} className="project-cal-week-event-extra">{line}</div>
        ))}
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
          const lanes = computeLanes(timed, staff, fields)
          // Nur Werktage (Mo–Fr) ausgrauen; Wochenende bleibt normal.
          const dow = d.getDay() // 0 = So, 6 = Sa
          const showDim = greyTopPx !== null && dow >= 1 && dow <= 5 && greyBottomPx > greyTopPx
          return (
            <div
              key={i}
              className={`project-cal-week-day-col${dropPreview?.dayISO === dayISO ? ' project-cal-drop-hover' : ''}${onCreateSlot ? ' creatable' : ''}`}
              onMouseDown={e => beginCreate(e, dayISO)}
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
              {showDim && (
                <div
                  className="project-cal-week-dim"
                  style={{ top: greyTopPx!, height: greyBottomPx - greyTopPx! }}
                  aria-hidden="true"
                />
              )}
              {timed.map(p => renderBlock(p, dayISO, false, lanes.get(p.id)))}
              {dropPreview?.dayISO === dayISO && (
                <div
                  className="project-cal-week-drop-line"
                  style={{ top: Math.max(0, Math.min(gridHeight, dropPreview.topPx)) }}
                >
                  <span className="project-cal-week-drop-time">{dropPreview.time}</span>
                </div>
              )}
              {createBox?.dayISO === dayISO && (
                <div
                  className="project-cal-week-create-box"
                  style={{ top: createBox.topPx, height: Math.max(2, createBox.heightPx) }}
                >
                  <span className="project-cal-week-create-time">
                    {createBox.startTime}–{createBox.endTime}
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Agenda-Ansicht (Mobile) ────────────────────────────────────────────────
// Vertikale Wochen-Agenda: Tage untereinander, Einsätze als Karten. Ersetzt auf
// dem Handy das Zeitraster (dessen Drag&Drop/Aufziehen auf Touch nicht geht).
// Verschieben passiert über das Bearbeitungs-Panel (Tap → onSelect), neue
// Einsätze über den +-Button im Tag-Header (Default-Slot 08:00–09:00).
function AgendaView({
  projects, staff, fields, currentDate, onSelect, onCreateSlot, holidays,
}: {
  projects: CalendarEntry[]
  staff: StaffLite[]
  fields?: Record<string, boolean>
  currentDate: Date
  onSelect: (p: Project) => void
  onCreateSlot?: (dayISO: string, startTime: string, endTime: string) => void
  holidays: Map<string, string>
}) {
  const days = getWeekDays(currentDate)
  const projectsByDay: CalendarEntry[][] = days.map(d => projects.filter(p => projectCoversDay(p, d)))
  return (
    <div className="project-cal-agenda">
      {days.map((day, i) => {
        const dayISO = toDateStr(day)
        const holiday = holidays.get(dayISO)
        const dayProjects = projectsByDay[i]
        return (
          <div key={dayISO} className="project-cal-agenda-day">
            <div className={`project-cal-agenda-day-head${isToday(day) ? ' today' : ''}`}>
              <span>{day.toLocaleDateString('de-CH', { weekday: 'short', day: '2-digit', month: '2-digit' })}</span>
              {holiday && <span className="project-cal-week-day-holiday">{holiday}</span>}
              {onCreateSlot && (
                <button
                  type="button"
                  className="project-cal-agenda-add"
                  onClick={() => onCreateSlot(dayISO, '08:00', '09:00')}
                  aria-label="Einsatz hinzufügen"
                >+</button>
              )}
            </div>
            {dayProjects.length === 0 ? (
              <div className="project-cal-agenda-empty">–</div>
            ) : dayProjects.map(p => {
              const extra = pillExtraLines(p, staff, fields)
              const monteurs = projectMonteurNames(p, staff)
              return (
                <div
                  key={p.id}
                  className="project-cal-agenda-event"
                  style={{ background: pillBg(p) }}
                  onClick={() => onSelect(p)}
                >
                  <span className="project-cal-agenda-event-time">{fmtTimeRange(p) || 'Ganztägig'}</span>
                  <strong>{p.termin_badge ? `${p.termin_badge} · ` : ''}{p.name}</strong>
                  {monteurs && <span className="project-cal-agenda-event-sub">{monteurs}</span>}
                  {extra.map((line, j) => <span key={j} className="project-cal-agenda-event-sub">{line}</span>)}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ProjectScheduleCalendar({
  projects, staff, loading, canton = 'ZH', onSelect, onReschedule, onCreateSlot,
  onVisibleWeekChange, onVisibleStaffChange, schedulingConfig,
}: Props) {
  const [viewMode, setViewMode] = useState<'month' | 'week' | 'staff'>('month')
  const isMobile = useIsMobile()
  const fields = schedulingConfig?.fields
  const greyAfter = schedulingConfig?.grey_after
  const greyUntil = schedulingConfig?.grey_until
  // Einsatz-Art-Farben als scoped CSS-Variablen (--kind-*) auf dem Kalender-Root.
  const kindColorVars: React.CSSProperties = {}
  for (const [k, v] of Object.entries(schedulingConfig?.colors || {})) {
    ;(kindColorVars as Record<string, string>)[`--kind-${k}`] = v
  }
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

  // Auf Mobile ist die Ansicht immer die Wochen-Agenda → Navigation wochenweise,
  // unabhängig vom (dort ausgeblendeten) Monatsmodus.
  const monthNav = viewMode === 'month' && !isMobile

  function handlePrev() {
    if (monthNav) {
      setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))
    } else {
      setCurrentDate(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n })
    }
  }

  function handleNext() {
    if (monthNav) {
      setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))
    } else {
      setCurrentDate(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n })
    }
  }

  // Neuer Termin aus dem Zeitraster: in der Mitarbeiteransicht ist der aktuell
  // fokussierte Mitarbeiter automatisch vorausgewählt, sonst kein Monteur.
  function handleCreateSlot(dayISO: string, startTime: string, endTime: string) {
    const monteurId = viewMode === 'staff' ? focusedStaff?.id ?? null : null
    onCreateSlot?.(dayISO, startTime, endTime, monteurId)
  }

  const title = monthNav
    ? currentDate.toLocaleDateString('de-CH', { month: 'long', year: 'numeric' })
    : (() => {
        const days = getWeekDays(currentDate)
        const from = days[0].toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit' })
        const to = days[6].toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })
        return `${from} – ${to}`
      })()

  return (
    <div style={kindColorVars}>
      <div className="absence-cal-toolbar">
        <div style={{ display: 'flex', gap: 6 }}>
          {isMobile ? (
            <>
              <button
                className={`admin-btn admin-btn-sm ${viewMode !== 'staff' ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
                onClick={() => setViewMode('week')}
              >Alle</button>
              <button
                className={`admin-btn admin-btn-sm ${viewMode === 'staff' ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
                onClick={() => setViewMode('staff')}
              >Mitarbeiter</button>
            </>
          ) : (
            <>
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
            </>
          )}
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
      ) : viewMode === 'staff' && !focusedStaff ? (
        <div className="admin-empty">Keine Mitarbeiter verfügbar.</div>
      ) : isMobile ? (
        <AgendaView
          projects={visibleProjects}
          staff={staff}
          fields={fields}
          currentDate={currentDate}
          onSelect={onSelect}
          onCreateSlot={onCreateSlot ? handleCreateSlot : undefined}
          holidays={holidays}
        />
      ) : viewMode === 'month' ? (
        <MonthView
          projects={visibleProjects}
          staff={staff}
          fields={fields}
          currentDate={currentDate}
          onSelect={onSelect}
          onReschedule={(id, d, t) => { void onReschedule(id, d, t) }}
          holidays={holidays}
        />
      ) : (
        <WeekView
          projects={visibleProjects}
          staff={staff}
          fields={fields}
          currentDate={currentDate}
          onSelect={onSelect}
          onReschedule={(id, d, t) => { void onReschedule(id, d, t) }}
          onCreateSlot={onCreateSlot ? handleCreateSlot : undefined}
          holidays={holidays}
          greyAfter={greyAfter}
          greyUntil={greyUntil}
        />
      )}

      {!loading && !isMobile && <CalendarLegend canton={canton} />}
      {!loading && isMobile && (
        <div className="project-cal-agenda-hint">
          Einsatz antippen zum Bearbeiten, <strong>+</strong> für neuen Einsatz.
        </div>
      )}
    </div>
  )
}
