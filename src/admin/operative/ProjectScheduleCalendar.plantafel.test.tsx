import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProjectScheduleCalendar, { CalendarEntry } from './ProjectScheduleCalendar'
import { getWeekDays, toDateStr } from '../utils/calendarHelpers'

// Plantafel: Monteure als Zeilen × Wochentage. Getestet werden Zeilen-Zuordnung,
// die tenant-schaltbaren Ansichten-Buttons (views) inkl. Fallback und die
// Monteur-Umzuweisung per Drag&Drop in eine andere Zeile.

const STAFF = [
  { id: 's1', name: 'Anna Muster' },
  { id: 's2', name: 'Beat Beispiel' },
]

// Aktuelle Woche, damit die Standard-Ansicht (heute) die Einträge zeigt.
const week = getWeekDays(new Date())
const MON = toDateStr(week[0])
const TUE = toDateStr(week[1])

function entry(over: Partial<CalendarEntry>): CalendarEntry {
  const base = {
    id: 'a1',
    name: 'Projekt Alpha',
    kind: 'project',
    start_date: MON,
    end_date: MON,
    start_time: '09:00',
    end_time: '11:00',
    monteur_ids: ['s1'],
  } as unknown as CalendarEntry
  return { ...base, ...over }
}

const CONFIG_ALL = {
  fields: {},
  colors: {},
  views: { month: true, week: true, staff: true, plantafel: true },
}

function renderCal(opts: {
  entries?: CalendarEntry[]
  config?: typeof CONFIG_ALL | undefined
  onReschedule?: (id: string, d: number, t?: string | null, m?: string[]) => void
} = {}) {
  return render(
    <ProjectScheduleCalendar
      projects={opts.entries ?? [entry({})]}
      staff={STAFF}
      loading={false}
      onSelect={vi.fn()}
      onReschedule={opts.onReschedule ?? vi.fn()}
      schedulingConfig={opts.config}
    />,
  )
}

// Zeilen der Tafel (ohne Header) als [Namenszelle, ...7 Tageszellen].
function boardRows(container: HTMLElement) {
  return [...container.querySelectorAll('.project-cal-board-row:not(.project-cal-board-header)')]
}

describe('Plantafel', () => {
  it('zeigt eine Zeile pro Monteur; Einsätze landen in der Zeile ihres Monteurs', async () => {
    const user = userEvent.setup()
    const { container } = renderCal({
      entries: [
        entry({ id: 'a1', name: 'Projekt Alpha', monteur_ids: ['s1'] }),
        entry({ id: 'a2', name: 'Projekt Beta', monteur_ids: ['s1', 's2'], start_date: TUE, end_date: TUE }),
      ],
    })
    await user.click(screen.getByRole('button', { name: 'Plantafel' }))

    const rows = boardRows(container)
    expect(rows).toHaveLength(2)  // kein «Ohne Monteur», alles zugewiesen
    expect(rows[0]).toHaveTextContent('Anna Muster')
    expect(rows[0]).toHaveTextContent('Projekt Alpha')
    expect(rows[0]).toHaveTextContent('Projekt Beta')  // Mehrfach-Team: in beiden Zeilen
    expect(rows[1]).toHaveTextContent('Beat Beispiel')
    expect(rows[1]).toHaveTextContent('Projekt Beta')
    expect(rows[1]).not.toHaveTextContent('Projekt Alpha')
  })

  it('sammelt Einsätze ohne Monteur in der Zeile «Ohne Monteur»', async () => {
    const user = userEvent.setup()
    const { container } = renderCal({
      entries: [entry({ id: 'a3', name: 'Projekt Gamma', monteur_ids: [] })],
    })
    await user.click(screen.getByRole('button', { name: 'Plantafel' }))

    const rows = boardRows(container)
    expect(rows).toHaveLength(3)
    expect(rows[2]).toHaveTextContent('Ohne Monteur')
    expect(rows[2]).toHaveTextContent('Projekt Gamma')
  })

  it('Drop in eine andere Monteur-Zeile weist den Quell-Monteur um', async () => {
    const user = userEvent.setup()
    const onReschedule = vi.fn()
    const { container } = renderCal({
      entries: [entry({ id: 'a1', monteur_ids: ['s1'] })],
      onReschedule,
    })
    await user.click(screen.getByRole('button', { name: 'Plantafel' }))

    // Minimaler DataTransfer-Ersatz (jsdom kennt keinen echten).
    const store: Record<string, string> = {}
    const dataTransfer = {
      setData: (k: string, v: string) => { store[k] = v },
      getData: (k: string) => store[k] ?? '',
      effectAllowed: '',
    }
    const chip = container.querySelector('.project-cal-board-chip')!
    fireEvent.dragStart(chip, { dataTransfer })

    // Zelle Dienstag in der Zeile von Beat (Zeile 2, Tageszelle Index 1).
    const targetCell = boardRows(container)[1].querySelectorAll('.project-cal-board-cell')[1]
    fireEvent.drop(targetCell, { dataTransfer })

    expect(onReschedule).toHaveBeenCalledWith('a1', 1, undefined, ['s2'])
  })

  it('abgeschaltete Ansichten erscheinen nicht als Button; Fallback auf die erste erlaubte', () => {
    const { container } = renderCal({
      config: { ...CONFIG_ALL, views: { month: false, week: false, staff: false, plantafel: true } },
    })
    expect(screen.queryByRole('button', { name: 'Monat' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Woche' })).not.toBeInTheDocument()
    // Einzige erlaubte Ansicht → Plantafel wird direkt gerendert.
    expect(container.querySelector('.project-cal-board')).toBeInTheDocument()
  })

  it('ohne views-Config sind alle Ansichten verfügbar (Default an)', () => {
    renderCal({ config: undefined })
    for (const label of ['Monat', 'Woche', 'Mitarbeiter', 'Plantafel']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
  })
})
