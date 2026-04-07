import { useEffect, useState } from 'react'
import { apiFetch } from '../../api/client'

interface ProjectOverviewItem {
  name: string
  customer_name: string
  customer_email: string
  invoice: {
    invoice_number: string
    total_amount: number
    status: string
    created_at: string
    pdf_url: string | null
  } | null
  quote: {
    quote_number: string
    total_amount: number
    status: string
    created_at: string
    pdf_url: string | null
  } | null
}

const STATUS_BADGE: Record<string, string> = {
  ausstehend: 'admin-badge-open',
  offen: 'admin-badge-open',
  gesendet: 'admin-badge-sent',
  bezahlt: 'admin-badge-paid',
  entwurf: 'admin-badge-draft',
  akzeptiert: 'admin-badge-approved',
  abgelehnt: 'admin-badge-rejected',
  archiviert: 'admin-badge-closed',
}

function fmtCHF(amount: number) {
  return `CHF ${amount.toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function ProjectOverviewScreen() {
  const [items, setItems] = useState<ProjectOverviewItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  async function load() {
    setLoading(true)
    try {
      setItems(await apiFetch('/pwa/admin/project-overview') as ProjectOverviewItem[])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const filtered = items.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.customer_name || '').toLowerCase().includes(search.toLowerCase())
  )

  const withInvoice = filtered.filter(p => p.invoice).length
  const withQuote = filtered.filter(p => p.quote).length

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Projektfortschritte</div>
          <div className="admin-page-subtitle">
            {filtered.length} offene Projekte · {withQuote} mit Offerte · {withInvoice} mit Rechnung
          </div>
        </div>
      </div>

      <div className="admin-table-wrap">
        <div className="admin-filter-bar">
          <input
            className="admin-search"
            placeholder="Projekt oder Kunde suchen…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="admin-loading"><div className="admin-spinner" /> Laden…</div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Projekt</th>
                <th>Kunde</th>
                <th>Offerte</th>
                <th>Rechnung</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={4} className="admin-table-empty">Keine offenen Projekte.</td></tr>
              ) : filtered.map(p => (
                <tr key={p.name}>
                  <td><strong>{p.name}</strong></td>
                  <td>
                    <div>{p.customer_name || '—'}</div>
                    {p.customer_email && (
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{p.customer_email}</div>
                    )}
                  </td>
                  <td>
                    {p.quote ? (
                      <div>
                        <span className={`admin-badge ${STATUS_BADGE[p.quote.status] || 'admin-badge-draft'}`}>
                          {p.quote.status}
                        </span>
                        <div style={{ fontSize: 12, marginTop: 4 }}>
                          {p.quote.quote_number} · {fmtCHF(p.quote.total_amount)}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{fmtDate(p.quote.created_at)}</div>
                        {p.quote.pdf_url && (
                          <a href={p.quote.pdf_url} target="_blank" rel="noreferrer"
                            className="admin-btn admin-btn-secondary admin-btn-sm" style={{ marginTop: 4 }}>
                            PDF
                          </a>
                        )}
                      </div>
                    ) : (
                      <span style={{ color: 'var(--muted)', fontSize: 12 }}>Keine Offerte</span>
                    )}
                  </td>
                  <td>
                    {p.invoice ? (
                      <div>
                        <span className={`admin-badge ${STATUS_BADGE[p.invoice.status] || 'admin-badge-draft'}`}>
                          {p.invoice.status}
                        </span>
                        <div style={{ fontSize: 12, marginTop: 4 }}>
                          {p.invoice.invoice_number} · {fmtCHF(p.invoice.total_amount)}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{fmtDate(p.invoice.created_at)}</div>
                        {p.invoice.pdf_url && (
                          <a href={p.invoice.pdf_url} target="_blank" rel="noreferrer"
                            className="admin-btn admin-btn-secondary admin-btn-sm" style={{ marginTop: 4 }}>
                            PDF
                          </a>
                        )}
                      </div>
                    ) : (
                      <span style={{ color: 'var(--muted)', fontSize: 12 }}>Keine Rechnung</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
