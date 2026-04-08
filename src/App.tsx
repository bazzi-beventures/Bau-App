import { useCallback, useEffect, useState } from 'react'
import { getMe, getTenantInfo, TenantInfo, UserInfo } from './api/auth'
import { ApiError } from './api/client'
import PinScreen from './auth/PinScreen'
import RegisterScreen from './auth/RegisterScreen'
import LoginScreen from './auth/LoginScreen'
import ConsentScreen from './auth/ConsentScreen'
import HomeScreen from './screens/HomeScreen'
import ChatScreen from './chat/ChatScreen'
import ArbeitsZeitScreen from './screens/ArbeitsZeitScreen'
import ProfileScreen from './screens/ProfileScreen'
import BerichtScreen, { BerichtType } from './screens/BerichtScreen'
import ProjekteScreen from './screens/ProjekteScreen'
import AdminApp from './admin/AdminApp'

type Screen = 'loading' | 'login' | 'pin' | 'register' | 'consent' | 'home' | 'rapport' | 'arbeitszeit' | 'profile' | 'bericht' | 'projekte' | 'admin'

interface PinState {
  tenantSlug: string
  authorizedUserId: string
  displayName: string
  pin: string
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function applyTenantBranding(info: TenantInfo) {
  const root = document.documentElement
  const c = info.brand_color
  const d = info.brand_color_dark || c
  root.style.setProperty('--accent-blue', c)
  root.style.setProperty('--accent-blue-dim', hexToRgba(c, 0.18))
  root.style.setProperty('--accent-blue-20', hexToRgba(c, 0.25))
  root.style.setProperty('--accent-blue-25', hexToRgba(c, 0.30))
  root.style.setProperty('--accent-blue-40', hexToRgba(c, 0.50))
  root.style.setProperty('--accent-blue-dark', d)
  console.log('[Branding] applied:', c, d)
}

// Generic fallback logo
function LogoSvg() {
  return (
    <svg viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M14 3L25 9v10L14 25 3 19V9z"/>
      <path d="M14 8v12M9 11l5 3 5-3"/>
    </svg>
  )
}

// Tenant-aware logo: shows company logo if available, else geometric fallback
export function TenantLogo({ logoUrl }: { logoUrl: string }) {
  const [imgError, setImgError] = useState(false)
  if (logoUrl && !imgError) {
    return (
      <div className="auth-logo-img">
        <img src={logoUrl} alt="Firmenlogo" onError={() => setImgError(true)} />
      </div>
    )
  }
  return (
    <div className="auth-logo" style={{ marginBottom: 28 }}>
      <LogoSvg />
    </div>
  )
}

function nextScreenAfterLogin(u: UserInfo): Screen {
  if (u.consent_required) return 'consent'
  if (u.role === 'admin' || u.role === 'superadmin') return 'admin'
  return 'home'
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading')
  const [user, setUser] = useState<UserInfo | null>(null)
  const [pinState, setPinState] = useState<PinState | null>(null)
  const [logoUrl, setLogoUrl] = useState('')
  const [tenantName, setTenantName] = useState('')
  const [berichtType, setBerichtType] = useState<BerichtType>('monthly')

  const hasStoredIdentity = Boolean(
    localStorage.getItem('authorizedUserId') && localStorage.getItem('tenantSlug')
  )

  const loadBranding = useCallback(async () => {
    const slug = localStorage.getItem('tenantSlug') ?? ''
    if (!slug) return
    try {
      const info = await getTenantInfo(slug)
      applyTenantBranding(info)
      setLogoUrl(info.logo_url)
      setTenantName(info.name)
    } catch (err) {
      console.warn('[Branding] Fehler beim Laden:', err)
    }
  }, [])

  useEffect(() => {
    Promise.all([
      getMe().then(u => u).catch(err => ({ error: err })),
      loadBranding(),
    ]).then(([userResult]) => {
      if ('error' in (userResult as object)) {
        setScreen(hasStoredIdentity ? 'login' : 'pin')
      } else {
        const u = userResult as UserInfo
        setUser(u)
        setScreen(nextScreenAfterLogin(u))
      }
    })
  }, [])

  if (screen === 'loading') {
    return (
      <div className="loading-screen">
        <div className="loading-logo">
          <LogoSvg />
        </div>
        <p className="loading-text">Laden…</p>
      </div>
    )
  }

  if (screen === 'pin') {
    return (
      <PinScreen
        logoUrl={logoUrl}
        onPinValid={(tenantSlug, authorizedUserId, displayName, pin) => {
          setPinState({ tenantSlug, authorizedUserId, displayName, pin })
          loadBranding()
          setScreen('register')
        }}
        onLoggedIn={() => {
          getMe().then(u => { setUser(u); loadBranding(); setScreen(nextScreenAfterLogin(u)) }).catch(() => setScreen('pin'))
        }}
      />
    )
  }

  if (screen === 'register' && pinState) {
    return (
      <RegisterScreen
        {...pinState}
        logoUrl={logoUrl}
        onRegistered={() => {
          getMe().then(u => { setUser(u); loadBranding(); setScreen(nextScreenAfterLogin(u)) }).catch(() => setScreen('login'))
        }}
      />
    )
  }

  if (screen === 'login') {
    return (
      <LoginScreen
        logoUrl={logoUrl}
        onLoggedIn={() => {
          getMe().then(u => { setUser(u); loadBranding(); setScreen(nextScreenAfterLogin(u)) }).catch(() => setScreen('pin'))
        }}
      />
    )
  }

  if (screen === 'consent' && user) {
    return (
      <ConsentScreen
        logoUrl={logoUrl}
        displayName={user.display_name}
        onAccepted={() => {
          getMe().then(u => { setUser(u); setScreen('home') }).catch(() => setScreen('home'))
        }}
      />
    )
  }

  if (screen === 'home' && user) {
    return (
      <HomeScreen
        displayName={user.display_name}
        logoUrl={logoUrl}
        onNavRapport={() => setScreen('rapport')}
        onNavArbeitszeit={() => setScreen('arbeitszeit')}
        onNavProjekte={() => setScreen('projekte')}
        onNavProfile={() => setScreen('profile')}
        onLoggedOut={() => { setUser(null); setScreen(hasStoredIdentity ? 'login' : 'pin') }}
      />
    )
  }

  if (screen === 'profile' && user) {
    return (
      <ProfileScreen
        displayName={user.display_name}
        email={user.email}
        role={user.role}
        tenantName={tenantName || localStorage.getItem('tenantSlug') || ''}
        logoUrl={logoUrl}
        onBack={() => setScreen('home')}
        onLoggedOut={() => { setUser(null); setScreen(hasStoredIdentity ? 'login' : 'pin') }}
      />
    )
  }

  if (screen === 'rapport' && user) {
    return (
      <ChatScreen
        displayName={user.display_name}
        logoUrl={logoUrl}
        activeNav="rapport"
        onNavHome={() => setScreen('home')}
        onNavArbeitszeit={() => setScreen('arbeitszeit')}
        onNavProfile={() => setScreen('profile')}
        onLoggedOut={() => { setUser(null); setScreen(hasStoredIdentity ? 'login' : 'pin') }}
      />
    )
  }

  if (screen === 'arbeitszeit' && user) {
    return (
      <ArbeitsZeitScreen
        displayName={user.display_name}
        logoUrl={logoUrl}
        onNavHome={() => setScreen('home')}
        onNavRapport={() => setScreen('rapport')}
        onNavProfile={() => setScreen('profile')}
        onLoggedOut={() => { setUser(null); setScreen(hasStoredIdentity ? 'login' : 'pin') }}
        onOpenBericht={(type) => { setBerichtType(type); setScreen('bericht') }}
      />
    )
  }

  if (screen === 'projekte' && user) {
    return (
      <ProjekteScreen
        logoUrl={logoUrl}
        onNavHome={() => setScreen('home')}
        onNavRapport={() => setScreen('rapport')}
        onNavProfile={() => setScreen('profile')}
        onLoggedOut={() => { setUser(null); setScreen(hasStoredIdentity ? 'login' : 'pin') }}
      />
    )
  }

  if (screen === 'bericht' && user) {
    return (
      <BerichtScreen
        berichtType={berichtType}
        logoUrl={logoUrl}
        onBack={() => setScreen('arbeitszeit')}
        onNavHome={() => setScreen('home')}
        onNavRapport={() => setScreen('rapport')}
        onNavProfile={() => setScreen('profile')}
        onLoggedOut={() => { setUser(null); setScreen(hasStoredIdentity ? 'login' : 'pin') }}
      />
    )
  }

  if (screen === 'admin' && user) {
    return (
      <AdminApp
        user={user}
        logoUrl={logoUrl}
        tenantName={tenantName || localStorage.getItem('tenantSlug') || ''}
        onLoggedOut={() => { setUser(null); setScreen(hasStoredIdentity ? 'login' : 'pin') }}
      />
    )
  }

  return null
}
