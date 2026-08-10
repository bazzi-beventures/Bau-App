import { BoardColumn, BoardTask } from '../../api/admin'

export const COLUMN_LABELS: Record<BoardColumn, string> = {
  offen: 'Offen',
  in_arbeit: 'In Arbeit',
  wartet: 'Wartet',
  erledigt: 'Erledigt',
}

/** Karten je Spalte, sortiert nach sort_order (Lücken-Sortierung), dann jüngste zuerst. */
export function groupByColumn(tasks: BoardTask[], columns: BoardColumn[]): Record<BoardColumn, BoardTask[]> {
  const grouped = Object.fromEntries(columns.map(c => [c, [] as BoardTask[]])) as Record<BoardColumn, BoardTask[]>
  for (const t of tasks) {
    if (grouped[t.status]) grouped[t.status].push(t)
  }
  for (const c of columns) {
    grouped[c].sort((a, b) =>
      a.sort_order - b.sort_order || (b.created_at || '').localeCompare(a.created_at || ''),
    )
  }
  return grouped
}

/**
 * sort_order für einen Drop an Position `targetIndex` innerhalb einer Spalte.
 * Lücken-Verfahren: zwischen Nachbarn das Mittel, an den Rändern ±1 — so braucht
 * ein Drop nie ein Umnummerieren der ganzen Spalte.
 */
export function dropSortOrder(columnTasks: BoardTask[], targetIndex: number, movedId?: string): number {
  const rest = columnTasks.filter(t => t.id !== movedId)
  if (rest.length === 0) return 0
  const idx = Math.max(0, Math.min(targetIndex, rest.length))
  if (idx === 0) return rest[0].sort_order - 1
  if (idx >= rest.length) return rest[rest.length - 1].sort_order + 1
  return (rest[idx - 1].sort_order + rest[idx].sort_order) / 2
}

export function daysSince(iso: string | null): number {
  if (!iso) return 0
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}

/** Überfällig = Fälligkeit vor heute und noch nicht erledigt. */
export function isOverdue(task: Pick<BoardTask, 'due_date' | 'status'>, today = new Date()): boolean {
  if (!task.due_date || task.status === 'erledigt') return false
  const iso = today.toISOString().slice(0, 10)
  return task.due_date < iso
}
