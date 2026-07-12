// Preis-Helfer für Offert-Positionen (frei erfasst oder aus Lieferanten-PDF).
// Reine Funktionen ohne React/DOM — direkt unit-testbar. Dieselbe Kalkulation
// nutzt das PDF-Review-Modal (dort inline als ceilToHalf).

/**
 * Verkaufspreis aus Einkaufspreis + Aufschlag:
 * `VK = EK × (1 + Aufschlag%)`, aufgerundet auf 0.50 (Schweizer 50-Rappen-Schritt).
 */
export function vkFromEk(ekPrice: number, marginPct: number): number {
  return Math.ceil(ekPrice * (1 + marginPct / 100) * 2) / 2
}

/** Aufschlag-Faktor (z. B. 1.75) → Prozent (75). */
export function factorToPct(factor: number): number {
  return Math.round((factor - 1) * 10000) / 100
}

/** Aufschlag-Prozent (75) → Faktor (1.75), auf 4 Nachkommastellen gerundet. */
export function pctToFactor(pct: number): number {
  return Math.round((1 + pct / 100) * 10000) / 10000
}
