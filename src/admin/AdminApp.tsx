import { useEffect, useState } from 'react'
import { UserInfo } from '../api/auth'
import { getAdminDashboard, AdminDashboard } from '../api/admin'
import AdminSidebar from './AdminSidebar'
import MobileNav from './MobileNav'
import { useAdminNav, AdminScreen } from './useAdminNav'
import { useIsMobile } from './useIsMobile'
import DashboardScreen from './dashboard/DashboardScreen'
import StaffScreen from './personal/StaffScreen'
import AbsencesScreen from './personal/AbsencesScreen'
import CorrectionsScreen from './personal/CorrectionsScreen'
import HrReportsScreen from './personal/HrReportsScreen'
import ProjectsScreen from './operative/ProjectsScreen'
import CustomersScreen from './operative/CustomersScreen'
import MaterialsScreen from './operative/MaterialsScreen'
import QuotesScreen from './operative/QuotesScreen'
import InvoicesScreen from './operative/InvoicesScreen'
import PricingRulesScreen from './operative/PricingRulesScreen'
import ProjectOverviewScreen from './operative/ProjectOverviewScreen'
import UsersScreen from './system/UsersScreen'
import ImportScreen from './system/ImportScreen'
import KpiScreen from './kpis/KpiScreen'
import './admin.css'
import './mobile.css'

function ComingSoon({ title }: { title: string }) {
  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">{title}</div>
          <div className="admin-page-subtitle">Wird in Phase 5 implementiert.</div>
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
  onSwitchToUser: () => void
}

const SCREEN_TITLES: Record<AdminScreen, string> = {
  'dashboard': 'Dashboard',
  'staff': 'Mitarbeiter',
  'absences': 'Absenzen',
  'corrections': 'Zeitkorrekturen',
  'hr-reports': 'HR-Berichte',
  'projects': 'Projekte',
  'customers': 'Kundenstamm',
  'materials': 'Material / Lager',
  'quotes': 'Offerten',
  'invoices': 'Rechnungen',
  'pricing-rules': 'Lieferantenpreise',
  'project-overview': 'Projektfortschritte',
  'users': 'Benutzerverwaltung',
  'import': 'Import / Upload',
  'kpis': 'Kennzahlen',
}

export default function AdminApp({ user, logoUrl, tenantName, onLoggedOut, onSwitchToUser }: Props) {
  const { screen, nav } = useAdminNav()
  const isMobile = useIsMobile()
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null)
  const [logoError, setLogoError] = useState(false)

  async function loadDashboard() {
    try { setDashboard(await getAdminDashboard()) } catch { /* ignore */ }
  }

  useEffect(() => { loadDashboard() }, [])
  useEffect(() => { if (screen === 'dashboard') loadDashboard() }, [screen])

  const badges = {
    corrections: dashboard?.pending_corrections ?? 0,
    absences: dashboard?.pending_absences ?? 0,
    invoices: dashboard?.open_invoices ?? 0,
  }

  function renderScreen() {
    switch (screen) {
      case 'dashboard':    return <DashboardScreen dashboard={dashboard} onNav={nav} />
      case 'staff':        return <StaffScreen />
      case 'absences':     return <AbsencesScreen onBadgeChange={loadDashboard} />
      case 'corrections':  return <CorrectionsScreen onBadgeChange={loadDashboard} />
      case 'hr-reports':   return <HrReportsScreen />
      case 'projects':     return <ProjectsScreen />
      case 'customers':    return <CustomersScreen />
      case 'materials':    return <MaterialsScreen />
      case 'quotes':       return <QuotesScreen />
      case 'invoices':     return <InvoicesScreen onBadgeChange={loadDashboard} />
      case 'pricing-rules':return <PricingRulesScreen />
      case 'project-overview': return <ProjectOverviewScreen />
      case 'users':        return <UsersScreen />
      case 'import':       return <ImportScreen />
      case 'kpis':         return <KpiScreen />
      default:             return <ComingSoon title={SCREEN_TITLES[screen]} />
    }
  }

  if (isMobile) {
    return (
      <div className="admin-shell-mobile">
        <main className="admin-content admin-content-mobile">
          <div className="admin-content-inner">
            {renderScreen()}
          </div>
        </main>
        <MobileNav
          screen={screen}
          onNav={nav}
          onLoggedOut={onLoggedOut}
          onSwitchToUser={onSwitchToUser}
          displayName={user.display_name}
          role={user.role}
          badges={badges}
        />
      </div>
    )
  }

  return (
    <div className="admin-shell">
      <AdminSidebar
        screen={screen}
        onNav={nav}
        onLoggedOut={onLoggedOut}
        onSwitchToUser={onSwitchToUser}
        displayName={user.display_name}
        role={user.role}
        tenantName={tenantName}
        badges={badges}
      />
      <main className="admin-content">
        <div className="admin-content-inner">
          {logoUrl && !logoError && (
            <img
              className="admin-content-logo"
              src={logoUrl}
              alt={tenantName}
              onError={() => setLogoError(true)}
            />
          )}
          {renderScreen()}
        </div>
      </main>
    </div>
  )
}
