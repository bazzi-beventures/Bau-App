import { useState } from 'react'
import { apiUrl } from '../../../api/client'
import { fmtDate } from '../../utils/format'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { ActionRow } from '../../components/ActionRow'
import { FileSections, REPORT_DOC_SECTIONS } from './FileSection'
import type { ProjectFile, ProjectFileCategory, ProjectReport } from './types'

interface ReportsTabProps {
  reports: ProjectReport[]
  // Optional: öffnet das Popup zum manuellen Erfassen (spiegelbildlich zu QuotesTab).
  // Fehlt der Prop, wird der Button nicht gezeigt (Abwärtskompatibilität).
  onShowCreateForm?: () => void
  // Optional: Link auf das Blanko-Rapportformular (PDF) für den Papier-Fallback.
  // Reiner Download wie die PDF-Links der Rapport-Zeilen — kein State, kein Fetch.
  paperRapportUrl?: string
  // Optional: löscht einen Rapport (inkl. Stunden/Material). Fehlt der Prop, wird
  // kein Löschen-Knopf gezeigt (Abwärtskompatibilität).
  onDelete?: (reportId: number) => Promise<void>
  // Optional: öffnet die Bearbeiten-Maske. Der Knopf erscheint nur an manuell
  // erfassten, noch nicht abgerechneten Rapporten — ein Chat-Rapport ist die
  // Aufnahme des Monteurs und wird nicht umgeschrieben (Server prüft dieselbe
  // Regel nochmals, db.report_edit_blocker).
  onEdit?: (reportId: number) => void
  // Optional: Datei-Sektion für hochgeladene Rapporte (Papier-Blatt, Fremdsystem).
  // Nur gezeigt, wenn die Upload-Props gesetzt sind — gleiche Handler wie der
  // Dokumente-Tab, die Sektion bestimmt die Kategorie ('rapport') implizit.
  files?: ProjectFile[]
  uploading?: boolean
  uploadingCategory?: ProjectFileCategory | null
  onUploadFile?: (category: ProjectFileCategory, files: File[]) => void
  onDeleteFile?: (fileId: string) => void
  onRenameFile?: (fileId: string, filename: string) => Promise<void>
}

export function ReportsTab({
  reports, onShowCreateForm, paperRapportUrl, onDelete, onEdit,
  files, uploading, uploadingCategory, onUploadFile, onDeleteFile, onRenameFile,
}: ReportsTabProps) {
  const [confirmDelete, setConfirmDelete] = useState<ProjectReport | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Abgerechnete Rapporte bleiben tabu: ihre Positionen stehen auf einer Rechnung.
  // Alles andere darf der Projektleiter wegräumen — auch unterschriebene Rapporte,
  // dann aber mit deutlicherem Hinweis. Server prüft dieselbe Regel nochmals.
  async function handleDelete() {
    if (!onDelete || !confirmDelete) return
    setDeleting(true)
    try {
      await onDelete(confirmDelete.id)
      setConfirmDelete(null)
    } catch {
      // Grund steht im Toast des Aufrufers (z.B. "hängt an einer Rechnung") —
      // der Dialog bleibt offen, damit die Aktion nicht still verpufft.
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="admin-table-wrap" style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div className="admin-section-title" style={{ margin: 0 }}>Rapporte</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            {reports.length === 0 ? 'keine' : `${reports.length} Rapport${reports.length === 1 ? '' : 'e'}`}
          </span>
          {paperRapportUrl && (
            <a
              href={paperRapportUrl}
              target="_blank"
              rel="noreferrer"
              className="admin-btn admin-btn-sm admin-btn-secondary"
              title="Blanko-Formular drucken, auf der Baustelle von Hand ausfüllen, danach über «+ Neuer Rapport» erfassen und das ausgefüllte Blatt unten hochladen"
            >
              Papier-Rapport (PDF)
            </a>
          )}
          {onShowCreateForm && (
            <button
              type="button"
              className="admin-btn admin-btn-sm admin-btn-primary"
              onClick={onShowCreateForm}
            >
              + Neuer Rapport
            </button>
          )}
        </div>
      </div>
      {reports.length === 0 ? (
        <div style={{ color: 'var(--muted)', fontSize: 13 }}>Noch keine Rapporte für dieses Projekt.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {reports.map(r => {
            const signed = !!r.signature_timestamp
            const billed = !!r.invoice_id
            const manual = r.source === 'admin_manual'
            // Priorität: Abgerechnet > Unterschrieben > Manuell > Pendent.
            const status: { label: string; cls: string } = billed
              ? { label: 'Abgerechnet', cls: 'admin-badge-closed' }
              : signed
                ? { label: 'Unterschrieben', cls: 'admin-badge-paid' }
                : manual
                  ? { label: 'Manuell', cls: 'admin-badge-sent' }
                  : { label: 'Pendent', cls: 'admin-badge-open' }
            return (
              <ActionRow key={r.id} style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: 18 }}>📋</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{fmtDate(r.report_date)}</span>
                    <span className={`admin-badge ${status.cls}`}>{status.label}</span>
                    {r.is_warranty && (
                      <span
                        className="admin-badge admin-badge-warning"
                        title="Als Garantiefall erfasst — beim Verrechnen die Positionen prüfen."
                      >
                        Garantie
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                    {r.created_by ?? '—'}
                    {r.description ? ` · ${r.description}` : ''}
                  </div>
                </div>
                {(r.storage_path || r.pdf_url) ? (
                  <a href={apiUrl(`/pwa/admin/reports/${r.id}/pdf`)} target="_blank" rel="noreferrer" className="admin-btn admin-btn-secondary admin-btn-sm">
                    PDF
                  </a>
                ) : (
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>kein PDF</span>
                )}
                {onEdit && manual && !billed && !signed && (
                  <button
                    type="button"
                    className="admin-btn admin-btn-sm admin-btn-secondary"
                    onClick={() => onEdit(r.id)}
                    title="Datum, Stunden, Material und Beschrieb dieses Rapports korrigieren"
                  >
                    Bearbeiten
                  </button>
                )}
                {onDelete && !billed && (
                  <button
                    type="button"
                    className="admin-btn admin-btn-sm admin-btn-danger"
                    onClick={() => setConfirmDelete(r)}
                    title="Rapport inkl. Stunden und Material löschen"
                  >
                    Löschen
                  </button>
                )}
              </ActionRow>
            )
          })}
        </div>
      )}

      {/* Hochgeladene Rapporte: das ausgefüllte Papier-Blatt (siehe Knopf oben) oder
          ein Rapport aus einem Fremdsystem. Bewusst hier statt im Dokumente-Tab —
          und bewusst als Datei-Kategorie: solche Blätter haben oft keine erfasste
          Rapport-Zeile, an die man sie hängen könnte. */}
      {onUploadFile && onDeleteFile && onRenameFile && (
        <div style={{ marginTop: 24 }}>
          <FileSections
            files={files ?? []}
            sections={REPORT_DOC_SECTIONS}
            uploading={!!uploading}
            uploadingCategory={uploadingCategory ?? null}
            onUpload={onUploadFile}
            onDelete={onDeleteFile}
            onRename={onRenameFile}
          />
        </div>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Rapport löschen?"
          message={
            <>
              {confirmDelete.signature_timestamp && (
                <div style={{ fontWeight: 600, marginBottom: 8 }}>
                  Dieser Rapport ist vom Kunden unterschrieben.
                </div>
              )}
              Rapport vom {fmtDate(confirmDelete.report_date)}
              {confirmDelete.created_by ? ` (${confirmDelete.created_by})` : ''} wirklich löschen?
              Erfasste Stunden, Material und Fotos werden mitgelöscht, das Material wird
              ins Lager zurückgebucht. Das lässt sich nicht rückgängig machen.
            </>
          }
          confirmLabel="Endgültig löschen"
          busyLabel="Wird gelöscht…"
          busy={deleting}
          variant="danger"
          onCancel={() => { if (!deleting) setConfirmDelete(null) }}
          onConfirm={() => void handleDelete()}
        />
      )}
    </div>
  )
}
