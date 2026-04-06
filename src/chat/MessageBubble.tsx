interface Props {
  role: 'user' | 'bot'
  text: string
  transcription?: string
  timestamp: string
}

export default function MessageBubble({ role, text, transcription, timestamp }: Props) {
  const isUser = role === 'user'
  return (
    <div className={`msg-row ${isUser ? 'msg-row-user' : 'msg-row-bot'}`}>
      <div className={`bubble ${isUser ? 'bubble-user' : 'bubble-bot'}`}>
        {transcription && (
          <p className="bubble-transcription">🎤 „{transcription}"</p>
        )}
        <p style={{ whiteSpace: 'pre-wrap' }}>{text}</p>
        <span className="bubble-time">{timestamp}</span>
      </div>
    </div>
  )
}
