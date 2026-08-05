import { useEffect } from 'react'

interface UnsavedChangesDialogProps {
  /** Speichern und danach die ausgelöste Aktion (Zurück/Navigation) fortsetzen. */
  onSave: () => void
  /** Änderungen wegwerfen und fortsetzen. */
  onDiscard: () => void
  /** In der Maske bleiben. */
  onCancel: () => void
  saving?: boolean
  message?: React.ReactNode
}

/**
 * Drei-Wege-Abfrage beim Verlassen einer Maske mit ungespeicherten Änderungen.
 * ConfirmDialog reicht hier nicht: „Verwerfen" und „Speichern" sind zwei
 * verschiedene Bestätigungen, nicht Bestätigen/Abbrechen.
 */
export function UnsavedChangesDialog({
  onSave,
  onDiscard,
  onCancel,
  saving = false,
  message = 'Du hast Änderungen gemacht, die noch nicht gespeichert sind.',
}: UnsavedChangesDialogProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !saving) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [saving, onCancel])

  return (
    <div
      className="admin-confirm-overlay"
      onClick={() => { if (!saving) onCancel() }}
      role="dialog"
      aria-modal="true"
      aria-label="Ungespeicherte Änderungen"
    >
      <div className="admin-confirm-box" onClick={e => e.stopPropagation()}>
        <div className="admin-confirm-title">Ungespeicherte Änderungen</div>
        <div className="admin-confirm-text">{message}</div>
        <div className="admin-confirm-actions">
          <button className="admin-btn admin-btn-secondary" onClick={onCancel} disabled={saving}>
            Abbrechen
          </button>
          <button className="admin-btn admin-btn-danger" onClick={onDiscard} disabled={saving}>
            Verwerfen
          </button>
          <button className="admin-btn admin-btn-primary" onClick={onSave} disabled={saving}>
            {saving ? 'Speichern…' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  )
}
