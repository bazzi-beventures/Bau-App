import { AdminDashboard } from '../../api/admin'
import { AdminScreen } from '../useAdminNav'

interface Props {
  dashboard: AdminDashboard | null
  onNav: (screen: AdminScreen) => void
}

interface KpiCardProps {
  label: string
  value: number | null
  colorClass: 'blue' | 'orange' | 'green' | 'red' | 'purple'
  onClick: () => void
  icon: React.ReactNode
}

function KpiCard({ label, value, colorClass, onClick, icon }: KpiCardProps) {
  return (
    <div className="admin-kpi-card" onClick={onClick}>
      <div className={`admin-kpi-icon ${colorClass}`}>{icon}</div>
      <div className="admin-kpi-value">{value ?? '—'}</div>
      <div className="admin-kpi-label">{label}</div>
    </div>
  )
}

function IconClock() {
  return <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm1-12a1 1 0 1 0-2 0v4a1 1 0 0 0 .293.707l2.828 2.829a1 1 0 1 0 1.415-1.415L11 9.586V6z" clipRule="evenodd"/></svg>
}
function IconCalendar() {
  return <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M6 2a1 1 0 0 0-1 1v1H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-1V3a1 1 0 1 0-2 0v1H7V3a1 1 0 0 0-1-1zm0 5a1 1 0 0 0 0 2h8a1 1 0 1 0 0-2H6z" clipRule="evenodd"/></svg>
}
function IconCash() {
  return <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2V6h10a2 2 0 0 0-2-2H4zm2 6a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2H6zm7 4a1 1 0 1 0-2 0 1 1 0 0 0 2 0z" clipRule="evenodd"/></svg>
}
function IconUsers() {
  return <svg viewBox="0 0 20 20" fill="currentColor"><path d="M9 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm8 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM9 12a5 5 0 0 0-5 5h10a5 5 0 0 0-5-5z"/></svg>
}
function IconReceipt() {
  return <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 2a1 1 0 0 0-1 1v14l3-2 2 2 2-2 2 2 2-2 3 2V3a1 1 0 0 0-1-1H4zm2 5a1 1 0 0 1 1-1h6a1 1 0 1 1 0 2H7a1 1 0 0 1-1-1zm1 3a1 1 0 1 0 0 2h4a1 1 0 1 0 0-2H7z" clipRule="evenodd"/></svg>
}

export default function DashboardScreen({ dashboard, onNav }: Props) {
  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Dashboard</div>
          <div className="admin-page-subtitle">Übersicht offener Aufgaben</div>
        </div>
      </div>

      <div className="admin-kpi-grid">
        <KpiCard
          label="Zeitkorrekturen offen"
          value={dashboard?.pending_corrections ?? null}
          colorClass="orange"
          onClick={() => onNav('corrections')}
          icon={<IconClock />}
        />
        <KpiCard
          label="Absenzen pendent"
          value={dashboard?.pending_absences ?? null}
          colorClass="blue"
          onClick={() => onNav('absences')}
          icon={<IconCalendar />}
        />
        <KpiCard
          label="Rechnungen offen"
          value={dashboard?.open_invoices ?? null}
          colorClass="red"
          onClick={() => onNav('invoices')}
          icon={<IconCash />}
        />
        <KpiCard
          label="Aktive Sessions"
          value={dashboard?.open_sessions ?? null}
          colorClass="green"
          onClick={() => onNav('hr-reports')}
          icon={<IconUsers />}
        />
        <KpiCard
          label="Offerten in Bearbeitung"
          value={dashboard?.draft_quotes ?? null}
          colorClass="purple"
          onClick={() => onNav('quotes')}
          icon={<IconReceipt />}
        />
      </div>

      {dashboard === null && (
        <div className="admin-loading">
          <div className="admin-spinner" />
          Lade Dashboard…
        </div>
      )}
    </div>
  )
}
