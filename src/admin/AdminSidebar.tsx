import { AdminScreen } from './useAdminNav'
import { logout } from '../api/auth'
import {
  IconDashboard, IconUsers, IconCalendar, IconClock, IconDocument, IconBox,
  IconFolder, IconReceipt, IconCash, IconTag, IconKey, IconUpload, IconChart,
  IconLogout, IconAddressBook,
} from './AdminIcons'

interface Props {
  screen: AdminScreen
  onNav: (screen: AdminScreen) => void
  onLoggedOut: () => void
  onSwitchToUser: () => void
  displayName: string
  role: string
  tenantName: string
  badges?: {
    corrections?: number
    absences?: number
    invoices?: number
  }
}

interface NavItemProps {
  label: string
  target: AdminScreen
  current: AdminScreen
  onNav: (s: AdminScreen) => void
  badge?: number
  icon: React.ReactNode
}

function NavItem({ label, target, current, onNav, badge, icon }: NavItemProps) {
  return (
    <button
      className={`admin-nav-item${current === target ? ' active' : ''}`}
      onClick={() => onNav(target)}
      title={label}
    >
      {icon}
      <span>{label}</span>
      {badge != null && badge > 0 && (
        <span className="admin-nav-badge danger">{badge}</span>
      )}
    </button>
  )
}

export default function AdminSidebar({ screen, onNav, onLoggedOut, onSwitchToUser, displayName, role, tenantName, badges }: Props) {
  const initials = displayName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const isManagement = role === 'management' || role === 'superadmin'

  async function handleLogout() {
    try { await logout() } catch { /* ignore */ }
    onLoggedOut()
  }

  return (
    <aside className="admin-sidebar">
      <div className="admin-sidebar-header">
        <span className="admin-sidebar-tenant">{tenantName || 'Admin'}</span>
      </div>

      <nav className="admin-nav">
        <NavItem label="Dashboard" target="dashboard" current={screen} onNav={onNav} icon={<IconDashboard />} />

        <div className="admin-nav-group-label">Personal</div>
        <NavItem label="Mitarbeiter" target="staff" current={screen} onNav={onNav} icon={<IconUsers />} />
        <NavItem label="Absenzen" target="absences" current={screen} onNav={onNav} icon={<IconCalendar />} badge={badges?.absences} />
        <NavItem label="Zeitkorrekturen" target="corrections" current={screen} onNav={onNav} icon={<IconClock />} badge={badges?.corrections} />
        <NavItem label="HR-Berichte" target="hr-reports" current={screen} onNav={onNav} icon={<IconDocument />} />

        <div className="admin-nav-group-label">Operativ</div>
        <NavItem label="Projekte" target="projects" current={screen} onNav={onNav} icon={<IconFolder />} />
        <NavItem label="Kundenstamm" target="customers" current={screen} onNav={onNav} icon={<IconAddressBook />} />
        <NavItem label="Offerten" target="quotes" current={screen} onNav={onNav} icon={<IconReceipt />} />
        <NavItem label="Rechnungen" target="invoices" current={screen} onNav={onNav} icon={<IconCash />} badge={badges?.invoices} />
        <NavItem label="Projektfortschritte" target="project-overview" current={screen} onNav={onNav} icon={<IconChart />} />

        <div className="admin-nav-group-label">Stammdaten</div>
        <NavItem label="Lieferanten" target="suppliers" current={screen} onNav={onNav} icon={<IconTag />} />
        <NavItem label="Material / Lager" target="materials" current={screen} onNav={onNav} icon={<IconBox />} />
        {isManagement && (
          <NavItem label="Preisregeln" target="pricing-rules" current={screen} onNav={onNav} icon={<IconTag />} />
        )}

        {isManagement && (
          <>
            <div className="admin-nav-group-label">Analyse</div>
            <NavItem label="Kennzahlen" target="kpis" current={screen} onNav={onNav} icon={<IconChart />} />
          </>
        )}

        <div className="admin-nav-group-label">System</div>
        <NavItem label="Benutzerverwaltung" target="users" current={screen} onNav={onNav} icon={<IconKey />} />
        <NavItem label="Import / Upload" target="import" current={screen} onNav={onNav} icon={<IconUpload />} />
      </nav>

      <div className="admin-sidebar-footer">
        <button className="admin-switch-btn" onClick={onSwitchToUser} title="Zur Mitarbeiter-App wechseln">
          <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
            <path d="M10 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm-7 9a7 7 0 1 1 14 0H3z" />
          </svg>
          <span>Mitarbeiter-App</span>
        </button>
        <div className="admin-user-row">
          <div className="admin-avatar">{initials}</div>
          <div className="admin-user-info">
            <div className="admin-user-name">{displayName}</div>
            <div className="admin-user-role">{role}</div>
          </div>
          <button className="admin-logout-btn" onClick={handleLogout} title="Abmelden">
            <IconLogout />
          </button>
        </div>
      </div>
    </aside>
  )
}
