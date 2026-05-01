interface ConfirmDialogProps {
  title: string
  message: React.ReactNode
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
  confirmLabel = 'Bestätigen',
  cancelLabel = 'Abbrechen',
  onConfirm,
  onCancel,
  busy = false,
  busyLabel,
  variant = 'primary',
}: ConfirmDialogProps) {
  const btnClass = variant === 'danger' ? 'admin-btn admin-btn-danger' : 'admin-btn admin-btn-primary'
  return (
    <div className="admin-confirm-overlay">
      <div className="admin-confirm-box">
        <div className="admin-confirm-title">{title}</div>
        <div className="admin-confirm-text">{message}</div>
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
