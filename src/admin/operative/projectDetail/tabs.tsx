import { useState, useRef } from 'react'
import { apiUrl } from '../../../api/client'
import { fmtCHF, fmtDate, todayISO } from '../../utils/format'
import { QUOTE_STATUS_LABELS, QUOTE_STATUS_BADGE, INVOICE_STATUS_LABELS, INVOICE_STATUS_BADGE } from '../../constants/statuses'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { ActionRow } from '../../components/ActionRow'
import { AutoGrowTextarea } from '../../components/AutoGrowTextarea'
import { PROJECT_FILE_ACCEPT, projectFileIcon } from '../../../shared/projectFileTypes'
import { BeschaffungStep, daysSince } from '../../constants/beschaffungSteps'

export type ProjectFileCategory =
  | 'fotos'
  | 'masse'
  | 'sonstiges'
  | 'angebot_lieferant'
  | 'bestellungen'
  | 'auftragsbestaetigung'
  | 'lieferschein'
  | 'anhang'
  | 'prospekt' // Altbestand: frühere Kategorie der Offerten-Anhänge, wird unter 'anhang' angezeigt
  | 'rapport'  // eingescanntes Papier-Blatt oder Rapport aus einem Fremdsystem (z.B. Sorba)
  | 'offerte'  // eingescannte/externe Offerte, die nicht im System erstellt wurde

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
  { key: 'anhang', title: 'Anhänge für Offerte' },
]

const SUPPLIER_DOC_SECTIONS: { key: ProjectFileCategory; title: string }[] = [
  // Chronologie des Beschaffungsablaufs: erst das Angebot des Lieferanten, dann
  // Bestellung, AB, Lieferschein.
  { key: 'angebot_lieferant', title: 'Angebote Lieferant' },
  { key: 'bestellungen', title: 'Bestellungen' },
  { key: 'auftragsbestaetigung', title: 'Auftragsbestätigung' },
  { key: 'lieferschein', title: 'Lieferschein' },
]

// Hochgeladene Rapporte, die nicht im System erfasst wurden: das ausgefüllte
// Papier-Blatt und Rapporte aus Fremdsystemen (z.B. Sorba). Steht im Rapporte-Tab
// unter der Rapport-Liste, nicht im Dokumente-Tab.
const REPORT_DOC_SECTIONS: { key: ProjectFileCategory; title: string }[] = [
  { key: 'rapport', title: 'Hochgeladene Rapporte (Papier / Fremdsystem)' },
]

// Offerten, die nicht in diesem System entstanden sind: die eingescannte Papier-
// Offerte, eine Offerte aus einem Vorgängersystem oder die eines Drittanbieters.
// Steht im Offerten-Tab unter der Offerten-Liste — analog zu den hochgeladenen
// Rapporten. NICHT zu verwechseln mit 'anhang' ("Anhänge für Offerte"): das sind
// Dokumente, die MIT der Offerte an den Kunden rausgehen. Hier liegt das Dokument
// nur am Projekt.
const QUOTE_DOC_SECTIONS: { key: ProjectFileCategory; title: string }[] = [
  { key: 'offerte', title: 'Hochgeladene Offerten (Papier / Fremdsystem)' },
]

// Alle bekannten Kategorien über beide Tabs hinweg. Der legacyFallback der
// "Sonstiges"-Sektion darf NUR echte Altlasten (null / unbekannte Kategorie)
// auffangen – sonst würden Lieferanten-Dateien (z.B. auftragsbestaetigung)
// zusätzlich unter "Sonstiges" doppelt erscheinen.
const ALL_CATEGORY_KEYS = new Set<ProjectFileCategory>(
  [...PROJECT_DOC_SECTIONS, ...SUPPLIER_DOC_SECTIONS, ...REPORT_DOC_SECTIONS, ...QUOTE_DOC_SECTIONS].map(s => s.key),
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
  thankyou_sent_at?: string | null
  rejection_mail_sent_at?: string | null
  variant_group_id?: string | null
  variant_group_kind?: string | null
  variant_rank?: number | null
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
  // Herkunft des Rapports: 'chat' (Standard, Monteur-App) oder 'admin_manual'
  // (Projektleiter hat ihn im Projekt-Detail nacherfasst). Steuert das Badge.
  source?: string
  // Dieser Einsatz ist als Garantiefall erfasst (reports.is_warranty). Eigenes
  // Badge NEBEN dem Status: es ersetzt «Abgerechnet»/«Manuell» nicht, sondern
  // ergänzt sie — beim Verrechnen ist genau diese Kombination die interessante.
  is_warranty?: boolean | null
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
  angebot_lieferant: 'Angebote Lieferant',
  bestellungen: 'Bestellungen',
  auftragsbestaetigung: 'Auftragsbestätigung',
  lieferschein: 'Lieferschein',
  anhang: 'Anhang',
  prospekt: 'Prospekt',
  rapport: 'Rapport',
  offerte: 'Offerte',
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

// Kleines Download-Symbol (Pfeil auf die Ablage) für den Knopf neben jeder Datei.
function DownloadIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ display: 'block' }}
    >
      <path d="M12 3v12" />
      <path d="m7 11 5 5 5-5" />
      <path d="M4 20h16" />
    </svg>
  )
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
          accept={PROJECT_FILE_ACCEPT}
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
              <span style={{ fontSize: 18 }}>{projectFileIcon(f.mime_type, f.filename)}</span>
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
                  {/* Der Dateiname öffnet nur (Fotos/PDFs liefert der Proxy `inline`
                      aus). Für "wirklich als Datei speichern" braucht es den
                      eigenen Knopf mit `?download=1` — siehe drive_proxy.py. */}
                  {(f.storage_path || f.file_url) && (
                    <a
                      href={apiUrl(`/pwa/admin/project-files/${f.id}/download?download=1`)}
                      download={f.filename}
                      className="admin-btn admin-btn-sm admin-btn-secondary"
                      title="Herunterladen"
                      aria-label={`${f.filename} herunterladen`}
                    >
                      <DownloadIcon />
                    </a>
                  )}
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

interface SupplierDocumentsTabProps extends DocumentsTabProps {
  // Feature `beschaffungsstatus`: Dropdown über den Datei-Sektionen. Fehlen die Props,
  // sieht der Tab aus wie vorher (Feature aus / Abwärtskompatibilität mit den Tests).
  beschaffungSteps?: BeschaffungStep[]
  beschaffungStatus?: string | null
  beschaffungStatusAt?: string | null
  beschaffungStatusSource?: string | null
  savingBeschaffung?: boolean
  onBeschaffungChange?: (status: string | null) => void
}

export function SupplierDocumentsTab({
  files, uploading, uploadingCategory, onUpload, onDelete, onRename,
  beschaffungSteps, beschaffungStatus, beschaffungStatusAt, beschaffungStatusSource,
  savingBeschaffung, onBeschaffungChange,
}: SupplierDocumentsTabProps) {
  const showBeschaffung = !!beschaffungSteps?.length && !!onBeschaffungChange
  const days = daysSince(beschaffungStatusAt)
  return (
    <div className="admin-table-wrap" style={{ padding: 24 }}>
      <div className="admin-section-title" style={{ marginBottom: 14 }}>Lieferantendokumente</div>

      {/* Beschaffungsstatus: bewusst hier und nicht im Status-Reiter (dort steht der
          Lebenszyklus). Man setzt den Schritt in dem Moment, in dem man auch das
          Dokument ablegt — Bedienung und Beleg am selben Ort. */}
      {showBeschaffung && (
        <div style={{
          marginBottom: 20,
          padding: '14px 16px',
          borderRadius: 8,
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}>
          <label className="admin-form-label" style={{ margin: 0, whiteSpace: 'nowrap' }}>
            Beschaffungsstatus
          </label>
          <select
            className="admin-form-input"
            style={{ width: 'auto', minWidth: 200 }}
            value={beschaffungStatus ?? ''}
            disabled={savingBeschaffung}
            onChange={e => onBeschaffungChange!(e.target.value || null)}
          >
            <option value="">— nichts bestellt</option>
            {beschaffungSteps!.map(s => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
          {savingBeschaffung && (
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Wird gespeichert…</span>
          )}
          {!savingBeschaffung && beschaffungStatus && (
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              {days !== null ? `seit ${days} Tag${days === 1 ? '' : 'en'}` : 'heute gesetzt'}
              {/* Woher der Wert kommt, entscheidet über das Vertrauen in die Spalte:
                  ein automatischer Sprung ohne Erklärung liest sich als Fehler. */}
              {beschaffungStatusSource === 'auto' && ' · automatisch beim Upload gesetzt'}
            </span>
          )}
        </div>
      )}

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
  // Feature offerte_dank_mail: steuert den „Dankeschön senden"-Knopf bei
  // angenommenen Offerten (Per-Knopfdruck-Modus bzw. Auto-Versand-Fallback).
  dankEnabled: boolean
  // Feature offerte_absage_mail: steuert den „Absage senden"-Knopf bei abgelehnten
  // Offerten (Per-Knopfdruck-Modus bzw. Auto-Versand-Fallback).
  absageEnabled: boolean
  sendingRejectionId: number | null
  onShowCreateForm: () => void
  onResumeDraft: () => void
  onUpdateStatus: (quoteId: number, status: string) => void
  onRegenerate: (quoteId: number) => void
  onSend: (quote: ProjectQuote) => void
  // Öffnet den Danke-Mail-Dialog (Empfänger-Abfrage) — der Versand selbst
  // passiert im Dialog, deshalb die ganze Offerte statt nur der ID.
  onSendThankyou: (quote: ProjectQuote) => void
  onSendRejection: (quoteId: number) => void
  onEdit: (quoteId: number) => void
  // „Weitere Offerte" (mehrere Varianten pro Projekt) — Standard-Fähigkeit, kein Flag.
  addingVariantId?: number | null
  onAddVariant?: (quoteId: number, kind: 'variante' | 'mehrfach') => void
  // Optional: Datei-Sektion für hochgeladene Offerten (Papier, Fremdsystem).
  // Nur gezeigt, wenn die Upload-Props gesetzt sind — gleiche Handler wie der
  // Dokumente-Tab, die Sektion bestimmt die Kategorie ('offerte') implizit.
  files?: ProjectFile[]
  uploading?: boolean
  uploadingCategory?: ProjectFileCategory | null
  onUploadFile?: (category: ProjectFileCategory, files: File[]) => void
  onDeleteFile?: (fileId: string) => void
  onRenameFile?: (fileId: string, filename: string) => Promise<void>
}

export function QuotesTab({
  quotes, invoices, regeneratingQuoteId, hasLocalDraft, dankEnabled,
  absageEnabled, sendingRejectionId,
  onShowCreateForm, onResumeDraft, onUpdateStatus, onRegenerate, onSend, onSendThankyou,
  onSendRejection, onEdit, addingVariantId, onAddVariant,
  files, uploading, uploadingCategory, onUploadFile, onDeleteFile, onRenameFile,
}: QuotesTabProps) {
  // Workaround-Hinweis: solange die Mitarbeiter-PWA noch nicht ausgerollt ist,
  // werden Rechnungen direkt aus der Offerte erstellt. Eine solche Rechnung
  // markiert die zugehörige Offertengruppe mit einem Badge.
  const hasWorkaroundInvoice = invoices.some(i => i.created_without_report)

  // Anzahl Varianten (= Ketten) und Art je Variantengruppe — nur für die Label-Anzeige
  // im Gruppenkopf (Option A/B bzw. Offerte 1/2). Die Art beim Anlegen bestimmt der
  // geklickte Button (+ Variante / + Weitere Offerte), nicht mehr ein Dialog.
  const groupInfo = new Map<string, { chains: Set<number | string>; kind: string }>()
  for (const q of quotes) {
    const gid = q.variant_group_id ?? `chain-${q.parent_id ?? q.id}`
    if (!groupInfo.has(gid)) groupInfo.set(gid, { chains: new Set(), kind: q.variant_group_kind ?? 'variante' })
    groupInfo.get(gid)!.chains.add(q.parent_id ?? q.id)
  }
  const groupSize = (q: ProjectQuote) => groupInfo.get(q.variant_group_id ?? `chain-${q.parent_id ?? q.id}`)?.chains.size ?? 1
  const groupKind = (q: ProjectQuote): 'variante' | 'mehrfach' =>
    (groupInfo.get(q.variant_group_id ?? `chain-${q.parent_id ?? q.id}`)?.kind === 'mehrfach' ? 'mehrfach' : 'variante')

  // Ketten je Slot (Gruppe + Rang): teilen sich mehrere Ketten einen Rang, sind das
  // Untervarianten eines Slots ("Offerte 3 · Option A/B", die zuerst erstellte = A).
  const slotChains = new Map<string, (number | string)[]>()
  for (const q of quotes) {
    const gid = q.variant_group_id ?? `chain-${q.parent_id ?? q.id}`
    const key = `${gid}:${q.variant_rank ?? 1}`
    const root = q.parent_id ?? q.id
    const arr = slotChains.get(key) ?? []
    if (!arr.includes(root)) slotChains.set(key, [...arr, root].sort((a, b) => Number(a) - Number(b)))
  }

  function labelFor(q: ProjectQuote): string {
    const rank = q.variant_rank ?? 1
    if (groupKind(q) === 'variante') {
      return rank >= 1 && rank <= 26 ? `Option ${String.fromCharCode(64 + rank)}` : `Option ${rank}`
    }
    const gid = q.variant_group_id ?? `chain-${q.parent_id ?? q.id}`
    const chains = slotChains.get(`${gid}:${rank}`) ?? []
    const base = `Offerte ${rank}`
    if (chains.length > 1) {
      const idx = chains.indexOf(q.parent_id ?? q.id)
      const letter = idx >= 0 && idx < 26 ? String.fromCharCode(65 + idx) : String(idx + 1)
      return `${base} · Option ${letter}`
    }
    return base
  }

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
                {groupSize(latest) > 1 && (
                  <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="admin-badge admin-badge-approved" style={{ fontSize: 11 }}>{labelFor(latest)}</span>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                      {groupKind(latest) === 'mehrfach' ? 'zusätzliche Offerte (mehrere annehmbar)' : 'Variante (Kunde wählt eine)'}
                    </span>
                  </div>
                )}
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
                    {dankEnabled && q.thankyou_sent_at && (
                      <span style={{ fontSize: 11, color: 'var(--muted)' }} title="Danke-Mail an den Kunden wurde versendet">
                        ✓ Danke-Mail {fmtDate(q.thankyou_sent_at)}
                      </span>
                    )}
                    {absageEnabled && q.rejection_mail_sent_at && (
                      <span style={{ fontSize: 11, color: 'var(--muted)' }} title="Absage-Mail an den Kunden wurde versendet">
                        ✓ Absage-Mail {fmtDate(q.rejection_mail_sent_at)}
                      </span>
                    )}
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
                          {/* Auch bei 'gesendet': nach dem Versand will man den Ausgang
                              festhalten — genau dann meldet sich der Kunde ja. Vorher war
                              nur 'entwurf' erlaubt, was den Normalfall aussperrte. */}
                          {['entwurf', 'gesendet'].includes(q.status) && (
                            <>
                              <button
                                className="admin-btn admin-btn-success admin-btn-sm"
                                onClick={() => onUpdateStatus(q.id, 'akzeptiert')}
                                title="Kunde hat die Offerte angenommen"
                              >
                                Akzeptiert
                              </button>
                              <button
                                className="admin-btn admin-btn-danger admin-btn-sm"
                                onClick={() => onUpdateStatus(q.id, 'abgelehnt')}
                                title="Kunde hat die Offerte abgelehnt"
                              >
                                Abgelehnt
                              </button>
                            </>
                          )}
                          {dankEnabled && q.status === 'akzeptiert' && !q.thankyou_sent_at && (
                            <button
                              className="admin-btn admin-btn-secondary admin-btn-sm"
                              onClick={() => onSendThankyou(q)}
                              title="Dankesmail an den Kunden senden"
                            >
                              Dankeschön senden
                            </button>
                          )}
                          {absageEnabled && q.status === 'abgelehnt' && !q.rejection_mail_sent_at && (
                            <button
                              className="admin-btn admin-btn-secondary admin-btn-sm"
                              disabled={sendingRejectionId === q.id}
                              onClick={() => onSendRejection(q.id)}
                              title="Absage-Mail an den Kunden senden"
                            >
                              {sendingRejectionId === q.id ? '…' : 'Absage senden'}
                            </button>
                          )}
                          <button
                            className="admin-btn admin-btn-secondary admin-btn-sm"
                            disabled={regeneratingQuoteId === q.id}
                            onClick={() => onRegenerate(q.id)}
                            title="Neue Offerten-Nummer mit gleichen Positionen — Kunde und Objekt werden vom aktuellen Projektstand übernommen"
                          >
                            {regeneratingQuoteId === q.id ? '…' : 'Neue Version'}
                          </button>
                          {onAddVariant && (
                            <>
                              <button
                                className="admin-btn admin-btn-secondary admin-btn-sm"
                                disabled={addingVariantId === q.id}
                                onClick={() => onAddVariant(q.id, 'variante')}
                                title="Kopiert diese Offerte als Variante — der Kunde wählt in einem Mail GENAU EINE (Option A/B/C)"
                              >
                                {addingVariantId === q.id ? '…' : '+ Variante'}
                              </button>
                              <button
                                className="admin-btn admin-btn-secondary admin-btn-sm"
                                disabled={addingVariantId === q.id}
                                onClick={() => onAddVariant(q.id, 'mehrfach')}
                                title="Eine eigenständige zusätzliche Offerte — der Kunde kann sie zusätzlich annehmen (Offerte 1/2)"
                              >
                                {addingVariantId === q.id ? '…' : '+ Weitere Offerte'}
                              </button>
                            </>
                          )}
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

      {/* Offerten, die nicht hier entstanden sind: die eingescannte Papier-Offerte,
          eine aus einem Vorgängersystem oder die eines Drittanbieters. Bewusst hier
          statt im Dokumente-Tab — und bewusst als Datei-Kategorie: solche Dokumente
          haben keine Offerten-Zeile, an die man sie hängen könnte. */}
      {onUploadFile && onDeleteFile && onRenameFile && (
        <div style={{ marginTop: 24 }}>
          <FileSections
            files={files ?? []}
            sections={QUOTE_DOC_SECTIONS}
            uploading={!!uploading}
            uploadingCategory={uploadingCategory ?? null}
            onUpload={onUploadFile}
            onDelete={onDeleteFile}
            onRename={onRenameFile}
          />
        </div>
      )}
    </div>
  )
}

// ─── Reports Tab ───────────────────────────────────────────────

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

// ─── Invoices Tab ──────────────────────────────────────────────

interface InvoicesTabProps {
  invoices: ProjectInvoice[]
  useAcceptedQuote: boolean
  generatingInvoice: boolean
  defaultEmail: string
  hasSignedReport: boolean
  onUseAcceptedQuoteChange: (v: boolean) => void
  // Erzeugt die Rechnung; `remark` ist die Bemerkung fuers PDF (leer = kein Block).
  // Liefert true bei Erfolg — der Dialog schliesst nur dann.
  onGenerateInvoice: (remark: string) => Promise<boolean>
  // Bezahlt-Markierung; `paidDate` ist der Tag des Zahlungseingangs (ISO),
  // nachtragbar statt automatisch «heute». Liefert true bei Erfolg — der Dialog
  // schliesst nur dann.
  onMarkPaid: (invoiceId: number, paidDate: string) => Promise<boolean>
  onUnmarkPaid: (invoiceId: number) => Promise<void>
  onArchive: (invoiceId: number) => Promise<void>
  onSendInvoice: (invoiceId: number, recipientEmail: string) => Promise<boolean>
  // Postversand: markiert als gesendet, ohne zu mailen. `sentDate` ist das
  // Aufgabedatum bei der Post (ISO), aus dem das Zahlungsziel läuft.
  onMarkSentByPost: (invoiceId: number, sentDate: string) => Promise<boolean>
}

export function InvoicesTab({ invoices, useAcceptedQuote, generatingInvoice, defaultEmail, hasSignedReport, onUseAcceptedQuoteChange, onGenerateInvoice, onMarkPaid, onUnmarkPaid, onArchive, onSendInvoice, onMarkSentByPost }: InvoicesTabProps) {
  const [sendInvoice, setSendInvoice] = useState<ProjectInvoice | null>(null)
  const [sendEmail, setSendEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [confirmPostal, setConfirmPostal] = useState<ProjectInvoice | null>(null)
  const [postalDate, setPostalDate] = useState('')
  const [confirmPaid, setConfirmPaid] = useState<ProjectInvoice | null>(null)
  const [paidDate, setPaidDate] = useState('')
  // Generieren-Dialog: traegt das Bemerkungs-Feld und (ohne unterschriebenen
  // Rapport) den frueheren Bestaetigungs-Hinweis — ein Dialog statt zwei.
  const [showGenerate, setShowGenerate] = useState(false)
  const [genRemark, setGenRemark] = useState('')
  const [confirmArchive, setConfirmArchive] = useState<ProjectInvoice | null>(null)
  const [confirmUnpay, setConfirmUnpay] = useState<ProjectInvoice | null>(null)
  const [acting, setActing] = useState(false)

  async function handleSend() {
    if (!sendInvoice || !sendEmail) return
    setSending(true)
    const ok = await onSendInvoice(sendInvoice.id, sendEmail)
    setSending(false)
    if (ok) setSendInvoice(null)
  }

  async function handleArchiveConfirm() {
    if (!confirmArchive) return
    setActing(true)
    await onArchive(confirmArchive.id)
    setActing(false)
    setConfirmArchive(null)
  }

  async function handleUnpayConfirm() {
    if (!confirmUnpay) return
    setActing(true)
    await onUnmarkPaid(confirmUnpay.id)
    setActing(false)
    setConfirmUnpay(null)
  }

  function openPostal(inv: ProjectInvoice) {
    setPostalDate(todayISO())
    setConfirmPostal(inv)
  }

  function openPaid(inv: ProjectInvoice) {
    setPaidDate(todayISO())
    setConfirmPaid(inv)
  }

  async function handlePaidConfirm() {
    if (!confirmPaid || !paidDate) return
    setActing(true)
    const ok = await onMarkPaid(confirmPaid.id, paidDate)
    setActing(false)
    // Nur bei Erfolg schliessen — sonst wäre die Fehlermeldung des Backends
    // (400 «Datum vor Rechnungsdatum») weg, bevor sie jemand liest.
    if (ok) setConfirmPaid(null)
  }

  async function handlePostalConfirm() {
    if (!confirmPostal || !postalDate) return
    setActing(true)
    const ok = await onMarkSentByPost(confirmPostal.id, postalDate)
    setActing(false)
    // Nur bei Erfolg schliessen — sonst wäre die Fehlermeldung des Backends
    // (409 «kein PDF», 400 «Datum») weg, bevor sie jemand liest.
    if (ok) setConfirmPostal(null)
  }

  function handleGenerateClick() {
    setGenRemark('')
    setShowGenerate(true)
  }

  async function handleGenerateConfirm() {
    const ok = await onGenerateInvoice(genRemark)
    if (ok) setShowGenerate(false)
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
                        {/* Postversand nur, solange die Rechnung den Betrieb noch nicht
                            verlassen hat, und nur mit vorliegendem PDF — genau die zwei
                            Guards des Endpunkts. Ohne die Bedingungen wäre der Knopf
                            sichtbar, aber jeder Klick ein 409. */}
                        {(inv.status === 'ausstehend' || inv.status === 'offen') && (inv.storage_path || inv.pdf_url) && (
                          <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={() => openPostal(inv)}>
                            Per Post versendet
                          </button>
                        )}
                        <button className="admin-btn admin-btn-success admin-btn-sm" onClick={() => openPaid(inv)}>Bezahlt</button>
                      </>
                    )}
                    {(inv.status === 'ausstehend' || inv.status === 'offen' || inv.status === 'gesendet') && (
                      <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={() => setConfirmArchive(inv)}>
                        Archivieren
                      </button>
                    )}
                    {inv.status === 'bezahlt' && (
                      <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={() => setConfirmUnpay(inv)}>
                        Zahlung zurücksetzen
                      </button>
                    )}
                  </ActionRow>
                ))}
              </div>
            )
          })}
        </div>
      )}

      {/* Dialog: Rechnung archivieren (annullieren) */}
      {confirmArchive && (
        <ConfirmDialog
          title="Rechnung archivieren?"
          message={
            <>
              {confirmArchive.invoice_number} · {fmtCHF(confirmArchive.total_amount)}<br />
              Die Rechnung gilt danach als annulliert. Die enthaltenen Rapporte werden
              von der Rechnung gelöst — sie sind wieder verrechenbar und können bei
              Bedarf gelöscht oder korrigiert werden, bevor eine neue Rechnung
              generiert wird.
            </>
          }
          confirmLabel="Archivieren"
          busyLabel="Wird archiviert…"
          busy={acting}
          variant="danger"
          onCancel={() => { if (!acting) setConfirmArchive(null) }}
          onConfirm={() => void handleArchiveConfirm()}
        />
      )}

      {/* Dialog: Zahlung zurücksetzen */}
      {confirmUnpay && (
        <ConfirmDialog
          title="Zahlung zurücksetzen?"
          message={
            <>
              {confirmUnpay.invoice_number} · {fmtCHF(confirmUnpay.total_amount)}<br />
              Die Rechnung gilt danach wieder als offen (gesendet bzw. ausstehend)
              und kann anschliessend archiviert werden. Bereits erzeugte
              Aftersales-Aufgaben bleiben bestehen und sind im Dashboard löschbar.
            </>
          }
          confirmLabel="Zahlung zurücksetzen"
          busyLabel="Wird zurückgesetzt…"
          busy={acting}
          variant="danger"
          onCancel={() => { if (!acting) setConfirmUnpay(null) }}
          onConfirm={() => void handleUnpayConfirm()}
        />
      )}

      {/* Dialog: Rechnung generieren (Bemerkung + ggf. Hinweis "ohne Rapport") */}
      {showGenerate && (
        <div className="admin-confirm-overlay">
          {/* maxHeight/overflow: die Bemerkung wächst mit dem Text bis ~10 Zeilen —
              ohne das schöbe sie auf kleinen Bildschirmen die Knöpfe aus dem Bild. */}
          <div className="admin-confirm-box" style={{ maxWidth: 440, maxHeight: '90vh', overflow: 'auto' }}>
            <div className="admin-confirm-title">Rechnung generieren</div>
            {!hasSignedReport && (
              <div className="admin-confirm-text" style={{ marginBottom: 12 }}>
                Es ist kein vom Kunden unterschriebener Rapport vorhanden.
                Die Rechnung wird stattdessen aus der akzeptierten Offerte generiert.
              </div>
            )}
            <div style={{ marginBottom: 12 }}>
              <label className="admin-form-label" htmlFor="proj-gen-remark">
                Bemerkung
              </label>
              <AutoGrowTextarea
                id="proj-gen-remark"
                className="admin-form-input"
                minRows={2}
                maxLength={1000}
                value={genRemark}
                placeholder="z.B. Referenz oder Projekt-Nr. des Kunden. Leer lassen, um den Block wegzulassen."
                onChange={e => setGenRemark(e.target.value)}
                disabled={generatingInvoice}
              />
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                Erscheint als eigener Block «Bemerkung» auf der Rechnung, über den Positionen.
              </div>
            </div>
            <div className="admin-confirm-actions">
              <button className="admin-btn admin-btn-secondary" onClick={() => setShowGenerate(false)} disabled={generatingInvoice}>Abbrechen</button>
              <button className="admin-btn admin-btn-primary" onClick={handleGenerateConfirm} disabled={generatingInvoice}>
                {generatingInvoice ? 'Wird erstellt…' : hasSignedReport ? 'Rechnung generieren' : 'Ohne Rapport erstellen'}
              </button>
            </div>
          </div>
        </div>
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

      {/* Dialog: Postversand — Wortlaut wie in der Rechnungsübersicht */}
      {/* Dialog: Rechnung bezahlt (mit nachtragbarem Zahlungsdatum) */}
      {confirmPaid && (
        <div className="admin-confirm-overlay">
          <div className="admin-confirm-box" style={{ maxWidth: 440 }}>
            <div className="admin-confirm-title">Rechnung als bezahlt markieren?</div>
            <div className="admin-confirm-text">
              {confirmPaid.invoice_number} · {fmtCHF(confirmPaid.total_amount)}
            </div>
            <div style={{ margin: '12px 0' }}>
              <label className="admin-form-label" htmlFor="proj-invoice-paid-date">Zahlungsdatum</label>
              <input
                id="proj-invoice-paid-date"
                className="admin-form-input"
                type="date"
                value={paidDate}
                max={todayISO()}
                onChange={e => setPaidDate(e.target.value)}
              />
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                Tag des Zahlungseingangs — nachtragbar, vorbelegt mit heute.
              </div>
            </div>
            <div className="admin-confirm-actions">
              <button className="admin-btn admin-btn-secondary" onClick={() => setConfirmPaid(null)} disabled={acting}>Abbrechen</button>
              <button
                className="admin-btn admin-btn-success"
                onClick={() => void handlePaidConfirm()}
                disabled={acting || !paidDate}
              >
                {acting ? 'Wird markiert…' : 'Ja, bezahlt'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmPostal && (
        <div className="admin-confirm-overlay">
          <div className="admin-confirm-box" style={{ maxWidth: 440 }}>
            <div className="admin-confirm-title">Als per Post versendet markieren?</div>
            <div className="admin-confirm-text">
              {confirmPostal.invoice_number} · {fmtCHF(confirmPostal.total_amount)}<br />
              Es wird keine E-Mail verschickt. Die Rechnung gilt danach als gesendet und
              läuft normal ins Mahnwesen — die Zahlungsfrist zählt ab dem Aufgabedatum.
            </div>
            <div style={{ margin: '12px 0' }}>
              <label className="admin-form-label" htmlFor="proj-postal-sent-date">Aufgabedatum</label>
              <input
                id="proj-postal-sent-date"
                className="admin-form-input"
                type="date"
                value={postalDate}
                max={todayISO()}
                onChange={e => setPostalDate(e.target.value)}
              />
            </div>
            <div className="admin-confirm-actions">
              <button className="admin-btn admin-btn-secondary" onClick={() => setConfirmPostal(null)} disabled={acting}>Abbrechen</button>
              <button
                className="admin-btn admin-btn-primary"
                onClick={() => void handlePostalConfirm()}
                disabled={acting || !postalDate}
              >
                {acting ? 'Wird markiert…' : 'Als versendet markieren'}
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
