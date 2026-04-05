import { useState } from 'react'
import { sendMessage } from '../api/chat'
import { ApiError } from '../api/client'

interface Props {
  displayName: string
  onNavHome: () => void
  onNavRapport: () => void
  onLoggedOut: () => void
}

interface Action {
  label: string
  sub: string
  msg: string
  iconColor: string
  iconClass: string
  icon: React.ReactNode
}

const ACTIONS: Action[] = [
  {
    label: 'Einstempeln',
    sub: 'Arbeitsbeginn erfassen',
    msg: 'Ich starte',
    iconColor: '#22c55e',
    iconClass: 'menu-icon-green',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="1.8">
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
      </svg>
    ),
  },
  {
    label: 'Ausstempeln',
    sub: 'Arbeitsende erfassen',
    msg: 'Feierabend',
    iconColor: '#22c55e',
    iconClass: 'menu-icon-green',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="1.8">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
        <line x1="8" y1="17" x2="16" y2="17"/>
      </svg>
    ),
  },
  {
    label: 'Pause starten',
    sub: 'Beginn der Pause',
    msg: 'Pause',
    iconColor: '#f59e0b',
    iconClass: 'menu-icon-amber',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.8">
        <path d="M18 8h1a4 4 0 0 1 0 8h-1"/>
        <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/>
        <line x1="6" y1="1" x2="6" y2="4"/>
        <line x1="10" y1="1" x2="10" y2="4"/>
        <line x1="14" y1="1" x2="14" y2="4"/>
      </svg>
    ),
  },
  {
    label: 'Pause beenden',
    sub: 'Ende der Pause',
    msg: 'Pause Ende',
    iconColor: '#f59e0b',
    iconClass: 'menu-icon-amber',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.8">
        <path d="M18 8h1a4 4 0 0 1 0 8h-1"/>
        <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/>
        <polyline points="10 13 12 15 16 11"/>
      </svg>
    ),
  },
  {
    label: 'Absenz melden',
    sub: 'Krankheit, Unfall, etc.',
    msg: 'Ich bin krank',
    iconColor: '#f87171',
    iconClass: 'menu-icon-red',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="1.8">
        <rect x="3" y="4" width="18" height="18" rx="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    ),
  },
  {
    label: 'Ferienantrag',
    sub: 'Urlaub beantragen',
    msg: 'Ich möchte Ferien nehmen',
    iconColor: '#22c55e',
    iconClass: 'menu-icon-green',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="1.8">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      </svg>
    ),
  },
  {
    label: 'Überstunden',
    sub: 'Saldo abfragen',
    msg: 'Wie viele Überstunden habe ich?',
    iconColor: '#22c55e',
    iconClass: 'menu-icon-green',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="1.8">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
      </svg>
    ),
  },
]

export default function ArbeitsZeitScreen({ onNavHome, onNavRapport, onLoggedOut }: Props) {
  const [result, setResult] = useState<{ text: string; isError: boolean } | null>(null)
  const [loadingIdx, setLoadingIdx] = useState<number | null>(null)

  async function handleAction(action: Action, idx: number) {
    setResult(null)
    setLoadingIdx(idx)
    try {
      const res = await sendMessage(action.msg)
      setResult({ text: res.reply, isError: false })
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onLoggedOut()
        return
      }
      setResult({ text: 'Fehler beim Senden. Bitte erneut versuchen.', isError: true })
    } finally {
      setLoadingIdx(null)
    }
  }

  return (
    <div className="app-screen">
      {/* Header */}
      <div className="inner-header">
        <div className="back-btn" onClick={onNavHome}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </div>
        <div className="inner-title">Arbeitszeit</div>
      </div>

      {/* Banner */}
      <div className="context-banner context-banner-green">
        <div className="banner-tag banner-tag-green">HR Assistent</div>
        <div className="banner-text">Hier verwaltest du deine Arbeitszeiten, Pausen und Abwesenheiten.</div>
      </div>

      {/* Result */}
      {result && (
        <div className={`action-result${result.isError ? ' action-result-error' : ''}`}>
          {result.text}
        </div>
      )}

      {/* Actions */}
      <div className="menu-list">
        {ACTIONS.map((action, idx) => (
          <div
            key={action.label}
            className="menu-item"
            onClick={() => loadingIdx === null && handleAction(action, idx)}
            style={{ opacity: loadingIdx !== null && loadingIdx !== idx ? 0.5 : 1 }}
          >
            <div className={`menu-icon ${action.iconClass}`}>
              {action.icon}
            </div>
            <div className="menu-text">
              <div className="menu-label">
                {loadingIdx === idx ? '…' : action.label}
              </div>
              <div className="menu-sub">{action.sub}</div>
            </div>
            <div className="menu-chevron">›</div>
          </div>
        ))}
      </div>

      {/* Nav bar */}
      <div className="nav-bar">
        <div className="nav-item" onClick={onNavHome}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          </svg>
          <span>Home</span>
        </div>
        <div className="nav-item" onClick={onNavRapport}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          <span>Rapporte</span>
        </div>
        <div className="nav-item active">
          <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="1.8">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          <span>Zeit</span>
        </div>
        <div className="nav-item" onClick={onLoggedOut}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
          <span>Profil</span>
        </div>
      </div>
    </div>
  )
}
