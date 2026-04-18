import { useState } from 'react'
import { logout } from '../api/auth'
import { Theme, loadTheme, applyTheme, toggleTheme } from '../theme'

interface Props {
  displayName: string
  email: string | null
  role: string
  tenantName: string
  logoUrl?: string
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

export default function ProfileScreen({ displayName, email, role, tenantName, logoUrl, onBack, onLoggedOut }: Props) {
  const [theme, setTheme] = useState<Theme>(() => loadTheme())

  async function handleLogout() {
    await logout().catch(() => {})
    onLoggedOut()
  }

  function handleToggleTheme() {
    const next = toggleTheme(theme)
    setTheme(next)
    applyTheme(next)
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
        {logoUrl && <img src={logoUrl} alt="Logo" className="header-logo" />}
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

        {/* Darstellung */}
        <div className="menu-item" onClick={handleToggleTheme}>
          <div className="menu-icon menu-icon-blue">
            {theme === 'dark' ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-blue)" strokeWidth="1.8">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-blue)" strokeWidth="1.8">
                <circle cx="12" cy="12" r="4"/>
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
              </svg>
            )}
          </div>
          <div className="menu-text">
            <div className="menu-sub">Darstellung</div>
            <div className="menu-label">{theme === 'dark' ? 'Dunkel' : 'Hell'}</div>
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
