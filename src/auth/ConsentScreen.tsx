import { useState } from 'react'
import { acceptConsent } from '../api/auth'
import { TenantLogo } from '../App'

interface Props {
  logoUrl: string
  displayName: string
  onAccepted: () => void
}

export default function ConsentScreen({ logoUrl, displayName, onAccepted }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleAccept() {
    setError('')
    setLoading(true)
    try {
      await acceptConsent()
      onAccepted()
    } catch {
      setError('Fehler beim Speichern der Zustimmung. Bitte nochmals versuchen.')
      setLoading(false)
    }
  }

  return (
    <div className="auth-screen consent-screen">
      <TenantLogo logoUrl={logoUrl} />
      <div className="auth-title">Datenschutzerklärung</div>
      <div className="auth-sub">Hallo {displayName.split(' ')[0]}, bitte lies und bestätige Folgendes:</div>

      <div className="consent-box">
        <p><strong>Gespeicherte Daten:</strong></p>
        <ul>
          <li>Name und Anmeldedaten</li>
          <li>Arbeitszeiten (Ein-/Ausstempeln, Pausen)</li>
          <li>Tagesberichte, Projektdaten und Materialverbrauch</li>
          <li>Fotos von der Baustelle</li>
          <li>Abwesenheiten (Urlaub, Krankheit)</li>
        </ul>

        <p><strong>Externe Datenverarbeitung:</strong></p>
        <ul>
          <li><strong>Groq</strong> (USA) — Transkription von Sprachnachrichten</li>
          <li><strong>Supabase</strong> (EU/Frankfurt) — Datenbank-Speicherung</li>
          <li><strong>Google Drive / OneDrive</strong> — Fotos und Dokumente</li>
          <li><strong>SMTP-Provider</strong> — E-Mail-Versand</li>
        </ul>

        <p>
          <strong>Rechtsgrundlage:</strong> Vertragserfüllung (nDSG Art. 31 Abs. 2 lit. a)
        </p>
        <p>
          Es gilt das schweizerische Datenschutzgesetz (nDSG). Daten werden teilweise
          in die USA übermittelt (mit Standardvertragsklauseln abgesichert).
        </p>
        <p>
          Du hast jederzeit das Recht auf Auskunft, Berichtigung und Löschung deiner Daten.
          Wende dich dafür an deinen Administrator.
        </p>
      </div>

      {error && <p className="error-msg">{error}</p>}

      <button
        className="btn-primary"
        onClick={handleAccept}
        disabled={loading}
        style={{ marginTop: 16 }}
      >
        {loading ? 'Wird gespeichert…' : '✅ Ich habe gelesen und stimme zu'}
      </button>

      <p className="auth-footer">Du kannst die App erst nach Zustimmung nutzen.</p>
    </div>
  )
}
