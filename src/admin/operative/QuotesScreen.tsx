import { useEffect, useState } from 'react'
import { apiFetch } from '../../api/client'

interface Quote {
  id: number
  quote_number: string
  project_name: string
  total_amount: number
  status: string
  created_at: string
  pdf_url: string | null
}

const STATUS_LABELS: Record<string, string> = {
  entwurf: 'Entwurf',
  gesendet: 'Gesendet',
  akzeptiert: 'Akzeptiert',
  abgelehnt: 'Abgelehnt',
  archiviert: 'Archiviert',
}

const STATUS_BADGE: Record<string, string> = {
  entwurf: 'admin-badge-draft',
  gesendet: 'admin-badge-sent',
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

export default function QuotesScreen() {
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [acting, setActing] = useState<number | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  async function load() {
    setLoading(true)
    try {
      setQuotes(await apiFetch('/pwa/admin/quotes') as Quote[])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function showToast(msg: string, type: 'success' | 'error') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  async function handleStatus(id: number, status: string) {
    setActing(id)
    try {
      await apiFetch(`/pwa/admin/quotes/${id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      })
      showToast(`Status auf «${STATUS_LABELS[status]}» gesetzt`, 'success')
      load()
    } catch {
      showToast('Fehler beim Aktualisieren', 'error')
    } finally {
      setActing(null)
    }
  }

  const statuses = ['', 'entwurf', 'gesendet', 'akzeptiert', 'abgelehnt', 'archiviert']

  const filtered = quotes.filter(q => {
    const matchStatus = !statusFilter || q.status === statusFilter
    const matchSearch = q.project_name.toLowerCase().includes(search.toLowerCase()) ||
      q.quote_number.toLowerCase().includes(search.toLowerCase())
    return matchStatus && matchSearch
  })

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Offerten</div>
          <div className="admin-page-subtitle">{filtered.length} Einträge</div>
        </div>
      </div>

      <div className="admin-table-wrap">
        <div className="admin-filter-bar">
          <input
            className="admin-search"
            placeholder="Projekt oder Offerten-Nr. suchen…"
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
                <th>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="admin-table-empty">Keine Offerten gefunden.</td></tr>
              ) : filtered.map(q => (
                <tr key={q.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{q.quote_number}</td>
                  <td><strong>{q.project_name}</strong></td>
                  <td style={{ fontWeight: 700 }}>{fmtCHF(q.total_amount)}</td>
                  <td>
                    <span className={`admin-badge ${STATUS_BADGE[q.status] || 'admin-badge-draft'}`}>
                      {STATUS_LABELS[q.status] || q.status}
                    </span>
                  </td>
                  <td style={{ color: 'var(--muted)' }}>{fmtDate(q.created_at)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {q.pdf_url && (
                        <a
                          href={q.pdf_url}
                          target="_blank"
                          rel="noreferrer"
                          className="admin-btn admin-btn-secondary admin-btn-sm"
                          onClick={e => e.stopPropagation()}
                        >
                          PDF
                        </a>
                      )}
                      {q.status === 'gesendet' && (
                        <>
                          <button
                            className="admin-btn admin-btn-success admin-btn-sm"
                            onClick={() => handleStatus(q.id, 'akzeptiert')}
                            disabled={acting === q.id}
                          >
                            {acting === q.id ? '…' : 'Akzeptieren'}
                          </button>
                          <button
                            className="admin-btn admin-btn-danger admin-btn-sm"
                            onClick={() => handleStatus(q.id, 'abgelehnt')}
                            disabled={acting === q.id}
                          >
                            {acting === q.id ? '…' : 'Ablehnen'}
                          </button>
                        </>
                      )}
                      {['entwurf', 'gesendet', 'akzeptiert', 'abgelehnt'].includes(q.status) && (
                        <button
                          className="admin-btn admin-btn-secondary admin-btn-sm"
                          onClick={() => handleStatus(q.id, 'archiviert')}
                          disabled={acting === q.id}
                          title="Archivieren"
                        >
                          Archiv
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

      {toast && (
        <div className="admin-toast-container">
          <div className={`admin-toast ${toast.type}`}>{toast.msg}</div>
        </div>
      )}
    </div>
  )
}
