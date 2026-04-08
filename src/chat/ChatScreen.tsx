import { useEffect, useRef, useState } from 'react'
import { sendMessage, sendVoice, confirmReport, cancelReport, disambiguateMaterial, uploadPhoto, downloadRapportPdf, ChatResponse, DisambiguationOption } from '../api/chat'
import { ApiError } from '../api/client'
import MessageBubble from './MessageBubble'
import ChatInput from './ChatInput'
import SignaturePad from './SignaturePad'

interface Message {
  id: number
  role: 'user' | 'bot'
  text: string
  transcription?: string
  timestamp: string
  action_taken?: string | null
  disambiguation?: DisambiguationOption[]
}

interface Props {
  displayName: string
  logoUrl?: string
  activeNav: 'rapport' | 'arbeitszeit'
  onNavHome: () => void
  onNavArbeitszeit: () => void
  onNavProjekte: () => void
  onNavProfile: () => void
  onLoggedOut: () => void
}

let _idCounter = 0
function nextId() { return ++_idCounter }

function now() {
  return new Date().toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })
}

export default function ChatScreen({ displayName, logoUrl, activeNav, onNavHome, onNavArbeitszeit, onNavProjekte, onNavProfile, onLoggedOut }: Props) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: nextId(),
      role: 'bot',
      text: `Hallo ${displayName.split(' ')[0]}! Sage z.B. „Neuer Rapport", „Foto hochladen" oder stell eine Frage.`,
      timestamp: now(),
    },
  ])
  const [loading, setLoading] = useState(false)
  const [pendingConfirm, setPendingConfirm] = useState(false)
  const [pendingDisambiguation, setPendingDisambiguation] = useState(false)
  const [pendingQuoteQuestion, setPendingQuoteQuestion] = useState(false)
  const [pendingSignReportId, setPendingSignReportId] = useState<number | null>(null)
  const [downloadReportId, setDownloadReportId] = useState<number | null>(null)
  const [pdfDownloading, setPdfDownloading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function addMessage(msg: Omit<Message, 'id'>) {
    setMessages(prev => [...prev, { ...msg, id: nextId() }])
  }

  function handleActionState(res: ChatResponse) {
    if (res.action_taken === 'confirm_pending') {
      setPendingConfirm(true)
      setPendingDisambiguation(false)
      setPendingQuoteQuestion(false)
    } else if (res.action_taken === 'disambiguate') {
      setPendingDisambiguation(true)
      setPendingConfirm(false)
      setPendingQuoteQuestion(false)
    } else if (res.action_taken === 'quote_question') {
      setPendingQuoteQuestion(true)
      setPendingConfirm(false)
      setPendingDisambiguation(false)
    } else if (res.action_taken === 'report_saved' && res.report_id) {
      setPendingSignReportId(Number(res.report_id))
      setPendingConfirm(false)
      setPendingDisambiguation(false)
      setPendingQuoteQuestion(false)
    } else {
      setPendingConfirm(false)
      setPendingDisambiguation(false)
      setPendingQuoteQuestion(false)
    }
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
        action_taken: res.action_taken,
        disambiguation: res.disambiguation,
      })
      handleActionState(res)
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

  async function handleConfirm() {
    setPendingConfirm(false)
    setLoading(true)
    try {
      const res = await confirmReport()
      addMessage({ role: 'bot', text: res.reply, timestamp: now(), action_taken: res.action_taken })
      handleActionState(res)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) { onLoggedOut(); return }
      addMessage({ role: 'bot', text: 'Fehler beim Speichern. Bitte erneut versuchen.', timestamp: now() })
    } finally {
      setLoading(false)
    }
  }

  async function handleCancel() {
    setPendingConfirm(false)
    setPendingDisambiguation(false)
    setLoading(true)
    try {
      const res = await cancelReport()
      addMessage({ role: 'bot', text: res.reply, timestamp: now() })
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) { onLoggedOut(); return }
      addMessage({ role: 'bot', text: 'Abgebrochen.', timestamp: now() })
    } finally {
      setLoading(false)
    }
  }

  async function handleDisambiguate(art_nr: string, displayName: string) {
    setPendingDisambiguation(false)
    addMessage({ role: 'user', text: displayName, timestamp: now() })
    setLoading(true)
    try {
      const res = await disambiguateMaterial(art_nr)
      addMessage({
        role: 'bot',
        text: res.reply,
        timestamp: now(),
        action_taken: res.action_taken,
        disambiguation: res.disambiguation,
      })
      handleActionState(res)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) { onLoggedOut(); return }
      addMessage({ role: 'bot', text: 'Fehler bei der Auswahl. Bitte erneut versuchen.', timestamp: now() })
    } finally {
      setLoading(false)
    }
  }

  function onSendText(text: string) {
    if (pendingConfirm || pendingDisambiguation || pendingQuoteQuestion) return
    handleResponse(text, sendMessage(text))
  }

  function onSendVoice(blob: Blob) {
    if (pendingConfirm || pendingDisambiguation || pendingQuoteQuestion) return
    handleResponse('🎤 Sprachnachricht', sendVoice(blob))
  }

  function onSendPhoto(file: File) {
    if (pendingConfirm || pendingDisambiguation || pendingQuoteQuestion) return
    handleResponse('📸 Foto', uploadPhoto(file))
  }

  // Find the last message with disambiguation options (for rendering buttons)
  const lastDisambigMsg = pendingDisambiguation
    ? [...messages].reverse().find(m => m.disambiguation && m.disambiguation.length > 0)
    : null

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
        {logoUrl && <img src={logoUrl} alt="Logo" className="header-logo" />}
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

        {/* Disambiguation buttons */}
        {lastDisambigMsg && !loading && (
          <div className="disambig-buttons">
            {lastDisambigMsg.disambiguation!.map(opt => (
              <button
                key={opt.art_nr}
                className="disambig-btn"
                onClick={() => handleDisambiguate(opt.art_nr, opt.name)}
              >
                {opt.name}
                {opt.manufacturer || opt.category
                  ? ` (${opt.manufacturer || opt.category})`
                  : ''}
              </button>
            ))}
          </div>
        )}

        {/* Offerten Ja/Nein buttons */}
        {pendingQuoteQuestion && !loading && (
          <div className="disambig-buttons">
            <button
              className="disambig-btn"
              onClick={() => {
                setPendingQuoteQuestion(false)
                handleResponse('Ja', sendMessage('Ja'))
              }}
            >
              Ja, Offerte verwenden
            </button>
            <button
              className="disambig-btn"
              onClick={() => {
                setPendingQuoteQuestion(false)
                handleResponse('Nein', sendMessage('Nein'))
              }}
            >
              Nein, normaler Flow
            </button>
          </div>
        )}

        {/* Confirmation buttons — shown below the pending summary message */}
        {pendingConfirm && !loading && (
          <div className="confirm-buttons">
            <button className="confirm-btn confirm-btn-yes" onClick={handleConfirm}>
              Speichern
            </button>
            <button className="confirm-btn confirm-btn-no" onClick={handleCancel}>
              Abbrechen
            </button>
          </div>
        )}

        {/* Inline signature pad — shown after report is saved */}
        {pendingSignReportId !== null && (
          <SignaturePad
            reportId={pendingSignReportId}
            onDone={() => {
              setDownloadReportId(pendingSignReportId)
              setPendingSignReportId(null)
            }}
            onLoggedOut={onLoggedOut}
          />
        )}

        {/* PDF Download button — shown after signature is done or skipped */}
        {downloadReportId !== null && (
          <div className="confirm-buttons">
            <button
              className="confirm-btn confirm-btn-yes"
              disabled={pdfDownloading}
              onClick={async () => {
                setPdfDownloading(true)
                try {
                  const { blob, filename } = await downloadRapportPdf(downloadReportId)
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = filename
                  a.click()
                  URL.revokeObjectURL(url)
                } catch (err) {
                  if (err instanceof ApiError && err.status === 401) { onLoggedOut(); return }
                } finally {
                  setPdfDownloading(false)
                }
              }}
            >
              {pdfDownloading ? 'PDF wird erstellt…' : '📄 Rapport als PDF'}
            </button>
            <button className="confirm-btn confirm-btn-no" onClick={() => setDownloadReportId(null)}>
              Schliessen
            </button>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input — disabled while awaiting confirmation or disambiguation */}
      <ChatInput onSendText={onSendText} onSendVoice={onSendVoice} onSendPhoto={onSendPhoto} disabled={loading || pendingConfirm || pendingDisambiguation || pendingQuoteQuestion || pendingSignReportId !== null} />

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
          <span>Arbeitszeit</span>
        </div>
        <div className="nav-item" onClick={onNavProjekte}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <path d="M9 22V12h6v10"/>
          </svg>
          <span>Projekte</span>
        </div>
        <div className="nav-item" onClick={onNavProfile}>
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
