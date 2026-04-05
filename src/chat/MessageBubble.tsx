interface Props {
  role: 'user' | 'bot'
  text: string
  transcription?: string
  timestamp: string
}

export default function MessageBubble({ role, text, transcription, timestamp }: Props) {
  const isUser = role === 'user'
  return (
    <div style={{ ...styles.row, justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
      <div style={{ ...styles.bubble, ...(isUser ? styles.userBubble : styles.botBubble) }}>
        {transcription && (
          <p style={styles.transcription}>🎤 „{transcription}"</p>
        )}
        <p style={styles.text}>{text}</p>
        <span style={styles.time}>{timestamp}</span>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  row: {
    display: 'flex',
    marginBottom: '0.4rem',
    paddingInline: '0.75rem',
  },
  bubble: {
    maxWidth: '80%',
    padding: '0.6rem 0.9rem',
    borderRadius: '1.1rem',
    lineHeight: 1.45,
    wordBreak: 'break-word',
  },
  userBubble: {
    background: '#1a73e8',
    color: '#fff',
    borderBottomRightRadius: '0.25rem',
  },
  botBubble: {
    background: '#fff',
    color: '#1c1e21',
    borderBottomLeftRadius: '0.25rem',
    boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
  },
  transcription: {
    fontSize: '0.75rem',
    opacity: 0.75,
    fontStyle: 'italic',
    marginBottom: '0.25rem',
  },
  text: { fontSize: '0.95rem' },
  time: { display: 'block', fontSize: '0.65rem', opacity: 0.6, marginTop: '0.3rem', textAlign: 'right' },
}
