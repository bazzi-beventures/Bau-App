// Hover-Karte über einer Kalender-/Gantt-Kachel. Eigene Datei, damit
// scheduleShared.ts frei von JSX bleibt (Fast Refresh mag keine Mischung aus
// Komponenten und Helfern in einer Datei).

import { createPortal } from 'react-dom'
import { projectCustomerName } from './ProjectsScreen'
import {
  entryTitle, fmtRange, kindSymbol, pillBg, projectMonteurNames,
  type HoverState, type StaffLite,
} from './scheduleShared'

const HOVER_CARD_W = 260
// Grobe Annahme für die Kartenhöhe, damit sie am unteren Rand nicht aus dem
// Bild rutscht. Die exakte Höhe steht erst nach dem Rendern fest; CSS deckelt
// zusätzlich per max-height.
const HOVER_CARD_MAX_H = 230

export default function EventHoverCard({ hover, staff }: { hover: HoverState; staff: StaffLite[] }) {
  const { entry: p, rect, note } = hover
  const rows: [string, string][] = []
  const kunde = projectCustomerName(p)
  const pl = p.projektleiter_id ? staff.find(s => s.id === p.projektleiter_id)?.name : ''
  const monteurs = projectMonteurNames(p, staff)
  if (p.object_address) rows.push(['Adresse', p.object_address])
  if (kunde) rows.push(['Kunde', kunde])
  if (pl) rows.push(['Projektleiter', pl])
  if (monteurs) rows.push(['Monteure', monteurs])
  if (p.bemerkung) rows.push(['Bemerkung', p.bemerkung])

  // Rechts neben der Kachel; bei zu wenig Platz nach links kippen. Vertikal an
  // der Kachel ausgerichtet, aber im sichtbaren Bereich gehalten.
  const flip = rect.right + 12 + HOVER_CARD_W > window.innerWidth
  const left = flip ? Math.max(8, rect.left - 12 - HOVER_CARD_W) : rect.right + 12
  const top = Math.max(8, Math.min(rect.top, window.innerHeight - HOVER_CARD_MAX_H))

  return createPortal(
    <div className="project-cal-hovercard" style={{ left, top, width: HOVER_CARD_W }} role="tooltip">
      <div className="project-cal-hovercard-head">
        <span className="project-cal-hovercard-dot" style={{ background: pillBg(p) }} />
        {kindSymbol(p) && <span className="project-cal-kind-symbol">{kindSymbol(p)}</span>}
        {p.termin_badge && <span className="project-cal-termin-badge">{p.termin_badge}</span>}
        <strong>{entryTitle(p)}</strong>
      </div>
      <div className="project-cal-hovercard-time">{fmtRange(p) || 'Ganztägig'}</div>
      {rows.map(([label, value]) => (
        <div key={label} className="project-cal-hovercard-row">
          <span className="project-cal-hovercard-label">{label}</span>
          <span>{value}</span>
        </div>
      ))}
      {note && <div className="project-cal-hovercard-note">{note}</div>}
    </div>,
    document.body,
  )
}
