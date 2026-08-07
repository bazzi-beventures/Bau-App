// Gemeinsame Bausteine der Einsatzplanungs-Ansichten (Kalender + Tagesplan/Gantt):
// Kalender-Eintrag, Formatierung, Farben/Symbole je Einsatz-Art, Hover-Zustand und
// das Drag&Drop-Payload. Liegt bewusst ausserhalb von ProjectScheduleCalendar.tsx,
// damit die Gantt-Ansicht dieselben Kacheln nutzt, ohne dass sich die beiden
// Ansichts-Dateien gegenseitig importieren. Die Hover-Karte selbst steht in
// EventHoverCard.tsx (diese Datei bleibt frei von JSX).

import { useEffect, useRef, useState } from 'react'
import { Project, projectCustomerName } from './ProjectsScreen'
import { parseDateStr, toDateStr } from '../utils/calendarHelpers'

export interface StaffLite {
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

// ─── Formatierung ────────────────────────────────────────────────────────────

export function projectCoversDay(p: Project, day: Date): boolean {
  if (!p.start_date || !p.end_date) return false
  const s = toDateStr(day)
  return s >= p.start_date.slice(0, 10) && s <= p.end_date.slice(0, 10)
}

export function fmtTime(t: string | null | undefined): string {
  return t ? t.slice(0, 5) : ''
}

// Anzeigename einer Kalenderkachel: Projektnummer vor dem Namen.
//
// Die aus der Alt-Software importierten Projekte tragen ihre Nummer schon im
// Namen ("261125 Heller Winterthur") — dort würde ein Präfix sie verdoppeln.
// Neu angelegte Projekte bekommen die Nummer nur in project_id_text, im
// Kalender fehlte sie deshalb bisher ganz. Interne Einsätze (Teamsitzung,
// Werkstatt …) haben keine Nummer und bleiben unverändert.
export function entryTitle(p: Project): string {
  const name = p.name ?? ''
  const nr = (p.project_id_text ?? '').trim()
  if (!nr || name.includes(nr)) return name
  return `${nr} ${name}`
}

export function fmtTimeRange(p: Project): string {
  const s = fmtTime(p.start_time), e = fmtTime(p.end_time)
  if (s && e) return `${s}–${e}`
  if (s) return `ab ${s}`
  if (e) return `bis ${e}`
  return ''
}

export function fmtRange(p: Project): string {
  if (!p.start_date || !p.end_date) return ''
  const s = parseDateStr(p.start_date).toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit' })
  const e = parseDateStr(p.end_date).toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit' })
  const datePart = s === e ? s : `${s} – ${e}`
  const timePart = fmtTimeRange(p)
  return timePart ? `${datePart} · ${timePart}` : datePart
}

// ─── Farben und Symbole je Einsatz-Art ───────────────────────────────────────

// Pill-Farbe je Einsatz-Art. Kundenprojekte bleiben Brand-Blau, interne
// Einsätze unterscheiden sich farblich klar davon.
// Die --kind-*-Variablen setzt der Kalender-Root aus der Tenant-Config (scheduling_config).
// Fehlt eine Variable, greift der hier hinterlegte Default.
export const KIND_COLORS: Record<string, string> = {
  project:     'var(--kind-project, var(--primary))',
  teamsitzung: 'var(--kind-teamsitzung, #7c3aed)',  // Lila
  lagerarbeit: 'var(--kind-lagerarbeit, #d97706)',  // Bernstein
  werkstatt:   'var(--kind-werkstatt, #0d9488)',    // Türkis
  sonstiges:   'var(--kind-sonstiges, #475569)',    // Slate
}

export function pillBg(p: Project): string {
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

export function kindSymbol(p: CalendarEntry): string {
  if (p.kind && p.kind !== 'project') return KIND_SYMBOLS[p.kind] ?? ''
  return TERMIN_SYMBOLS[p.termin_kind ?? 'montage'] ?? ''
}

// Optionale Zusatz-Zeilen auf der Kachel, gesteuert per Tenant-Config (scheduling_config.fields).
export function pillExtraLines(p: Project, staff: StaffLite[], fields?: Record<string, boolean>): string[] {
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

export function projectMonteurNames(p: Project, staff: StaffLite[]): string {
  if (!p.monteur_ids || p.monteur_ids.length === 0) return ''
  const byId = new Map(staff.map(s => [s.id, s.name]))
  return p.monteur_ids.map(id => byId.get(id) || '').filter(Boolean).join(', ')
}

// ─── Hover-Karte ──────────────────────────────────────────────────────────────
// Eine Kalenderkachel ist zwangsläufig klein — ein 30-Minuten-Termin hat nicht
// genug Höhe für Adresse, Kunde und Bemerkung. Statt den Text abzuschneiden
// zeigt eine Karte beim Überfahren die vollen Angaben. Ersetzt den nativen
// title-Tooltip, der erst nach ~1 s erscheint und keine Zeilen kennt.

const HOVER_DELAY_MS = 220

export interface HoverState {
  entry: CalendarEntry
  rect: DOMRect
}

// Hover-Zustand + fertige Event-Handler für eine Kachel. Die Verzögerung
// verhindert, dass beim Überstreichen mehrerer Kacheln Karten aufblitzen.
export function useHoverCard() {
  const [hover, setHover] = useState<HoverState | null>(null)
  const timerRef = useRef<number | null>(null)

  function cancelTimer() {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
  }, [])

  function bind(entry: CalendarEntry) {
    return {
      onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
        const rect = e.currentTarget.getBoundingClientRect()
        cancelTimer()
        timerRef.current = window.setTimeout(() => setHover({ entry, rect }), HOVER_DELAY_MS)
      },
      onMouseLeave: () => { cancelTimer(); setHover(null) },
      // Beim Ziehen oder Klicken stört die Karte nur.
      onMouseDown: () => { cancelTimer(); setHover(null) },
    }
  }

  return { hover, bind }
}

// ─── Drag-Handlers ────────────────────────────────────────────────────────────

// Drag-Transfer payload format: "<projectId>|<grabDayISO>|<grabOffset>|<sourceRowId>"
// grabOffset = Position des Mauszeigers innerhalb der gegriffenen Pille (px) auf
// der Achse, entlang der die Ansicht die Zeit abbildet: im Wochenraster vertikal
// (offsetY), im Tagesplan/Gantt horizontal (offsetX). So landet beim Drop der
// Block-Anfang dort, wo der Block (nicht der Cursor) hingehört.
// sourceRowId = Monteur-Zeile, aus der der Chip gegriffen wurde ('' ausserhalb
// einer Monteur-Zeile bzw. Zeile «Ohne Monteur»).
const DRAG_MIME = 'application/x-bau-project'

export function setDragPayload(
  e: React.DragEvent,
  projectId: string,
  grabDayISO: string,
  sourceRowId = '',
  axis: 'x' | 'y' = 'y',
) {
  const raw = `${projectId}|${grabDayISO}|${grabDragOffset(e, axis)}|${sourceRowId}`
  e.dataTransfer.setData(DRAG_MIME, raw)
  e.dataTransfer.setData('text/plain', raw)
  e.dataTransfer.effectAllowed = 'move'
}

export function grabDragOffset(e: React.DragEvent, axis: 'x' | 'y' = 'y'): number {
  const raw = axis === 'x' ? e.nativeEvent.offsetX : e.nativeEvent.offsetY
  return Math.round(raw) || 0
}

export function readDragPayload(
  e: React.DragEvent,
): { projectId: string; grabDayISO: string; grabOffset: number; sourceRowId: string } | null {
  const raw = e.dataTransfer.getData(DRAG_MIME) || e.dataTransfer.getData('text/plain')
  if (!raw || !raw.includes('|')) return null
  const [projectId, grabDayISO, grabOffset, sourceRowId] = raw.split('|')
  return { projectId, grabDayISO, grabOffset: Number(grabOffset) || 0, sourceRowId: sourceRowId || '' }
}
