import { useEffect, useState } from 'react'
import { getAdminAbsences, approveAbsence, rejectAbsence, Absence } from '../../api/admin'

const TYPE_LABELS: Record<string, string> = {
  vacation: 'Urlaub',
  sick: 'Krankheit',
  public_holiday: 'Feiertag',
  other: 'Sonstiges',
}

function fmt(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function dayCount(start: string, end: string) {
  const d = (new Date(end).getTime() - new Date(start).getTime()) / 86400000 + 1
  return d > 1 ? `${d} Tage` : '1 Tag'
}

export default function AbsencesScreen({ onBadgeChange }: { onBadgeChange?: () => void }) {
  const [absences, setAbsences] = useState<Absence[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'requested' | 'approved' | 'rejected'>('requested')
  const [acting, setActing] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  async function load() {
    setLoading(true)
    try {
      setAbsences(await getAdminAbsences(filter))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [filter])

  function showToast(msg: string, type: 'success' | 'error') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  async function handleApprove(id: string) {
    setActing(id)
    try {
      await approveAbsence(id)
      showToast('Absenz genehmigt', 'success')
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
      await rejectAbsence(id)
      showToast('Absenz abgelehnt', 'success')
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
          <div className="admin-page-title">Absenzen</div>
          <div className="admin-page-subtitle">{absences.length} Einträge</div>
        </div>
      </div>

      {/* Filter-Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['requested', 'approved', 'rejected'] as const).map(f => (
          <button
            key={f}
            className={`admin-btn ${filter === f ? 'admin-btn-primary' : 'admin-btn-secondary'} admin-btn-sm`}
            onClick={() => setFilter(f)}
          >
            {f === 'requested' ? 'Pendent' : f === 'approved' ? 'Genehmigt' : 'Abgelehnt'}
          </button>
        ))}
      </div>

      <div className="admin-table-wrap">
        {loading ? (
          <div className="admin-loading"><div className="admin-spinner" /> Laden…</div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Mitarbeiter</th>
                <th>Typ</th>
                <th>Von</th>
                <th>Bis</th>
                <th>Dauer</th>
                <th>Status</th>
                {filter === 'requested' && <th>Aktionen</th>}
              </tr>
            </thead>
            <tbody>
              {absences.length === 0 ? (
                <tr><td colSpan={7} className="admin-table-empty">Keine Absenzen gefunden.</td></tr>
              ) : absences.map(a => (
                <tr key={a.id}>
                  <td><strong>{a.staff_name}</strong></td>
                  <td>{TYPE_LABELS[a.absence_type] ?? a.absence_type}</td>
                  <td>{fmt(a.start_date)}</td>
                  <td>{fmt(a.end_date)}</td>
                  <td style={{ color: 'var(--muted)' }}>{dayCount(a.start_date, a.end_date)}</td>
                  <td>
                    <span className={
                      a.status === 'approved' ? 'admin-badge admin-badge-approved' :
                      a.status === 'rejected' ? 'admin-badge admin-badge-rejected' :
                      'admin-badge admin-badge-pending'
                    }>{a.status === 'approved' ? 'Genehmigt' : a.status === 'rejected' ? 'Abgelehnt' : 'Pendent'}</span>
                  </td>
                  {filter === 'requested' && (
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          className="admin-btn admin-btn-success admin-btn-sm"
                          onClick={() => handleApprove(a.id)}
                          disabled={acting === a.id}
                        >
                          {acting === a.id ? '…' : '✓ Genehmigen'}
                        </button>
                        <button
                          className="admin-btn admin-btn-danger admin-btn-sm"
                          onClick={() => handleReject(a.id)}
                          disabled={acting === a.id}
                        >
                          {acting === a.id ? '…' : '✕ Ablehnen'}
                        </button>
                      </div>
                    </td>
                  )}
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
