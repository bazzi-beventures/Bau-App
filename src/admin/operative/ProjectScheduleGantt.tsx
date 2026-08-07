// Tagesplan (Gantt) der Einsatzplanung: eine Zeile je Mitarbeiter, die Uhrzeit
// läuft waagrecht über einen oder mehrere Tage. Ergänzt die Plantafel (dort ist
// eine Zelle = ein ganzer Tag) um die Frage, die der Disponent morgens hat: WANN
// ist wer wie lange gebunden — und wie voll ist sein Tag.
//
// Rasterlogik liegt in utils/ganttGrid.ts, gemeinsame Formatierung/Farben und das
// Drag-Payload in scheduleShared.ts.

import { useState } from 'react'
import { Project } from './ProjectsScreen'
import {
  CalendarEntry, StaffLite,
  useHoverCard, entryTitle, fmtTimeRange, kindSymbol, pillBg, pillExtraLines,
  projectCoversDay, projectMonteurNames, readDragPayload, setDragPayload,
} from './scheduleShared'
import EventHoverCard from './EventHoverCard'
import { diffDays, hhmmToMin, isToday, toDateStr } from '../utils/calendarHelpers'
import { computeWeekHours } from '../utils/weekGrid'
import {
  GANTT_BAR_H, GANTT_LANE_GAP, GANTT_ROW_PAD,
  barMetrics, computeGanttLanes, dayWidthPx, ganttDays, laneCount, rowHeightPx,
  plannedMinutes, timeOffsetX, utilizationPct, utilizationTone,
  xToDayIndex, xToSnappedTime,
} from '../utils/ganttGrid'

// Breite der Namens- und der Auslastungsspalte (beide sticky, auch im CSS
// gesetzt) — hier nötig, um die Mindestbreite des Rasters zu berechnen.
const NAME_COL_W = 170
const UTIL_COL_W = 64
// Ab dieser Balkenbreite (px) passt neben dem Namen auch die Uhrzeit.
const TIME_LABEL_MIN_PX = 150

interface Props {
  projects: CalendarEntry[]
  // Volle Mitarbeiterliste für Namensauflösung (Tooltips, Zusatzfelder).
  staff: StaffLite[]
  // Zeilen des Plans = Mitarbeiter nach aktivem Filter.
  rowStaff: StaffLite[]
  fields?: Record<string, boolean>
  currentDate: Date
  // Anzahl sichtbarer Tage (1 / 3 / 5).
  span: number
  // Breite einer Stunde in px (Zoom-Stufe).
  hourWidth: number
  onSelect: (p: Project) => void
  // Doppelklick auf einen Balken: springt in die Projektmaske (siehe Kalender-Props).
  onOpenProject?: (p: Project) => void
  onReschedule: (id: string, deltaDays: number, startTime?: string | null, monteurIds?: string[]) => void
  // Klick auf freie Rasterfläche → neuer Termin (1 h ab der geklickten Uhrzeit)
  // mit dem Zeilen-Mitarbeiter vorbelegt (null = Zeile «Ohne Monteur»).
  onCreateSlot?: (dayISO: string, startTime: string, endTime: string, monteurId: string | null) => void
  holidays: Map<string, string>
  // Nicht-Arbeitszeit-Fenster (Werktage Mo–Fr, rein visuell).
  greyAfter?: string
  greyUntil?: string
  // Tages-Kapazität in Stunden — Bezugsgrösse des Auslastungsgrads.
  dayCapacityHours: number
}

export default function ProjectScheduleGantt({
  projects, staff, rowStaff, fields, currentDate, span, hourWidth,
  onSelect, onOpenProject, onReschedule, onCreateSlot, holidays, greyAfter, greyUntil, dayCapacityHours,
}: Props) {
  const { hover, bind } = useHoverCard()
  // Zeile, über der gerade ein Balken schwebt: rowId ('' = «Ohne Monteur»).
  const [hoverRow, setHoverRow] = useState<string | null>(null)
  const days = ganttDays(currentDate, span)
  const staffIds = new Set(staff.map(s => s.id))

  // Einträge einer Zeile an einem Tag. rowId null = «Ohne Monteur».
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

  // Rastergrenzen über ALLE sichtbaren Tage — sonst würde jeder Tag eine andere
  // Breite bekommen und die Achse wäre nicht mehr durchgehend lesbar.
  const visibleTimed = days.flatMap(d => projects.filter(p => projectCoversDay(p, d)))
  const { startHour, endHour } = computeWeekHours(visibleTimed)
  const hours: number[] = []
  for (let h = startHour; h < endHour; h++) hours.push(h)
  const dayW = dayWidthPx(startHour, endHour, hourWidth)
  const axisW = dayW * days.length
  // Positionen ausserhalb der Achse auf den sichtbaren Bereich ziehen, sonst
  // landet ein Drop rechts des letzten Tages rechnerisch wieder am Tagesanfang.
  const clampX = (x: number) => Math.max(0, Math.min(axisW - 1, x))

  // Ausgrau-Fenster (Nicht-Arbeitszeit) je Werktag, auf das Raster begrenzt.
  const HHMM = /^\d{2}:\d{2}$/
  const greyLeft = greyAfter && HHMM.test(greyAfter)
    ? Math.max(0, Math.min(dayW, timeOffsetX(greyAfter, startHour, hourWidth)))
    : null
  const greyRight = greyUntil && HHMM.test(greyUntil)
    ? Math.max(0, Math.min(dayW, timeOffsetX(greyUntil, startHour, hourWidth)))
    : dayW

  // Kapazität des sichtbaren Zeitraums: nur Werktage ohne Feiertag zählen —
  // sonst drückt ein sichtbares Wochenende die Auslastung künstlich nach unten.
  const capacityDays = days.filter(d => {
    const dow = d.getDay()
    return dow >= 1 && dow <= 5 && !holidays.has(toDateStr(d))
  }).length
  const dayCapacityMin = Math.round(dayCapacityHours * 60)
  const capacityMin = capacityDays * dayCapacityMin

  function handleDrop(e: React.DragEvent, rowId: string | null) {
    e.preventDefault()
    setHoverRow(null)
    const payload = readDragPayload(e)
    if (!payload) return
    const proj = projects.find(p => p.id === payload.projectId)
    if (!proj) return
    const rect = e.currentTarget.getBoundingClientRect()
    // Der Balken soll dort landen, wo sein Anfang hingehört — nicht der Cursor.
    const x = clampX(e.clientX - rect.left - payload.grabOffset)
    const dayIndex = xToDayIndex(x, days.length, startHour, endHour, hourWidth)
    const delta = diffDays(payload.grabDayISO, toDateStr(days[dayIndex]))
    // Ganztägige Einsätze bleiben ganztägig — sie haben keine Uhrzeit, die das
    // Raster sinnvoll setzen könnte.
    const time = proj.start_time ? xToSnappedTime(x, startHour, endHour, hourWidth) : undefined

    const srcRow = payload.sourceRowId || null
    // Zeilenwechsel = Umzuweisung: Quell-Monteur raus, Ziel-Monteur rein.
    // Drop in «Ohne Monteur» ändert das Team nicht (nur Zeit/Tag).
    let newTeam: string[] | undefined
    if (rowId && rowId !== srcRow) {
      const team = (proj.monteur_ids || []).filter(id => id !== srcRow)
      if (!team.includes(rowId)) team.push(rowId)
      newTeam = team
    }
    const timeChanged = time !== undefined && time !== (proj.start_time ?? '').slice(0, 5)
    if (delta !== 0 || newTeam || timeChanged) onReschedule(proj.id, delta, time, newTeam)
  }

  function handleTrackClick(e: React.MouseEvent, rowId: string | null) {
    // Nur Klicks auf die freie Rasterfläche — Balken öffnen ihr Panel selbst.
    if (!onCreateSlot || e.target !== e.currentTarget) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = clampX(e.clientX - rect.left)
    const dayIndex = xToDayIndex(x, days.length, startHour, endHour, hourWidth)
    const startTime = xToSnappedTime(x, startHour, endHour, hourWidth)
    // Endzeit eine Stunde später — im selben Tag, damit sie nicht in die
    // Anfangszeit des Folgetages kippt.
    const endTime = xToSnappedTime(
      Math.min(x + hourWidth, (dayIndex + 1) * dayW - 1), startHour, endHour, hourWidth,
    )
    onCreateSlot(toDateStr(days[dayIndex]), startTime, endTime, rowId)
  }

  function renderBar(p: CalendarEntry, dayIndex: number, dayISO: string, rowId: string | null, lane: number, conflict: boolean) {
    const timeLabel = fmtTimeRange(p)
    const extra = pillExtraLines(p, staff, fields)
    const allDay = !p.start_time
    const geo = allDay
      ? { leftPx: dayIndex * dayW, widthPx: dayW }
      : barMetrics(p, dayIndex, startHour, endHour, hourWidth)
    // Auf einem schmalen Balken hat nur eines von beiden Platz — dann gewinnt der
    // Name: die Uhrzeit steht ohnehin in der Position auf der Achse (und in der
    // Hover-Karte). Eine halb abgeschnittene Uhrzeit wäre schlechter als keine.
    const showTime = geo.widthPx >= TIME_LABEL_MIN_PX
    return (
      <div
        key={`${p.id}@${dayISO}`}
        className={
          `project-cal-gantt-bar${allDay ? ' allday' : ''}` +
          `${conflict ? ' conflict' : ''}`
        }
        draggable
        onDragStart={e => setDragPayload(e, p.id, dayISO, rowId ?? '', 'x')}
        onClick={() => onSelect(p)}
        onDoubleClick={onOpenProject ? e => {
          e.preventDefault()
          window.getSelection()?.removeAllRanges()
          onOpenProject(p)
        } : undefined}
        style={{
          background: pillBg(p),
          left: geo.leftPx,
          width: geo.widthPx,
          // Ganztägige Einsätze (Ferien, Kurs, …) liegen als Band hinter den
          // getakteten Balken — sie belegen den Tag, aber keine Uhrzeit.
          top: allDay ? 0 : GANTT_ROW_PAD + lane * (GANTT_BAR_H + GANTT_LANE_GAP),
          height: allDay ? '100%' : GANTT_BAR_H,
        }}
        title={[
          entryTitle(p), timeLabel || 'ganztägig', projectMonteurNames(p, staff), ...extra,
          conflict ? '⚠ Zeitliche Überschneidung mit einem anderen Einsatz dieses Mitarbeiters' : '',
        ].filter(Boolean).join(' · ')}
        {...bind(p)}
      >
        {kindSymbol(p) && <span className="project-cal-kind-symbol">{kindSymbol(p)}</span>}
        {p.termin_badge && <span className="project-cal-termin-badge">{p.termin_badge}</span>}
        <span className="project-cal-gantt-bar-name">{entryTitle(p)}</span>
        {timeLabel && showTime && <span className="project-cal-gantt-bar-time">{timeLabel}</span>}
        {conflict && <span className="project-cal-gantt-bar-warn">⚠</span>}
      </div>
    )
  }

  // Doppelbuchung: getaktete Einsätze desselben Mitarbeiters am selben Tag mit
  // zeitlicher Überschneidung (ohne Endzeit zählt 1 h). Die Sammelzeile «Ohne
  // Monteur» bleibt aussen vor — dort ist niemand gebunden.
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

  function renderRow(rowId: string | null, label: string) {
    const perDay = days.map(d => cellEntries(rowId, d))
    const lanesPerDay = perDay.map(list => computeGanttLanes(list))
    const rowLanes = Math.max(1, ...lanesPerDay.map(laneCount))
    const height = rowHeightPx(rowLanes)
    const planned = plannedMinutes(perDay.flat(), dayCapacityMin)
    // Der Auslastungsgrad gilt für zugewiesene Arbeit — «Ohne Monteur» ist
    // niemandes Tag und bekommt darum kein Badge.
    const pct = rowId === null ? null : utilizationPct(planned, capacityMin)
    const cellKey = rowId ?? ''

    return (
      <div key={cellKey || '∅'} className="project-cal-gantt-row" style={{ height }}>
        <div className={`project-cal-gantt-name${rowId === null ? ' unassigned' : ''}`}>
          <span className="project-cal-gantt-name-text">{label}</span>
        </div>
        <div
          className={
            `project-cal-gantt-track${hoverRow === cellKey ? ' project-cal-drop-hover' : ''}` +
            `${onCreateSlot ? ' creatable' : ''}`
          }
          style={{ width: axisW }}
          onDragOver={e => { e.preventDefault(); setHoverRow(cellKey) }}
          onDragLeave={e => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              setHoverRow(prev => prev === cellKey ? null : prev)
            }
          }}
          onDrop={e => handleDrop(e, rowId)}
          onClick={e => handleTrackClick(e, rowId)}
          title={onCreateSlot ? 'Klicken, um hier einen Einsatz zu planen' : undefined}
        >
          {days.map((d, i) => {
            const dow = d.getDay()
            const isHoliday = holidays.has(toDateStr(d))
            const dim = greyLeft !== null && dow >= 1 && dow <= 5 && greyRight > greyLeft
            return (
              <div key={i} className="project-cal-gantt-day-bg" style={{ left: i * dayW, width: dayW }} aria-hidden="true">
                {(dow === 0 || dow === 6 || isHoliday) && <div className="project-cal-gantt-offday" />}
                {dim && (
                  <div
                    className="project-cal-gantt-dim"
                    style={{ left: greyLeft!, width: greyRight - greyLeft! }}
                  />
                )}
                {hours.map(h => (
                  <div
                    key={h}
                    className="project-cal-gantt-hour-line"
                    style={{ left: (h - startHour) * hourWidth }}
                  />
                ))}
              </div>
            )
          })}
          {days.map((d, i) => {
            const dayISO = toDateStr(d)
            const entries = perDay[i]
            const conflicts = rowId !== null ? conflictIds(entries) : new Set<string>()
            const lanes = lanesPerDay[i]
            return entries.map(p => renderBar(p, i, dayISO, rowId, lanes.get(p.id) ?? 0, conflicts.has(p.id)))
          })}
        </div>
        <div className="project-cal-gantt-util">
          {pct === null ? (
            <span className="project-cal-gantt-util-badge idle">–</span>
          ) : (
            <span
              className={`project-cal-gantt-util-badge ${utilizationTone(pct)}`}
              title={`${(planned / 60).toLocaleString('de-CH', { maximumFractionDigits: 1 })} h geplant von ${(capacityMin / 60).toLocaleString('de-CH', { maximumFractionDigits: 1 })} h`}
            >
              {pct}%
            </span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="project-cal-gantt">
      <div className="project-cal-gantt-scroll">
        {/* minWidth statt width: passt die Achse auf den Bildschirm, bleibt sie
            trotzdem über die volle Breite und das Auslastungs-Badge rechts. */}
        <div className="project-cal-gantt-inner" style={{ minWidth: NAME_COL_W + axisW + UTIL_COL_W }}>
          <div className="project-cal-gantt-row project-cal-gantt-header">
            <div className="project-cal-gantt-name">Mitarbeiter</div>
            <div className="project-cal-gantt-axis" style={{ width: axisW }}>
              {days.map((d, i) => {
                const holidayName = holidays.get(toDateStr(d))
                return (
                  <div
                    key={i}
                    className={`project-cal-gantt-day-head${isToday(d) ? ' today' : ''}`}
                    style={{ left: i * dayW, width: dayW }}
                  >
                    <div className="project-cal-gantt-day-title">
                      {d.toLocaleDateString('de-CH', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                      {holidayName && <span className="project-cal-week-day-holiday"> {holidayName}</span>}
                    </div>
                    <div className="project-cal-gantt-hours">
                      {hours.map(h => (
                        <span
                          key={h}
                          className="project-cal-gantt-hour-label"
                          style={{ left: (h - startHour) * hourWidth, width: hourWidth }}
                        >
                          {String(h).padStart(2, '0')}
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="project-cal-gantt-util" title="Auslastungsgrad im sichtbaren Zeitraum">%</div>
          </div>

          {rowStaff.map(s => renderRow(s.id, s.name))}
          {hasUnassigned && renderRow(null, 'Ohne Monteur')}
          {rowStaff.length === 0 && !hasUnassigned && (
            <div className="admin-empty">Keine Mitarbeiter sichtbar.</div>
          )}
        </div>
      </div>
      {hover && <EventHoverCard hover={hover} staff={staff} />}
    </div>
  )
}
