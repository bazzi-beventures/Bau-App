import { useEffect } from 'react'

interface ConfirmDialogProps {
  title: string
  message: React.ReactNode
  // Nicht blockierender Warnhinweis unter dem Text (z.B. «noch 2 Rechnungen
  // offen»). Falsy = kein Kasten, damit Aufrufer direkt einen ggf. leeren String
  // durchreichen können.
  warning?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
  busy?: boolean
  busyLabel?: string
  variant?: 'danger' | 'primary'
}

export function ConfirmDialog({
  title,
  message,
  warning,
  confirmLabel = 'Bestätigen',
  cancelLabel = 'Abbrechen',
  onConfirm,
  onCancel,
  busy = false,
  busyLabel,
  variant = 'primary',
}: ConfirmDialogProps) {
  const btnClass = variant === 'danger' ? 'admin-btn admin-btn-danger' : 'admin-btn admin-btn-primary'

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onCancel])

  return (
    <div
      className="admin-confirm-overlay"
      onClick={() => { if (!busy) onCancel() }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="admin-confirm-box" onClick={e => e.stopPropagation()}>
        <div className="admin-confirm-title">{title}</div>
        <div className="admin-confirm-text">{message}</div>
        {warning ? <div className="admin-confirm-warning">{warning}</div> : null}
        <div className="admin-confirm-actions">
          <button className="admin-btn admin-btn-secondary" onClick={onCancel} disabled={busy}>{cancelLabel}</button>
          <button className={btnClass} onClick={onConfirm} disabled={busy}>
            {busy && busyLabel ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
