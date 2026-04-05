import { useEffect, useRef, useState } from 'react'
import { sendMessage, sendVoice, ChatResponse } from '../api/chat'
import { logout } from '../api/auth'
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
  onLoggedOut: () => void
}

let _idCounter = 0
function nextId() { return ++_idCounter }

function now() {
  return new Date().toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })
}

export default function ChatScreen({ displayName, onLoggedOut }: Props) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: nextId(),
      role: 'bot',
      text: `Hallo ${displayName}! 👋\nSage z.B. „Ich starte", „Pause", „Feierabend" oder „Ich bin krank".`,
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

  async function handleResponse(userText: string, promise: Promise<ChatResponse>, transcription?: string) {
    addMessage({ role: 'user', text: transcription ? `🎤 ${userText}` : userText, timestamp: now(), transcription: undefined })
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
      addMessage({ role: 'bot', text: '⚠️ Fehler beim Senden. Bitte erneut versuchen.', timestamp: now() })
    } finally {
      setLoading(false)
    }
  }

  function onSendText(text: string) {
    handleResponse(text, sendMessage(text))
  }

  function onSendVoice(blob: Blob) {
    handleResponse('(Sprachnachricht)', sendVoice(blob))
  }

  async function handleLogout() {
    await logout()
    onLoggedOut()
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.headerTitle}>🏗️ Bau-App</span>
        <span style={styles.headerName}>{displayName}</span>
        <button style={styles.logoutBtn} onClick={handleLogout}>Abmelden</button>
      </div>

      {/* Message list */}
      <div style={styles.messageList}>
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
          <div style={{ paddingInline: '0.75rem' }}>
            <div style={styles.typingIndicator}>
              <span />
              <span />
              <span />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <ChatInput onSendText={onSendText} onSendVoice={onSendVoice} disabled={loading} />
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100dvh',
    background: '#f0f2f5',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.75rem 1rem',
    background: '#1a73e8',
    color: '#fff',
    paddingTop: 'calc(0.75rem + env(safe-area-inset-top, 0px))',
  },
  headerTitle: { fontWeight: 700, fontSize: '1rem', flex: 1 },
  headerName: { fontSize: '0.85rem', opacity: 0.85 },
  logoutBtn: {
    background: 'rgba(255,255,255,0.2)',
    border: 'none',
    color: '#fff',
    borderRadius: '0.4rem',
    padding: '0.3rem 0.6rem',
    fontSize: '0.8rem',
    cursor: 'pointer',
  },
  messageList: {
    flex: 1,
    overflowY: 'auto',
    paddingBlock: '0.75rem',
    display: 'flex',
    flexDirection: 'column',
  },
  typingIndicator: {
    display: 'inline-flex',
    gap: '4px',
    background: '#fff',
    padding: '0.6rem 0.9rem',
    borderRadius: '1.1rem',
    borderBottomLeftRadius: '0.25rem',
    boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
  },
}
