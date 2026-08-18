import { useCallback, useRef, useState } from 'react'
import { backdropCloseProps } from '../../../shared/backdropClose'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { QuoteCreateForm } from '../quotes/QuoteCreateForm'
import { QuoteEditForm } from '../quotes/QuoteEditForm'
import type { QuoteDetail } from '../quotes/quoteTypes'
import { ReportCreateForm } from '../ReportCreateForm'
import type { Project } from '../../../api/admin/projects'
import type { ProjectQuote } from './types'
import type { StaffMember } from './DetailsForm'

// Die drei grossen Erfassungsmasken ueber dem Projekt-Detail (Charge H, H3):
// neue Offerte, Rapport (erfassen ODER bearbeiten) und Offerte bearbeiten.
//
// Sie liegen zusammen, weil sie sich denselben Rahmen teilen — 920 px breit,
// scrollend, ueber dem Screen — und weil ihr Unterschied genau EINE Frage ist:
// meldet die Maske ungespeicherte Aenderungen nach aussen? Nur QuoteEditForm tut
// das (onDirtyChange); nur dort darf ein Klick neben das Fenster schliessen.
// Die Rueckfrage dazu gehoert dieser Datei, nicht dem Screen: sie betrifft
// ausschliesslich diese eine Maske.
//
// Der React-Compiler-Lint meldet fuer `blockWhen` «Cannot access refs during
// render» — ein Fehlalarm: backdropCloseProps reicht die Funktion nur an
// onClick weiter, gelesen wird die Ref erst beim Klick. Der Dirty-Stand MUSS
// eine Ref sein; als State wuerde jeder Tastendruck in der Offerte den ganzen
// Screen neu rendern.

export function ProjectMaskDialogs({
  project, staff, quotes,
  showQuoteForm, onQuoteDone, onQuoteCancel,
  showReportForm, editReportId, onReportDone, onReportCancel,
  editQuote, onEditQuoteDone, onEditQuoteClose,
}: {
  project: Project
  staff: StaffMember[]
  /** Der Rapport verrechnet gegen angenommene Offerten — deshalb hier. */
  quotes: ProjectQuote[]
  showQuoteForm: boolean
  onQuoteDone: (warning?: string) => void
  onQuoteCancel: () => void
  showReportForm: boolean
  /** Gesetzt = dieselbe Maske im Bearbeiten-Modus fuer genau diesen Rapport. */
  editReportId: number | null
  onReportDone: () => void
  onReportCancel: () => void
  editQuote: QuoteDetail | null
  onEditQuoteDone: (warning?: string) => void
  onEditQuoteClose: () => void
}) {
  // Die Bearbeiten-Maske kennt keinen localStorage-Entwurf — geaenderte
  // Positionen leben nur in ihrem State. Sie meldet ueber onDirtyChange, ob
  // etwas offen ist; ein Klick neben das Fenster fragt dann nach, statt alles
  // wegzuwerfen.
  const editQuoteDirty = useRef(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const markDirty = useCallback((dirty: boolean) => { editQuoteDirty.current = dirty }, [])
  const close = useCallback(() => {
    setConfirmDiscard(false)
    editQuoteDirty.current = false
    onEditQuoteClose()
  }, [onEditQuoteClose])

  return (
    <>
      {/* ── Dialog: Neue Offerte ─────────────────────────────── */}
      {/* Bewusst ohne backdropCloseProps: die Maske hat kein Dirty-Signal (anders
          als QuoteEditForm mit onDirtyChange unten), ein Klick daneben würde eine
          halb erfasste Offerte wegwerfen. Fällt mit Charge H2 (Offert-Formulare)
          zusammen — dort bekommt QuoteCreateForm onDirtyChange. */}
      {showQuoteForm && (
        <div className="admin-confirm-overlay">
          <div className="admin-confirm-box" style={{ maxWidth: 920, maxHeight: '90vh', overflow: 'auto' }}>
            <QuoteCreateForm
              lockedProjectName={project.name}
              lockedProjectId={project.id}
              onDone={onQuoteDone}
              onCancel={onQuoteCancel}
            />
          </div>
        </div>
      )}

      {/* ── Dialog: Rapport manuell erfassen / bearbeiten ─────── */}
      {/* Ebenfalls ohne backdropCloseProps — ReportCreateForm meldet keine
          Änderungen nach aussen; Rückfrage kommt mit Charge H3. */}
      {(showReportForm || editReportId !== null) && (
        <div className="admin-confirm-overlay">
          {/* Gleiche Breite wie die Offerten-Maske: die Material-/Fixpreis-Zeilen
              haben bis zu fünf Felder pro Zeile — bei 640 px blieb je Feld so wenig
              Platz, dass Artikelnamen und Preise abgeschnitten wurden. */}
          <div className="admin-confirm-box" style={{ maxWidth: 920, maxHeight: '90vh', overflow: 'auto' }}>
            <ReportCreateForm
              // key: beim Wechsel Erfassen ↔ Bearbeiten (und zwischen zwei Rapporten)
              // muss React die Maske neu aufbauen, sonst bliebe der State der
              // vorherigen stehen.
              key={editReportId ?? 'new'}
              project={project}
              staff={staff}
              quotes={quotes}
              editReportId={editReportId ?? undefined}
              onDone={onReportDone}
              onCancel={onReportCancel}
            />
          </div>
        </div>
      )}

      {/* ── Dialog: Offerte bearbeiten (nur Entwürfe) ────────── */}
      {/* Klick ausserhalb (auf das Overlay) verlässt die Maske. Solange nichts
          geändert wurde, direkt — das PDF entsteht erst beim Speichern, Verlassen
          erzeugt nichts. Sind Änderungen offen, kommt zuerst die Rückfrage; sie
          gingen sonst ersatzlos verloren (kein Entwurf wie beim Erstellen). */}
      {editQuote && (
        <div
          className="admin-confirm-overlay"
          {...backdropCloseProps(close, {
            blockWhen: () => editQuoteDirty.current,
            onBlocked: () => setConfirmDiscard(true),
          })}
        >
          <div className="admin-confirm-box" style={{ maxWidth: 920, maxHeight: '90vh', overflow: 'auto' }}>
            <QuoteEditForm
              quote={editQuote}
              onDirtyChange={markDirty}
              onDone={warning => { close(); onEditQuoteDone(warning) }}
              onCancel={close}
            />
          </div>
        </div>
      )}

      {confirmDiscard && (
        <ConfirmDialog
          title="Änderungen verwerfen?"
          message="Die Offerte ist noch nicht gespeichert. Schliessen verwirft die Änderungen."
          confirmLabel="Verwerfen"
          cancelLabel="Weiter bearbeiten"
          variant="danger"
          onConfirm={close}
          onCancel={() => setConfirmDiscard(false)}
        />
      )}
    </>
  )
}
