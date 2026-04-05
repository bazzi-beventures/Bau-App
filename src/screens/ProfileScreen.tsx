import { logout } from '../api/auth'

interface Props {
  displayName: string
  tenantSlug: string
  onBack: () => void
  onLoggedOut: () => void
}

export default function ProfileScreen({ displayName, tenantSlug, onBack, onLoggedOut }: Props) {
  async function handleLogout() {
    await logout().catch(() => {})
    onLoggedOut()
  }

  return (
    <div className="app-screen">
      <div className="inner-header">
        <div className="back-btn" onClick={onBack}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10 3L5 8l5 5"/>
          </svg>
        </div>
        <div className="inner-title">Profil</div>
      </div>

      <div className="menu-list">
        <div className="menu-item" style={{ cursor: 'default' }}>
          <div className="menu-icon menu-icon-blue">
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-blue)" strokeWidth="1.8">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
          </div>
          <div className="menu-text">
            <div className="menu-label">{displayName}</div>
            <div className="menu-sub">{tenantSlug}</div>
          </div>
        </div>

        <div className="menu-item" onClick={handleLogout} style={{ marginTop: 16 }}>
          <div className="menu-icon menu-icon-red">
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-red)" strokeWidth="1.8">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </div>
          <div className="menu-text">
            <div className="menu-label" style={{ color: 'var(--accent-red)' }}>Abmelden</div>
            <div className="menu-sub">Von diesem Gerät abmelden</div>
          </div>
        </div>
      </div>
    </div>
  )
}
