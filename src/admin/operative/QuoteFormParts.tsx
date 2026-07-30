import { ApiError } from '../../api/client'

type DescPriceRow = { description: string; total_price: string }

/** Fehlertext für den Lieferanten-PDF-Upload (OCR) — geteilt von Erstell- und Bearbeiten-Formular.
 *
 * Der OCR-Endpoint läuft lange (Mistral OCR + Retries). Bricht dabei die Verbindung ab,
 * liefert der Client ApiError(0) mit dem generischen Text "Keine Internetverbindung" —
 * was hier fast immer falsch ist: nicht das Gerät ist offline, sondern der Edge-Proxy
 * hat die Verbindung gekappt, während die Analyse noch lief. Deshalb hier ein eigener,
 * ehrlicher Text; nur wenn der Browser sich selbst als offline meldet, bleibt es bei
 * der Offline-Aussage. */
export function pdfUploadErrorMessage(err: unknown): string {
  if (err instanceof ApiError && err.status === 0) {
    return typeof navigator !== 'undefined' && navigator.onLine === false
      ? 'Keine Internetverbindung — die PDF konnte nicht gesendet werden. Bitte erneut versuchen.'
      : 'Die Verbindung zum Server ist abgebrochen, bevor die PDF-Analyse fertig war. Bitte erneut versuchen.'
  }
  if (err instanceof Error && err.message.trim()) return err.message
  return 'PDF-Extraktion fehlgeschlagen. Bitte erneut versuchen.'
}

interface DescPriceFieldsetProps<T extends DescPriceRow> {
  title: string
  rows: T[]
  onChange: (rows: T[]) => void
  addLabel: string
  defaultDescription?: string
}

export function DescPriceFieldset<T extends DescPriceRow>({
  title, rows, onChange, addLabel, defaultDescription = '',
}: DescPriceFieldsetProps<T>) {
  function update(i: number, patch: Partial<DescPriceRow>) {
    onChange(rows.map((r, j) => j === i ? { ...r, ...patch } : r))
  }
  function remove(i: number) {
    onChange(rows.filter((_, j) => j !== i))
  }
  function add() {
    onChange([...rows, { description: defaultDescription, total_price: '' } as T])
  }
  return (
    <fieldset style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginBottom: 20 }}>
      <legend style={{ fontWeight: 600, padding: '0 8px' }}>{title}</legend>
      {rows.map((row, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
          <input className="admin-form-input" style={{ flex: 3 }} placeholder="Beschreibung" value={row.description}
            onChange={e => update(i, { description: e.target.value })} />
          <input className="admin-form-input" style={{ flex: 1 }} placeholder="Betrag CHF" value={row.total_price}
            onChange={e => update(i, { total_price: e.target.value })} />
          <button className="admin-btn admin-btn-danger admin-btn-sm" onClick={() => remove(i)} title="Entfernen">✕</button>
        </div>
      ))}
      <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={add}>{addLabel}</button>
    </fieldset>
  )
}

interface DiscountsFieldsetProps {
  laborDiscount: string
  materialDiscount: string
  onLaborChange: (v: string) => void
  onMaterialChange: (v: string) => void
}

export function DiscountsFieldset({ laborDiscount, materialDiscount, onLaborChange, onMaterialChange }: DiscountsFieldsetProps) {
  return (
    <fieldset style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginBottom: 20 }}>
      <legend style={{ fontWeight: 600, padding: '0 8px' }}>Rabatte</legend>
      <div style={{ display: 'flex', gap: 16 }}>
        <div style={{ flex: 1 }}>
          <label className="admin-form-label">Rabatt auf Lohn (%)</label>
          <input className="admin-form-input" placeholder="0" value={laborDiscount} onChange={e => onLaborChange(e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label className="admin-form-label" title="Gilt auf Materialpositionen sowie auf Weitere Produkte / Freie Positionen (inkl. per PDF eingelesene Materialien)">Rabatt auf Material &amp; Produkte (%)</label>
          <input className="admin-form-input" placeholder="0" value={materialDiscount} onChange={e => onMaterialChange(e.target.value)} />
        </div>
      </div>
    </fieldset>
  )
}

interface SkontoFieldsetProps {
  skontoPct: string
  skontoDays: string
  onPctChange: (v: string) => void
  onDaysChange: (v: string) => void
}

// Skonto = Abzug bei früher Zahlung. Reiner Hinweis auf der Offerte (ändert das Total
// NICHT). Sind beide Felder leer/0, erscheint kein Hinweis im PDF. Der konkrete Satz
// wird aus dem Begleittext der Offert-Vorlagen ({prozent}/{tage}/{betrag}) gebildet.
export function SkontoFieldset({ skontoPct, skontoDays, onPctChange, onDaysChange }: SkontoFieldsetProps) {
  return (
    <fieldset style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginBottom: 20 }}>
      <legend style={{ fontWeight: 600, padding: '0 8px' }}>Skonto</legend>
      <div style={{ display: 'flex', gap: 16 }}>
        <div style={{ flex: 1 }}>
          <label className="admin-form-label" title="Abzug bei Zahlung innerhalb der Frist. Nur ein Hinweis auf der Offerte — das Total bleibt unverändert.">Skonto (%)</label>
          <input className="admin-form-input" placeholder="0" value={skontoPct} onChange={e => onPctChange(e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label className="admin-form-label" title="Zahlungsfrist in Tagen, innerhalb der der Skonto gilt">Frist (Tage)</label>
          <input className="admin-form-input" placeholder="z.B. 10" value={skontoDays} onChange={e => onDaysChange(e.target.value)} />
        </div>
      </div>
      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted, #888)', margin: '8px 8px 0' }}>
        Nur ein Hinweis auf der Offerte — das Total bleibt unverändert. Der Begleittext stammt aus den Offert-Vorlagen.
      </p>
    </fieldset>
  )
}
