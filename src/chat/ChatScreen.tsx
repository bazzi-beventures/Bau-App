import { useEffect, useRef, useState } from 'react'
import { sendMessage, sendVoice, ChatResponse } from '../api/chat'
import { ApiError } from '../api/client'
import MessageBubble from './MessageBubble'
import ChatInput from './ChatInput'

interface Message {
  id: number
  role: 'user' | 'bot'
  text: string
  transcription?: string
  timestamp: string
}

interface Props {
  displayName: string
  activeNav: 'rapport' | 'arbeitszeit'
  onNavHome: () => void
  onNavArbeitszeit: () => void
  onLoggedOut: () => void
}

let _idCounter = 0
function nextId() { return ++_idCounter }

function now() {
  return new Date().toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })
}

export default function ChatScreen({ displayName, activeNav, onNavHome, onNavArbeitszeit, onLoggedOut }: Props) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: nextId(),
      role: 'bot',
      text: `Hallo ${displayName.split(' ')[0]}! Sage z.B. „Neuer Rapport", „Foto hochladen" oder stell eine Frage.`,
      timestamp: now(),
    },
  ])
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function addMessage(msg: Omit<Message, 'id'>) {
    setMessages(prev => [...prev, { ...msg, id: nextId() }])
  }

  async function handleResponse(userText: string, promise: Promise<ChatResponse>) {
    addMessage({ role: 'user', text: userText, timestamp: now() })
    setLoading(true)
    try {
      const res = await promise
      addMessage({
        role: 'bot',
        text: res.reply,
        transcription: res.transcription,
        timestamp: now(),
      })
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onLoggedOut()
        return
      }
      addMessage({ role: 'bot', text: 'Fehler beim Senden. Bitte erneut versuchen.', timestamp: now() })
    } finally {
      setLoading(false)
    }
  }

  function onSendText(text: string) {
    handleResponse(text, sendMessage(text))
  }

  function onSendVoice(blob: Blob) {
    handleResponse('🎤 Sprachnachricht', sendVoice(blob))
  }

  return (
    <div className="chat-screen">
      {/* Header */}
      <div className="chat-header">
        <div className="back-btn" onClick={onNavHome}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </div>
        <div>
          <div className="chat-header-title">Rapporte</div>
          <div className="chat-header-sub">Rapport Bot · KI-Assistent</div>
        </div>
      </div>

      {/* Messages */}
      <div className="chat-messages">
        {messages.map(msg => (
          <MessageBubble
            key={msg.id}
            role={msg.role}
            text={msg.text}
            transcription={msg.transcription}
            timestamp={msg.timestamp}
          />
        ))}
        {loading && (
          <div className="msg-row msg-row-bot">
            <div className="typing-dot-row">
              <span /><span /><span />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <ChatInput onSendText={onSendText} onSendVoice={onSendVoice} disabled={loading} />

      {/* Nav bar */}
      <div className="nav-bar">
        <div className="nav-item" onClick={onNavHome}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          </svg>
          <span>Home</span>
        </div>
        <div className={`nav-item ${activeNav === 'rapport' ? 'active' : ''}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke={activeNav === 'rapport' ? '#3b82f6' : 'currentColor'} strokeWidth="1.8">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          <span>Rapporte</span>
        </div>
        <div className={`nav-item ${activeNav === 'arbeitszeit' ? 'active' : ''}`} onClick={onNavArbeitszeit}>
          <svg viewBox="0 0 24 24" fill="none" stroke={activeNav === 'arbeitszeit' ? '#22c55e' : 'currentColor'} strokeWidth="1.8">
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
