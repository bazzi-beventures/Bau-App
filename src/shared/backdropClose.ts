import type React from 'react'

// Klick-aufs-Overlay-schliesst — aber sicher gegen Textauswahl-Drags.
//
// Problem: beginnt man eine Textauswahl in einem Feld und lässt die Maus
// AUSSERHALB der Box los, feuert der Browser den click auf dem gemeinsamen
// Vorfahren (= Overlay) → ein plain onClick={onClose} schliesst das Fenster
// mitten in der Eingabe. Der Guard schliesst nur, wenn mousedown UND click
// beide auf dem Backdrop selbst landen. (Muster aus PdfExtractionReviewModal.)
//
// Verwendung (Einzeiler, kein Hook nötig — der Zustand liegt am DOM-Knoten):
//   <div className="admin-modal-overlay" {...backdropCloseProps(onClose)}>
export function backdropCloseProps(onClose: () => void): {
  onMouseDown: React.MouseEventHandler<HTMLDivElement>
  onClick: React.MouseEventHandler<HTMLDivElement>
} {
  return {
    onMouseDown: e => {
      ;(e.currentTarget as HTMLElement & { _mdOnBackdrop?: boolean })._mdOnBackdrop =
        e.target === e.currentTarget
    },
    onClick: e => {
      const el = e.currentTarget as HTMLElement & { _mdOnBackdrop?: boolean }
      if (e.target === e.currentTarget && el._mdOnBackdrop) onClose()
      el._mdOnBackdrop = false
    },
  }
}
