import React, { useCallback, useEffect, useState } from 'react'
import { getMe, getTenantInfo, TenantInfo, UserInfo } from './api/auth'
import { ApiError } from './api/client'
import PinScreen from './auth/PinScreen'
import LoginScreen from './auth/LoginScreen'
import ConsentScreen from './auth/ConsentScreen'
import HomeScreen from './screens/HomeScreen'
import ChatScreen from './chat/ChatScreen'
import ArbeitsZeitScreen from './screens/ArbeitsZeitScreen'
import ProfileScreen from './screens/ProfileScreen'
import BerichtScreen, { BerichtType } from './screens/BerichtScreen'
import ProjekteScreen from './screens/ProjekteScreen'
import AbsenzenScreen from './screens/AbsenzenScreen'
import AdminApp from './admin/AdminApp'

type Screen = 'loading' | 'login' | 'pin' | 'consent' | 'home' | 'rapport' | 'arbeitszeit' | 'profile' | 'bericht' | 'projekte' | 'admin' | 'absenzen'

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
  if (u.role === 'admin' || u.role === 'management' || u.role === 'superadmin') return 'admin'
  return 'home'
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading')
  const [screenHistory, setScreenHistory] = useState<Screen[]>(['loading'])
  const [user, setUser] = useState<UserInfo | null>(null)
  const [logoUrl, setLogoUrl] = useState('')
  const [tenantName, setTenantName] = useState('')
  const [canton, setCanton] = useState('ZH')
  const [berichtType, setBerichtType] = useState<BerichtType>('monthly')
  const [isOffline, setIsOffline] = useState(!navigator.onLine)

  // Wrap setScreen to push browser history entries for back-button support in PWA
  const navigateTo = useCallback((newScreen: Screen) => {
    setScreen(newScreen)
    setScreenHistory(prev => [...prev, newScreen])
    window.history.pushState({ screen: newScreen }, '')
  }, [])

  // Handle Android/PWA back button via popstate
  useEffect(() => {
    const handlePopState = () => {
      setScreenHistory(prev => {
        if (prev.length <= 1) {
          // No history left — push a dummy state so the app doesn't exit
          window.history.pushState({ screen: prev[0] }, '')
          return prev
        }
        const next = [...prev]
        next.pop()
        const previousScreen = next[next.length - 1]
        setScreen(previousScreen)
        return next
      })
    }
    window.addEventListener('popstate', handlePopState)
    // Push an initial state so the first back press triggers popstate instead of exiting
    window.history.pushState({ screen: 'loading' }, '')
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    const goOnline = () => setIsOffline(false)
    const goOffline = () => setIsOffline(true)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

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
      setCanton(info.canton || 'ZH')
    } catch (err) {
      console.warn('[Branding] Fehler beim Laden:', err)
    }
  }, [])

  // For logout/auth-reset: clears history and navigates
  const resetTo = useCallback((s: Screen) => {
    setScreen(s)
    setScreenHistory([s])
    window.history.replaceState({ screen: s }, '')
  }, [])

  useEffect(() => {
    Promise.all([
      getMe().then(u => u).catch(err => ({ error: err })),
      loadBranding(),
    ]).then(([userResult]) => {
      if ('error' in (userResult as object)) {
        resetTo(hasStoredIdentity ? 'login' : 'pin')
      } else {
        const u = userResult as UserInfo
        setUser(u)
        resetTo(nextScreenAfterLogin(u))
      }
    })
  }, [])

  const offlineBanner = isOffline ? (
    <div style={{
      position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)',
      width: '100%', maxWidth: 480, zIndex: 9999,
      background: '#f59e0b', color: '#1a1a1a',
      textAlign: 'center', padding: '6px 12px',
      fontSize: '0.85rem', fontWeight: 600,
    }}>
      Kein Internet – Offline-Modus
    </div>
  ) : null

  if (screen === 'loading') {
    return (
      <>
        {offlineBanner}
        <div className="loading-screen">
          <div className="loading-logo">
            <LogoSvg />
          </div>
          <p className="loading-text">Laden…</p>
        </div>
      </>
    )
  }

  let inner: React.ReactNode = null

  const handleLoggedOut = useCallback(() => {
    setUser(null)
    resetTo(hasStoredIdentity ? 'login' : 'pin')
  }, [resetTo, hasStoredIdentity])

  if (screen === 'pin') {
    inner = (
      <PinScreen
        logoUrl={logoUrl}
        onLoggedIn={() => {
          getMe().then(u => { setUser(u); loadBranding(); resetTo(nextScreenAfterLogin(u)) }).catch(() => resetTo('pin'))
        }}
      />
    )
  } else if (screen === 'login') {
    inner = (
      <LoginScreen
        logoUrl={logoUrl}
        onLoggedIn={() => {
          getMe().then(u => { setUser(u); loadBranding(); resetTo(nextScreenAfterLogin(u)) }).catch(() => resetTo('pin'))
        }}
      />
    )
  } else if (screen === 'consent' && user) {
    inner = (
      <ConsentScreen
        logoUrl={logoUrl}
        displayName={user.display_name}
        onAccepted={() => {
          getMe().then(u => { setUser(u); resetTo('home') }).catch(() => resetTo('home'))
        }}
      />
    )
  } else if (screen === 'home' && user) {
    inner = (
      <HomeScreen
        displayName={user.display_name}
        logoUrl={logoUrl}
        role={user.role}
        onNavRapport={() => navigateTo('rapport')}
        onNavArbeitszeit={() => navigateTo('arbeitszeit')}
        onNavProjekte={() => navigateTo('projekte')}
        onNavProfile={() => navigateTo('profile')}
        onLoggedOut={handleLoggedOut}
        onSwitchToAdmin={(user.role === 'admin' || user.role === 'management' || user.role === 'superadmin') ? () => navigateTo('admin') : undefined}
      />
    )
  } else if (screen === 'profile' && user) {
    inner = (
      <ProfileScreen
        displayName={user.display_name}
        email={user.email}
        role={user.role}
        tenantName={tenantName || localStorage.getItem('tenantSlug') || ''}
        logoUrl={logoUrl}
        onBack={() => navigateTo('home')}
        onLoggedOut={handleLoggedOut}
      />
    )
  } else if (screen === 'rapport' && user) {
    if (user.role === 'user_light') { resetTo('home'); return null }
    inner = (
      <ChatScreen
        displayName={user.display_name}
        logoUrl={logoUrl}
        activeNav="rapport"
        onNavHome={() => navigateTo('home')}
        onNavArbeitszeit={() => navigateTo('arbeitszeit')}
        onNavProjekte={() => navigateTo('projekte')}
        onNavProfile={() => navigateTo('profile')}
        onLoggedOut={handleLoggedOut}
      />
    )
  } else if (screen === 'arbeitszeit' && user) {
    inner = (
      <ArbeitsZeitScreen
        displayName={user.display_name}
        logoUrl={logoUrl}
        onNavHome={() => navigateTo('home')}
        onNavRapport={() => navigateTo('rapport')}
        onNavProjekte={() => navigateTo('projekte')}
        onNavProfile={() => navigateTo('profile')}
        onLoggedOut={handleLoggedOut}
        onOpenBericht={(type) => { setBerichtType(type); navigateTo('bericht') }}
        onNavAbsenzen={() => navigateTo('absenzen')}
      />
    )
  } else if (screen === 'absenzen' && user) {
    inner = (
      <AbsenzenScreen
        logoUrl={logoUrl}
        onBack={() => navigateTo('arbeitszeit')}
        onNavHome={() => navigateTo('home')}
        onNavRapport={() => navigateTo('rapport')}
        onNavProfile={() => navigateTo('profile')}
        onLoggedOut={handleLoggedOut}
      />
    )
  } else if (screen === 'projekte' && user) {
    if (user.role === 'user_light') { resetTo('home'); return null }
    inner = (
      <ProjekteScreen
        logoUrl={logoUrl}
        onNavHome={() => navigateTo('home')}
        onNavRapport={() => navigateTo('rapport')}
        onNavArbeitszeit={() => navigateTo('arbeitszeit')}
        onNavProfile={() => navigateTo('profile')}
        onLoggedOut={handleLoggedOut}
      />
    )
  } else if (screen === 'bericht' && user) {
    inner = (
      <BerichtScreen
        berichtType={berichtType}
        logoUrl={logoUrl}
        onBack={() => navigateTo('arbeitszeit')}
        onNavHome={() => navigateTo('home')}
        onNavRapport={() => navigateTo('rapport')}
        onNavProfile={() => navigateTo('profile')}
        onLoggedOut={handleLoggedOut}
      />
    )
  } else if (screen === 'admin' && user) {
    inner = (
      <AdminApp
        user={user}
        logoUrl={logoUrl}
        tenantName={tenantName || localStorage.getItem('tenantSlug') || ''}
        canton={canton}
        onLoggedOut={handleLoggedOut}
        onSwitchToUser={() => navigateTo('home')}
      />
    )
  }

  return (
    <>
      {offlineBanner}
      {inner}
    </>
  )
}
