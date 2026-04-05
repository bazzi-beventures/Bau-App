import { useEffect, useState } from 'react'
import { getMe, UserInfo } from './api/auth'
import { ApiError } from './api/client'
import PinScreen from './auth/PinScreen'
import RegisterScreen from './auth/RegisterScreen'
import LoginScreen from './auth/LoginScreen'
import ChatScreen from './chat/ChatScreen'

type Screen = 'loading' | 'login' | 'pin' | 'register' | 'chat'

interface PinState {
  tenantSlug: string
  authorizedUserId: string
  displayName: string
  pin: string
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading')
  const [user, setUser] = useState<UserInfo | null>(null)
  const [pinState, setPinState] = useState<PinState | null>(null)

  const hasStoredIdentity = Boolean(
    localStorage.getItem('authorizedUserId') && localStorage.getItem('tenantSlug')
  )

  useEffect(() => {
    // Try to restore session from cookie
    getMe()
      .then(u => {
        setUser(u)
        setScreen('chat')
      })
      .catch(err => {
        if (err instanceof ApiError && err.status === 401) {
          // Session expired or not set — go to login or pin
          setScreen(hasStoredIdentity ? 'login' : 'pin')
        } else {
          setScreen(hasStoredIdentity ? 'login' : 'pin')
        }
      })
  }, [])

  if (screen === 'loading') {
    return (
      <div style={loadingStyle}>
        <div style={{ fontSize: '3rem' }}>🏗️</div>
        <p style={{ color: '#65676b', marginTop: '0.5rem' }}>Laden…</p>
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
          // After registration, server set cookie — reload user
          getMe().then(u => { setUser(u); setScreen('chat') }).catch(() => setScreen('login'))
        }}
      />
    )
  }

  if (screen === 'login') {
    return (
      <LoginScreen
        onLoggedIn={() => {
          getMe().then(u => { setUser(u); setScreen('chat') }).catch(() => setScreen('pin'))
        }}
      />
    )
  }

  if (screen === 'chat' && user) {
    return (
      <ChatScreen
        displayName={user.display_name}
        onLoggedOut={() => {
          setUser(null)
          setScreen(hasStoredIdentity ? 'login' : 'pin')
        }}
      />
    )
  }

  return null
}

const loadingStyle: React.CSSProperties = {
  minHeight: '100dvh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#f0f2f5',
}
