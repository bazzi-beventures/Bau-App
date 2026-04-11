import { useEffect, useState } from 'react'
import { getAdminAbsences, approveAbsence, rejectAbsence, getAbsenceAnalytics, Absence, AbsenceAnalytics } from '../../api/admin'
import KpiCards from '../kpis/components/KpiCards'
import BiBarChart from '../kpis/components/BiBarChart'
import HorizontalBarChart from '../kpis/components/HorizontalBarChart'

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

type TabType = 'requested' | 'approved' | 'rejected' | 'analytics'

export default function AbsencesScreen({ onBadgeChange }: { onBadgeChange?: () => void }) {
  const [absences, setAbsences] = useState<Absence[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<TabType>('requested')
  const [acting, setActing] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [analytics, setAnalytics] = useState<AbsenceAnalytics | null>(null)
  const [analyticsYear, setAnalyticsYear] = useState(new Date().getFullYear())
  const [analyticsLoading, setAnalyticsLoading] = useState(false)

  async function load() {
    if (tab === 'analytics') return
    setLoading(true)
    try {
      setAbsences(await getAdminAbsences(tab))
    } finally {
      setLoading(false)
    }
  }

  async function loadAnalytics(year: number) {
    setAnalyticsLoading(true)
    try {
      setAnalytics(await getAbsenceAnalytics(year))
    } finally {
      setAnalyticsLoading(false)
    }
  }

  useEffect(() => {
    if (tab === 'analytics') {
      loadAnalytics(analyticsYear)
    } else {
      load()
    }
  }, [tab, analyticsYear])

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

  const TAB_LABELS: Record<TabType, string> = {
    requested: 'Pendent',
    approved: 'Genehmigt',
    rejected: 'Abgelehnt',
    analytics: 'Analytik',
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Absenzen</div>
          <div className="admin-page-subtitle">
            {tab === 'analytics' ? `Jahr ${analyticsYear}` : `${absences.length} Einträge`}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['requested', 'approved', 'rejected', 'analytics'] as const).map(t => (
          <button
            key={t}
            className={`admin-btn ${tab === t ? 'admin-btn-primary' : 'admin-btn-secondary'} admin-btn-sm`}
            onClick={() => setTab(t)}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {tab === 'analytics' ? (
        <div>
          {/* Jahr-Auswahl */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <span style={{ color: 'var(--muted)', fontSize: 13 }}>Jahr:</span>
            {[new Date().getFullYear() - 1, new Date().getFullYear()].map(y => (
              <button
                key={y}
                className={`admin-btn ${analyticsYear === y ? 'admin-btn-primary' : 'admin-btn-secondary'} admin-btn-sm`}
                onClick={() => setAnalyticsYear(y)}
              >
                {y}
              </button>
            ))}
          </div>

          {analyticsLoading ? (
            <div className="admin-loading"><div className="admin-spinner" /> Laden…</div>
          ) : analytics ? (
            <>
              {/* KPI Totals */}
              <KpiCards
                columns={4}
                cards={[
                  { label: 'Urlaubstage', value: String(analytics.totals.vacation), color: '#3b82f6' },
                  { label: 'Kranktage', value: String(analytics.totals.sick), color: '#ef4444' },
                  { label: 'Feiertage', value: String(analytics.totals.public_holiday), color: '#8b5cf6' },
                  { label: 'Sonstiges', value: String(analytics.totals.other), color: '#6b7280' },
                ]}
              />

              {/* Absenzen pro Monat */}
              <div style={{ marginTop: 24, marginBottom: 8, fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>
                Absenzen pro Monat
              </div>
              <BiBarChart
                data={analytics.by_month}
                xKey="month"
                bars={[
                  { dataKey: 'vacation', color: '#3b82f6', label: 'Urlaub' },
                  { dataKey: 'sick', color: '#ef4444', label: 'Krankheit' },
                  { dataKey: 'public_holiday', color: '#8b5cf6', label: 'Feiertag' },
                  { dataKey: 'other', color: '#6b7280', label: 'Sonstiges' },
                ]}
              />

              {/* Pro Mitarbeiter */}
              {analytics.by_staff.length > 0 && (
                <>
                  <div style={{ marginTop: 24, marginBottom: 8, fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>
                    Tage pro Mitarbeiter
                  </div>
                  <HorizontalBarChart
                    data={analytics.by_staff}
                    yKey="name"
                    dataKey="total"
                    color="#3b82f6"
                  />
                </>
              )}
            </>
          ) : (
            <div style={{ color: 'var(--muted)', padding: 24 }}>Keine Daten verfügbar.</div>
          )}
        </div>
      ) : (
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
                  {tab === 'requested' && <th>Aktionen</th>}
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
                    {tab === 'requested' && (
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
      )}

      {toast && (
        <div className="admin-toast-container">
          <div className={`admin-toast ${toast.type}`}>{toast.msg}</div>
        </div>
      )}
    </div>
  )
}
