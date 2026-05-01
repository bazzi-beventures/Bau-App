interface Termin {
  datum: string
  uhrzeit: string
  notiz: string
}

interface TimelineProject {
  id: string
  name: string
  termine: Termin[]
}

interface TimelineInfo {
  start: string
  days: string[]
  todayIndex: number
}

interface ProjectSpan {
  project: TimelineProject
  firstDatum: string | null
  lastDatum: string | null
  startOffset: number
  length: number
  terminIndices: number[]
}

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

function buildTimeline<P extends TimelineProject>(projects: P[]): { info: TimelineInfo; spans: { project: P; firstDatum: string | null; lastDatum: string | null; startOffset: number; length: number; terminIndices: number[] }[] } {
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

  const spans = projects.map(p => {
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

interface Props<P extends TimelineProject> {
  projects: P[]
  onSelect: (project: P) => void
}

export function ProjectTimeline<P extends TimelineProject>({ projects, onSelect }: Props<P>) {
  const DAY_WIDTH = 36
  const { info, spans } = buildTimeline(projects)
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
                onClick={() => onSelect(span.project)}
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
}
