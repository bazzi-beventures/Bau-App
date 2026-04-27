import { useState } from 'react'
import { AdminScreen } from './useAdminNav'
import { logout } from '../api/auth'
import {
  IconDashboard, IconFolder, IconClock, IconCash,
  IconUsers, IconAddressBook, IconReceipt, IconCalendar,
  IconDocument, IconBox, IconTag, IconChart, IconKey, IconLogout, IconSettings,
} from './AdminIcons'

interface Props {
  screen: AdminScreen
  onNav: (screen: AdminScreen) => void
  onLoggedOut: () => void
  onSwitchToUser: () => void
  displayName: string
  role: string
  badges?: {
    corrections?: number
    absences?: number
    invoices?: number
  }
}

const PRIMARY_TABS: AdminScreen[] = ['dashboard', 'projects', 'corrections', 'invoices']

function IconMenu() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M3 5a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1zm0 5a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1zm0 5a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1z" clipRule="evenodd"/>
    </svg>
  )
}

function IconSwitchUser() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
      <path d="M10 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm-7 9a7 7 0 1 1 14 0H3z"/>
    </svg>
  )
}

export default function MobileNav({ screen, onNav, onLoggedOut, onSwitchToUser, displayName, role, badges }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  const initials = displayName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const isManagement = role === 'management' || role === 'superadmin'
  const isMoreActive = !PRIMARY_TABS.includes(screen)
  const hasSecondaryBadge = (badges?.absences ?? 0) > 0

  function navigate(target: AdminScreen) {
    setDrawerOpen(false)
    onNav(target)
  }

  async function handleLogout() {
    setDrawerOpen(false)
    try { await logout() } catch { /* ignore */ }
    onLoggedOut()
  }

  function handleSwitchToUser() {
    setDrawerOpen(false)
    onSwitchToUser()
  }

  return (
    <>
      {/* Bottom tab bar */}
      <nav className="admin-mobile-tabbar">
        <button
          className={`admin-mobile-tab${screen === 'dashboard' ? ' active' : ''}`}
          onClick={() => navigate('dashboard')}
        >
          <IconDashboard />
          <span className="admin-mobile-tab-label">Dashboard</span>
        </button>

        <button
          className={`admin-mobile-tab${screen === 'projects' ? ' active' : ''}`}
          onClick={() => navigate('projects')}
        >
          <IconFolder />
          <span className="admin-mobile-tab-label">Projekte</span>
        </button>

        <button
          className={`admin-mobile-tab${screen === 'corrections' ? ' active' : ''}`}
          onClick={() => navigate('corrections')}
        >
          <IconClock />
          <span className="admin-mobile-tab-label">Korrekturen</span>
          {(badges?.corrections ?? 0) > 0 && (
            <span className="admin-mobile-tab-badge">{badges!.corrections}</span>
          )}
        </button>

        <button
          className={`admin-mobile-tab${screen === 'invoices' ? ' active' : ''}`}
          onClick={() => navigate('invoices')}
        >
          <IconCash />
          <span className="admin-mobile-tab-label">Rechnungen</span>
          {(badges?.invoices ?? 0) > 0 && (
            <span className="admin-mobile-tab-badge">{badges!.invoices}</span>
          )}
        </button>

        <button
          className={`admin-mobile-tab${isMoreActive ? ' active' : ''}`}
          onClick={() => setDrawerOpen(true)}
        >
          <IconMenu />
          <span className="admin-mobile-tab-label">Mehr</span>
          {hasSecondaryBadge && !isMoreActive && (
            <span className="admin-mobile-tab-dot" />
          )}
        </button>
      </nav>

      {/* Mehr drawer */}
      {drawerOpen && (
        <>
          <div className="admin-mobile-drawer-overlay" onClick={() => setDrawerOpen(false)} />
          <div className="admin-mobile-drawer">
            <div className="admin-mobile-drawer-handle" />

            <div className="admin-mobile-drawer-scroll">
              {/* Frequently used secondary screens */}
              <div className="admin-mobile-drawer-group">
                <div className="admin-mobile-drawer-group-label">Häufig genutzt</div>

                <button className={`admin-mobile-drawer-item${screen === 'my-time' ? ' active' : ''}`} onClick={() => navigate('my-time')}>
                  <IconClock /><span>Meine Zeit</span>
                </button>
                <button className={`admin-mobile-drawer-item${screen === 'staff' ? ' active' : ''}`} onClick={() => navigate('staff')}>
                  <IconUsers /><span>Mitarbeiter</span>
                </button>
                <button className={`admin-mobile-drawer-item${screen === 'customers' ? ' active' : ''}`} onClick={() => navigate('customers')}>
                  <IconAddressBook /><span>Kundenstamm</span>
                </button>
                <button className={`admin-mobile-drawer-item${screen === 'quotes' ? ' active' : ''}`} onClick={() => navigate('quotes')}>
                  <IconReceipt /><span>Offerten</span>
                </button>
                <button className={`admin-mobile-drawer-item${screen === 'absences' ? ' active' : ''}`} onClick={() => navigate('absences')}>
                  <IconCalendar /><span>Absenzen</span>
                  {(badges?.absences ?? 0) > 0 && (
                    <span className="admin-mobile-drawer-item-badge">{badges!.absences}</span>
                  )}
                </button>
              </div>

              {/* All remaining screens */}
              <div className="admin-mobile-drawer-group">
                <div className="admin-mobile-drawer-group-label">Alle Bereiche</div>

                <button className={`admin-mobile-drawer-item${screen === 'hr-reports' ? ' active' : ''}`} onClick={() => navigate('hr-reports')}>
                  <IconDocument /><span>HR-Berichte</span>
                </button>
                <button className={`admin-mobile-drawer-item${screen === 'materials' ? ' active' : ''}`} onClick={() => navigate('materials')}>
                  <IconBox /><span>Material / Lager</span>
                </button>
                {isManagement && (
                  <button className={`admin-mobile-drawer-item${screen === 'pricing-rules' ? ' active' : ''}`} onClick={() => navigate('pricing-rules')}>
                    <IconTag /><span>Lieferantenpreise</span>
                  </button>
                )}
                {isManagement && (
                  <button className={`admin-mobile-drawer-item${screen === 'kpis' ? ' active' : ''}`} onClick={() => navigate('kpis')}>
                    <IconChart /><span>Kennzahlen</span>
                  </button>
                )}
                <button className={`admin-mobile-drawer-item${screen === 'users' ? ' active' : ''}`} onClick={() => navigate('users')}>
                  <IconKey /><span>Benutzerverwaltung</span>
                </button>
                {isManagement && (
                  <button className={`admin-mobile-drawer-item${screen === 'configuration' ? ' active' : ''}`} onClick={() => navigate('configuration')}>
                    <IconSettings /><span>Konfiguration</span>
                  </button>
                )}
              </div>
            </div>

            <div className="admin-mobile-drawer-divider" />

            <div className="admin-mobile-drawer-footer">
              <button className="admin-mobile-switch-btn" onClick={handleSwitchToUser}>
                <IconSwitchUser />
                <span>Zur Mitarbeiter-App</span>
              </button>
              <div className="admin-mobile-user-row">
                <div className="admin-mobile-avatar">{initials}</div>
                <div className="admin-mobile-user-info">
                  <div className="admin-mobile-user-name">{displayName}</div>
                  <div className="admin-mobile-user-role">{role}</div>
                </div>
                <button className="admin-mobile-logout-btn" onClick={handleLogout} title="Abmelden">
                  <IconLogout />
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}
