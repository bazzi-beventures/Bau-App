import { logout } from '../api/auth'

interface Props {
  displayName: string
  email: string | null
  role: string
  tenantName: string
  onBack: () => void
  onLoggedOut: () => void
}

function roleLabel(role: string): string {
  switch (role) {
    case 'admin': return 'Administrator'
    case 'manager': return 'Manager'
    case 'user': return 'Mitarbeiter'
    default: return role
  }
}

export default function ProfileScreen({ displayName, email, role, tenantName, onBack, onLoggedOut }: Props) {
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

      {/* Avatar + Name */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '28px 0 20px' }}>
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          background: 'var(--accent-blue-dim)',
          border: '2px solid var(--accent-blue-20)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 28, fontWeight: 600, color: 'var(--accent-blue)',
        }}>
          {displayName.charAt(0).toUpperCase()}
        </div>
        <div style={{ marginTop: 12, fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>{displayName}</div>
        <div style={{ marginTop: 4, fontSize: 13, color: 'var(--muted)' }}>{roleLabel(role)}</div>
      </div>

      <div className="menu-list">
        {/* E-Mail */}
        <div className="menu-item" style={{ cursor: 'default' }}>
          <div className="menu-icon menu-icon-blue">
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-blue)" strokeWidth="1.8">
              <rect x="2" y="4" width="20" height="16" rx="2"/>
              <path d="M2 7l10 7 10-7"/>
            </svg>
          </div>
          <div className="menu-text">
            <div className="menu-sub">E-Mail</div>
            <div className="menu-label">{email ?? '—'}</div>
          </div>
        </div>

        {/* Firma */}
        <div className="menu-item" style={{ cursor: 'default' }}>
          <div className="menu-icon menu-icon-blue">
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-blue)" strokeWidth="1.8">
              <rect x="2" y="7" width="20" height="15" rx="1"/>
              <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
            </svg>
          </div>
          <div className="menu-text">
            <div className="menu-sub">Firma</div>
            <div className="menu-label">{tenantName}</div>
          </div>
        </div>

        {/* Rolle */}
        <div className="menu-item" style={{ cursor: 'default' }}>
          <div className="menu-icon menu-icon-blue">
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-blue)" strokeWidth="1.8">
              <path d="M12 2a5 5 0 1 1 0 10A5 5 0 0 1 12 2z"/>
              <path d="M2 20c0-4 4-7 10-7s10 3 10 7"/>
            </svg>
          </div>
          <div className="menu-text">
            <div className="menu-sub">Rolle</div>
            <div className="menu-label">{roleLabel(role)}</div>
          </div>
        </div>

        {/* Abmelden */}
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
