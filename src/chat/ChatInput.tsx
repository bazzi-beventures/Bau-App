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
    <div style={styles.container}>
      <textarea
        ref={textareaRef}
        style={styles.textarea}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Nachricht schreiben…"
        rows={1}
        disabled={disabled || isRecording}
      />
      {text.trim() ? (
        <button style={styles.sendBtn} onClick={submit} disabled={disabled}>
          ➤
        </button>
      ) : (
        <button
          style={{ ...styles.micBtn, ...(isRecording ? styles.micRecording : {}) }}
          onPointerDown={startRecording}
          onPointerUp={stopRecording}
          onPointerLeave={stopRecording}
          disabled={disabled}
        >
          {isRecording ? '⏹' : '🎤'}
        </button>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '0.5rem',
    padding: '0.6rem 0.75rem',
    background: '#fff',
    borderTop: '1px solid #e4e6ea',
    paddingBottom: 'calc(0.6rem + env(safe-area-inset-bottom, 0px))',
  },
  textarea: {
    flex: 1,
    resize: 'none',
    border: '1.5px solid #ddd',
    borderRadius: '1.2rem',
    padding: '0.6rem 0.9rem',
    fontSize: '0.95rem',
    lineHeight: 1.4,
    outline: 'none',
    maxHeight: '7rem',
    overflowY: 'auto',
  },
  sendBtn: {
    background: '#1a73e8',
    color: '#fff',
    border: 'none',
    borderRadius: '50%',
    width: '2.5rem',
    height: '2.5rem',
    fontSize: '1rem',
    flexShrink: 0,
  },
  micBtn: {
    background: '#f0f2f5',
    border: 'none',
    borderRadius: '50%',
    width: '2.5rem',
    height: '2.5rem',
    fontSize: '1.1rem',
    flexShrink: 0,
    transition: 'background 0.15s',
  },
  micRecording: {
    background: '#d93025',
  },
}
