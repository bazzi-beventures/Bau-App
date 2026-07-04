import { useEffect, useRef, useState } from 'react'
import { sendMessageStream, sendVoice, confirmReport, cancelReport, disambiguateMaterial, uploadPhoto, downloadRapportPdf, ChatResponse, DisambiguationOption } from '../api/chat'
import { ApiError, isOfflineError } from '../api/client'
import { UserInfo } from '../api/auth'
import { getFeature, isFeatureEnabled, KleinmaterialPromptConfig } from '../api/modules'
import MessageBubble from './MessageBubble'
import ChatInput from './ChatInput'
import SignaturePad from './SignaturePad'
import KleinmaterialPrompt, { KleinmaterialSelection } from './KleinmaterialPrompt'
import ErsatzteilPrompt, { ErsatzteilSelection } from './ErsatzteilPrompt'
import { loadDraft, saveDraft } from './rapportDraft'

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
  user: UserInfo
  logoUrl?: string
  activeNav: 'rapport' | 'arbeitszeit'
  initialMessage?: string | null
  onInitialMessageConsumed?: () => void
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

export default function ChatScreen({ displayName, user, logoUrl, activeNav, initialMessage, onInitialMessageConsumed, onNavHome, onNavArbeitszeit, onNavProjekte, onNavProfile, onLoggedOut }: Props) {
  const kleinmaterialCfg = getFeature<KleinmaterialPromptConfig>(user, 'kleinmaterial_prompt')
  const kleinmaterialEnabled = !!kleinmaterialCfg?.enabled
  const ersatzteilEnabled = isFeatureEnabled(user, 'ersatzteil_prompt')

  function greetingMessage(): Message {
    return {
      id: nextId(),
      role: 'bot',
      text: `Hallo ${displayName.split(' ')[0]}! Sage z.B. „Neuer Rapport", „Foto hochladen" oder stell eine Frage.`,
      timestamp: now(),
    }
  }

  // Zwischengespeicherten Rapport genau einmal (beim ersten Render) laden, damit
  // ein angefangener Rapport nach Navigation/Reload nicht neu eingegeben werden
  // muss. Den ID-Zähler über die wiederhergestellten IDs heben, sonst kollidieren
  // neue Nachrichten-IDs mit den restaurierten.
  const draftRef = useRef<ReturnType<typeof loadDraft> | undefined>(undefined)
  if (draftRef.current === undefined) {
    const d = loadDraft(user.authorized_user_id, Date.now())
    if (d) for (const m of d.messages) { if (m.id > _idCounter) _idCounter = m.id }
    draftRef.current = d
  }
  const draft = draftRef.current

  // Vor dem Speichern gesammelte Zusatz-Positionen (werden beim Bestätigen mitgebucht).
  const [kleinCollected, setKleinCollected] = useState(() => draft?.kleinCollected ?? false)
  const [ersatzCollected, setErsatzCollected] = useState(() => draft?.ersatzCollected ?? false)
  const [collectedKlein, setCollectedKlein] = useState<KleinmaterialSelection | null>(() => draft?.collectedKlein ?? null)
  const [collectedErsatz, setCollectedErsatz] = useState<ErsatzteilSelection[]>(() => draft?.collectedErsatz ?? [])
  const [messages, setMessages] = useState<Message[]>(() => draft?.messages ?? [greetingMessage()])
  const [loading, setLoading] = useState(false)
  const [pendingConfirm, setPendingConfirm] = useState(() => draft?.pendingConfirm ?? false)
  const [pendingDisambiguation, setPendingDisambiguation] = useState(() => draft?.pendingDisambiguation ?? false)
  const [pendingQuoteQuestion, setPendingQuoteQuestion] = useState(() => draft?.pendingQuoteQuestion ?? false)
  const [pendingSignReportId, setPendingSignReportId] = useState<number | null>(() => draft?.pendingSignReportId ?? null)
  const [downloadReportId, setDownloadReportId] = useState<number | null>(() => draft?.downloadReportId ?? null)
  const [pdfDownloading, setPdfDownloading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Rapport-Zwischenstand persistieren, sobald sich relevanter State ändert.
  // Leere Zustände (nur Begrüssung) löschen den Draft automatisch (siehe saveDraft).
  useEffect(() => {
    saveDraft(user.authorized_user_id, {
      messages, kleinCollected, ersatzCollected, collectedKlein, collectedErsatz,
      pendingConfirm, pendingDisambiguation, pendingQuoteQuestion,
      pendingSignReportId, downloadReportId,
    }, Date.now())
  }, [user.authorized_user_id, messages, kleinCollected, ersatzCollected, collectedKlein,
      collectedErsatz, pendingConfirm, pendingDisambiguation, pendingQuoteQuestion,
      pendingSignReportId, downloadReportId])

  // Nach abgeschlossenem Rapport (PDF geschlossen) auf einen frischen Stand
  // zurücksetzen — das löscht zugleich den Draft, weil der Zustand wieder leer ist.
  function resetConversation() {
    setMessages([greetingMessage()])
    setKleinCollected(false)
    setErsatzCollected(false)
    setCollectedKlein(null)
    setCollectedErsatz([])
    setPendingConfirm(false)
    setPendingDisambiguation(false)
    setPendingQuoteQuestion(false)
    setPendingSignReportId(null)
    setDownloadReportId(null)
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const initialSentRef = useRef(false)
  useEffect(() => {
    if (!initialMessage || initialSentRef.current) return
    initialSentRef.current = true
    handleResponseStream(initialMessage)
    onInitialMessageConsumed?.()
  }, [initialMessage])

  function addMessage(msg: Omit<Message, 'id'>) {
    setMessages(prev => [...prev, { ...msg, id: nextId() }])
  }

  function handleActionState(res: ChatResponse) {
    if (res.action_taken === 'confirm_pending') {
      setPendingConfirm(true)
      setPendingDisambiguation(false)
      setPendingQuoteQuestion(false)
      // Neue Bestätigung → Zusatz-Material-Schritte zurücksetzen
      setKleinCollected(false)
      setErsatzCollected(false)
      setCollectedKlein(null)
      setCollectedErsatz([])
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
      addMessage({ role: 'bot', text: isOfflineError(err) ? 'Keine Internetverbindung' : 'Fehler beim Senden. Bitte erneut versuchen.', timestamp: now() })
    } finally {
      setLoading(false)
    }
  }

  /**
   * Streaming-Variante: legt eine leere Bot-Bubble an und füllt sie chunkweise.
   * Bei Tool-Call-Pfaden (kein Delta, nur ein Result-Event) bleibt die Bubble
   * leer — der Spinner zeigt sich währenddessen — und wird am Ende mit dem
   * vollen Reply ersetzt.
   */
  async function handleResponseStream(userText: string) {
    addMessage({ role: 'user', text: userText, timestamp: now() })
    const botId = nextId()
    setMessages(prev => [...prev, { id: botId, role: 'bot', text: '', timestamp: now() }])
    setLoading(true)
    let sawDelta = false
    try {
      let finalRes: ChatResponse | null = null
      for await (const ev of sendMessageStream(userText)) {
        if (ev.type === 'delta') {
          sawDelta = true
          // Spinner ausblenden, sobald der erste Token kommt
          setLoading(false)
          setMessages(prev =>
            prev.map(m => m.id === botId ? { ...m, text: m.text + ev.text } : m)
          )
        } else if (ev.type === 'result') {
          finalRes = ev.result
        }
      }
      if (!finalRes) {
        setMessages(prev =>
          prev.map(m => m.id === botId
            ? { ...m, text: m.text || 'Fehler beim Verarbeiten. Bitte erneut versuchen.' }
            : m)
        )
        return
      }
      // Result-Event ist autoritativ: Reply, action_taken, disambiguation übernehmen.
      // Falls Deltas gestreamt wurden, ist result.reply normalerweise == bisheriger Bubble-Text.
      setMessages(prev =>
        prev.map(m => m.id === botId
          ? {
              ...m,
              text: finalRes!.reply,
              action_taken: finalRes!.action_taken,
              disambiguation: finalRes!.disambiguation,
            }
          : m)
      )
      handleActionState(finalRes)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onLoggedOut()
        return
      }
      const errText = isOfflineError(err) ? 'Keine Internetverbindung' : 'Fehler beim Senden. Bitte erneut versuchen.'
      setMessages(prev =>
        prev.map(m => m.id === botId
          ? { ...m, text: sawDelta ? m.text : errText }
          : m)
      )
    } finally {
      setLoading(false)
    }
  }

  async function handleConfirm() {
    setPendingConfirm(false)
    setLoading(true)
    try {
      const res = await confirmReport({
        kleinmaterial: collectedKlein,
        ersatzteile: collectedErsatz.map(it => ({ art_nr: it.art_nr, amount: it.amount })),
      })
      addMessage({ role: 'bot', text: res.reply, timestamp: now(), action_taken: res.action_taken })
      handleActionState(res)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) { onLoggedOut(); return }
      addMessage({ role: 'bot', text: isOfflineError(err) ? 'Keine Internetverbindung' : 'Fehler beim Speichern. Bitte erneut versuchen.', timestamp: now() })
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
      addMessage({ role: 'bot', text: isOfflineError(err) ? 'Keine Internetverbindung' : 'Fehler bei der Auswahl. Bitte erneut versuchen.', timestamp: now() })
    } finally {
      setLoading(false)
    }
  }

  function onSendText(text: string) {
    if (pendingConfirm || pendingDisambiguation || pendingQuoteQuestion) return
    handleResponseStream(text)
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

  // Vor dem Speichern: erst Klein-, dann Ersatzteil-Schritt, dann Speichern-Button.
  const kleinStepPending = pendingConfirm && kleinmaterialEnabled && !!kleinmaterialCfg && !kleinCollected
  const ersatzStepPending = pendingConfirm && !kleinStepPending && ersatzteilEnabled && !ersatzCollected
  const confirmReady = pendingConfirm && !kleinStepPending && !ersatzStepPending
  const hasExtras = !!collectedKlein?.amount_chf || collectedErsatz.length > 0

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
                handleResponseStream('Ja')
              }}
            >
              Ja, Offerte verwenden
            </button>
            <button
              className="disambig-btn"
              onClick={() => {
                setPendingQuoteQuestion(false)
                handleResponseStream('Nein')
              }}
            >
              Nein, normaler Flow
            </button>
          </div>
        )}

        {/* Vor dem Speichern: Klein-/Schmiermaterial-Schritt (Feature aktiv) */}
        {kleinStepPending && kleinmaterialCfg && !loading && (
          <KleinmaterialPrompt
            config={kleinmaterialCfg}
            onSubmit={(sel) => { setCollectedKlein(sel); setKleinCollected(true) }}
          />
        )}

        {/* Vor dem Speichern: Ersatzteil-Schritt (nach Kleinmaterial, Feature aktiv) */}
        {ersatzStepPending && !loading && (
          <ErsatzteilPrompt
            onSubmit={(items) => { setCollectedErsatz(items); setErsatzCollected(true) }}
          />
        )}

        {/* Recap der gesammelten Zusatz-Positionen + Speichern/Abbrechen */}
        {confirmReady && !loading && (
          <>
            {hasExtras && (
              <div className="kleinmaterial-prompt">
                <div className="kleinmaterial-title">Zusätzlich zum Rapport erfasst</div>
                <div className="ersatzteil-list">
                  {collectedKlein?.amount_chf ? (
                    <div className="ersatzteil-row">
                      <span className="ersatzteil-name">Klein-/Schmiermaterial</span>
                      <span>CHF {collectedKlein.amount_chf} × {collectedKlein.count} = CHF {collectedKlein.amount_chf * collectedKlein.count}</span>
                    </div>
                  ) : null}
                  {collectedErsatz.map(it => (
                    <div key={it.art_nr} className="ersatzteil-row">
                      <span className="ersatzteil-name">
                        <span className="ersatzteil-artnr">{it.art_nr}</span> {it.name}
                      </span>
                      <span>{it.amount} {it.unit}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="confirm-buttons">
              <button className="confirm-btn confirm-btn-yes" onClick={handleConfirm}>
                Speichern
              </button>
              <button className="confirm-btn confirm-btn-no" onClick={handleCancel}>
                Abbrechen
              </button>
            </div>
          </>
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
            <button className="confirm-btn confirm-btn-no" onClick={resetConversation}>
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
