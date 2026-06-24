import { useEffect, useState } from 'react'
import { fetchFrequentMaterials, recordErsatzteile, FrequentMaterialOption } from '../api/chat'

interface Props {
  reportId: number
  onDone: () => void
}

// Beim Rapport-Abschluss: Mitarbeiter wählt aus der kuratierten Ersatzteil-Liste
// (Mehrfachauswahl + Menge). Gewählte Teile werden als Material-Position gebucht
// (verrechenbar, mit Lagerabbuchung). Analog zu KleinmaterialPrompt. Feature
// `ersatzteil_prompt` — die Liste kommt vom Backend (leer ⇒ Schritt überspringen).
export default function ErsatzteilPrompt({ reportId, onDone }: Props) {
  const [items, setItems] = useState<FrequentMaterialOption[]>([])
  const [qty, setQty] = useState<Record<string, number>>({})  // art_nr -> Menge (0 = nicht gewählt)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchFrequentMaterials()
      .then(list => {
        if (cancelled) return
        if (!list.length) { onDone(); return }   // nichts kuratiert → Schritt überspringen
        setItems(list)
      })
      .catch(() => { if (!cancelled) onDone() })  // Fehler darf den Flow nicht blockieren
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [reportId])

  function toggle(artNr: string) {
    setQty(prev => {
      const next = { ...prev }
      if (next[artNr]) delete next[artNr]
      else next[artNr] = 1
      return next
    })
  }

  function setCount(artNr: string, n: number) {
    setQty(prev => ({ ...prev, [artNr]: Math.max(1, n) }))
  }

  async function submit() {
    const selected = Object.entries(qty)
      .filter(([, n]) => n > 0)
      .map(([art_nr, n]) => ({ art_nr, amount: n }))
    setSaving(true)
    setError(null)
    try {
      await recordErsatzteile(reportId, selected)
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen')
    } finally {
      setSaving(false)
    }
  }

  // Während des Ladens und bei leerer Liste (onDone wurde dann schon gerufen) nichts zeigen.
  if (loading || items.length === 0) return null

  const selectedCount = Object.values(qty).filter(n => n > 0).length

  return (
    <div className="kleinmaterial-prompt">
      <div className="kleinmaterial-title">Ersatzteile verbraucht?</div>
      <div className="kleinmaterial-sub">
        Wähle die verbauten Ersatzteile und gib die Menge an.
      </div>

      <div className="ersatzteil-list">
        {items.map(m => {
          const checked = !!qty[m.art_nr]
          return (
            <div key={m.art_nr} className={`ersatzteil-row ${checked ? 'is-selected' : ''}`}>
              <label className="ersatzteil-pick">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(m.art_nr)}
                  disabled={saving}
                />
                <span className="ersatzteil-name">
                  <span className="ersatzteil-artnr">{m.art_nr}</span> {m.name}
                </span>
              </label>
              {checked && (
                <div className="kleinmaterial-stepper">
                  <button
                    type="button"
                    onClick={() => setCount(m.art_nr, qty[m.art_nr] - 1)}
                    disabled={saving || qty[m.art_nr] <= 1}
                  >−</button>
                  <span>{qty[m.art_nr]}</span>
                  <button
                    type="button"
                    onClick={() => setCount(m.art_nr, qty[m.art_nr] + 1)}
                    disabled={saving}
                  >+</button>
                  <span className="ersatzteil-unit">{m.unit}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {error && <div className="kleinmaterial-error">{error}</div>}

      <div className="kleinmaterial-actions">
        <button
          type="button"
          className="confirm-btn confirm-btn-no"
          onClick={submit}
          disabled={saving}
        >
          Nichts verbraucht
        </button>
        <button
          type="button"
          className="confirm-btn confirm-btn-yes"
          onClick={submit}
          disabled={saving || selectedCount === 0}
        >
          {saving ? 'Speichern…' : `Erfassen${selectedCount ? ` (${selectedCount})` : ''}`}
        </button>
      </div>
    </div>
  )
}
