import { useEffect, useState } from 'react'
import { getAdminCorrections, approveCorrection, rejectCorrection, Correction } from '../../api/admin'

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function TimeChange({ before, after, label }: { before: string | null; after: string | null; label: string }) {
  if (!after) return null
  const changed = before !== after
  return (
    <div style={{ fontSize: 12.5, marginBottom: 4 }}>
      <span style={{ color: 'var(--muted)' }}>{label}: </span>
      {changed && before ? <><span style={{ textDecoration: 'line-through', color: 'var(--muted)', marginRight: 6 }}>{before}</span></> : null}
      <span style={{ color: changed ? '#22c55e' : 'inherit' }}>{after}</span>
    </div>
  )
}

export default function CorrectionsScreen({ onBadgeChange }: { onBadgeChange?: () => void }) {
  const [corrections, setCorrections] = useState<Correction[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      setCorrections(await getAdminCorrections())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function showToast(msg: string, type: 'success' | 'error') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  async function handleApprove(id: string) {
    setActing(id)
    try {
      await approveCorrection(id)
      showToast('Korrektur genehmigt — Session aktualisiert', 'success')
      load()
      onBadgeChange?.()
    } catch {
      showToast('Fehler beim Genehmigen', 'error')
    } finally {
      setActing(null)
    }
  }

  async function handleReject(id: string) {
    setActing(id)
    try {
      await rejectCorrection(id)
      showToast('Korrektur abgelehnt', 'success')
      load()
      onBadgeChange?.()
    } catch {
      showToast('Fehler beim Ablehnen', 'error')
    } finally {
      setActing(null)
    }
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Zeitkorrekturen</div>
          <div className="admin-page-subtitle">{corrections.length} pendente Anträge</div>
        </div>
      </div>

      <div className="admin-table-wrap">
        {loading ? (
          <div className="admin-loading"><div className="admin-spinner" /> Laden…</div>
        ) : corrections.length === 0 ? (
          <div className="admin-table-empty" style={{ padding: 48 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
            Keine offenen Korrekturanträge
          </div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Mitarbeiter</th>
                <th>Datum</th>
                <th>Gewünschte Zeit</th>
                <th>Begründung</th>
                <th>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {corrections.map(c => (
                <>
                  <tr key={c.id} onClick={() => setExpanded(expanded === c.id ? null : c.id)} style={{ cursor: 'pointer' }}>
                    <td><strong>{c.staff_name}</strong></td>
                    <td>{fmtDate(c.session_date)}</td>
                    <td>
                      <div style={{ fontSize: 13 }}>
                        {c.requested_clock_in && <span>Ein: <strong>{c.requested_clock_in}</strong></span>}
                        {c.requested_clock_out && <span style={{ marginLeft: 10 }}>Aus: <strong>{c.requested_clock_out}</strong></span>}
                        {c.requested_break_minutes != null && c.requested_break_minutes > 0 && (
                          <span style={{ marginLeft: 10 }}>Pause: <strong>{c.requested_break_minutes} Min.</strong></span>
                        )}
                      </div>
                    </td>
                    <td style={{ color: 'var(--muted)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.reason || '—'}
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          className="admin-btn admin-btn-success admin-btn-sm"
                          onClick={() => handleApprove(c.id)}
                          disabled={acting === c.id}
                        >
                          {acting === c.id ? '…' : '✓ Genehmigen'}
                        </button>
                        <button
                          className="admin-btn admin-btn-danger admin-btn-sm"
                          onClick={() => handleReject(c.id)}
                          disabled={acting === c.id}
                        >
                          {acting === c.id ? '…' : '✕ Ablehnen'}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expanded === c.id && (
                    <tr key={`${c.id}-detail`}>
                      <td colSpan={5} style={{ background: '#0f1117', padding: '12px 20px' }}>
                        <div style={{ fontSize: 13 }}>
                          <strong>Zeitänderungen</strong>
                          <div style={{ marginTop: 8 }}>
                            <TimeChange before={c.current_clock_in} after={c.requested_clock_in} label="Einstempeln" />
                            <TimeChange before={c.current_clock_out} after={c.requested_clock_out} label="Ausstempeln" />
                            {c.requested_break_minutes != null && c.requested_break_minutes > 0 && (
                              <div style={{ fontSize: 12.5, marginBottom: 4 }}>
                                <span style={{ color: 'var(--muted)' }}>Pause: </span>
                                <span>{c.requested_break_minutes} Min.</span>
                              </div>
                            )}
                          </div>
                          {c.reason && (
                            <div style={{ marginTop: 8, color: 'var(--muted)' }}>
                              <strong style={{ color: 'var(--text)' }}>Begründung:</strong> {c.reason}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
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
