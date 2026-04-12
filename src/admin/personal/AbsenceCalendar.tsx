import { useState } from 'react'
import { Absence } from '../../api/admin'

const TYPE_LABELS: Record<string, string> = {
  vacation: 'Urlaub',
  sick: 'Krankheit',
  public_holiday: 'Feiertag',
  other: 'Sonstiges',
}

const TYPE_COLORS: Record<string, string> = {
  vacation: '#3b82f6',
  sick: '#ef4444',
  public_holiday: '#8b5cf6',
  other: '#6b7280',
}

function getTypeColor(type: string): string {
  return TYPE_COLORS[type] ?? '#6b7280'
}

function getWeekDays(date: Date): Date[] {
  const d = new Date(date)
  const day = d.getDay()
  const diff = (day + 6) % 7
  d.setDate(d.getDate() - diff)
  return Array.from({ length: 7 }, (_, i) => {
    const n = new Date(d)
    n.setDate(d.getDate() + i)
    return n
  })
}

function getMonthDays(date: Date): (Date | null)[] {
  const year = date.getFullYear()
  const month = date.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startPad = (firstDay.getDay() + 6) % 7
  const result: (Date | null)[] = Array(startPad).fill(null)
  for (let d = 1; d <= lastDay.getDate(); d++) result.push(new Date(year, month, d))
  while (result.length % 7 !== 0) result.push(null)
  return result
}

function absenceCoversDay(absence: Absence, day: Date): boolean {
  const pad = (n: number) => String(n).padStart(2, '0')
  const dayStr = `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`
  return dayStr >= absence.start_date.slice(0, 10) && dayStr <= absence.end_date.slice(0, 10)
}

function isToday(date: Date): boolean {
  const t = new Date()
  return (
    date.getDate() === t.getDate() &&
    date.getMonth() === t.getMonth() &&
    date.getFullYear() === t.getFullYear()
  )
}

function fmt(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function dayCount(start: string, end: string) {
  const d = (new Date(end).getTime() - new Date(start).getTime()) / 86400000 + 1
  return d > 1 ? `${d} Tage` : '1 Tag'
}

// ─── Detail Modal ─────────────────────────────────────────────────────────────

function AbsenceDetailModal({ absence, onClose }: { absence: Absence; onClose: () => void }) {
  const color = getTypeColor(absence.absence_type)
  const statusLabel =
    absence.status === 'approved' ? 'Genehmigt' :
    absence.status === 'rejected' ? 'Abgelehnt' : 'Pendent'
  const statusClass =
    absence.status === 'approved' ? 'admin-badge-approved' :
    absence.status === 'rejected' ? 'admin-badge-rejected' : 'admin-badge-pending'

  return (
    <div className="absence-modal-backdrop" onClick={onClose}>
      <div className="absence-modal" onClick={e => e.stopPropagation()}>
        <div className="absence-modal-header" style={{ borderLeft: `4px solid ${color}` }}>
          <div>
            <div className="absence-modal-name">{absence.staff_name}</div>
            <div className="absence-modal-type" style={{ color }}>
              {TYPE_LABELS[absence.absence_type] ?? absence.absence_type}
            </div>
          </div>
          <button className="absence-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="absence-modal-body">
          <div className="absence-modal-row">
            <span className="absence-modal-label">Zeitraum</span>
            <span>{fmt(absence.start_date)} – {fmt(absence.end_date)}</span>
          </div>
          <div className="absence-modal-row">
            <span className="absence-modal-label">Dauer</span>
            <span>{dayCount(absence.start_date, absence.end_date)}</span>
          </div>
          <div className="absence-modal-row">
            <span className="absence-modal-label">Status</span>
            <span className={`admin-badge ${statusClass}`}>{statusLabel}</span>
          </div>
          {absence.note && (
            <div className="absence-modal-row">
              <span className="absence-modal-label">Notiz</span>
              <span>{absence.note}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Legend ───────────────────────────────────────────────────────────────────

function CalendarLegend() {
  return (
    <div className="absence-cal-legend">
      {Object.entries(TYPE_LABELS).map(([type, label]) => (
        <div key={type} className="absence-cal-legend-item">
          <span className="absence-cal-legend-dot" style={{ background: TYPE_COLORS[type] }} />
          {label}
        </div>
      ))}
      <div className="absence-cal-legend-item">
        <span className="absence-cal-legend-dot" style={{ background: '#3b82f6', opacity: 0.5 }} />
        Pendent
      </div>
    </div>
  )
}

// ─── Month View ───────────────────────────────────────────────────────────────

function MonthView({ absences, currentDate, onSelect }: { absences: Absence[]; currentDate: Date; onSelect: (a: Absence) => void }) {
  const days = getMonthDays(currentDate)
  const DOW = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

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

          const today = isToday(day)
          const dayAbsences = absences.filter(a => absenceCoversDay(a, day))
          const visible = dayAbsences.slice(0, 3)
          const overflow = dayAbsences.length - 3

          return (
            <div key={i} className={`absence-cal-day-cell${today ? ' today' : ''}`}>
              <span className="absence-cal-day-num">{day.getDate()}</span>
              {visible.map((a, j) => (
                <div
                  key={j}
                  className="absence-cal-pill"
                  title={`${a.staff_name} – ${TYPE_LABELS[a.absence_type] ?? a.absence_type}`}
                  style={{
                    background: getTypeColor(a.absence_type),
                    opacity: a.status === 'requested' ? 0.6 : 1,
                    cursor: 'pointer',
                  }}
                  onClick={() => onSelect(a)}
                >
                  {a.staff_name}
                </div>
              ))}
              {overflow > 0 && (
                <div className="absence-cal-pill-overflow">+{overflow} mehr</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Week View ────────────────────────────────────────────────────────────────

function WeekView({ absences, currentDate, onSelect }: { absences: Absence[]; currentDate: Date; onSelect: (a: Absence) => void }) {
  const days = getWeekDays(currentDate)

  const staffThisWeek = Array.from(
    new Set(
      absences
        .filter(a => days.some(d => absenceCoversDay(a, d)))
        .map(a => a.staff_name)
    )
  ).sort()

  if (staffThisWeek.length === 0) {
    return <div className="absence-cal-empty">Keine Absenzen diese Woche.</div>
  }

  return (
    <div className="admin-table-wrap">
      <table className="admin-table" style={{ tableLayout: 'fixed', width: '100%' }}>
        <thead>
          <tr>
            <th style={{ width: 150 }}>Mitarbeiter</th>
            {days.map((d, i) => (
              <th
                key={i}
                style={isToday(d) ? { color: 'var(--accent-blue, #3b82f6)' } : undefined}
              >
                {d.toLocaleDateString('de-CH', { weekday: 'short', day: 'numeric', month: 'numeric' })}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {staffThisWeek.map(name => (
            <tr key={name}>
              <td><strong>{name}</strong></td>
              {days.map((d, i) => {
                const absence = absences.find(
                  a => a.staff_name === name && absenceCoversDay(a, d)
                )
                return (
                  <td key={i} style={{ padding: '6px 8px' }}>
                    {absence && (
                      <div
                        className="absence-cal-week-block"
                        title={`${TYPE_LABELS[absence.absence_type] ?? absence.absence_type}${absence.status === 'requested' ? ' (pendent)' : ''}`}
                        style={{
                          background: getTypeColor(absence.absence_type),
                          opacity: absence.status === 'requested' ? 0.6 : 1,
                          cursor: 'pointer',
                        }}
                        onClick={() => onSelect(absence)}
                      >
                        {TYPE_LABELS[absence.absence_type] ?? absence.absence_type}
                      </div>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  absences: Absence[]
  loading: boolean
}

export default function AbsenceCalendar({ absences, loading }: Props) {
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selected, setSelected] = useState<Absence | null>(null)

  function handlePrev() {
    if (viewMode === 'month') {
      setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))
    } else {
      setCurrentDate(d => {
        const n = new Date(d)
        n.setDate(n.getDate() - 7)
        return n
      })
    }
  }

  function handleNext() {
    if (viewMode === 'month') {
      setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))
    } else {
      setCurrentDate(d => {
        const n = new Date(d)
        n.setDate(n.getDate() + 7)
        return n
      })
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
      {/* Toolbar */}
      <div className="absence-cal-toolbar">
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            className={`admin-btn admin-btn-sm ${viewMode === 'month' ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
            onClick={() => setViewMode('month')}
          >
            Monat
          </button>
          <button
            className={`admin-btn admin-btn-sm ${viewMode === 'week' ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
            onClick={() => setViewMode('week')}
          >
            Woche
          </button>
        </div>

        <div className="absence-cal-title">{title}</div>

        <div style={{ display: 'flex', gap: 6 }}>
          <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={handlePrev}>←</button>
          <button
            className="admin-btn admin-btn-secondary admin-btn-sm"
            onClick={() => setCurrentDate(new Date())}
          >
            Heute
          </button>
          <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={handleNext}>→</button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="admin-loading"><div className="admin-spinner" /> Laden…</div>
      ) : viewMode === 'month' ? (
        <MonthView absences={absences} currentDate={currentDate} onSelect={setSelected} />
      ) : (
        <WeekView absences={absences} currentDate={currentDate} onSelect={setSelected} />
      )}

      {/* Legend */}
      {!loading && <CalendarLegend />}

      {/* Detail Modal */}
      {selected && (
        <AbsenceDetailModal absence={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}
