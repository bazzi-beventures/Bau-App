interface TimelineProject {
  id: string
  name: string
  start_date: string | null
  end_date: string | null
}

interface TimelineInfo {
  start: string
  days: string[]
  todayIndex: number
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

function buildTimeline<P extends TimelineProject>(projects: P[]): {
  info: TimelineInfo
  spans: { project: P; startDate: string | null; endDate: string | null; startOffset: number; length: number }[]
} {
  const today = toISO(new Date())
  const allDates: string[] = []
  projects.forEach(p => {
    if (p.start_date) allDates.push(p.start_date)
    if (p.end_date) allDates.push(p.end_date)
  })

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
    if (!p.start_date) {
      return { project: p, startDate: null, endDate: null, startOffset: -1, length: 0 }
    }
    const start = p.start_date
    const end = p.end_date && p.end_date >= start ? p.end_date : start
    const startOffset = diffDays(startISO, start)
    const length = diffDays(start, end) + 1
    return { project: p, startDate: start, endDate: end, startOffset, length }
  })

  spans.sort((a, b) => {
    if (!a.startDate && !b.startDate) return a.project.name.localeCompare(b.project.name)
    if (!a.startDate) return 1
    if (!b.startDate) return -1
    return a.startDate.localeCompare(b.startDate)
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
                {span.startDate && (
                  <div
                    className="projekte-timeline-bar"
                    style={{
                      left: span.startOffset * DAY_WIDTH + 4,
                      width: Math.max(span.length * DAY_WIDTH - 8, DAY_WIDTH - 8),
                    }}
                  >
                    <span className="projekte-timeline-bar-label">{span.project.name}</span>
                  </div>
                )}
                {!span.startDate && (
                  <div className="projekte-timeline-bar projekte-timeline-bar-empty" style={{ left: 4, width: 120 }}>
                    <span className="projekte-timeline-bar-label">{span.project.name} · kein Termin</span>
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
