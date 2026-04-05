import { useEffect, useState } from 'react'
import { getMe, UserInfo } from './api/auth'
import { ApiError } from './api/client'
import PinScreen from './auth/PinScreen'
import RegisterScreen from './auth/RegisterScreen'
import LoginScreen from './auth/LoginScreen'
import HomeScreen from './screens/HomeScreen'
import ChatScreen from './chat/ChatScreen'
import ArbeitsZeitScreen from './screens/ArbeitsZeitScreen'

type Screen = 'loading' | 'login' | 'pin' | 'register' | 'home' | 'rapport' | 'arbeitszeit'

interface PinState {
  tenantSlug: string
  authorizedUserId: string
  displayName: string
  pin: string
}

// Logo SVG shared across auth screens
export function LogoSvg() {
  return (
    <svg viewBox="0 0 28 28" fill="none" stroke="#3b82f6" strokeWidth="1.8">
      <path d="M14 3L25 9v10L14 25 3 19V9z"/>
      <path d="M14 8v12M9 11l5 3 5-3"/>
    </svg>
  )
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading')
  const [user, setUser] = useState<UserInfo | null>(null)
  const [pinState, setPinState] = useState<PinState | null>(null)

  const hasStoredIdentity = Boolean(
    localStorage.getItem('authorizedUserId') && localStorage.getItem('tenantSlug')
  )

  useEffect(() => {
    getMe()
      .then(u => {
        setUser(u)
        setScreen('home')
      })
      .catch(err => {
        if (err instanceof ApiError && err.status === 401) {
          setScreen(hasStoredIdentity ? 'login' : 'pin')
        } else {
          setScreen(hasStoredIdentity ? 'login' : 'pin')
        }
      })
  }, [])

  if (screen === 'loading') {
    return (
      <div className="loading-screen">
        <div className="auth-logo" style={{ margin: 0 }}>
          <LogoSvg />
        </div>
        <p className="loading-text">Laden…</p>
      </div>
    )
  }

  if (screen === 'pin') {
    return (
      <PinScreen
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
        onRegistered={() => {
          getMe().then(u => { setUser(u); setScreen('home') }).catch(() => setScreen('login'))
        }}
      />
    )
  }

  if (screen === 'login') {
    return (
      <LoginScreen
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
        onLoggedOut={() => { setUser(null); setScreen(hasStoredIdentity ? 'login' : 'pin') }}
      />
    )
  }

  return null
}
