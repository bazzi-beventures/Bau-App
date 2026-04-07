import { useEffect, useState } from 'react'
import { apiFetch } from '../../api/client'

const BASE_URL = import.meta.env.VITE_API_URL ?? ''

interface Session {
  id: string
  staff_name: string
  date: string
  clock_in: string
  clock_out: string | null
  break_minutes: number
  total_minutes: number | null
  violations?: string[]
}

interface LaborHour {
  staff_name: string
  project_name: string
  hours: number
  date: string
}

interface OvertimeInfo {
  total_net_hours: number
  soll_hours: number
  saldo: number
  absence_days: number
}

interface TimesheetData {
  sessions: Session[]
  labor_hours: LaborHour[]
  overtime_by_staff: Record<string, OvertimeInfo>
  soll_stunden_woche: number
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

function fmtDecimal(hours: number) {
  const sign = hours >= 0 ? '+' : ''
  return `${sign}${hours.toFixed(1)} h`
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
  const [exporting, setExporting] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

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

  async function handleExport() {
    setExporting(true)
    try {
      const res = await fetch(`${BASE_URL}/pwa/admin/hr/export-timesheets`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date_from: dateFrom, date_to: dateTo }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(err.detail || 'Export fehlgeschlagen')
      }
      const blob = await res.blob()
      const disposition = res.headers.get('Content-Disposition') ?? ''
      const match = disposition.match(/filename="?([^"]+)"?/)
      const filename = match ? match[1] : `Stunden-Export_${dateFrom}_${dateTo}.xlsx`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      setToast({ msg: 'Export heruntergeladen', type: 'success' })
      setTimeout(() => setToast(null), 3000)
    } catch (err) {
      setToast({ msg: err instanceof Error ? err.message : 'Export fehlgeschlagen', type: 'error' })
      setTimeout(() => setToast(null), 3000)
    } finally {
      setExporting(false)
    }
  }

  const staffGroups = data ? groupByStaff(data.sessions) : new Map<string, Session[]>()

  function staffTotalHours(sessions: Session[]) {
    return sessions.reduce((sum, s) => sum + (s.total_minutes ?? 0), 0)
  }

  function staffViolationCount(sessions: Session[]) {
    return sessions.reduce((sum, s) => sum + (s.violations?.length ?? 0), 0)
  }

  // Alle Verstösse sammeln für Summary
  const allViolations: { staff: string; date: string; text: string }[] = []
  if (data) {
    for (const s of data.sessions) {
      for (const v of (s.violations ?? [])) {
        allViolations.push({ staff: s.staff_name, date: s.date, text: v })
      }
    }
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
          <button className="admin-btn admin-btn-secondary" onClick={handleExport} disabled={exporting || loading}>
            {exporting ? 'Exportieren…' : 'XLSX Export'}
          </button>
        </div>
      </div>

      {loading && <div className="admin-loading"><div className="admin-spinner" /> Zeiterfassungsdaten werden geladen…</div>}

      {data && !loading && (
        <>
          {/* Verstösse-Zusammenfassung */}
          {allViolations.length > 0 && (
            <div className="admin-table-wrap" style={{ marginBottom: 16, border: '1px solid rgba(239,68,68,0.3)' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(239,68,68,0.2)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16 }}>!</span>
                <span style={{ fontWeight: 700, fontSize: 14, color: '#ef4444' }}>
                  {allViolations.length} Verstoss{allViolations.length !== 1 ? 'e' : ''} im Zeitraum
                </span>
              </div>
              <div style={{ padding: '8px 16px', maxHeight: 200, overflowY: 'auto' }}>
                {allViolations.map((v, i) => (
                  <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: 13, display: 'flex', gap: 12 }}>
                    <span style={{ color: 'var(--muted)', minWidth: 90 }}>{fmtDate(v.date)}</span>
                    <span style={{ fontWeight: 600, minWidth: 130 }}>{v.staff}</span>
                    <span style={{ color: '#fca5a5' }}>{v.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {staffGroups.size === 0 ? (
            <div className="admin-table-wrap">
              <div className="admin-table-empty" style={{ padding: 48 }}>Keine Daten für diesen Zeitraum gefunden.</div>
            </div>
          ) : (
            Array.from(staffGroups.entries()).map(([staffName, sessions]) => {
              const totalMin = staffTotalHours(sessions)
              const violationCount = staffViolationCount(sessions)
              const isExpanded = expandedStaff === staffName
              const overtime = data.overtime_by_staff?.[staffName]

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
                        <div style={{ fontWeight: 700, fontSize: 14 }}>
                          {staffName}
                          {violationCount > 0 && (
                            <span style={{
                              marginLeft: 8, fontSize: 11, fontWeight: 600,
                              background: 'rgba(239,68,68,0.15)', color: '#ef4444',
                              padding: '2px 7px', borderRadius: 10,
                            }}>
                              {violationCount} Verstoss{violationCount !== 1 ? 'e' : ''}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{sessions.length} Sessions</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                      {overtime && (
                        <div style={{ textAlign: 'right' }}>
                          <div style={{
                            fontWeight: 700, fontSize: 14,
                            color: overtime.saldo >= 0 ? '#22c55e' : '#ef4444',
                          }}>
                            {fmtDecimal(overtime.saldo)}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                            Saldo (Soll: {overtime.soll_hours.toFixed(1)}h)
                          </div>
                        </div>
                      )}
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
                          <th>Verstösse</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sessions.sort((a, b) => a.date.localeCompare(b.date)).map(s => {
                          const hasViolations = (s.violations?.length ?? 0) > 0
                          return (
                            <tr key={s.id} style={hasViolations ? { background: 'rgba(239,68,68,0.06)' } : undefined}>
                              <td>{fmtDate(s.date)}</td>
                              <td>{fmtTime(s.clock_in)}</td>
                              <td style={!s.clock_out ? { color: '#ef4444', fontWeight: 600 } : undefined}>
                                {fmtTime(s.clock_out)}
                              </td>
                              <td style={{ color: 'var(--muted)' }}>
                                {s.break_minutes > 0 ? `${s.break_minutes} min` : '—'}
                              </td>
                              <td><strong>{fmtHours(s.total_minutes)}</strong></td>
                              <td>
                                {hasViolations ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                    {s.violations!.map((v, i) => (
                                      <span key={i} style={{
                                        fontSize: 11, color: '#fca5a5',
                                        background: 'rgba(239,68,68,0.1)',
                                        padding: '2px 6px', borderRadius: 4,
                                        display: 'inline-block',
                                      }}>
                                        {v}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                        <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                          <td colSpan={4} style={{ fontWeight: 700 }}>Total</td>
                          <td style={{ fontWeight: 700, color: 'var(--accent-blue, #3b82f6)' }}>{fmtHours(totalMin)}</td>
                          <td />
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

      {toast && (
        <div className="admin-toast-container">
          <div className={`admin-toast ${toast.type}`}>{toast.msg}</div>
        </div>
      )}
    </div>
  )
}
