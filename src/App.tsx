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
  const [user, setUser] = useState<UserInfo | null>(null)
  const [logoUrl, setLogoUrl] = useState('')
  const [tenantName, setTenantName] = useState('')
  const [canton, setCanton] = useState('ZH')
  const [berichtType, setBerichtType] = useState<BerichtType>('monthly')
  const [isOffline, setIsOffline] = useState(!navigator.onLine)

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

  if (screen === 'pin') {
    inner = (
      <PinScreen
        logoUrl={logoUrl}
        onLoggedIn={() => {
          getMe().then(u => { setUser(u); loadBranding(); setScreen(nextScreenAfterLogin(u)) }).catch(() => setScreen('pin'))
        }}
      />
    )
  } else if (screen === 'login') {
    inner = (
      <LoginScreen
        logoUrl={logoUrl}
        onLoggedIn={() => {
          getMe().then(u => { setUser(u); loadBranding(); setScreen(nextScreenAfterLogin(u)) }).catch(() => setScreen('pin'))
        }}
      />
    )
  } else if (screen === 'consent' && user) {
    inner = (
      <ConsentScreen
        logoUrl={logoUrl}
        displayName={user.display_name}
        onAccepted={() => {
          getMe().then(u => { setUser(u); setScreen('home') }).catch(() => setScreen('home'))
        }}
      />
    )
  } else if (screen === 'home' && user) {
    inner = (
      <HomeScreen
        displayName={user.display_name}
        logoUrl={logoUrl}
        onNavRapport={() => setScreen('rapport')}
        onNavArbeitszeit={() => setScreen('arbeitszeit')}
        onNavProjekte={() => setScreen('projekte')}
        onNavProfile={() => setScreen('profile')}
        onLoggedOut={() => { setUser(null); setScreen(hasStoredIdentity ? 'login' : 'pin') }}
        onSwitchToAdmin={(user.role === 'admin' || user.role === 'management' || user.role === 'superadmin') ? () => setScreen('admin') : undefined}
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
        onBack={() => setScreen('home')}
        onLoggedOut={() => { setUser(null); setScreen(hasStoredIdentity ? 'login' : 'pin') }}
      />
    )
  } else if (screen === 'rapport' && user) {
    inner = (
      <ChatScreen
        displayName={user.display_name}
        logoUrl={logoUrl}
        activeNav="rapport"
        onNavHome={() => setScreen('home')}
        onNavArbeitszeit={() => setScreen('arbeitszeit')}
        onNavProjekte={() => setScreen('projekte')}
        onNavProfile={() => setScreen('profile')}
        onLoggedOut={() => { setUser(null); setScreen(hasStoredIdentity ? 'login' : 'pin') }}
      />
    )
  } else if (screen === 'arbeitszeit' && user) {
    inner = (
      <ArbeitsZeitScreen
        displayName={user.display_name}
        logoUrl={logoUrl}
        onNavHome={() => setScreen('home')}
        onNavRapport={() => setScreen('rapport')}
        onNavProjekte={() => setScreen('projekte')}
        onNavProfile={() => setScreen('profile')}
        onLoggedOut={() => { setUser(null); setScreen(hasStoredIdentity ? 'login' : 'pin') }}
        onOpenBericht={(type) => { setBerichtType(type); setScreen('bericht') }}
        onNavAbsenzen={() => setScreen('absenzen')}
      />
    )
  } else if (screen === 'absenzen' && user) {
    inner = (
      <AbsenzenScreen
        logoUrl={logoUrl}
        onBack={() => setScreen('arbeitszeit')}
        onNavHome={() => setScreen('home')}
        onNavRapport={() => setScreen('rapport')}
        onNavProfile={() => setScreen('profile')}
        onLoggedOut={() => { setUser(null); setScreen(hasStoredIdentity ? 'login' : 'pin') }}
      />
    )
  } else if (screen === 'projekte' && user) {
    inner = (
      <ProjekteScreen
        logoUrl={logoUrl}
        onNavHome={() => setScreen('home')}
        onNavRapport={() => setScreen('rapport')}
        onNavArbeitszeit={() => setScreen('arbeitszeit')}
        onNavProfile={() => setScreen('profile')}
        onLoggedOut={() => { setUser(null); setScreen(hasStoredIdentity ? 'login' : 'pin') }}
      />
    )
  } else if (screen === 'bericht' && user) {
    inner = (
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
  } else if (screen === 'admin' && user) {
    inner = (
      <AdminApp
        user={user}
        logoUrl={logoUrl}
        tenantName={tenantName || localStorage.getItem('tenantSlug') || ''}
        canton={canton}
        onLoggedOut={() => { setUser(null); setScreen(hasStoredIdentity ? 'login' : 'pin') }}
        onSwitchToUser={() => setScreen('home')}
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
