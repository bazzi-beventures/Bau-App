import { Fragment, useEffect, useRef, useState } from 'react'
import { Project, projectCustomerName } from './ProjectsScreen'
import {
  SCHEDULING_VIEWS, resolveScheduleDistances,
  type SchedulingConfig, type SchedulingViewKey,
} from '../../api/admin'
import { useIsMobile } from '../useIsMobile'
import {
  getSwissHolidays, getWeekDays, getMonthDays, toDateStr, isToday,
  parseDateStr, diffDays, hhmmToMin, minToHHMM,
} from '../utils/calendarHelpers'

// Drag-Transfer payload format: "<projectId>|<grabDayISO>|<grabOffsetY>|<sourceRowId>"
// grabOffsetY = Y-Position des Mauszeigers innerhalb der gegriffenen Pille (px),
// damit beim Drop in das Zeitraster der Block-Anfang dort landet, wo der Block
// (nicht der Cursor) hingehört. sourceRowId = Monteur-Zeile, aus der der Chip in
// der Plantafel gegriffen wurde ('' ausserhalb der Plantafel bzw. Zeile «Ohne Monteur»).
const DRAG_MIME = 'application/x-bau-project'

interface StaffLite {
  id: string
  name: string
}

// Kalender-Eintrag = EIN Termin (project_appointments). Der Screen spreadet das
// Projekt und überlagert die Terminfelder; `id` ist die TERMIN-ID — dadurch sind
// Keys/Lanes/Drag&Drop je Termin eindeutig, auch bei mehreren Terminen desselben
// Projekts. termin_badge: Typ-Label (z.B. "Aufmass"), leer beim Standardfall.
// termin_kind: roher Termin-Typ (aufmass/montage/service/sonstiges) für das
// Typ-Symbol — nur bei Kundenprojekten gesetzt, interne Einsätze nutzen p.kind.
export type CalendarEntry = Project & { termin_badge?: string; termin_kind?: string }

interface Props {
  projects: CalendarEntry[]
  staff: StaffLite[]
  loading: boolean
  canton?: string
  onSelect: (p: Project) => void
  // Verschiebt einen Einsatz im Kalender. deltaDays = Tagesversatz; startTime
  // steuert die Uhrzeit: undefined = Zeit beibehalten (Monat / Ganztägig-Strip),
  // 'HH:MM' = neue Startzeit (Drop ins Zeitraster), null = Zeit löschen (ganztägig).
  // monteurIds = neues Termin-Team (Plantafel: Drop in andere Monteur-Zeile),
  // undefined = Team unverändert.
  onReschedule: (id: string, deltaDays: number, startTime?: string | null, monteurIds?: string[]) => Promise<void> | void
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

// Kleines Typ-Symbol je Aufgaben-Art: Kundenprojekte nach Termin-Typ
// (termin_kind), interne Einsätze nach Einsatz-Art (kind).
const TERMIN_SYMBOLS: Record<string, string> = {
  aufmass: '📐',
  montage: '🔧',
  service: '🛠️',
  sonstiges: '📋',
}
const KIND_SYMBOLS: Record<string, string> = {
  teamsitzung: '👥',
  lagerarbeit: '📦',
  werkstatt: '⚙️',
  sonstiges: '📌',
}

function kindSymbol(p: CalendarEntry): string {
  if (p.kind && p.kind !== 'project') return KIND_SYMBOLS[p.kind] ?? ''
  return TERMIN_SYMBOLS[p.termin_kind ?? 'montage'] ?? ''
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

function setDragPayload(e: React.DragEvent, projectId: string, grabDayISO: string, sourceRowId = '') {
  const grabOffsetY = Math.round(e.nativeEvent.offsetY) || 0
  const raw = `${projectId}|${grabDayISO}|${grabOffsetY}|${sourceRowId}`
  e.dataTransfer.setData(DRAG_MIME, raw)
  e.dataTransfer.setData('text/plain', raw)
  e.dataTransfer.effectAllowed = 'move'
}

function readDragPayload(e: React.DragEvent): { projectId: string; grabDayISO: string; grabOffsetY: number; sourceRowId: string } | null {
  const raw = e.dataTransfer.getData(DRAG_MIME) || e.dataTransfer.getData('text/plain')
  if (!raw || !raw.includes('|')) return null
  const [projectId, grabDayISO, grabOffsetY, sourceRowId] = raw.split('|')
  return { projectId, grabDayISO, grabOffsetY: Number(grabOffsetY) || 0, sourceRowId: sourceRowId || '' }
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
        📐 Aufmass · 🔧 Montage · 🛠️ Service · 📋 Sonstiges · 👥 Teamsitzung · 📦 Lager · ⚙️ Werkstatt
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
                    {kindSymbol(p) && <span className="project-cal-kind-symbol">{kindSymbol(p)}</span>}
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
          {kindSymbol(p) && <span className="project-cal-kind-symbol">{kindSymbol(p)}</span>}
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

// ─── Distanz-Paare (Plantafel) ──────────────────────────────────────────────

// Kanonischer Cache-Key für ein Adresspaar — gleiche Normalisierung wie das
// Backend (getrimmt, lexikografisch sortiert), Trenner ist ein Steuerzeichen,
// das in Adressen nicht vorkommt. null = leer/identisch → keine Distanz nötig.
const PAIR_SEP = '\u0001'

function pairKey(a: string | null | undefined, b: string | null | undefined): string | null {
  const x = (a ?? '').trim()
  const y = (b ?? '').trim()
  if (!x || !y || x === y) return null
  return x <= y ? `${x}${PAIR_SEP}${y}` : `${y}${PAIR_SEP}${x}`
}

// ─── Plantafel (Monteure als Zeilen × Wochentage) ───────────────────────────
// Dispositions-Sicht: eine Zeile pro Monteur, Spalten Mo–So. Ein Termin mit
// mehreren Monteuren erscheint in jeder betroffenen Zeile; Termine ohne
// (bekannten) Monteur sammeln sich in der Zeile «Ohne Monteur». Drag&Drop
// verschiebt den Tag; ein Drop in einer anderen Monteur-Zeile weist zusätzlich
// den Quell-Monteur auf den Ziel-Monteur um (restliches Team bleibt erhalten).

function PlantafelView({
  projects, staff, rowStaff, fields, currentDate, onSelect, onReschedule, onCreateCell, holidays, showDistances,
}: {
  projects: CalendarEntry[]
  staff: StaffLite[]
  // Zeilen der Tafel = Monteure nach aktivem Filter (staff bleibt die volle
  // Liste für Namensauflösung in Tooltips/Zusatzfeldern).
  rowStaff: StaffLite[]
  fields?: Record<string, boolean>
  currentDate: Date
  onSelect: (p: Project) => void
  onReschedule: (id: string, deltaDays: number, startTime?: string | null, monteurIds?: string[]) => void
  // Klick auf leere Zelle → neuer Termin an diesem Tag mit dem Zeilen-Monteur
  // vorbelegt (null = Zeile «Ohne Monteur»).
  onCreateCell?: (dayISO: string, monteurId: string | null) => void
  holidays: Map<string, string>
  // Fahrdistanzen zwischen aufeinanderfolgenden Einsätzen anzeigen (Tenant-Config).
  showDistances?: boolean
}) {
  const days = getWeekDays(currentDate)
  // Hover-Zelle beim Drag: `${dayISO}|${rowId}` (rowId '' = «Ohne Monteur»).
  const [hoverCell, setHoverCell] = useState<string | null>(null)
  // Aufgelöste Distanzen (pairKey → km); wächst über Wochenwechsel mit.
  const [distances, setDistances] = useState<Record<string, number>>({})
  // Bereits angefragte Paare — verhindert Wiederholungs-Requests für Paare,
  // die der Server (noch) nicht auflösen konnte.
  const requestedPairsRef = useRef<Set<string>>(new Set())
  const projById = new Map(projects.map(p => [p.id, p]))
  const staffIds = new Set(staff.map(s => s.id))

  // Einträge einer Zelle: rowId = Monteur-Zeile, null = «Ohne Monteur».
  // Ganztägige zuerst, danach chronologisch.
  function cellEntries(rowId: string | null, day: Date): CalendarEntry[] {
    return projects
      .filter(p => projectCoversDay(p, day) && (
        rowId === null
          ? !(p.monteur_ids || []).some(id => staffIds.has(id))
          : (p.monteur_ids || []).includes(rowId)
      ))
      .sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''))
  }

  const hasUnassigned = days.some(d => cellEntries(null, d).length > 0)

  // Aufeinanderfolgende GETAKTETE Einsätze einer Zelle mit verschiedenen
  // Objektadressen — nur zwischen denen ergibt eine Fahrdistanz Sinn
  // (Ganztägige haben keine Reihenfolge, «Ohne Monteur» keine Route).
  const neededPairs = new Set<string>()
  if (showDistances) {
    for (const s of rowStaff) {
      for (const d of days) {
        const timed = cellEntries(s.id, d).filter(p => p.start_time)
        for (let i = 0; i + 1 < timed.length; i++) {
          const k = pairKey(timed[i].object_address, timed[i + 1].object_address)
          if (k) neededPairs.add(k)
        }
      }
    }
  }
  const neededSig = [...neededPairs].sort().join('\n')

  // Fehlende Paare gebündelt beim Server anfragen (cache-first, dort gedeckelt).
  // Deps bewusst nur die Paar-Signatur: erneut versucht wird erst, wenn sich
  // die sichtbare Tafel ändert — nicht bei jedem Distanz-Merge.
  useEffect(() => {
    if (!neededSig) return
    const missing = neededSig.split('\n').filter(k => !requestedPairsRef.current.has(k))
    if (missing.length === 0) return
    missing.forEach(k => requestedPairsRef.current.add(k))
    let cancelled = false
    resolveScheduleDistances(missing.map(k => k.split(PAIR_SEP) as [string, string]))
      .then(res => {
        if (cancelled || res.distances.length === 0) return
        setDistances(prev => {
          const next = { ...prev }
          for (const d of res.distances) {
            const k = pairKey(d.a, d.b)
            if (k) next[k] = d.km
          }
          return next
        })
      })
      // Distanz ist reine Zusatzinfo — Fehler still schlucken, nichts anzeigen.
      .catch(() => {})
    return () => { cancelled = true }
  }, [neededSig])

  // km zwischen zwei Einsätzen (beide getaktet, Adressen vorhanden/verschieden).
  function distBetween(a: CalendarEntry, b: CalendarEntry): number | null {
    if (!a.start_time || !b.start_time) return null
    const k = pairKey(a.object_address, b.object_address)
    if (!k) return null
    return distances[k] ?? null
  }

  // Doppelbuchung: getaktete Einsätze desselben Monteurs am selben Tag, die sich
  // zeitlich überschneiden (ohne Endzeit zählt 1 h). Nur echte Ressourcen-
  // Konflikte — die Sammelzeile «Ohne Monteur» bleibt aussen vor.
  function conflictIds(entries: CalendarEntry[]): Set<string> {
    const timed = entries.filter(p => p.start_time)
    const out = new Set<string>()
    for (let i = 0; i < timed.length; i++) {
      for (let j = i + 1; j < timed.length; j++) {
        const a = timed[i], b = timed[j]
        const aS = hhmmToMin(a.start_time!)
        const aE = a.end_time ? hhmmToMin(a.end_time) : aS + 60
        const bS = hhmmToMin(b.start_time!)
        const bE = b.end_time ? hhmmToMin(b.end_time) : bS + 60
        if (aS < bE && bS < aE) { out.add(a.id); out.add(b.id) }
      }
    }
    return out
  }

  function handleDrop(e: React.DragEvent, day: Date, rowId: string | null) {
    e.preventDefault()
    setHoverCell(null)
    const payload = readDragPayload(e)
    if (!payload) return
    const proj = projById.get(payload.projectId)
    if (!proj) return
    const delta = diffDays(payload.grabDayISO, toDateStr(day))
    const srcRow = payload.sourceRowId || null
    // Zeilenwechsel = Umzuweisung: Quell-Monteur raus, Ziel-Monteur rein.
    // Drop in «Ohne Monteur» ändert das Team nicht (nur Tagesversatz).
    let newTeam: string[] | undefined
    if (rowId && rowId !== srcRow) {
      const team = (proj.monteur_ids || []).filter(id => id !== srcRow)
      if (!team.includes(rowId)) team.push(rowId)
      newTeam = team
    }
    if (delta !== 0 || newTeam) onReschedule(proj.id, delta, undefined, newTeam)
  }

  function renderChip(p: CalendarEntry, dayISO: string, rowId: string | null, conflict: boolean) {
    const timeLabel = fmtTimeRange(p)
    const extra = pillExtraLines(p, staff, fields)
    const monteurs = projectMonteurNames(p, staff)
    const symbol = kindSymbol(p)
    return (
      <div
        key={p.id}
        className={`project-cal-board-chip${conflict ? ' conflict' : ''}`}
        draggable
        onDragStart={e => setDragPayload(e, p.id, dayISO, rowId ?? '')}
        onClick={() => onSelect(p)}
        style={{ background: pillBg(p) }}
        title={[
          p.name, timeLabel, monteurs, ...extra,
          conflict ? '⚠ Zeitliche Überschneidung mit einem anderen Einsatz dieses Monteurs' : '',
        ].filter(Boolean).join(' · ')}
      >
        <span className="project-cal-board-chip-time">
          {symbol && <span className="project-cal-kind-symbol">{symbol}</span>}
          {timeLabel || 'ganztägig'}
          {conflict && <span className="project-cal-board-chip-warn">⚠</span>}
        </span>
        <span className="project-cal-board-chip-name">
          {p.termin_badge && <span className="project-cal-termin-badge">{p.termin_badge}</span>}
          {p.name}
        </span>
      </div>
    )
  }

  function renderRow(rowId: string | null, label: string) {
    return (
      <div key={rowId ?? '∅'} className="project-cal-board-row">
        <div className={`project-cal-board-staff${rowId === null ? ' unassigned' : ''}`}>{label}</div>
        {days.map(d => {
          const dayISO = toDateStr(d)
          const cellKey = `${dayISO}|${rowId ?? ''}`
          const entries = cellEntries(rowId, d)
          const conflicts = rowId !== null ? conflictIds(entries) : new Set<string>()
          return (
            <div
              key={dayISO}
              className={
                `project-cal-board-cell${isToday(d) ? ' today' : ''}` +
                `${holidays.has(dayISO) ? ' holiday' : ''}` +
                `${hoverCell === cellKey ? ' project-cal-drop-hover' : ''}` +
                `${onCreateCell ? ' creatable' : ''}`
              }
              onDragOver={e => { e.preventDefault(); setHoverCell(cellKey) }}
              onDragLeave={() => setHoverCell(prev => prev === cellKey ? null : prev)}
              onDrop={e => handleDrop(e, d, rowId)}
              onClick={e => {
                // Nur Klicks auf die freie Zellfläche — Chips öffnen ihr Panel selbst.
                if (onCreateCell && e.target === e.currentTarget) onCreateCell(dayISO, rowId)
              }}
              title={onCreateCell ? 'Klicken, um hier einen Einsatz zu planen' : undefined}
            >
              {entries.map((p, i) => {
                const next = entries[i + 1]
                const km = showDistances && rowId !== null && next ? distBetween(p, next) : null
                return (
                  <Fragment key={p.id}>
                    {renderChip(p, dayISO, rowId, conflicts.has(p.id))}
                    {km !== null && (
                      <div
                        className="project-cal-board-dist"
                        title={`Fahrstrecke ${p.object_address} → ${next.object_address}`}
                      >
                        ↓ {km.toLocaleString('de-CH', { maximumFractionDigits: 1 })} km
                      </div>
                    )}
                  </Fragment>
                )
              })}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="project-cal-board">
      <div className="project-cal-board-row project-cal-board-header">
        <div className="project-cal-board-staff">Monteur</div>
        {days.map(d => {
          const holidayName = holidays.get(toDateStr(d))
          return (
            <div key={toDateStr(d)} className={`project-cal-board-day-head${isToday(d) ? ' today' : ''}`}>
              <span className="project-cal-week-day-wd">{d.toLocaleDateString('de-CH', { weekday: 'short' })}</span>{' '}
              <span className="project-cal-week-day-num">{d.getDate()}.{d.getMonth() + 1}.</span>
              {holidayName && <div className="project-cal-week-day-holiday">{holidayName}</div>}
            </div>
          )
        })}
      </div>
      {rowStaff.map(s => renderRow(s.id, s.name))}
      {hasUnassigned && renderRow(null, 'Ohne Monteur')}
      {rowStaff.length === 0 && !hasUnassigned && (
        <div className="admin-empty">Keine Monteure sichtbar.</div>
      )}
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
                  <strong>{kindSymbol(p) ? `${kindSymbol(p)} ` : ''}{p.termin_badge ? `${p.termin_badge} · ` : ''}{p.name}</strong>
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
  const [viewMode, setViewMode] = useState<SchedulingViewKey>('month')
  const isMobile = useIsMobile()
  const fields = schedulingConfig?.fields
  const greyAfter = schedulingConfig?.grey_after
  const greyUntil = schedulingConfig?.grey_until
  // Tenant-schaltbare Ansichten: fehlender Key = an (Default). Liegt die aktuell
  // gewählte Ansicht ausserhalb der erlaubten, greift die erste erlaubte —
  // abgeleitet statt per Effect, damit auch die async nachladende Config sofort wirkt.
  const viewEnabled = (k: SchedulingViewKey) => schedulingConfig?.views?.[k] !== false
  const availableViews = SCHEDULING_VIEWS.filter(v => viewEnabled(v.key))
  const view: SchedulingViewKey = viewEnabled(viewMode) ? viewMode : (availableViews[0]?.key ?? 'month')
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
    if (view === 'staff') {
      onVisibleStaffChange(focusedStaff ? [focusedStaff.id] : [])
      return
    }
    if (hiddenStaff.size === 0) onVisibleStaffChange(null)
    else onVisibleStaffChange(staff.filter(s => !hiddenStaff.has(s.id)).map(s => s.id))
  }, [hiddenStaff, staff, onVisibleStaffChange, view, focusedStaff])

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
    if (view === 'staff') {
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
  const monthNav = view === 'month' && !isMobile

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
    const monteurId = view === 'staff' ? focusedStaff?.id ?? null : null
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
                className={`admin-btn admin-btn-sm ${view !== 'staff' ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
                onClick={() => setViewMode('week')}
              >Alle</button>
              {viewEnabled('staff') && (
                <button
                  className={`admin-btn admin-btn-sm ${view === 'staff' ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
                  onClick={() => setViewMode('staff')}
                >Mitarbeiter</button>
              )}
            </>
          ) : (
            availableViews.map(v => (
              <button
                key={v.key}
                className={`admin-btn admin-btn-sm ${view === v.key ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
                onClick={() => setViewMode(v.key)}
              >{v.label}</button>
            ))
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

      {!loading && view === 'staff' && staff.length > 0 && (
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

      {!loading && view !== 'staff' && staff.length > 0 && (
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
      ) : view === 'staff' && !focusedStaff ? (
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
      ) : view === 'plantafel' ? (
        <PlantafelView
          projects={visibleProjects}
          staff={staff}
          rowStaff={hiddenStaff.size > 0 ? staff.filter(s => !hiddenStaff.has(s.id)) : staff}
          fields={fields}
          currentDate={currentDate}
          onSelect={onSelect}
          onReschedule={(id, d, t, m) => { void onReschedule(id, d, t, m) }}
          onCreateCell={onCreateSlot
            ? (dayISO, monteurId) => onCreateSlot(dayISO, '08:00', '09:00', monteurId)
            : undefined}
          holidays={holidays}
          showDistances={schedulingConfig?.show_distances !== false}
        />
      ) : view === 'month' ? (
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
