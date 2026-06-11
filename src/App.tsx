import React, { useCallback, useEffect, useRef, useState } from 'react'
import { getMe, getTenantInfo, TenantInfo, UserInfo } from './api/auth'
import { ApiError, apiUrl, resetSessionExpiredFlag } from './api/client'
import { SK } from './api/storageKeys'
import PinScreen from './auth/PinScreen'
import LoginScreen from './auth/LoginScreen'
import ConsentScreen from './auth/ConsentScreen'
import HomeScreen from './screens/HomeScreen'
import ChatScreen from './chat/ChatScreen'
import ArbeitsZeitScreen from './screens/ArbeitsZeitScreen'
import ProfileScreen from './screens/ProfileScreen'
import BerichtScreen, { BerichtType } from './screens/BerichtScreen'
import ProjekteScreen from './screens/ProjekteScreen'
import ProjektEntwurfScreen from './screens/ProjektEntwurfScreen'
import AbsenzenScreen from './screens/AbsenzenScreen'
import AdminApp from './admin/AdminApp'
import HelpBot from './shared/HelpBot'
import { applyTheme, loadTheme, useTheme } from './theme'

type Screen = 'loading' | 'login' | 'pin' | 'consent' | 'home' | 'rapport' | 'arbeitszeit' | 'profile' | 'bericht' | 'projekte' | 'projektEntwurf' | 'admin' | 'absenzen' | 'help'

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
  const [logoUrlDark, setLogoUrlDark] = useState('')
  const [tenantName, setTenantName] = useState('')
  const [canton, setCanton] = useState('ZH')
  const [berichtType, setBerichtType] = useState<BerichtType>('monthly')
  const [rapportInitialMessage, setRapportInitialMessage] = useState<string | null>(null)
  const [isOffline, setIsOffline] = useState(!navigator.onLine)
  const [swUpdateReady, setSwUpdateReady] = useState(false)
  const [pushMsg, setPushMsg] = useState<{ title: string; body: string } | null>(null)
  const [authExpiredAt, setAuthExpiredAt] = useState<number | null>(null)
  const screenRef = useRef(screen)
  const theme = useTheme()
  // Im Dark-Theme die weiße Logo-Variante nutzen, falls vorhanden — sonst das
  // helle Standard-Logo. Reagiert über useTheme() automatisch auf Toggles.
  const effectiveLogo = theme === 'dark' && logoUrlDark ? logoUrlDark : logoUrl

  useEffect(() => {
    applyTheme(loadTheme())
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

  useEffect(() => {
    const onUpdate = () => setSwUpdateReady(true)
    window.addEventListener('sw-update-ready', onUpdate)
    return () => window.removeEventListener('sw-update-ready', onUpdate)
  }, [])

  // Push-Nachricht vom Service Worker → In-App-Banner (App war offen oder im
  // Hintergrund). Der SW postet {type:'push', title, body, url}.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === 'push') {
        setPushMsg({ title: e.data.title || 'Mitteilung', body: e.data.body || '' })
      }
    }
    navigator.serviceWorker.addEventListener('message', onMsg)
    return () => navigator.serviceWorker.removeEventListener('message', onMsg)
  }, [])

  // Cold-Start: App wurde durch Antippen einer Benachrichtigung geöffnet,
  // die Nachricht steckt im URL-Hash (#notif=...). Anzeigen und Hash entfernen.
  useEffect(() => {
    const m = window.location.hash.match(/notif=([^&]+)/)
    if (!m) return
    try {
      const p = JSON.parse(decodeURIComponent(m[1]))
      setPushMsg({ title: p.title || 'Mitteilung', body: p.body || '' })
    } catch { /* ignore */ }
    history.replaceState(null, '', window.location.pathname + window.location.search)
  }, [])

  useEffect(() => {
    const onAuthExpired = () => {
      const storedIdentity = Boolean(
        localStorage.getItem(SK.AUTHORIZED_USER_ID) && localStorage.getItem(SK.TENANT_SLUG)
      )
      setUser(null)
      setScreen(storedIdentity ? 'login' : 'pin')
      setAuthExpiredAt(Date.now())
    }
    window.addEventListener('auth:expired', onAuthExpired)
    return () => window.removeEventListener('auth:expired', onAuthExpired)
  }, [])

  useEffect(() => {
    if (authExpiredAt === null) return
    const t = window.setTimeout(() => setAuthExpiredAt(null), 8000)
    return () => window.clearTimeout(t)
  }, [authExpiredAt])

  // Keep ref in sync so the popstate handler always sees the latest screen
  useEffect(() => { screenRef.current = screen }, [screen])

  // Push a history entry on every screen change so the back button has something to pop
  useEffect(() => {
    history.pushState(null, '', window.location.href)
  }, [screen])

  // Hardware/browser back button → navigate to home instead of closing the app
  useEffect(() => {
    const onPopState = () => {
      history.pushState(null, '', window.location.href) // re-add entry so next back press still works
      const s = screenRef.current
      if (s !== 'home' && s !== 'admin' && s !== 'pin' && s !== 'login' && s !== 'loading') {
        setScreen('home')
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const hasStoredIdentity = Boolean(
    localStorage.getItem(SK.AUTHORIZED_USER_ID) && localStorage.getItem(SK.TENANT_SLUG)
  )

  const loadBranding = useCallback(async () => {
    const slug = localStorage.getItem(SK.TENANT_SLUG) ?? ''
    if (!slug) return
    try {
      const info = await getTenantInfo(slug)
      applyTenantBranding(info)
      // logo_url ist ein relativer Proxy-Pfad (/pwa/tenant-logo?...). Das Backend
      // liegt auf anderer Origin als die PWA → absolut machen, damit <img src>
      // aufs Backend zeigt und nicht auf die PWA-Origin.
      setLogoUrl(info.logo_url ? apiUrl(info.logo_url) : '')
      setLogoUrlDark(info.logo_url_dark ? apiUrl(info.logo_url_dark) : '')
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
      position: 'fixed', top: 'env(safe-area-inset-top, 0px)', left: '50%', transform: 'translateX(-50%)',
      width: '100%', maxWidth: 480, zIndex: 9999,
      background: '#f59e0b', color: '#1a1a1a',
      textAlign: 'center', padding: '6px 12px',
      fontSize: '0.85rem', fontWeight: 600,
    }}>
      Kein Internet – Offline-Modus
    </div>
  ) : null

  const authExpiredBanner = authExpiredAt !== null ? (
    <div style={{
      position: 'fixed',
      top: `calc(${isOffline ? 32 : 0}px + env(safe-area-inset-top, 0px))`,
      left: '50%', transform: 'translateX(-50%)',
      width: '100%', maxWidth: 480, zIndex: 9999,
      background: 'var(--accent-blue, #1e3a5f)', color: '#fff',
      textAlign: 'center', padding: '8px 12px',
      fontSize: '0.85rem', fontWeight: 600,
      boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
    }}>
      Sitzung abgelaufen – bitte erneut anmelden.
    </div>
  ) : null

  const updateBanner = swUpdateReady ? (
    <div style={{
      position: 'fixed',
      bottom: 'calc(64px + env(safe-area-inset-bottom, 0px))',
      left: '50%', transform: 'translateX(-50%)',
      width: 'calc(100% - 32px)', maxWidth: 448, zIndex: 9998,
      background: '#1e3a5f', color: '#fff',
      borderRadius: 10, padding: '10px 16px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
      fontSize: '0.875rem',
    }}>
      <span>Neue Version verfügbar</span>
      <button
        onClick={() => window.location.reload()}
        style={{
          background: '#22c55e', color: '#fff', border: 'none',
          borderRadius: 6, padding: '5px 12px', cursor: 'pointer',
          fontWeight: 600, fontSize: '0.85rem',
        }}
      >
        Aktualisieren
      </button>
    </div>
  ) : null

  const pushBanner = pushMsg ? (
    <div style={{
      position: 'fixed',
      top: `calc(${(isOffline ? 32 : 0) + (authExpiredAt !== null ? 40 : 0) + 8}px + env(safe-area-inset-top, 0px))`,
      left: '50%', transform: 'translateX(-50%)',
      width: 'calc(100% - 24px)', maxWidth: 448, zIndex: 9999,
      background: 'var(--accent-blue, #1e3a5f)', color: '#fff',
      borderRadius: 12, padding: '12px 14px',
      display: 'flex', alignItems: 'flex-start', gap: 12,
      boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
    }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="22" height="22" style={{ flexShrink: 0, marginTop: 1 }}>
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{pushMsg.title}</div>
        {pushMsg.body && (
          <div style={{ fontSize: '0.85rem', marginTop: 2, opacity: 0.95, wordBreak: 'break-word' }}>
            {pushMsg.body}
          </div>
        )}
      </div>
      <button
        onClick={() => setPushMsg(null)}
        aria-label="Schliessen"
        style={{
          background: 'transparent', border: 'none', color: '#fff',
          fontSize: '1.3rem', lineHeight: 1, cursor: 'pointer',
          padding: '0 2px', flexShrink: 0, opacity: 0.85,
        }}
      >
        ×
      </button>
    </div>
  ) : null

  if (screen === 'loading') {
    return (
      <>
        {offlineBanner}
        {authExpiredBanner}
        {pushBanner}
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
        logoUrl={effectiveLogo}
        onLoggedIn={() => {
          resetSessionExpiredFlag()
          setAuthExpiredAt(null)
          getMe().then(u => { setUser(u); loadBranding(); setScreen(nextScreenAfterLogin(u)) }).catch(() => setScreen('pin'))
        }}
      />
    )
  } else if (screen === 'login') {
    inner = (
      <LoginScreen
        logoUrl={effectiveLogo}
        onLoggedIn={() => {
          resetSessionExpiredFlag()
          setAuthExpiredAt(null)
          getMe().then(u => { setUser(u); loadBranding(); setScreen(nextScreenAfterLogin(u)) }).catch(() => setScreen('pin'))
        }}
      />
    )
  } else if (screen === 'consent' && user) {
    inner = (
      <ConsentScreen
        logoUrl={effectiveLogo}
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
        logoUrl={effectiveLogo}
        role={user.role}
        enabledModules={user.enabled_modules ?? []}
        onNavRapport={() => setScreen('rapport')}
        onNavArbeitszeit={() => setScreen('arbeitszeit')}
        onNavProjekte={() => setScreen('projekte')}
        onNavProjektEntwurf={() => setScreen('projektEntwurf')}
        onNavProfile={() => setScreen('profile')}
        onNavHelp={() => setScreen('help')}
        onLoggedOut={() => { setUser(null); setScreen(hasStoredIdentity ? 'login' : 'pin') }}
        onSwitchToAdmin={(user.role === 'admin' || user.role === 'management' || user.role === 'superadmin') ? () => setScreen('admin') : undefined}
      />
    )
  } else if (screen === 'help' && user) {
    if (!user.enabled_modules?.includes('help_bot')) { setScreen('home'); return null }
    inner = (
      <div className="app-screen" style={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}>
        <HelpBot header={{ title: 'Hilfe', onBack: () => setScreen('home') }} />
      </div>
    )
  } else if (screen === 'profile' && user) {
    inner = (
      <ProfileScreen
        displayName={user.display_name}
        email={user.email}
        role={user.role}
        tenantName={tenantName || localStorage.getItem(SK.TENANT_SLUG) || ''}
        logoUrl={effectiveLogo}
        onBack={() => setScreen('home')}
        onLoggedOut={() => { setUser(null); setScreen(hasStoredIdentity ? 'login' : 'pin') }}
      />
    )
  } else if (screen === 'rapport' && user) {
    if (user.role === 'user_light') { setScreen('home'); return null }
    if (!user.enabled_modules?.includes('ai')) { setScreen('home'); return null }
    inner = (
      <ChatScreen
        displayName={user.display_name}
        user={user}
        logoUrl={effectiveLogo}
        activeNav="rapport"
        initialMessage={rapportInitialMessage}
        onInitialMessageConsumed={() => setRapportInitialMessage(null)}
        onNavHome={() => setScreen('home')}
        onNavArbeitszeit={() => setScreen('arbeitszeit')}
        onNavProjekte={() => setScreen('projekte')}
        onNavProfile={() => setScreen('profile')}
        onLoggedOut={() => { setUser(null); setScreen(hasStoredIdentity ? 'login' : 'pin') }}
      />
    )
  } else if (screen === 'arbeitszeit' && user) {
    if (!user.enabled_modules?.includes('timekeeping')) { setScreen('home'); return null }
    inner = (
      <ArbeitsZeitScreen
        displayName={user.display_name}
        logoUrl={effectiveLogo}
        role={user.role}
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
    if (!user.enabled_modules?.includes('hr')) { setScreen('home'); return null }
    inner = (
      <AbsenzenScreen
        logoUrl={effectiveLogo}
        canton={canton}
        onBack={() => setScreen('arbeitszeit')}
        onNavHome={() => setScreen('home')}
        onNavRapport={() => setScreen('rapport')}
        onNavProfile={() => setScreen('profile')}
        onLoggedOut={() => { setUser(null); setScreen(hasStoredIdentity ? 'login' : 'pin') }}
      />
    )
  } else if (screen === 'projekte' && user) {
    if (user.role === 'user_light') { setScreen('home'); return null }
    inner = (
      <ProjekteScreen
        logoUrl={effectiveLogo}
        onNavHome={() => setScreen('home')}
        onNavRapport={() => setScreen('rapport')}
        onStartRapport={(projectName) => {
          setRapportInitialMessage(`Neuer Rapport für Projekt "${projectName}"`)
          setScreen('rapport')
        }}
        onNavArbeitszeit={() => setScreen('arbeitszeit')}
        onNavProfile={() => setScreen('profile')}
        onLoggedOut={() => { setUser(null); setScreen(hasStoredIdentity ? 'login' : 'pin') }}
      />
    )
  } else if (screen === 'projektEntwurf' && user) {
    if (user.role === 'user_light') { setScreen('home'); return null }
    inner = (
      <ProjektEntwurfScreen
        logoUrl={effectiveLogo}
        onNavHome={() => setScreen('home')}
        onLoggedOut={() => { setUser(null); setScreen(hasStoredIdentity ? 'login' : 'pin') }}
      />
    )
  } else if (screen === 'bericht' && user) {
    if (!user.enabled_modules?.includes('hr')) { setScreen('home'); return null }
    inner = (
      <BerichtScreen
        berichtType={berichtType}
        logoUrl={effectiveLogo}
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
        logoUrl={effectiveLogo}
        tenantName={tenantName || localStorage.getItem(SK.TENANT_SLUG) || ''}
        canton={canton}
        onLoggedOut={() => { setUser(null); setScreen(hasStoredIdentity ? 'login' : 'pin') }}
        onSwitchToUser={() => setScreen('home')}
      />
    )
  }

  return (
    <>
      {offlineBanner}
      {authExpiredBanner}
      {pushBanner}
      {updateBanner}
      {inner}
    </>
  )
}
