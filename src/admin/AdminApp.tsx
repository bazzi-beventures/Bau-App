import { useEffect, useState } from 'react'
import { UserInfo } from '../api/auth'
import { getAdminDashboard, AdminDashboard } from '../api/admin'
import AdminSidebar from './AdminSidebar'
import { useAdminNav, AdminScreen } from './useAdminNav'
import DashboardScreen from './dashboard/DashboardScreen'
import StaffScreen from './personal/StaffScreen'
import AbsencesScreen from './personal/AbsencesScreen'
import CorrectionsScreen from './personal/CorrectionsScreen'
import HrReportsScreen from './personal/HrReportsScreen'
import './admin.css'

// Lazy placeholder for screens not yet built
function ComingSoon({ title }: { title: string }) {
  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">{title}</div>
          <div className="admin-page-subtitle">Wird in einer der nächsten Phasen implementiert.</div>
        </div>
      </div>
      <div className="admin-loading" style={{ height: 300, flexDirection: 'column', gap: 16 }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.3 }}>
          <path d="M12 6v6l4 2"/><circle cx="12" cy="12" r="10"/>
        </svg>
        <span>Kommt bald</span>
      </div>
    </div>
  )
}

interface Props {
  user: UserInfo
  logoUrl: string
  tenantName: string
  onLoggedOut: () => void
}

const SCREEN_TITLES: Record<AdminScreen, string> = {
  'dashboard': 'Dashboard',
  'staff': 'Mitarbeiter',
  'absences': 'Absenzen',
  'corrections': 'Zeitkorrekturen',
  'hr-reports': 'HR-Berichte',
  'projects': 'Projekte',
  'materials': 'Material / Lager',
  'quotes': 'Offerten',
  'invoices': 'Rechnungen',
  'pricing-rules': 'Lieferantenpreise',
  'users': 'Benutzerverwaltung',
  'import': 'Import / Upload',
}

export default function AdminApp({ user, logoUrl, tenantName, onLoggedOut }: Props) {
  const { screen, detailId, nav } = useAdminNav()
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null)

  async function loadDashboard() {
    try {
      setDashboard(await getAdminDashboard())
    } catch { /* ignore */ }
  }

  useEffect(() => { loadDashboard() }, [])

  // Reload dashboard when returning to it
  useEffect(() => {
    if (screen === 'dashboard') loadDashboard()
  }, [screen])

  const badges = {
    corrections: dashboard?.pending_corrections ?? 0,
    absences: dashboard?.pending_absences ?? 0,
    invoices: dashboard?.open_invoices ?? 0,
  }

  function renderScreen() {
    switch (screen) {
      case 'dashboard':
        return <DashboardScreen dashboard={dashboard} onNav={nav} />
      case 'staff':
        return <StaffScreen />
      case 'absences':
        return <AbsencesScreen />
      case 'corrections':
        return <CorrectionsScreen />
      case 'hr-reports':
        return <HrReportsScreen />
      default:
        return <ComingSoon title={SCREEN_TITLES[screen]} />
    }
  }

  return (
    <div className="admin-shell">
      <AdminSidebar
        screen={screen}
        onNav={nav}
        onLoggedOut={onLoggedOut}
        displayName={user.display_name}
        role={user.role}
        logoUrl={logoUrl}
        tenantName={tenantName}
        badges={badges}
      />
      <main className="admin-content">
        {renderScreen()}
      </main>
    </div>
  )
}
