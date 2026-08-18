import type { ProjectReport } from './types'

// Ein Rapport taugt als Rechnungsbasis, wenn er vom Kunden unterschrieben ODER
// manuell vom Projektleiter erfasst wurde (source 'admin_manual' — per Design
// ohne Unterschrift, das Backend behandelt ihn trotzdem als verrechnungsreif).
// Steuert die use_quote-Heuristik und den „kein Rapport"-Warnhinweis, damit ein
// manuell erfasster Rapport tatsächlich aus dem Rapport (nicht der Offerte)
// verrechnet wird.
export function hasBillableReport(
  reports: Pick<ProjectReport, 'signature_timestamp' | 'source'>[],
): boolean {
  return reports.some(r => !!r.signature_timestamp || r.source === 'admin_manual')
}
