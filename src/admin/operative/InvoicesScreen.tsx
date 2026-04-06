import { useEffect, useState } from 'react'
import { apiFetch } from '../../api/client'

interface Invoice {
  id: number
  invoice_number: string
  project_name: string
  total_amount: number
  status: string
  created_at: string
  paid_at: string | null
  pdf_url: string | null
}

const STATUS_LABELS: Record<string, string> = {
  ausstehend: 'Ausstehend',
  offen: 'Offen',
  gesendet: 'Gesendet',
  bezahlt: 'Bezahlt',
  archiviert: 'Archiviert',
  inaktiv: 'Inaktiv',
}

const STATUS_BADGE: Record<string, string> = {
  ausstehend: 'admin-badge-open',
  offen: 'admin-badge-open',
  gesendet: 'admin-badge-sent',
  bezahlt: 'admin-badge-paid',
  archiviert: 'admin-badge-closed',
  inaktiv: 'admin-badge-draft',
}

function fmtCHF(amount: number) {
  return `CHF ${amount.toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function InvoicesScreen() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [acting, setActing] = useState<number | null>(null)
  const [confirmPaid, setConfirmPaid] = useState<Invoice | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  async function load() {
    setLoading(true)
    try {
      const url = statusFilter ? `/pwa/admin/invoices?status=${statusFilter}` : '/pwa/admin/invoices'
      setInvoices(await apiFetch(url) as Invoice[])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [statusFilter])

  function showToast(msg: string, type: 'success' | 'error') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  async function handleMarkPaid(id: number) {
    setActing(id)
    try {
      await apiFetch(`/pwa/admin/invoices/${id}/mark-paid`, { method: 'POST' })
      showToast('Rechnung als bezahlt markiert', 'success')
      setConfirmPaid(null)
      load()
    } catch {
      showToast('Fehler', 'error')
    } finally {
      setActing(null)
    }
  }

  async function handleArchive(id: number) {
    setActing(id)
    try {
      await apiFetch(`/pwa/admin/invoices/${id}/archive`, { method: 'POST' })
      showToast('Rechnung archiviert', 'success')
      load()
    } catch {
      showToast('Fehler beim Archivieren', 'error')
    } finally {
      setActing(null)
    }
  }

  const filtered = invoices.filter(inv =>
    inv.project_name.toLowerCase().includes(search.toLowerCase()) ||
    inv.invoice_number.toLowerCase().includes(search.toLowerCase())
  )

  const totalOpen = invoices
    .filter(i => i.status === 'ausstehend' || i.status === 'offen' || i.status === 'gesendet')
    .reduce((s, i) => s + i.total_amount, 0)

  const statuses = ['', 'ausstehend', 'offen', 'gesendet', 'bezahlt', 'archiviert']

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Rechnungen</div>
          <div className="admin-page-subtitle">{filtered.length} Einträge · Offen: {fmtCHF(totalOpen)}</div>
        </div>
      </div>

      <div className="admin-table-wrap">
        <div className="admin-filter-bar">
          <input
            className="admin-search"
            placeholder="Projekt oder Rechnungs-Nr. suchen…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select
            className="admin-form-select"
            style={{ width: 'auto', flexShrink: 0 }}
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            {statuses.map(s => (
              <option key={s} value={s}>{s ? STATUS_LABELS[s] : 'Alle Status'}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="admin-loading"><div className="admin-spinner" /> Laden…</div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Nr.</th>
                <th>Projekt</th>
                <th>Betrag</th>
                <th>Status</th>
                <th>Erstellt</th>
                <th>Bezahlt am</th>
                <th>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="admin-table-empty">Keine Rechnungen gefunden.</td></tr>
              ) : filtered.map(inv => (
                <tr key={inv.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{inv.invoice_number}</td>
                  <td><strong>{inv.project_name}</strong></td>
                  <td style={{ fontWeight: 700 }}>{fmtCHF(inv.total_amount)}</td>
                  <td>
                    <span className={`admin-badge ${STATUS_BADGE[inv.status] || 'admin-badge-draft'}`}>
                      {STATUS_LABELS[inv.status] || inv.status}
                    </span>
                  </td>
                  <td style={{ color: 'var(--muted)' }}>{fmtDate(inv.created_at)}</td>
                  <td style={{ color: 'var(--muted)' }}>{fmtDate(inv.paid_at)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {inv.pdf_url && (
                        <a
                          href={inv.pdf_url}
                          target="_blank"
                          rel="noreferrer"
                          className="admin-btn admin-btn-secondary admin-btn-sm"
                        >
                          PDF
                        </a>
                      )}
                      {(inv.status === 'ausstehend' || inv.status === 'offen' || inv.status === 'gesendet') && (
                        <button
                          className="admin-btn admin-btn-success admin-btn-sm"
                          onClick={() => setConfirmPaid(inv)}
                          disabled={acting === inv.id}
                        >
                          Als bezahlt markieren
                        </button>
                      )}
                      {inv.status === 'bezahlt' && (
                        <button
                          className="admin-btn admin-btn-secondary admin-btn-sm"
                          onClick={() => handleArchive(inv.id)}
                          disabled={acting === inv.id}
                        >
                          {acting === inv.id ? '…' : 'Archivieren'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Bestätigungsdialog bezahlt markieren */}
      {confirmPaid && (
        <div className="admin-confirm-overlay">
          <div className="admin-confirm-box">
            <div className="admin-confirm-title">Rechnung als bezahlt markieren?</div>
            <div className="admin-confirm-text">
              {confirmPaid.invoice_number} · {fmtCHF(confirmPaid.total_amount)}<br />
              Projekt: {confirmPaid.project_name}
            </div>
            <div className="admin-confirm-actions">
              <button className="admin-btn admin-btn-secondary" onClick={() => setConfirmPaid(null)}>Abbrechen</button>
              <button
                className="admin-btn admin-btn-success"
                onClick={() => handleMarkPaid(confirmPaid.id)}
                disabled={acting === confirmPaid.id}
              >
                {acting === confirmPaid.id ? '…' : 'Ja, bezahlt'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="admin-toast-container">
          <div className={`admin-toast ${toast.type}`}>{toast.msg}</div>
        </div>
      )}
    </div>
  )
}
