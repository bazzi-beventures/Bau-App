import { useEffect, useState } from 'react'
import { apiFetch } from '../../api/client'

interface Session {
  id: string
  staff_name: string
  date: string
  clock_in: string
  clock_out: string | null
  break_minutes: number
  total_minutes: number | null
}

interface LaborHour {
  staff_name: string
  project_name: string
  hours: number
  date: string
}

interface TimesheetData {
  sessions: Session[]
  labor_hours: LaborHour[]
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('de-CH', { weekday: 'short', day: '2-digit', month: '2-digit' })
}

function fmtHours(minutes: number | null) {
  if (minutes == null) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}:${m.toString().padStart(2, '0')} h`
}

function fmtTime(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Zurich' })
}

// Group sessions by staff name
function groupByStaff(sessions: Session[]) {
  const map = new Map<string, Session[]>()
  for (const s of sessions) {
    const arr = map.get(s.staff_name) ?? []
    arr.push(s)
    map.set(s.staff_name, arr)
  }
  return map
}

export default function HrReportsScreen() {
  const now = new Date()
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const defaultTo = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)

  const [dateFrom, setDateFrom] = useState(defaultFrom)
  const [dateTo, setDateTo] = useState(defaultTo)
  const [data, setData] = useState<TimesheetData | null>(null)
  const [loading, setLoading] = useState(false)
  const [expandedStaff, setExpandedStaff] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const result = await apiFetch(
        `/pwa/admin/hr/timesheet?date_from=${dateFrom}&date_to=${dateTo}`
      ) as TimesheetData
      setData(result)
      if (result.sessions.length > 0) {
        setExpandedStaff(result.sessions[0].staff_name)
      }
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const staffGroups = data ? groupByStaff(data.sessions) : new Map<string, Session[]>()

  function staffTotalHours(sessions: Session[]) {
    return sessions.reduce((sum, s) => sum + (s.total_minutes ?? 0), 0)
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">HR-Berichte</div>
          <div className="admin-page-subtitle">Arbeitszeitübersicht pro Mitarbeiter</div>
        </div>
      </div>

      {/* Filter */}
      <div className="admin-table-wrap" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="admin-form-group">
            <label className="admin-form-label">Von</label>
            <input type="date" className="admin-form-input" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ width: 160 }} />
          </div>
          <div className="admin-form-group">
            <label className="admin-form-label">Bis</label>
            <input type="date" className="admin-form-input" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ width: 160 }} />
          </div>
          <button className="admin-btn admin-btn-primary" onClick={load} disabled={loading}>
            {loading ? 'Laden…' : 'Laden'}
          </button>
        </div>
      </div>

      {loading && <div className="admin-loading"><div className="admin-spinner" /> Zeiterfassungsdaten werden geladen…</div>}

      {data && !loading && (
        <>
          {staffGroups.size === 0 ? (
            <div className="admin-table-wrap">
              <div className="admin-table-empty" style={{ padding: 48 }}>Keine Daten für diesen Zeitraum gefunden.</div>
            </div>
          ) : (
            Array.from(staffGroups.entries()).map(([staffName, sessions]) => {
              const totalMin = staffTotalHours(sessions)
              const isExpanded = expandedStaff === staffName
              return (
                <div key={staffName} className="admin-table-wrap" style={{ marginBottom: 14 }}>
                  {/* Staff-Header */}
                  <div
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '14px 16px', cursor: 'pointer', userSelect: 'none',
                    }}
                    onClick={() => setExpandedStaff(isExpanded ? null : staffName)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div className="admin-avatar" style={{ width: 34, height: 34 }}>
                        {staffName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{staffName}</div>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{sessions.length} Sessions</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 700, fontSize: 16 }}>{fmtHours(totalMin)}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>Total Netto</div>
                      </div>
                      <span style={{ color: 'var(--muted)', fontSize: 18 }}>{isExpanded ? '▲' : '▼'}</span>
                    </div>
                  </div>

                  {isExpanded && (
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Datum</th>
                          <th>Einstempeln</th>
                          <th>Ausstempeln</th>
                          <th>Pause</th>
                          <th>Netto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sessions.sort((a, b) => a.date.localeCompare(b.date)).map(s => (
                          <tr key={s.id}>
                            <td>{fmtDate(s.date)}</td>
                            <td>{fmtTime(s.clock_in)}</td>
                            <td>{fmtTime(s.clock_out)}</td>
                            <td style={{ color: 'var(--muted)' }}>{s.break_minutes > 0 ? `${s.break_minutes} min` : '—'}</td>
                            <td><strong>{fmtHours(s.total_minutes)}</strong></td>
                          </tr>
                        ))}
                        <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                          <td colSpan={4} style={{ fontWeight: 700 }}>Total</td>
                          <td style={{ fontWeight: 700, color: 'var(--accent-blue, #3b82f6)' }}>{fmtHours(totalMin)}</td>
                        </tr>
                      </tbody>
                    </table>
                  )}
                </div>
              )
            })
          )}
        </>
      )}
    </div>
  )
}
