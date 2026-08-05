// Preis-Helfer für Offert-Positionen (frei erfasst oder aus Lieferanten-PDF).
// Reine Funktionen ohne React/DOM — direkt unit-testbar. Einzige Quelle der
// Kalkulation für QuotesScreen und das PDF-Review-Modal.

/**
 * Zahl aus einem Preis-Eingabefeld. Akzeptiert das Schweizer Dezimalkomma
 * („12,50"); leere oder unlesbare Eingabe wird zu 0.
 */
export function parseNum(v: string): number {
  return parseFloat(v.replace(',', '.')) || 0
}

/**
 * Verkaufspreis aus Einkaufspreis + Aufschlag:
 * `VK = EK × (1 + Aufschlag%)`, aufgerundet auf 0.05 (Schweizer Rappenrundung).
 *
 * Pendant zu `db.pricing.compute_material_vk` im Backend (dort via
 * `db.money.round_to_5_rappen`). Vorher rundete diese Funktion auf 0.50 auf,
 * das Backend dagegen auf den Rappen genau — derselbe Artikel kostete als freie
 * Position 449.00 und als Katalog-Artikel 448.94. Beide Wege liefern jetzt 448.95.
 *
 * Gerechnet wird über ganzzahlige Rappen: `Math.ceil(448.95 * 20) / 20` ergibt in
 * Float 449.00, weil 448.95 * 20 als 8979.000000000001 dasteht. Ganze Zahlen sind
 * exakt, also erst auf Rappen runden und dann in 5er-Schritten aufrunden.
 */
export function vkFromEk(ekPrice: number, marginPct: number): number {
  const rappen = Math.round(ekPrice * (1 + marginPct / 100) * 100)
  return (Math.ceil(rappen / 5) * 5) / 100
}

/** Aufschlag-Faktor (z. B. 1.75) → Prozent (75). */
export function factorToPct(factor: number): number {
  return Math.round((factor - 1) * 10000) / 100
}

/** Aufschlag-Prozent (75) → Faktor (1.75), auf 4 Nachkommastellen gerundet. */
export function pctToFactor(pct: number): number {
  return Math.round((1 + pct / 100) * 10000) / 10000
}
