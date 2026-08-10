import { useEffect, useState } from 'react'
import { backdropCloseProps } from '../../shared/backdropClose'
import {
  BoardColumn, BoardTask, TaskBoardResponse,
  createBoardTask, deleteBoardTask, getTaskBoard, updateBoardTask,
} from '../../api/admin'
import { AdminScreen } from '../useAdminNav'
import { fmtDate } from '../utils/format'
import { COLUMN_LABELS, daysSince, dropSortOrder, groupByColumn, isOverdue } from './taskBoardLogic'

interface Props {
  onNav: (screen: AdminScreen, detailId?: string) => void
  onBadgeChange?: () => void
}

type Toast = { msg: string; type: 'success' | 'error' } | null

/** Deep-Link von der Karte zum Quell-Datensatz. */
function navTarget(task: BoardTask): { screen: AdminScreen; detailId?: string } | null {
  switch (task.ref_kind) {
    case 'quote': return { screen: 'quotes' }
    case 'invoice': return { screen: 'invoices' }
    case 'project': return task.project_id ? { screen: 'projects', detailId: task.project_id } : { screen: 'projects' }
    case 'draft': return { screen: 'project-drafts' }
    case 'approval': return { screen: 'dashboard' }
    case 'aftersales': return { screen: 'aftersales' }
    default:
      return task.project_id ? { screen: 'projects', detailId: task.project_id } : null
  }
}

function initials(name: string | null | undefined): string {
  return (name ?? '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'
}

// ─── Karte ───────────────────────────────────────────────────

interface CardProps {
  task: BoardTask
  typeLabel: string | null
  assigneeName: string | null
  onClick: () => void
  onDragStart: (e: React.DragEvent) => void
  onDropBefore: (e: React.DragEvent) => void
}

function TaskCard({ task, typeLabel, assigneeName, onClick, onDragStart, onDropBefore }: CardProps) {
  const overdue = isOverdue(task)
  return (
    <div
      className={`tb-card${task.status === 'erledigt' ? ' done' : ''}`}
      draggable
      onDragStart={onDragStart}
      onDragOver={e => e.preventDefault()}
      onDrop={onDropBefore}
      onClick={onClick}
    >
      <div className="tb-card-top">
        <span className={`tb-card-type${task.source === 'manuell' ? ' manual' : ''}`}>
          {task.source === 'manuell' ? 'Manuell' : (typeLabel ?? task.task_type)}
        </span>
        {assigneeName && <span className="tb-card-avatar" title={assigneeName}>{initials(assigneeName)}</span>}
      </div>
      <div className="tb-card-title">{task.title}</div>
      {task.project_name && task.ref_kind !== 'project' && (
        <div className="tb-card-project">{task.project_name}</div>
      )}
      <div className="tb-card-meta">
        {task.due_date
          ? <span className={overdue ? 'tb-due overdue' : 'tb-due'}>Fällig: {fmtDate(task.due_date)}</span>
          : task.status === 'erledigt' && task.done_at
            ? <span>Erledigt: {fmtDate(task.done_at)}{task.auto_done ? ' (System)' : ''}</span>
            : <span>seit {daysSince(task.created_at)} Tagen</span>}
      </div>
    </div>
  )
}

// ─── Detail-Modal ────────────────────────────────────────────

interface DetailModalProps {
  task: BoardTask
  board: TaskBoardResponse
  onClose: () => void
  onChanged: (reload?: boolean) => void
  onNav: Props['onNav']
}

function TaskDetailModal({ task, board, onClose, onChanged, onNav }: DetailModalProps) {
  const isManual = task.source === 'manuell'
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description ?? '')
  const [status, setStatus] = useState<BoardColumn>(task.status)
  const [assignee, setAssignee] = useState(task.assignee_staff_id ?? '')
  const [dueDate, setDueDate] = useState(task.due_date ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const target = navTarget(task)
  const typeLabel = task.task_type ? board.task_types[task.task_type] ?? task.task_type : 'Manuelle Aufgabe'

  async function handleSave() {
    const patch = {
      ...(isManual ? { title: title.trim(), description: description.trim() || null } : {}),
      ...(status !== task.status ? { status } : {}),
      ...((assignee || null) !== task.assignee_staff_id ? { assignee_staff_id: assignee || null } : {}),
      ...((dueDate || null) !== task.due_date ? { due_date: dueDate || null } : {}),
    }
    // Nichts geändert → einfach schliessen (der Server lehnt leere Patches ab).
    if (Object.keys(patch).length === 0) { onClose(); return }
    setBusy(true)
    setError(null)
    try {
      await updateBoardTask(task.id, patch)
      onChanged(true)
      onClose()
    } catch {
      setError('Speichern fehlgeschlagen')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm('Aufgabe löschen?')) return
    setBusy(true)
    try {
      await deleteBoardTask(task.id)
      onChanged(true)
      onClose()
    } catch {
      setError('Löschen fehlgeschlagen')
      setBusy(false)
    }
  }

  return (
    <div className="admin-modal-overlay" {...backdropCloseProps(onClose)}>
      <div className="admin-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="admin-modal-header">
          <div className="admin-modal-title">{typeLabel}</div>
          <button className="admin-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="admin-modal-body tb-detail">
          {error && <div className="admin-toast error">{error}</div>}

          {isManual ? (
            <label className="tb-field">
              <span>Titel</span>
              <input className="admin-input" value={title} onChange={e => setTitle(e.target.value)} maxLength={300} />
            </label>
          ) : (
            <div className="tb-detail-title">{task.title}</div>
          )}

          {isManual ? (
            <label className="tb-field">
              <span>Beschreibung</span>
              <textarea className="admin-input" rows={3} value={description} onChange={e => setDescription(e.target.value)} maxLength={4000} />
            </label>
          ) : (
            task.description && <div className="tb-detail-desc">{task.description}</div>
          )}

          {task.project_name && <div className="tb-detail-row">Projekt: <strong>{task.project_name}</strong></div>}
          {task.created_by_name && <div className="tb-detail-row">Erstellt von {task.created_by_name}</div>}
          {task.done_at && (
            <div className="tb-detail-row">
              Erledigt am {fmtDate(task.done_at)}{task.auto_done ? ' — automatisch (Bedingung behoben)' : task.done_by_name ? ` von ${task.done_by_name}` : ''}
            </div>
          )}

          <div className="tb-field-row">
            <label className="tb-field">
              <span>Spalte</span>
              <select className="admin-input" value={status} onChange={e => setStatus(e.target.value as BoardColumn)}>
                {board.columns.map(c => <option key={c} value={c}>{COLUMN_LABELS[c]}</option>)}
              </select>
            </label>
            <label className="tb-field">
              <span>Zugewiesen an</span>
              <select className="admin-input" value={assignee} onChange={e => setAssignee(e.target.value)}>
                <option value="">— Nicht zugewiesen —</option>
                {board.staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label className="tb-field">
              <span>Fällig am</span>
              <input type="date" className="admin-input" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </label>
          </div>

          <div className="tb-detail-actions">
            {target && (
              <button className="admin-btn admin-btn-secondary" onClick={() => { onClose(); onNav(target.screen, target.detailId) }}>
                Öffnen
              </button>
            )}
            {isManual && (
              <button className="admin-btn admin-btn-danger" disabled={busy} onClick={handleDelete}>
                Löschen
              </button>
            )}
            <button className="admin-btn admin-btn-primary" disabled={busy} onClick={handleSave} style={{ marginLeft: 'auto' }}>
              {busy ? 'Speichere…' : 'Speichern'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Neue Aufgabe ────────────────────────────────────────────

interface CreateModalProps {
  board: TaskBoardResponse
  onClose: () => void
  onCreated: () => void
}

function CreateTaskModal({ board, onClose, onCreated }: CreateModalProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [assignee, setAssignee] = useState(board.me_staff_id ?? '')
  const [dueDate, setDueDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    if (!title.trim()) { setError('Titel fehlt'); return }
    setBusy(true)
    setError(null)
    try {
      await createBoardTask({
        title: title.trim(),
        description: description.trim() || null,
        assignee_staff_id: assignee || null,
        due_date: dueDate || null,
      })
      onCreated()
      onClose()
    } catch {
      setError('Anlegen fehlgeschlagen')
      setBusy(false)
    }
  }

  return (
    <div className="admin-modal-overlay" {...backdropCloseProps(onClose)}>
      <div className="admin-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <div className="admin-modal-header">
          <div className="admin-modal-title">Neue Aufgabe</div>
          <button className="admin-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="admin-modal-body tb-detail">
          {error && <div className="admin-toast error">{error}</div>}
          <label className="tb-field">
            <span>Titel</span>
            <input className="admin-input" value={title} onChange={e => setTitle(e.target.value)} maxLength={300} autoFocus />
          </label>
          <label className="tb-field">
            <span>Beschreibung (optional)</span>
            <textarea className="admin-input" rows={3} value={description} onChange={e => setDescription(e.target.value)} maxLength={4000} />
          </label>
          <div className="tb-field-row">
            <label className="tb-field">
              <span>Zugewiesen an</span>
              <select className="admin-input" value={assignee} onChange={e => setAssignee(e.target.value)}>
                <option value="">— Nicht zugewiesen —</option>
                {board.staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label className="tb-field">
              <span>Fällig am (optional)</span>
              <input type="date" className="admin-input" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </label>
          </div>
          <div className="tb-detail-actions">
            <button className="admin-btn admin-btn-primary" disabled={busy} onClick={handleCreate} style={{ marginLeft: 'auto' }}>
              {busy ? 'Lege an…' : 'Aufgabe anlegen'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Board ───────────────────────────────────────────────────

export default function TaskBoardScreen({ onNav, onBadgeChange }: Props) {
  const [board, setBoard] = useState<TaskBoardResponse | null>(null)
  const [filter, setFilter] = useState('me')
  const [loading, setLoading] = useState(true)
  const [detailTask, setDetailTask] = useState<BoardTask | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [toast, setToast] = useState<Toast>(null)

  async function load(assignee = filter, refresh = false) {
    setLoading(true)
    try {
      setBoard(await getTaskBoard(assignee, refresh))
    } catch {
      setToast({ msg: 'Board konnte nicht geladen werden', type: 'error' })
      setTimeout(() => setToast(null), 3000)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load('me') }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function switchFilter(next: string) {
    setFilter(next)
    load(next)
  }

  function staffName(staffId: string | null): string | null {
    if (!staffId || !board) return null
    return board.staff.find(s => s.id === staffId)?.name ?? null
  }

  async function moveTask(task: BoardTask, column: BoardColumn, targetIndex: number) {
    if (!board) return
    const grouped = groupByColumn(board.tasks, board.columns)
    const sortOrder = dropSortOrder(grouped[column], targetIndex, task.id)
    const patch = {
      ...(task.status !== column ? { status: column } : {}),
      sort_order: sortOrder,
    }
    // Optimistisch verschieben; bei Fehler frisch laden.
    setBoard(b => b ? {
      ...b,
      tasks: b.tasks.map(t => t.id === task.id ? { ...t, status: column, sort_order: sortOrder } : t),
    } : b)
    try {
      await updateBoardTask(task.id, patch)
      if (task.status !== column) onBadgeChange?.()
    } catch {
      setToast({ msg: 'Verschieben fehlgeschlagen', type: 'error' })
      setTimeout(() => setToast(null), 3000)
      load()
    }
  }

  function handleDrop(e: React.DragEvent, column: BoardColumn, targetIndex: number) {
    e.preventDefault()
    e.stopPropagation()
    const taskId = e.dataTransfer.getData('text/task-id')
    const task = board?.tasks.find(t => t.id === taskId)
    if (task) moveTask(task, column, targetIndex)
  }

  const grouped = board ? groupByColumn(board.tasks, board.columns) : null
  const plOptions = board?.projektleiter ?? []

  return (
    <div className="admin-page tb-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Aufgaben</div>
          <div className="admin-page-subtitle">Kanban-Board — automatisch abgeleitete und manuelle Aufgaben</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="admin-btn admin-btn-secondary" onClick={() => load(filter, true)} disabled={loading}>
            Aktualisieren
          </button>
          <button className="admin-btn admin-btn-primary" onClick={() => setShowCreate(true)} disabled={!board}>
            + Aufgabe
          </button>
        </div>
      </div>

      {toast && <div className={`admin-toast ${toast.type}`}>{toast.msg}</div>}

      {board?.can_filter_all && (
        <div className="tb-filterbar">
          <button className={`tb-chip${filter === 'me' ? ' active' : ''}`} onClick={() => switchFilter('me')}>Meine</button>
          <button className={`tb-chip${filter === 'all' ? ' active' : ''}`} onClick={() => switchFilter('all')}>Alle</button>
          <button className={`tb-chip${filter === 'none' ? ' active' : ''}`} onClick={() => switchFilter('none')}>Nicht zugewiesen</button>
          <select
            className="admin-input tb-pl-select"
            value={plOptions.some(p => p.id === filter) ? filter : ''}
            onChange={e => e.target.value && switchFilter(e.target.value)}
          >
            <option value="">Projektleiter…</option>
            {plOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      )}

      {board === null && loading && (
        <div className="admin-loading"><div className="admin-spinner" />Lade Aufgaben…</div>
      )}

      {board && grouped && (
        <div className="tb-board">
          {board.columns.map(column => {
            const tasks = grouped[column]
            return (
              <div
                key={column}
                className={`tb-column${column === 'erledigt' ? ' done' : ''}`}
                onDragOver={e => e.preventDefault()}
                onDrop={e => handleDrop(e, column, tasks.length)}
              >
                <div className="tb-column-header">
                  <span>{COLUMN_LABELS[column]}</span>
                  <span className="tb-column-count">{tasks.length}</span>
                </div>
                <div className="tb-column-body">
                  {tasks.length === 0 && <div className="tb-column-empty">Keine Aufgaben</div>}
                  {tasks.map((task, idx) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      typeLabel={task.task_type ? board.task_types[task.task_type] ?? null : null}
                      assigneeName={staffName(task.assignee_staff_id)}
                      onClick={() => setDetailTask(task)}
                      onDragStart={e => e.dataTransfer.setData('text/task-id', task.id)}
                      onDropBefore={e => handleDrop(e, column, idx)}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {detailTask && board && (
        <TaskDetailModal
          task={detailTask}
          board={board}
          onClose={() => setDetailTask(null)}
          onChanged={() => { load(); onBadgeChange?.() }}
          onNav={onNav}
        />
      )}

      {showCreate && board && (
        <CreateTaskModal
          board={board}
          onClose={() => setShowCreate(false)}
          onCreated={() => { load(); onBadgeChange?.() }}
        />
      )}
    </div>
  )
}
