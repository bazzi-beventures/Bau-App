import { fmtCHF, fmtDate } from '../../utils/format'
import { QUOTE_STATUS_LABELS, QUOTE_STATUS_BADGE, INVOICE_STATUS_LABELS, INVOICE_STATUS_BADGE } from '../../constants/statuses'

export interface ProjectFile {
  id: string
  filename: string
  file_url: string | null
  mime_type: string | null
  created_at: string
}

export interface ProjectQuote {
  id: number
  parent_id: number | null
  version: number
  quote_number: string
  total_amount: number
  status: string
  created_at: string
  pdf_url: string | null
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
}

export interface ProjectApproval {
  id: string
  title: string
  filename: string
  file_url: string | null
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

interface DocumentsTabProps {
  files: ProjectFile[]
  uploading: boolean
  fileInputRef: React.RefObject<HTMLInputElement>
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void
  onDelete: (fileId: string) => void
}

export function DocumentsTab({ files, uploading, fileInputRef, onUpload, onDelete }: DocumentsTabProps) {
  return (
    <div className="admin-table-wrap" style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div className="admin-section-title" style={{ margin: 0 }}>Dokumente & Fotos</div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            style={{ display: 'none' }}
            onChange={onUpload}
          />
          <button
            type="button"
            className="admin-btn admin-btn-sm admin-btn-secondary"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? 'Wird hochgeladen…' : '+ Datei hochladen'}
          </button>
        </div>
      </div>
      {files.length === 0 && (
        <div style={{ color: 'var(--muted)', fontSize: 13 }}>Noch keine Dateien hochgeladen.</div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {files.map(f => (
          <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
            <span style={{ fontSize: 18 }}>{f.mime_type === 'application/pdf' ? '📄' : '🖼️'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              {f.file_url
                ? <a href={f.file_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, fontWeight: 500, color: 'var(--primary)', textDecoration: 'none', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.filename}</a>
                : <span style={{ fontSize: 13, fontWeight: 500 }}>{f.filename}</span>
              }
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>{formatDateTime(f.created_at)}</div>
            </div>
            <button
              type="button"
              className="admin-btn admin-btn-sm admin-btn-danger"
              onClick={() => onDelete(f.id)}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Quotes Tab ────────────────────────────────────────────────

interface QuotesTabProps {
  quotes: ProjectQuote[]
  regeneratingQuoteId: number | null
  onShowCreateForm: () => void
  onUpdateStatus: (quoteId: number, status: string) => void
  onRegenerate: (quoteId: number) => void
}

export function QuotesTab({ quotes, regeneratingQuoteId, onShowCreateForm, onUpdateStatus, onRegenerate }: QuotesTabProps) {
  return (
    <div className="admin-table-wrap" style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div className="admin-section-title" style={{ margin: 0 }}>Offerten</div>
        <button
          type="button"
          className="admin-btn admin-btn-sm admin-btn-primary"
          onClick={onShowCreateForm}
        >
          + Neue Offerte
        </button>
      </div>
      {quotes.length === 0 ? (
        <div style={{ color: 'var(--muted)', fontSize: 13 }}>Noch keine Offerten.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {groupByParent(quotes).map(group => {
            const latest = group[0]
            return (
              <div key={latest.parent_id ?? latest.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, background: 'var(--surface-2)' }}>
                {group.map((q, idx) => (
                  <div key={q.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 4px', borderTop: idx > 0 ? '1px dashed var(--border)' : 'none' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, minWidth: 32, color: idx === 0 ? 'var(--primary)' : 'var(--muted)' }}>V{q.version}</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 12, minWidth: 130 }}>{q.quote_number}</span>
                    <span className={`admin-badge ${QUOTE_STATUS_BADGE[q.status] || 'admin-badge-draft'}`}>{QUOTE_STATUS_LABELS[q.status] || q.status}</span>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>{fmtDate(q.created_at)}</span>
                    <span style={{ flex: 1, textAlign: 'right', fontWeight: 600, fontSize: 13 }}>{fmtCHF(q.total_amount)}</span>
                    {q.pdf_url && (
                      <a href={q.pdf_url} target="_blank" rel="noreferrer" className="admin-btn admin-btn-secondary admin-btn-sm">PDF</a>
                    )}
                    {idx === 0 && (
                      <>
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
                ))}
              </div>
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
  onUseAcceptedQuoteChange: (v: boolean) => void
  onGenerateInvoice: () => void
  onMarkPaid: (invoiceId: number) => void
}

export function InvoicesTab({ invoices, useAcceptedQuote, generatingInvoice, onUseAcceptedQuoteChange, onGenerateInvoice, onMarkPaid }: InvoicesTabProps) {
  return (
    <div className="admin-table-wrap" style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div className="admin-section-title" style={{ margin: 0 }}>Rechnungen</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
            <input type="checkbox" checked={useAcceptedQuote} onChange={e => onUseAcceptedQuoteChange(e.target.checked)} />
            Aus akzeptierter Offerte
          </label>
          <button
            type="button"
            className="admin-btn admin-btn-sm admin-btn-primary"
            disabled={generatingInvoice}
            onClick={onGenerateInvoice}
          >
            {generatingInvoice ? 'Wird erstellt…' : '+ Rechnung generieren'}
          </button>
        </div>
      </div>
      {invoices.length === 0 ? (
        <div style={{ color: 'var(--muted)', fontSize: 13 }}>Noch keine Rechnungen.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {groupByParent(invoices).map(group => {
            const latest = group[0]
            return (
              <div key={latest.parent_id ?? latest.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, background: 'var(--surface-2)' }}>
                {group.map((inv, idx) => (
                  <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 4px', borderTop: idx > 0 ? '1px dashed var(--border)' : 'none' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, minWidth: 32, color: idx === 0 ? 'var(--primary)' : 'var(--muted)' }}>V{inv.version}</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 12, minWidth: 150 }}>{inv.invoice_number}</span>
                    <span className={`admin-badge ${INVOICE_STATUS_BADGE[inv.status] || 'admin-badge-draft'}`}>{INVOICE_STATUS_LABELS[inv.status] || inv.status}</span>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>{fmtDate(inv.created_at)}</span>
                    <span style={{ flex: 1, textAlign: 'right', fontWeight: 600, fontSize: 13 }}>{fmtCHF(inv.total_amount)}</span>
                    {inv.pdf_url && (
                      <a href={inv.pdf_url} target="_blank" rel="noreferrer" className="admin-btn admin-btn-secondary admin-btn-sm">PDF</a>
                    )}
                    {idx === 0 && (inv.status === 'ausstehend' || inv.status === 'offen' || inv.status === 'gesendet') && (
                      <button className="admin-btn admin-btn-success admin-btn-sm" onClick={() => onMarkPaid(inv.id)}>Bezahlt</button>
                    )}
                  </div>
                ))}
              </div>
            )
          })}
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
                  {a.file_url && (
                    <a href={a.file_url} target="_blank" rel="noreferrer" className="admin-btn admin-btn-secondary admin-btn-sm" style={{ marginLeft: 'auto' }}>
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
