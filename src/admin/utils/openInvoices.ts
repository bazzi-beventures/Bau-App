// «Offen» heisst hier: es wird noch Geld erwartet. Archivierte (annullierte) und
// inaktive Rechnungen zählen deshalb nicht mit, bezahlte ohnehin nicht.
// Grundlage für die Offen-Summe in der Rechnungsübersicht und für den Hinweis
// beim Projektabschluss.
const OPEN_INVOICE_STATUSES = ['ausstehend', 'offen', 'gesendet']

export function isInvoiceOpen(status: string | null | undefined): boolean {
  return !!status && OPEN_INVOICE_STATUSES.includes(status)
}

export function countOpenInvoices(invoices: { status: string }[]): number {
  return invoices.filter(i => isInvoiceOpen(i.status)).length
}

// Warnhinweis vor dem Projektabschluss. Ein abgeschlossenes Projekt ist für die
// Mitarbeiter weg — offene Rechnungen darin gehen sonst leicht vergessen.
// Leerer String = kein Hinweis (nichts offen), damit der Aufrufer nur auf
// Wahrheitswert prüfen muss.
export function openInvoicesHint(count: number): string {
  if (count <= 0) return ''
  return count === 1
    ? 'Achtung: Für dieses Projekt ist noch 1 Rechnung offen.'
    : `Achtung: Für dieses Projekt sind noch ${count} Rechnungen offen.`
}
