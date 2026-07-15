import { useState, useRef } from 'react'
import { apiUrl } from '../../../api/client'
import { fmtCHF, fmtDate } from '../../utils/format'
import { QUOTE_STATUS_LABELS, QUOTE_STATUS_BADGE, INVOICE_STATUS_LABELS, INVOICE_STATUS_BADGE } from '../../constants/statuses'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { ActionRow } from '../../components/ActionRow'

export type ProjectFileCategory =
  | 'fotos'
  | 'masse'
  | 'sonstiges'
  | 'bestellungen'
  | 'auftragsbestaetigung'
  | 'lieferschein'
  | 'anhang'
  | 'prospekt' // Altbestand: frühere Kategorie der Offerten-Anhänge, wird unter 'anhang' angezeigt

export interface ProjectFile {
  id: string
  filename: string
  file_url: string | null
  storage_path?: string | null
  mime_type: string | null
  category: ProjectFileCategory | null
  created_at: string
}

const PROJECT_DOC_SECTIONS: { key: ProjectFileCategory; title: string; legacyFallback?: boolean }[] = [
  { key: 'fotos', title: 'Fotos' },
  { key: 'masse', title: 'Masse' },
  { key: 'sonstiges', title: 'Sonstiges', legacyFallback: true },
  // Dokumente für den Kunden (z.B. Produktprospekt) — können beim Versand einer
  // Offerte als E-Mail-Anhang gewählt werden (Feature prospekt_mit_offerte).
  { key: 'anhang', title: 'Anhänge' },
]

const SUPPLIER_DOC_SECTIONS: { key: ProjectFileCategory; title: string }[] = [
  { key: 'bestellungen', title: 'Bestellungen' },
  { key: 'auftragsbestaetigung', title: 'Auftragsbestätigung' },
  { key: 'lieferschein', title: 'Lieferschein' },
]

// Alle bekannten Kategorien über beide Tabs hinweg. Der legacyFallback der
// "Sonstiges"-Sektion darf NUR echte Altlasten (null / unbekannte Kategorie)
// auffangen – sonst würden Lieferanten-Dateien (z.B. auftragsbestaetigung)
// zusätzlich unter "Sonstiges" doppelt erscheinen.
const ALL_CATEGORY_KEYS = new Set<ProjectFileCategory>(
  [...PROJECT_DOC_SECTIONS, ...SUPPLIER_DOC_SECTIONS].map(s => s.key),
)
// Altbestand: wird in der Anhänge-Sektion angezeigt und darf nicht zusätzlich
// unter "Sonstiges" auftauchen.
ALL_CATEGORY_KEYS.add('prospekt')

export interface ProjectQuote {
  id: number
  parent_id: number | null
  version: number
  quote_number: string
  total_amount: number
  status: string
  created_at: string
  pdf_url: string | null
  xlsx_url: string | null
  storage_path?: string | null
  xlsx_storage_path?: string | null
  customer_email: string | null
}

export interface ProjectInvoice {
  id: number
  parent_id: number | null
  version: number
  invoice_number: string
  total_amount: number
  status: string
  created_at: string
  paid_at: string | null
  pdf_url: string | null
  storage_path?: string | null
  created_without_report?: boolean
}

export interface ProjectReport {
  id: number
  report_date: string
  description: string | null
  created_by: string | null
  pdf_url: string | null
  storage_path?: string | null
  signature_timestamp: string | null
  invoice_id: number | null
  created_at: string
}

export interface ProjectTask {
  id: string
  text: string
  is_done: boolean
  done_at: string | null
  done_by_name: string | null
  created_by_name?: string | null
  created_at: string
}

export interface ProjectApproval {
  id: string
  title: string
  filename: string
  file_url: string | null
  storage_path?: string | null
  mime_type: string | null
  requested_by_user_id: string | null
  requested_by_name: string | null
  approver_user_id: string | null
  approver_name: string | null
  status: 'pending' | 'approved' | 'rejected'
  decided_at: string | null
  decision_note: string | null
  created_at: string
}

export const APPROVAL_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendent',
  approved: 'Freigegeben',
  rejected: 'Abgelehnt',
}

export const APPROVAL_STATUS_BADGE: Record<string, string> = {
  pending: 'admin-badge-open',
  approved: 'admin-badge-paid',
  rejected: 'admin-badge-closed',
}

export function groupByParent<T extends { id: number; parent_id: number | null; version: number }>(items: T[]): T[][] {
  const groups = new Map<number, T[]>()
  for (const item of items) {
    const key = item.parent_id ?? item.id
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(item)
  }
  const result = Array.from(groups.values())
  for (const g of result) g.sort((a, b) => b.version - a.version)
  result.sort((a, b) => {
    const aDate = (a[0] as unknown as { created_at: string }).created_at
    const bDate = (b[0] as unknown as { created_at: string }).created_at
    return new Date(bDate).getTime() - new Date(aDate).getTime()
  })
  return result
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ─── Documents Tab ─────────────────────────────────────────────

export const CATEGORY_LABELS: Record<ProjectFileCategory, string> = {
  fotos: 'Fotos',
  masse: 'Masse',
  sonstiges: 'Sonstiges',
  bestellungen: 'Bestellungen',
  auftragsbestaetigung: 'Auftragsbestätigung',
  lieferschein: 'Lieferschein',
  anhang: 'Anhang',
  prospekt: 'Prospekt',
}

interface FileSectionsProps {
  files: ProjectFile[]
  sections: { key: ProjectFileCategory; title: string; legacyFallback?: boolean }[]
  uploading: boolean
  uploadingCategory: ProjectFileCategory | null
  onUpload: (category: ProjectFileCategory, files: File[]) => void
  onDelete: (fileId: string) => void
  onRename: (fileId: string, filename: string) => Promise<void>
}

interface FileSectionProps {
  section: { key: ProjectFileCategory; title: string; legacyFallback?: boolean }
  items: ProjectFile[]
  uploading: boolean
  isUploadingHere: boolean
  onUpload: (category: ProjectFileCategory, files: File[]) => void
  onDelete: (fileId: string) => void
  onRename: (fileId: string, filename: string) => Promise<void>
}

// Eine Datei-Sektion (z.B. "Fotos") mit Drag-&-Drop-Feld + Hochladen-Button.
// Sowohl Ablegen per Drag-&-Drop als auch Auswahl über den Button laden direkt
// in DIESE Kategorie hoch — die Sektion bestimmt die Kategorie implizit.
function FileSection({ section, items, uploading, isUploadingHere, onUpload, onDelete, onRename }: FileSectionProps) {
  const [dragOver, setDragOver] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [renaming, setRenaming] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function pickFiles() {
    if (!uploading) inputRef.current?.click()
  }

  function startEdit(f: ProjectFile) {
    setEditingId(f.id)
    setEditValue(f.filename)
  }

  async function saveEdit() {
    const name = editValue.trim()
    if (!editingId || !name || renaming) return
    setRenaming(true)
    try {
      await onRename(editingId, name)
      setEditingId(null)
    } finally {
      setRenaming(false)
    }
  }

  function handleSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files ? Array.from(e.target.files) : []
    if (selected.length) onUpload(section.key, selected)
    e.target.value = '' // gleiche Datei erneut auswählbar machen
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    if (uploading) return
    const dropped = Array.from(e.dataTransfer.files || [])
    if (dropped.length) onUpload(section.key, dropped)
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--muted)',
          padding: '6px 10px',
          background: 'var(--surface-2)',
          borderLeft: '3px solid var(--primary)',
          borderRadius: 4,
          marginBottom: 8,
        }}
      >
        <span>{section.title}</span>
        <span style={{ color: 'var(--muted)', fontWeight: 500 }}>· {items.length}</span>
      </div>

      {/* Drag-&-Drop-Feld: Datei reinziehen ODER klicken / Button → Datei-Auswahl */}
      <div
        onClick={pickFiles}
        onDragOver={e => { e.preventDefault(); if (!uploading) setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          flexWrap: 'wrap',
          padding: '14px 12px',
          marginBottom: 8,
          borderRadius: 8,
          border: `2px dashed ${dragOver ? 'var(--primary)' : 'var(--border)'}`,
          background: dragOver ? 'var(--surface-2)' : 'transparent',
          color: 'var(--muted)',
          fontSize: 12,
          cursor: uploading ? 'default' : 'pointer',
          transition: 'border-color 0.15s, background 0.15s',
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          style={{ display: 'none' }}
          onChange={handleSelect}
        />
        <span>
          {isUploadingHere
            ? 'Wird hochgeladen…'
            : dragOver
              ? 'Dateien hier ablegen'
              : 'Dateien hierher ziehen oder klicken'}
        </span>
        <button
          type="button"
          className="admin-btn admin-btn-sm admin-btn-secondary"
          style={{ textTransform: 'none', letterSpacing: 0 }}
          disabled={uploading}
          onClick={e => { e.stopPropagation(); pickFiles() }}
        >
          + Hochladen
        </button>
      </div>

      {items.length === 0 ? (
        <div style={{ color: 'var(--muted)', fontSize: 12, padding: '4px 12px' }}>—</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map(f => (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <span style={{ fontSize: 18 }}>{f.mime_type === 'application/pdf' ? '📄' : '🖼️'}</span>
              {editingId === f.id ? (
                <>
                  <input
                    type="text"
                    className="admin-input"
                    value={editValue}
                    disabled={renaming}
                    autoFocus
                    onChange={e => setEditValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') saveEdit()
                      if (e.key === 'Escape') setEditingId(null)
                    }}
                    style={{ flex: 1, minWidth: 0, fontSize: 13 }}
                  />
                  <button
                    type="button"
                    className="admin-btn admin-btn-sm admin-btn-primary"
                    disabled={renaming || !editValue.trim()}
                    onClick={saveEdit}
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    className="admin-btn admin-btn-sm admin-btn-secondary"
                    disabled={renaming}
                    onClick={() => setEditingId(null)}
                  >
                    ✕
                  </button>
                </>
              ) : (
                <>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {(f.storage_path || f.file_url)
                      ? <a href={apiUrl(`/pwa/admin/project-files/${f.id}/download`)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, fontWeight: 500, color: 'var(--primary)', textDecoration: 'none', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.filename}</a>
                      : <span style={{ fontSize: 13, fontWeight: 500 }}>{f.filename}</span>
                    }
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{formatDateTime(f.created_at)}</div>
                  </div>
                  <button
                    type="button"
                    className="admin-btn admin-btn-sm admin-btn-secondary"
                    title="Umbenennen"
                    onClick={() => startEdit(f)}
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    className="admin-btn admin-btn-sm admin-btn-danger"
                    onClick={() => onDelete(f.id)}
                  >
                    ✕
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function FileSections({ files, sections, uploading, uploadingCategory, onUpload, onDelete, onRename }: FileSectionsProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {sections.map(section => {
        const items = files.filter(f => {
          if (f.category === section.key) return true
          // Altbestand: frühere Kategorie der Offerten-Anhänge.
          if (section.key === 'anhang' && f.category === 'prospekt') return true
          // Fallback nur für echte Altlasten: null oder eine Kategorie, die in
          // KEINEM Tab vorkommt. Bekannte Fremd-Kategorien (z.B. auftragsbestaetigung)
          // bleiben in ihrer eigenen Sektion und tauchen hier nicht auf.
          if (section.legacyFallback && (f.category == null || !ALL_CATEGORY_KEYS.has(f.category))) return true
          return false
        })
        return (
          <FileSection
            key={section.key}
            section={section}
            items={items}
            uploading={uploading}
            isUploadingHere={uploading && uploadingCategory === section.key}
            onUpload={onUpload}
            onDelete={onDelete}
            onRename={onRename}
          />
        )
      })}
    </div>
  )
}

interface DocumentsTabProps {
  files: ProjectFile[]
  uploading: boolean
  uploadingCategory: ProjectFileCategory | null
  onUpload: (category: ProjectFileCategory, files: File[]) => void
  onDelete: (fileId: string) => void
  onRename: (fileId: string, filename: string) => Promise<void>
}

export function DocumentsTab({ files, uploading, uploadingCategory, onUpload, onDelete, onRename }: DocumentsTabProps) {
  return (
    <div className="admin-table-wrap" style={{ padding: 24 }}>
      <div className="admin-section-title" style={{ marginBottom: 14 }}>Dokumente & Fotos</div>
      <FileSections
        files={files}
        sections={PROJECT_DOC_SECTIONS}
        uploading={uploading}
        uploadingCategory={uploadingCategory}
        onUpload={onUpload}
        onDelete={onDelete}
        onRename={onRename}
      />
    </div>
  )
}

export function SupplierDocumentsTab({ files, uploading, uploadingCategory, onUpload, onDelete, onRename }: DocumentsTabProps) {
  return (
    <div className="admin-table-wrap" style={{ padding: 24 }}>
      <div className="admin-section-title" style={{ marginBottom: 14 }}>Lieferantendokumente</div>
      <FileSections
        files={files}
        sections={SUPPLIER_DOC_SECTIONS}
        uploading={uploading}
        uploadingCategory={uploadingCategory}
        onUpload={onUpload}
        onDelete={onDelete}
        onRename={onRename}
      />
    </div>
  )
}

// ─── Quotes Tab ────────────────────────────────────────────────

interface QuotesTabProps {
  quotes: ProjectQuote[]
  invoices: ProjectInvoice[]
  regeneratingQuoteId: number | null
  hasLocalDraft: boolean
  onShowCreateForm: () => void
  onResumeDraft: () => void
  onUpdateStatus: (quoteId: number, status: string) => void
  onRegenerate: (quoteId: number) => void
  onSend: (quote: ProjectQuote) => void
  onEdit: (quoteId: number) => void
}

export function QuotesTab({ quotes, invoices, regeneratingQuoteId, hasLocalDraft, onShowCreateForm, onResumeDraft, onUpdateStatus, onRegenerate, onSend, onEdit }: QuotesTabProps) {
  // Workaround-Hinweis: solange die Mitarbeiter-PWA noch nicht ausgerollt ist,
  // werden Rechnungen direkt aus der Offerte erstellt. Eine solche Rechnung
  // markiert die zugehörige Offertengruppe mit einem Badge.
  const hasWorkaroundInvoice = invoices.some(i => i.created_without_report)
  return (
    <div className="admin-table-wrap" style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div className="admin-section-title" style={{ margin: 0 }}>Offerten</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Nur sichtbar, wenn ein lokal gespeicherter, noch nicht abgeschickter
              Entwurf für dieses Projekt existiert (versehentlich geschlossen). */}
          {hasLocalDraft && (
            <button
              type="button"
              className="admin-btn admin-btn-sm admin-btn-secondary"
              onClick={onResumeDraft}
              title="Eine begonnene, noch nicht erstellte Offerte fortsetzen"
            >
              ● Entwurf fortsetzen
            </button>
          )}
          <button
            type="button"
            className="admin-btn admin-btn-sm admin-btn-primary"
            onClick={onShowCreateForm}
          >
            + Neue Offerte
          </button>
        </div>
      </div>
      {quotes.length === 0 ? (
        <div style={{ color: 'var(--muted)', fontSize: 13 }}>Noch keine Offerten.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {groupByParent(quotes).map((group, groupIdx) => {
            const latest = group[0]
            const showWorkaroundBadge = hasWorkaroundInvoice && groupIdx === 0
            return (
              <div key={latest.parent_id ?? latest.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, background: 'var(--surface-2)' }}>
                {showWorkaroundBadge && (
                  <div style={{ marginBottom: 8, fontSize: 12 }}>
                    <span className="admin-badge admin-badge-pending" title="Rechnung wurde direkt aus dieser Offerte erstellt, weil noch kein vom Kunden unterschriebener Arbeitsrapport vorliegt.">
                      ⚠ Rechnung ohne Rapport erstellt
                    </span>
                  </div>
                )}
                {group.map((q, idx) => {
                  // Nur der aktuellste Entwurf ist direkt bearbeitbar — ein Klick auf
                  // die Zeile öffnet die Maske. Klicks auf Buttons/Links (PDF, Senden …)
                  // sollen NICHT ins Bearbeiten springen.
                  const editable = idx === 0 && q.status === 'entwurf'
                  return (
                  <ActionRow
                    key={q.id}
                    onClick={editable ? (e) => { if (!(e.target as HTMLElement).closest('button, a')) onEdit(q.id) } : undefined}
                    title={editable ? 'Klicken zum Bearbeiten (z.B. Vertipper korrigieren)' : undefined}
                    style={{ padding: '6px 4px', borderTop: idx > 0 ? '1px dashed var(--border)' : 'none', cursor: editable ? 'pointer' : 'default' }}
                  >
                    <span style={{ fontSize: 11, fontWeight: 700, minWidth: 32, color: idx === 0 ? 'var(--primary)' : 'var(--muted)' }}>V{q.version}</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 12, minWidth: 130 }}>{q.quote_number}</span>
                    <span className={`admin-badge ${QUOTE_STATUS_BADGE[q.status] || 'admin-badge-draft'}`}>{QUOTE_STATUS_LABELS[q.status] || q.status}</span>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>{fmtDate(q.created_at)}</span>
                    {editable && <span style={{ fontSize: 12, color: 'var(--muted)' }} title="Klicken zum Bearbeiten">✎ bearbeiten</span>}
                    {/* Summe + Aktionen als ein rechtsbündiger Block, der bei knappem
                        Platz (Kommentar-Seitenleiste) als Einheit umbricht – statt die
                        Summe vom Button-Cluster zu trennen. */}
                    <div style={{ marginLeft: 'auto', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{fmtCHF(q.total_amount)}</span>
                      {(q.storage_path || q.pdf_url) && (
                        <a href={apiUrl(`/pwa/admin/quotes/${q.id}/pdf`)} target="_blank" rel="noreferrer" className="admin-btn admin-btn-secondary admin-btn-sm">PDF</a>
                      )}
                      {(q.xlsx_storage_path || q.xlsx_url) && (
                        <a href={apiUrl(`/pwa/admin/quotes/${q.id}/xlsx`)} target="_blank" rel="noreferrer" className="admin-btn admin-btn-secondary admin-btn-sm">XLSX</a>
                      )}
                      {idx === 0 && (
                        <>
                          {['entwurf', 'gesendet'].includes(q.status) && (
                            <button
                              className="admin-btn admin-btn-primary admin-btn-sm"
                              onClick={() => onSend(q)}
                            >
                              {q.status === 'gesendet' ? 'Erneut senden' : 'Senden'}
                            </button>
                          )}
                          {q.status === 'entwurf' && (
                            <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={() => onUpdateStatus(q.id, 'akzeptiert')}>Akzeptiert</button>
                          )}
                          <button
                            className="admin-btn admin-btn-secondary admin-btn-sm"
                            disabled={regeneratingQuoteId === q.id}
                            onClick={() => onRegenerate(q.id)}
                          >
                            {regeneratingQuoteId === q.id ? '…' : 'Neue Version'}
                          </button>
                        </>
                      )}
                    </div>
                  </ActionRow>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Reports Tab ───────────────────────────────────────────────

interface ReportsTabProps {
  reports: ProjectReport[]
}

export function ReportsTab({ reports }: ReportsTabProps) {
  return (
    <div className="admin-table-wrap" style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div className="admin-section-title" style={{ margin: 0 }}>Rapporte</div>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          {reports.length === 0 ? 'keine' : `${reports.length} Rapport${reports.length === 1 ? '' : 'e'}`}
        </span>
      </div>
      {reports.length === 0 ? (
        <div style={{ color: 'var(--muted)', fontSize: 13 }}>Noch keine Rapporte für dieses Projekt.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {reports.map(r => {
            const signed = !!r.signature_timestamp
            const billed = !!r.invoice_id
            return (
              <ActionRow key={r.id} style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: 18 }}>📋</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{fmtDate(r.report_date)}</span>
                    <span className={`admin-badge ${signed ? 'admin-badge-paid' : 'admin-badge-open'}`}>
                      {signed ? 'Unterschrieben' : 'Pendent'}
                    </span>
                    {billed && (
                      <span className="admin-badge admin-badge-closed">Abgerechnet</span>
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
              </ActionRow>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Invoices Tab ──────────────────────────────────────────────

interface InvoicesTabProps {
  invoices: ProjectInvoice[]
  useAcceptedQuote: boolean
  generatingInvoice: boolean
  defaultEmail: string
  hasSignedReport: boolean
  onUseAcceptedQuoteChange: (v: boolean) => void
  onGenerateInvoice: () => void
  onMarkPaid: (invoiceId: number) => void
  onSendInvoice: (invoiceId: number, recipientEmail: string) => Promise<boolean>
}

export function InvoicesTab({ invoices, useAcceptedQuote, generatingInvoice, defaultEmail, hasSignedReport, onUseAcceptedQuoteChange, onGenerateInvoice, onMarkPaid, onSendInvoice }: InvoicesTabProps) {
  const [sendInvoice, setSendInvoice] = useState<ProjectInvoice | null>(null)
  const [sendEmail, setSendEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [confirmNoReport, setConfirmNoReport] = useState(false)

  async function handleSend() {
    if (!sendInvoice || !sendEmail) return
    setSending(true)
    const ok = await onSendInvoice(sendInvoice.id, sendEmail)
    setSending(false)
    if (ok) setSendInvoice(null)
  }

  function handleGenerateClick() {
    if (hasSignedReport) {
      onGenerateInvoice()
    } else {
      setConfirmNoReport(true)
    }
  }

  function handleConfirmNoReport() {
    setConfirmNoReport(false)
    onGenerateInvoice()
  }

  return (
    <div className="admin-table-wrap" style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div className="admin-section-title" style={{ margin: 0 }}>Rechnungen</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
            <input type="checkbox" checked={useAcceptedQuote} onChange={e => onUseAcceptedQuoteChange(e.target.checked)} />
            Aus aktueller Offerte
          </label>
          <button
            type="button"
            className="admin-btn admin-btn-sm admin-btn-primary"
            disabled={generatingInvoice}
            onClick={handleGenerateClick}
          >
            {generatingInvoice ? 'Wird erstellt…' : '+ Rechnung generieren'}
          </button>
        </div>
      </div>
      {!hasSignedReport && (
        <div style={{
          marginBottom: 14,
          padding: '10px 14px',
          borderRadius: 8,
          background: 'var(--warning-bg, #fff4e5)',
          border: '1px solid var(--warning, #f0ad4e)',
          color: 'var(--warning-fg, #8a5a00)',
          fontSize: 13,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <span style={{ fontSize: 16 }}>⚠️</span>
          <span>
            Kein unterzeichneter Rapport vorhanden — die Rechnung wird auf Basis der aktuellen (zuletzt bearbeiteten) Offerte erstellt.
          </span>
        </div>
      )}
      {invoices.length === 0 ? (
        <div style={{ color: 'var(--muted)', fontSize: 13 }}>Noch keine Rechnungen.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {groupByParent(invoices).map(group => {
            const latest = group[0]
            return (
              <div key={latest.parent_id ?? latest.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, background: 'var(--surface-2)' }}>
                {group.map((inv, idx) => (
                  <ActionRow key={inv.id} style={{ padding: '6px 4px', borderTop: idx > 0 ? '1px dashed var(--border)' : 'none' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, minWidth: 32, color: idx === 0 ? 'var(--primary)' : 'var(--muted)' }}>V{inv.version}</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 12, minWidth: 150 }}>{inv.invoice_number}</span>
                    <span className={`admin-badge ${INVOICE_STATUS_BADGE[inv.status] || 'admin-badge-draft'}`}>{INVOICE_STATUS_LABELS[inv.status] || inv.status}</span>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>{fmtDate(inv.created_at)}</span>
                    <span style={{ flex: 1, textAlign: 'right', fontWeight: 600, fontSize: 13 }}>{fmtCHF(inv.total_amount)}</span>
                    {(inv.storage_path || inv.pdf_url) && (
                      <a href={apiUrl(`/pwa/admin/invoices/${inv.id}/pdf`)} target="_blank" rel="noreferrer" className="admin-btn admin-btn-secondary admin-btn-sm">PDF</a>
                    )}
                    {idx === 0 && (inv.status === 'ausstehend' || inv.status === 'offen' || inv.status === 'gesendet') && (
                      <>
                        <button
                          className="admin-btn admin-btn-primary admin-btn-sm"
                          onClick={() => { setSendEmail(defaultEmail); setSendInvoice(inv) }}
                        >
                          Senden
                        </button>
                        <button className="admin-btn admin-btn-success admin-btn-sm" onClick={() => onMarkPaid(inv.id)}>Bezahlt</button>
                      </>
                    )}
                  </ActionRow>
                ))}
              </div>
            )
          })}
        </div>
      )}

      {/* Dialog: Rechnung ohne unterschriebenen Rapport erstellen */}
      {confirmNoReport && (
        <ConfirmDialog
          title="Rechnung ohne Arbeitsrapport erstellen?"
          message={
            <>
              Es ist kein vom Kunden unterschriebener Rapport vorhanden.
              Die Rechnung wird stattdessen aus der akzeptierten Offerte generiert.
            </>
          }
          confirmLabel="Ohne Rapport erstellen"
          busyLabel="Wird erstellt…"
          busy={generatingInvoice}
          variant="primary"
          onCancel={() => setConfirmNoReport(false)}
          onConfirm={handleConfirmNoReport}
        />
      )}

      {/* Dialog: Rechnung senden */}
      {sendInvoice && (
        <div className="admin-confirm-overlay">
          <div className="admin-confirm-box" style={{ maxWidth: 440 }}>
            <div className="admin-confirm-title">Rechnung senden</div>
            <div className="admin-confirm-text" style={{ marginBottom: 12 }}>
              {sendInvoice.invoice_number} · {fmtCHF(sendInvoice.total_amount)}
            </div>
            <div style={{ marginBottom: 12 }}>
              <label className="admin-form-label">Empfänger E-Mail</label>
              <input
                className="admin-form-input"
                type="email"
                value={sendEmail}
                onChange={e => setSendEmail(e.target.value)}
                placeholder="kunde@example.com"
              />
            </div>
            <div className="admin-confirm-actions">
              <button className="admin-btn admin-btn-secondary" onClick={() => setSendInvoice(null)} disabled={sending}>Abbrechen</button>
              <button className="admin-btn admin-btn-primary" onClick={handleSend} disabled={!sendEmail || sending}>
                {sending ? 'Wird gesendet…' : 'Rechnung senden'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Approvals Tab ─────────────────────────────────────────────

interface ApprovalsTabProps {
  approvals: ProjectApproval[]
  currentUserId: string | null
  decidingApprovalId: string | null
  onShowCreateForm: () => void
  onDecide: (approvalId: string, decision: 'approve' | 'reject') => void
  onDelete: (approvalId: string) => void
}

export function ApprovalsTab({ approvals, currentUserId, decidingApprovalId, onShowCreateForm, onDecide, onDelete }: ApprovalsTabProps) {
  return (
    <div className="admin-table-wrap" style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div className="admin-section-title" style={{ margin: 0 }}>Bestellfreigabe / Visierung</div>
        <button
          type="button"
          className="admin-btn admin-btn-sm admin-btn-primary"
          onClick={onShowCreateForm}
        >
          + Neue Bestellfreigabe
        </button>
      </div>
      {approvals.length === 0 ? (
        <div style={{ color: 'var(--muted)', fontSize: 13 }}>Noch keine Freigaben angefragt.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {approvals.map(a => {
            const isApprover = !!currentUserId && a.approver_user_id === currentUserId
            const isCreator = !!currentUserId && a.requested_by_user_id === currentUserId
            return (
              <div key={a.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, background: 'var(--surface-2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{a.title}</span>
                  <span className={`admin-badge ${APPROVAL_STATUS_BADGE[a.status]}`}>{APPROVAL_STATUS_LABELS[a.status]}</span>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{fmtDate(a.created_at)}</span>
                  {(a.storage_path || a.file_url) && (
                    <a href={apiUrl(`/pwa/admin/approvals/${a.id}/download`)} target="_blank" rel="noreferrer" className="admin-btn admin-btn-secondary admin-btn-sm" style={{ marginLeft: 'auto' }}>
                      📎 {a.filename}
                    </a>
                  )}
                </div>
                <div style={{ marginTop: 6, fontSize: 12, color: 'var(--muted)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <span>Eingereicht von <strong>{a.requested_by_name ?? '—'}</strong></span>
                  <span>Freigeber: <strong>{a.approver_name ?? '—'}</strong></span>
                  {a.decided_at && (
                    <span>Entschieden am {fmtDate(a.decided_at)}</span>
                  )}
                </div>
                {a.decision_note && (
                  <div style={{ marginTop: 6, fontSize: 12, fontStyle: 'italic', color: 'var(--muted)' }}>
                    Notiz: {a.decision_note}
                  </div>
                )}
                {a.status === 'pending' && (isApprover || isCreator) && (
                  <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                    {isApprover && (
                      <>
                        <button
                          className="admin-btn admin-btn-success admin-btn-sm"
                          disabled={decidingApprovalId === a.id}
                          onClick={() => onDecide(a.id, 'approve')}
                        >
                          {decidingApprovalId === a.id ? '…' : 'Freigeben'}
                        </button>
                        <button
                          className="admin-btn admin-btn-danger admin-btn-sm"
                          disabled={decidingApprovalId === a.id}
                          onClick={() => onDecide(a.id, 'reject')}
                        >
                          Ablehnen
                        </button>
                      </>
                    )}
                    {isCreator && !isApprover && (
                      <button
                        className="admin-btn admin-btn-secondary admin-btn-sm"
                        onClick={() => onDelete(a.id)}
                      >
                        Löschen
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Aufgaben Tab ──────────────────────────────────────────────

interface TasksTabProps {
  tasks: ProjectTask[]
  onAdd: (text: string) => Promise<void>
  onEdit: (taskId: string, text: string) => Promise<void>
  onDelete: (taskId: string) => Promise<void>
}

export function TasksTab({ tasks, onAdd, onEdit, onDelete }: TasksTabProps) {
  const [newText, setNewText] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  async function handleAdd() {
    const t = newText.trim()
    if (!t) return
    setAdding(true)
    try {
      await onAdd(t)
      setNewText('')
    } finally {
      setAdding(false)
    }
  }

  async function handleSaveEdit() {
    const t = editingText.trim()
    if (!editingId || !t) return
    setSavingEdit(true)
    try {
      await onEdit(editingId, t)
      setEditingId(null)
      setEditingText('')
    } finally {
      setSavingEdit(false)
    }
  }

  return (
    <div className="admin-table-wrap" style={{ padding: 24 }}>
      <div className="admin-section-title" style={{ marginBottom: 6 }}>Aufgaben</div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>
        Checkliste fürs Projekt — der Monteur hakt die Punkte in der App ab.
      </div>

      {/* Neue Aufgabe */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          className="admin-form-input"
          style={{ flex: 1 }}
          placeholder="Neue Aufgabe… (z.B. Schlüssel beim Hauswart abholen)"
          value={newText}
          onChange={e => setNewText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleAdd() } }}
        />
        <button
          type="button"
          className="admin-btn admin-btn-primary"
          disabled={adding || !newText.trim()}
          onClick={handleAdd}
        >
          {adding ? '…' : '+ Aufgabe'}
        </button>
      </div>

      {tasks.length === 0 ? (
        <div style={{ color: 'var(--muted)', fontSize: 13 }}>Noch keine Aufgaben.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {tasks.map(t => {
            const isEditing = editingId === t.id
            return (
              <div key={t.id} style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                {isEditing ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <textarea
                      className="admin-form-input"
                      rows={2}
                      value={editingText}
                      onChange={e => setEditingText(e.target.value)}
                      style={{ resize: 'vertical' }}
                    />
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button type="button" className="admin-btn admin-btn-sm admin-btn-secondary" onClick={() => { setEditingId(null); setEditingText('') }} disabled={savingEdit}>Abbrechen</button>
                      <button type="button" className="admin-btn admin-btn-sm admin-btn-primary" onClick={handleSaveEdit} disabled={savingEdit || !editingText.trim()}>{savingEdit ? 'Speichern…' : 'Speichern'}</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span className={`admin-badge ${t.is_done ? 'admin-badge-paid' : 'admin-badge-open'}`}>
                      {t.is_done ? '✓ erledigt' : 'offen'}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 14, whiteSpace: 'pre-wrap', textDecoration: t.is_done ? 'line-through' : 'none', color: t.is_done ? 'var(--muted)' : 'var(--text)' }}>
                      {t.text}
                    </span>
                    {t.is_done && t.done_by_name && (
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>von {t.done_by_name}</span>
                    )}
                    <button type="button" className="admin-btn admin-btn-sm admin-btn-secondary" onClick={() => { setEditingId(t.id); setEditingText(t.text) }}>Bearbeiten</button>
                    <button type="button" className="admin-btn admin-btn-sm admin-btn-danger" onClick={() => void onDelete(t.id)}>Löschen</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
