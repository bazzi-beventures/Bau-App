import { useState } from 'react'
import { apiFetch } from '../api/client'
import { KleinmaterialPromptConfig } from '../api/modules'

interface Props {
  reportId: number
  config: KleinmaterialPromptConfig
  onDone: () => void
}

export default function KleinmaterialPrompt({ reportId, config, onDone }: Props) {
  const [selected, setSelected] = useState<number | null>(null)
  const [count, setCount] = useState(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(amountChf: number | null) {
    setSaving(true)
    setError(null)
    try {
      await apiFetch(`/pwa/chat/report/${reportId}/kleinmaterial`, {
        method: 'POST',
        body: JSON.stringify({
          amount_chf: amountChf,
          count: amountChf === null ? 0 : count,
          scope: config.scope,
        }),
      })
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen')
    } finally {
      setSaving(false)
    }
  }

  const total = selected !== null ? selected * count : 0

  return (
    <div className="kleinmaterial-prompt">
      <div className="kleinmaterial-title">Klein-/Schmiermaterial verbraucht?</div>
      <div className="kleinmaterial-sub">
        Schrauben, Fett, Verbrauchsmaterial — wähle den Pauschalbetrag.
      </div>

      <div className="kleinmaterial-presets">
        {config.presets_chf.map(amt => (
          <button
            key={amt}
            type="button"
            className={`kleinmaterial-preset ${selected === amt ? 'is-selected' : ''}`}
            onClick={() => setSelected(amt)}
            disabled={saving}
          >
            CHF {amt}
          </button>
        ))}
      </div>

      {selected !== null && (
        <div className="kleinmaterial-count">
          <label>Anzahl</label>
          <div className="kleinmaterial-stepper">
            <button
              type="button"
              onClick={() => setCount(Math.max(1, count - 1))}
              disabled={saving || count <= 1}
            >−</button>
            <span>{count}</span>
            <button
              type="button"
              onClick={() => setCount(count + 1)}
              disabled={saving}
            >+</button>
          </div>
          <div className="kleinmaterial-total">= CHF {total}</div>
        </div>
      )}

      {error && <div className="kleinmaterial-error">{error}</div>}

      <div className="kleinmaterial-actions">
        <button
          type="button"
          className="confirm-btn confirm-btn-no"
          onClick={() => submit(null)}
          disabled={saving}
        >
          Nein, nichts verbraucht
        </button>
        <button
          type="button"
          className="confirm-btn confirm-btn-yes"
          onClick={() => selected !== null && submit(selected)}
          disabled={saving || selected === null}
        >
          {saving ? 'Speichern…' : 'Erfassen'}
        </button>
      </div>
    </div>
  )
}
