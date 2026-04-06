import { useEffect, useState } from 'react'
import { getMe, getTenantInfo, TenantInfo, UserInfo } from './api/auth'
import { ApiError } from './api/client'
import PinScreen from './auth/PinScreen'
import RegisterScreen from './auth/RegisterScreen'
import LoginScreen from './auth/LoginScreen'
import HomeScreen from './screens/HomeScreen'
import ChatScreen from './chat/ChatScreen'
import ArbeitsZeitScreen from './screens/ArbeitsZeitScreen'
import ProfileScreen from './screens/ProfileScreen'

type Screen = 'loading' | 'login' | 'pin' | 'register' | 'home' | 'rapport' | 'arbeitszeit' | 'profile'

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
  root.style.setProperty('--accent-blue', c)
  root.style.setProperty('--accent-blue-dim', hexToRgba(c, 0.12))
  root.style.setProperty('--accent-blue-20', hexToRgba(c, 0.2))
  root.style.setProperty('--accent-blue-25', hexToRgba(c, 0.25))
  root.style.setProperty('--accent-blue-40', hexToRgba(c, 0.4))
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

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading')
  const [user, setUser] = useState<UserInfo | null>(null)
  const [pinState, setPinState] = useState<PinState | null>(null)
  const [logoUrl, setLogoUrl] = useState('')
  const [tenantName, setTenantName] = useState('')

  const hasStoredIdentity = Boolean(
    localStorage.getItem('authorizedUserId') && localStorage.getItem('tenantSlug')
  )

  useEffect(() => {
    const tenantSlug = localStorage.getItem('tenantSlug') ?? ''

    const brandingPromise = tenantSlug
      ? getTenantInfo(tenantSlug).then(info => {
          applyTenantBranding(info)
          setLogoUrl(info.logo_url)
          setTenantName(info.name)
        }).catch(() => undefined)
      : Promise.resolve(undefined)

    Promise.all([
      getMe().then(u => u).catch(err => ({ error: err })),
      brandingPromise,
    ]).then(([userResult]) => {
      if ('error' in (userResult as object)) {
        setScreen(hasStoredIdentity ? 'login' : 'pin')
      } else {
        setUser(userResult as UserInfo)
        setScreen('home')
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
          setScreen('register')
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
          getMe().then(u => { setUser(u); setScreen('home') }).catch(() => setScreen('login'))
        }}
      />
    )
  }

  if (screen === 'login') {
    return (
      <LoginScreen
        logoUrl={logoUrl}
        onLoggedIn={() => {
          getMe().then(u => { setUser(u); setScreen('home') }).catch(() => setScreen('pin'))
        }}
      />
    )
  }

  if (screen === 'home' && user) {
    return (
      <HomeScreen
        displayName={user.display_name}
        onNavRapport={() => setScreen('rapport')}
        onNavArbeitszeit={() => setScreen('arbeitszeit')}
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
        onBack={() => setScreen('home')}
        onLoggedOut={() => { setUser(null); setScreen(hasStoredIdentity ? 'login' : 'pin') }}
      />
    )
  }

  if (screen === 'rapport' && user) {
    return (
      <ChatScreen
        displayName={user.display_name}
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
        onNavHome={() => setScreen('home')}
        onNavRapport={() => setScreen('rapport')}
        onNavProfile={() => setScreen('profile')}
        onLoggedOut={() => { setUser(null); setScreen(hasStoredIdentity ? 'login' : 'pin') }}
      />
    )
  }

  return null
}
