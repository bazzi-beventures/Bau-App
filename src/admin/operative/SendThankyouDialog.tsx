import { useState } from 'react'
import { apiFetch } from '../../api/client'
import { backdropCloseProps } from '../../shared/backdropClose'

interface Props {
  quoteId: number
  header: React.ReactNode
  defaultEmail?: string
  onClose: () => void
  onSent: (message: string) => void
}

// Kleiner Versand-Dialog für die Danke-Mail nach Offerten-Annahme (Feature
// offerte_dank_mail) — analog zum Offerten-Versand wird zuerst die
// Empfänger-Adresse abgefragt, vorbelegt mit der Kunden-E-Mail der Offerte.
// Gemeinsam genutzt von der Offerten-Liste und dem Projekt-Detail.
export function SendThankyouDialog({ quoteId, header, defaultEmail, onClose, onSent }: Props) {
  const [email, setEmail] = useState(defaultEmail ?? '')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  async function handleSend() {
    if (!email) return
    setSending(true)
    setError('')
    try {
      const res = await apiFetch(`/pwa/admin/quotes/${quoteId}/send-thankyou`, {
        method: 'POST',
        body: JSON.stringify({ recipient_email: email }),
      }) as { message?: string }
      onSent(res.message || `Danke-Mail an ${email} gesendet`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Versand fehlgeschlagen')
      setSending(false)
    }
  }

  return (
    <div className="admin-confirm-overlay" {...backdropCloseProps(() => { if (!sending) onClose() })}>
      <div className="admin-confirm-box" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
        <div className="admin-confirm-title">Dankesmail senden</div>
        <div className="admin-confirm-text" style={{ marginBottom: 12 }}>{header}</div>

        <div style={{ marginBottom: 12 }}>
          <label className="admin-form-label">Empfänger E-Mail</label>
          <input
            className="admin-form-input"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="kunde@example.com"
          />
        </div>

        {error && <div className="admin-form-error" style={{ marginBottom: 12 }}>{error}</div>}

        <div className="admin-confirm-actions">
          <button className="admin-btn admin-btn-secondary" onClick={onClose} disabled={sending}>Abbrechen</button>
          <button className="admin-btn admin-btn-primary" onClick={handleSend} disabled={!email || sending}>
            {sending ? 'Wird gesendet…' : 'Dankesmail senden'}
          </button>
        </div>
      </div>
    </div>
  )
}
