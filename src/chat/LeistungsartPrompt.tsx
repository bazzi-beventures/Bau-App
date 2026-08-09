import { useState } from 'react'

// Kanonische Leistungsarten — Werte = CHECK-Constraint von reports.art_der_arbeit
// (Migration 20260809) und Spiegel von db.projects.WORK_TYPES; Labels wie auf dem
// gedruckten Rapportblatt und im Admin-Formular (ReportCreateForm.WORK_TYPES).
export const WORK_TYPES: { value: string; label: string }[] = [
  { value: 'Neumontage', label: 'Neumontage' },
  { value: 'Wiedermontage', label: 'Wiedermontage' },
  { value: 'Umbau', label: 'Umbau/Ersatz' },
  { value: 'Reparatur', label: 'Reparatur' },
  { value: 'Wartung', label: 'Service/Wartung' },
  { value: 'Demontage', label: 'Demontage' },
]

interface Props {
  // Vorauswahl aus dem Projekt (pending_summary.art_der_arbeit). Nicht-kanonische
  // Alt-Werte hat das Backend bereits aussortiert.
  initial: string[]
  onSubmit: (workTypes: string[]) => void
}

// Vor dem Speichern: Mitarbeiter kreuzt an, was er gemacht hat — dieselbe Leiste wie
// oben auf dem gedruckten Rapportblatt. Sammelt nur die Auswahl; geschrieben wird sie
// zusammen mit dem Rapport beim Bestätigen (reports.art_der_arbeit).
//
// Bewusst ohne Feature-Flag und ohne Übersprung-Automatik: die Angabe ist eine
// Ankreuz-Frage, die das Büro sonst nachtelefonieren muss. «Weiter» ohne Auswahl ist
// erlaubt — nicht jeder Einsatz passt in eine der sechs Arten.
export default function LeistungsartPrompt({ initial, onSubmit }: Props) {
  const [selected, setSelected] = useState<string[]>(
    () => WORK_TYPES.map(w => w.value).filter(v => initial.includes(v))
  )

  function toggle(value: string) {
    setSelected(prev =>
      prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]
    )
  }

  return (
    <div className="kleinmaterial-prompt">
      <div className="kleinmaterial-title">Was wurde gemacht?</div>
      <div className="kleinmaterial-sub">
        Leistungsart des Einsatzes — Mehrfachauswahl möglich. Aus dem Projekt
        vorausgewählt; wenn du etwas anderes gemacht hast, hier ändern.
      </div>

      <div className="kleinmaterial-presets">
        {WORK_TYPES.map(w => (
          <button
            key={w.value}
            type="button"
            aria-pressed={selected.includes(w.value)}
            className={`kleinmaterial-preset ${selected.includes(w.value) ? 'is-selected' : ''}`}
            onClick={() => toggle(w.value)}
          >
            {w.label}
          </button>
        ))}
      </div>

      <div className="kleinmaterial-actions">
        <button
          type="button"
          className="confirm-btn confirm-btn-yes"
          onClick={() => onSubmit(selected)}
        >
          Weiter
        </button>
      </div>
    </div>
  )
}
