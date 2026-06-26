import { Fragment, useEffect, useState } from 'react'
import { UserInfo } from '../api/auth'
import { getAdminDashboard, AdminDashboard } from '../api/admin'
import AdminSidebar from './AdminSidebar'
import MobileNav from './MobileNav'
import RequireModule from './RequireModule'
import { useAdminNav, AdminScreen } from './useAdminNav'
import { useIsMobile } from './useIsMobile'
import DashboardScreen from './dashboard/DashboardScreen'
import StaffScreen from './personal/StaffScreen'
import BulkClockInScreen from './personal/BulkClockInScreen'
import MyTimeScreen from './personal/MyTimeScreen'
import AbsencesScreen from './personal/AbsencesScreen'
import CorrectionsScreen from './personal/CorrectionsScreen'
import HrReportsScreen from './personal/HrReportsScreen'
import VacationOverviewScreen from './personal/VacationOverviewScreen'
import ProjectsScreen from './operative/ProjectsScreen'
import ProjectDraftsScreen from './operative/ProjectDraftsScreen'
import ProjectScheduleScreen from './operative/ProjectScheduleScreen'
import CustomersScreen from './operative/CustomersScreen'
import MaterialsScreen from './operative/MaterialsScreen'
import QuotesScreen from './operative/QuotesScreen'
import InvoicesScreen from './operative/InvoicesScreen'
import PaymentReconciliationScreen from './operative/PaymentReconciliationScreen'
import PricingRulesScreen from './operative/PricingRulesScreen'
import QuoteTemplatesScreen from './operative/QuoteTemplatesScreen'
import SuppliersScreen from './masterdata/SuppliersScreen'
import StaffRolesScreen from './masterdata/StaffRolesScreen'
import UsersScreen from './system/UsersScreen'
import AdminToolsScreen from './system/AdminToolsScreen'
import KpiScreen from './kpis/KpiScreen'
import HelpBubble from '../shared/HelpBubble'
import { hasModule, isFeatureEnabled } from '../api/modules'
import { Theme, loadTheme, applyTheme, toggleTheme as flipTheme } from '../theme'
import './tokens.css'
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
  canton: string
  onLoggedOut: () => void
  onSwitchToUser: () => void
}

const SCREEN_TITLES: Record<AdminScreen, string> = {
  'dashboard': 'Dashboard',
  'my-time': 'Meine Zeiterfassung',
  'staff': 'Mitarbeiter',
  'bulk-clockin': 'Massen-Einstempeln',
  'absences': 'Absenzen',
  'corrections': 'Zeitkorrekturen',
  'hr-reports': 'HR-Berichte',
  'vacation': 'Ferien',
  'projects': 'Projekte',
  'project-drafts': 'Projekt-Entwürfe',
  'project-schedule': 'Einsatzplanung',
  'customers': 'Kundenstamm',
  'quotes': 'Offerten',
  'invoices': 'Rechnungen',
  'payment-reconciliation': 'Zahlungsabgleich',
  'suppliers': 'Lieferanten',
  'staff-roles': 'Funktionen',
  'materials': 'Material / Lager',
  'pricing-rules': 'Preisregeln',
  'quote-templates': 'Offert-Vorlagen',
  'users': 'Benutzerverwaltung',
  'kpis': 'Kennzahlen',
  'admin-tools': 'Admin-Tools',
}

export default function AdminApp({ user, logoUrl, tenantName, canton, onLoggedOut, onSwitchToUser }: Props) {
  const { screen, detailId, resetTick, nav, clearDetail } = useAdminNav()
  const isMobile = useIsMobile()
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null)
  const [logoError, setLogoError] = useState(false)
  const [theme, setTheme] = useState<Theme>(() => loadTheme())

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const toggleTheme = () => setTheme(flipTheme)

  async function loadDashboard() {
    try { setDashboard(await getAdminDashboard()) } catch { /* ignore */ }
  }

  useEffect(() => { loadDashboard() }, [])
  useEffect(() => { if (screen === 'dashboard') loadDashboard() }, [screen])

  const badges = {
    corrections: dashboard?.pending_corrections ?? 0,
    absences: dashboard?.pending_absences ?? 0,
    invoices: dashboard?.open_invoices ?? 0,
    drafts: dashboard?.pending_drafts ?? 0,
  }

  const isManagement = user.role === 'management' || user.role === 'superadmin'

  const enabledModules = user.enabled_modules ?? []
  const guard = (mod: Parameters<typeof RequireModule>[0]['module'], el: JSX.Element) => (
    <RequireModule module={mod} enabledModules={enabledModules}>{el}</RequireModule>
  )

  const isSuperadmin = user.role === 'superadmin'
  // Modul 'help_bot' = Master-Schalter; Feature-Flag 'help_bot_admin' = unabhängiger
  // Schalter für den Admin-Bereich (Default an).
  const showHelpBubble = hasModule(user, 'help_bot') && isFeatureEnabled(user, 'help_bot_admin')

  function renderScreen() {
    if ((screen === 'pricing-rules' || screen === 'quote-templates' || screen === 'kpis' || screen === 'users' || screen === 'bulk-clockin') && !isManagement) {
      return <ComingSoon title="Kein Zugriff" />
    }
    if (screen === 'admin-tools' && !isSuperadmin) {
      return <ComingSoon title="Kein Zugriff" />
    }
    switch (screen) {
      case 'dashboard':    return <DashboardScreen dashboard={dashboard} onNav={nav} onBadgeChange={loadDashboard} />
      case 'my-time':      return guard('timekeeping', <MyTimeScreen onLoggedOut={onLoggedOut} />)
      case 'staff':        return <StaffScreen />
      case 'bulk-clockin': return guard('timekeeping', <BulkClockInScreen />)
      case 'absences':     return guard('hr', <AbsencesScreen onBadgeChange={loadDashboard} canton={canton} />)
      case 'corrections':  return guard('timekeeping', <CorrectionsScreen onBadgeChange={loadDashboard} />)
      case 'hr-reports':   return guard('hr', <HrReportsScreen />)
      case 'vacation':     return guard('hr', <VacationOverviewScreen />)
      case 'projects':     return <ProjectsScreen openNew={detailId === 'new'} onConsumedNew={clearDetail} />
      case 'project-drafts': return <ProjectDraftsScreen onBadgeChange={loadDashboard} />
      case 'project-schedule': return guard('scheduling', <ProjectScheduleScreen canton={canton} onNav={nav} />)
      case 'customers':    return <CustomersScreen />
      case 'quotes':       return guard('quotes', <QuotesScreen initialStatus={detailId} onConsumed={clearDetail} />)
      case 'invoices':     return guard('invoicing', <InvoicesScreen onBadgeChange={loadDashboard} />)
      case 'payment-reconciliation': return guard('payment_matching', <PaymentReconciliationScreen />)
      case 'suppliers':    return <SuppliersScreen />
      case 'staff-roles':  return <StaffRolesScreen />
      case 'materials':    return <MaterialsScreen user={user} />
      case 'pricing-rules':return <PricingRulesScreen />
      case 'quote-templates': return <QuoteTemplatesScreen />
      case 'users':        return <UsersScreen />
      case 'kpis':         return guard('kpis', <KpiScreen />)
      case 'admin-tools':  return <AdminToolsScreen userRole={user.role} />
      default:             return <ComingSoon title={SCREEN_TITLES[screen]} />
    }
  }

  if (isMobile) {
    return (
      <div className="admin-shell-mobile">
        <main className="admin-content admin-content-mobile">
          <div className="admin-content-inner">
            <div className="admin-content-topbar admin-content-topbar--mobile">
              <div className="admin-mobile-topbar-title">{SCREEN_TITLES[screen]}</div>
              <button
                type="button"
                className="admin-btn-icon admin-theme-toggle"
                onClick={toggleTheme}
                title={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                aria-label="Theme wechseln"
              >
                {theme === 'dark' ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="4"/>
                    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/>
                  </svg>
                )}
              </button>
            </div>
            <Fragment key={`${screen}:${resetTick}`}>{renderScreen()}</Fragment>
          </div>
        </main>
        <MobileNav
          screen={screen}
          onNav={nav}
          onLoggedOut={onLoggedOut}
          onSwitchToUser={onSwitchToUser}
          displayName={user.display_name}
          role={user.role}
          enabledModules={user.enabled_modules ?? []}
          badges={badges}
        />
        {showHelpBubble && <HelpBubble />}
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
        enabledModules={user.enabled_modules ?? []}
        badges={badges}
      />
      <main className="admin-content">
        <div className="admin-content-inner">
          <div className="admin-content-topbar">
            <button
              type="button"
              className="admin-btn-icon admin-theme-toggle"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
              aria-label="Theme wechseln"
            >
              {theme === 'dark' ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="4"/>
                  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/>
                </svg>
              )}
            </button>
            {logoUrl && !logoError && (
              <img
                className="admin-content-logo"
                src={logoUrl}
                alt={tenantName}
                onError={() => setLogoError(true)}
              />
            )}
          </div>
          <Fragment key={`${screen}:${resetTick}`}>{renderScreen()}</Fragment>
        </div>
      </main>
      {showHelpBubble && <HelpBubble />}
    </div>
  )
}
