import { AdminScreen } from './useAdminNav'
import { logout } from '../api/auth'

interface Props {
  screen: AdminScreen
  onNav: (screen: AdminScreen) => void
  onLoggedOut: () => void
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

function IconDashboard() {
  return <svg viewBox="0 0 20 20" fill="currentColor"><path d="M2 10a8 8 0 1 1 16 0A8 8 0 0 1 2 10zm8-3a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm-3 6a3 3 0 1 1 6 0H7z"/></svg>
}
function IconUsers() {
  return <svg viewBox="0 0 20 20" fill="currentColor"><path d="M9 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm8 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM9 12a5 5 0 0 0-5 5h10a5 5 0 0 0-5-5z"/></svg>
}
function IconCalendar() {
  return <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M6 2a1 1 0 0 0-1 1v1H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-1V3a1 1 0 1 0-2 0v1H7V3a1 1 0 0 0-1-1zm0 5a1 1 0 0 0 0 2h8a1 1 0 1 0 0-2H6z" clipRule="evenodd"/></svg>
}
function IconClock() {
  return <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm1-12a1 1 0 1 0-2 0v4a1 1 0 0 0 .293.707l2.828 2.829a1 1 0 1 0 1.415-1.415L11 9.586V6z" clipRule="evenodd"/></svg>
}
function IconDocument() {
  return <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 4a2 2 0 0 1 2-2h4.586A2 2 0 0 1 12 2.586L15.414 6A2 2 0 0 1 16 7.414V16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4zm2 6a1 1 0 0 1 1-1h6a1 1 0 1 1 0 2H7a1 1 0 0 1-1-1zm1 3a1 1 0 1 0 0 2h4a1 1 0 1 0 0-2H7z" clipRule="evenodd"/></svg>
}
function IconBox() {
  return <svg viewBox="0 0 20 20" fill="currentColor"><path d="M4 3a2 2 0 1 0 0 4h12a2 2 0 1 0 0-4H4z"/><path fillRule="evenodd" d="M3 8h14v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8zm5 3a1 1 0 0 1 1-1h2a1 1 0 1 1 0 2H9a1 1 0 0 1-1-1z" clipRule="evenodd"/></svg>
}
function IconFolder() {
  return <svg viewBox="0 0 20 20" fill="currentColor"><path d="M2 6a2 2 0 0 1 2-2h5l2 2h5a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6z"/></svg>
}
function IconReceipt() {
  return <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 2a1 1 0 0 0-1 1v14l3-2 2 2 2-2 2 2 2-2 3 2V3a1 1 0 0 0-1-1H4zm2 5a1 1 0 0 1 1-1h6a1 1 0 1 1 0 2H7a1 1 0 0 1-1-1zm1 3a1 1 0 1 0 0 2h4a1 1 0 1 0 0-2H7z" clipRule="evenodd"/></svg>
}
function IconCash() {
  return <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2V6h10a2 2 0 0 0-2-2H4zm2 6a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2H6zm7 4a1 1 0 1 0-2 0 1 1 0 0 0 2 0z" clipRule="evenodd"/></svg>
}
function IconTag() {
  return <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M17.707 9.293a1 1 0 0 1 0 1.414l-7 7a1 1 0 0 1-1.414 0l-7-7A.997.997 0 0 1 2 10V5a3 3 0 0 1 3-3h5c.256 0 .512.098.707.293l7 7zM5 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" clipRule="evenodd"/></svg>
}
function IconKey() {
  return <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 8a6 6 0 0 1-7.743 5.743L10 14l-1 1-1 1H6v2H2v-4l4.257-4.257A6 6 0 1 1 18 8zm-6-4a1 1 0 1 0 0 2 2 2 0 0 1 2 2 1 1 0 1 0 2 0 4 4 0 0 0-4-4z" clipRule="evenodd"/></svg>
}
function IconUpload() {
  return <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1zM6.293 6.707a1 1 0 0 1 0-1.414l3-3a1 1 0 0 1 1.414 0l3 3a1 1 0 0 1-1.414 1.414L11 5.414V13a1 1 0 1 1-2 0V5.414L7.707 6.707a1 1 0 0 1-1.414 0z" clipRule="evenodd"/></svg>
}
function IconChart() {
  return <svg viewBox="0 0 20 20" fill="currentColor"><path d="M2 11a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-5zm6-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V7zm6-3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1V4z"/></svg>
}
function IconLogout() {
  return <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 3a1 1 0 0 0-1 1v12a1 1 0 1 0 2 0V5h10v11a1 1 0 1 0 2 0V4a1 1 0 0 0-1-1H3zm7 9a1 1 0 0 0 1-1V7.414l1.293 1.293a1 1 0 1 0 1.414-1.414l-3-3a1 1 0 0 0-1.414 0l-3 3a1 1 0 1 0 1.414 1.414L9 7.414V11a1 1 0 0 0 1 1z" clipRule="evenodd"/></svg>
}

export default function AdminSidebar({ screen, onNav, onLoggedOut, displayName, role, tenantName, badges }: Props) {
  const initials = displayName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

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
<NavItem label="Zeitkorrekturen" target="corrections" current={screen} onNav={onNav} icon={<IconClock />} badge={badges?.corrections} />
        <NavItem label="HR-Berichte" target="hr-reports" current={screen} onNav={onNav} icon={<IconDocument />} />

        <div className="admin-nav-group-label">Operativ</div>
        <NavItem label="Projekte" target="projects" current={screen} onNav={onNav} icon={<IconFolder />} />
        <NavItem label="Material / Lager" target="materials" current={screen} onNav={onNav} icon={<IconBox />} />
        <NavItem label="Offerten" target="quotes" current={screen} onNav={onNav} icon={<IconReceipt />} />
        <NavItem label="Rechnungen" target="invoices" current={screen} onNav={onNav} icon={<IconCash />} badge={badges?.invoices} />
        <NavItem label="Lieferantenpreise" target="pricing-rules" current={screen} onNav={onNav} icon={<IconTag />} />

        <div className="admin-nav-group-label">Analyse</div>
        <NavItem label="Kennzahlen" target="kpis" current={screen} onNav={onNav} icon={<IconChart />} />

        <div className="admin-nav-group-label">System</div>
        <NavItem label="Benutzerverwaltung" target="users" current={screen} onNav={onNav} icon={<IconKey />} />
        <NavItem label="Import / Upload" target="import" current={screen} onNav={onNav} icon={<IconUpload />} />
      </nav>

      <div className="admin-sidebar-footer">
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
