interface Props {
  role: 'user' | 'bot'
  text: string
  transcription?: string
  timestamp: string
  sign_url?: string
}

export default function MessageBubble({ role, text, transcription, timestamp, sign_url }: Props) {
  const isUser = role === 'user'
  return (
    <div className={`msg-row ${isUser ? 'msg-row-user' : 'msg-row-bot'}`}>
      <div className={`bubble ${isUser ? 'bubble-user' : 'bubble-bot'}`}>
        {transcription && (
          <p className="bubble-transcription">🎤 „{transcription}"</p>
        )}
        <p style={{ whiteSpace: 'pre-wrap' }}>{text}</p>
        {sign_url && (
          <a
            href={sign_url}
            target="_blank"
            rel="noopener noreferrer"
            className="sign-link-btn"
          >
            Hier unterschreiben
          </a>
        )}
        <span className="bubble-time">{timestamp}</span>
      </div>
    </div>
  )
}
