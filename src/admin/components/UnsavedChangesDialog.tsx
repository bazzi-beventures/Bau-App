import { useEffect } from 'react'
import { backdropCloseProps } from '../../shared/backdropClose'

interface UnsavedChangesDialogProps {
  /** Speichern und danach die ausgelöste Aktion (Zurück/Navigation) fortsetzen. */
  onSave: () => void
  /** Änderungen wegwerfen und fortsetzen. */
  onDiscard: () => void
  /** In der Maske bleiben. */
  onCancel: () => void
  saving?: boolean
  message?: React.ReactNode
  /** Überschrift/Beschriftungen überschreiben — für Masken, in denen „Speichern"
   *  etwas anderes heisst (z. B. Offert-Entwurf behalten statt Offerte anlegen). */
  title?: string
  saveLabel?: string
  savingLabel?: string
  discardLabel?: string
  cancelLabel?: string
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
  title = 'Ungespeicherte Änderungen',
  saveLabel = 'Speichern',
  savingLabel = 'Speichern…',
  discardLabel = 'Verwerfen',
  cancelLabel = 'Abbrechen',
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
      // Drag-sicher wie beim ConfirmDialog: ein plain onClick schloss den Dialog
      // auch, wenn eine Textauswahl ausserhalb der Box endete.
      {...backdropCloseProps(() => { if (!saving) onCancel() })}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="admin-confirm-box" onClick={e => e.stopPropagation()}>
        <div className="admin-confirm-title">{title}</div>
        <div className="admin-confirm-text">{message}</div>
        <div className="admin-confirm-actions">
          <button className="admin-btn admin-btn-secondary" onClick={onCancel} disabled={saving}>
            {cancelLabel}
          </button>
          <button className="admin-btn admin-btn-danger" onClick={onDiscard} disabled={saving}>
            {discardLabel}
          </button>
          <button className="admin-btn admin-btn-primary" onClick={onSave} disabled={saving}>
            {saving ? savingLabel : saveLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
