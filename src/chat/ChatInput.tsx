import { useRef, useState } from 'react'
import { useVoiceRecorder } from './useVoiceRecorder'

interface Props {
  onSendText: (text: string) => void
  onSendVoice: (blob: Blob) => void
  disabled?: boolean
}

export default function ChatInput({ onSendText, onSendVoice, disabled }: Props) {
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const { isRecording, startRecording, stopRecording } = useVoiceRecorder(onSendVoice)

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  function submit() {
    const trimmed = text.trim()
    if (!trimmed) return
    onSendText(trimmed)
    setText('')
    textareaRef.current?.focus()
  }

  return (
    <div className="chat-input-bar">
      <textarea
        ref={textareaRef}
        className="chat-textarea"
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Nachricht schreiben…"
        rows={1}
        disabled={disabled || isRecording}
      />
      {text.trim() ? (
        <button className="chat-send-btn" onClick={submit} disabled={disabled}>
          <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      ) : (
        <button
          className={`chat-mic-btn${isRecording ? ' recording' : ''}`}
          onPointerDown={startRecording}
          onPointerUp={stopRecording}
          onPointerLeave={stopRecording}
          title={isRecording ? 'Loslassen zum Senden' : 'Gedrückt halten zum Aufnehmen'}
          disabled={disabled}
        >
          {isRecording ? (
            <span className="chat-mic-recording-label">● REC</span>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.8">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
          )}
        </button>
      )}
    </div>
  )
}
