// Rapporte am Projekt: manuell erfassen, bearbeiten, zum Bearbeiten laden.
// Teil des api/admin/-Barrels (Charge H1): eine Datei je Domäne, gebündelt in
// index.ts — bestehende `from '../api/admin'`-Importe bleiben damit gültig.

import { apiFetch } from '../client'

/**
 * Ein Rapport zum Bearbeiten. Bewusst `unknown` als Rückgabe: die Nutzlast ist
 * die grosse, verschachtelte Rapport-Form (Stunden, Material, Fixpreise,
 * Massaufnahme …), die heute nur im ReportCreateForm vollständig beschrieben ist.
 * Sie wandert mit dem Umbau der Maske hierher — bis dahin wäre ein hier
 * abgeschriebener Typ genau die Art Vermutung, die dieser Umbau abschafft.
 */
export async function getProjectReport(projectId: string, reportId: number): Promise<unknown> {
  return apiFetch(`/pwa/admin/projects/${projectId}/reports/${reportId}`)
}

export interface SaveReportResult {
  report_id?: number
  // Erfolg mit Vorbehalt (z.B. Lager nicht abgebucht, unbekannte art_nr) — der
  // Aufrufer zeigt die Hinweise, der Rapport ist gespeichert.
  warnings?: unknown
}

/**
 * Ohne `reportId` anlegen (POST), mit `reportId` ersetzen (PUT) — das Backend
 * ersetzt beim Bearbeiten Stunden UND Material vollständig durch die Nutzlast.
 * Was nicht mitkommt, ist danach weg.
 */
export async function saveProjectReport(
  projectId: string, payload: unknown, reportId?: number,
): Promise<SaveReportResult | null> {
  return apiFetch<SaveReportResult | null>(
    reportId
      ? `/pwa/admin/projects/${projectId}/reports/${reportId}`
      : `/pwa/admin/projects/${projectId}/reports`,
    { method: reportId ? 'PUT' : 'POST', body: JSON.stringify(payload) },
  )
}

export interface DeleteReportResult {
  // Anzahl Materialpositionen, die ins Lager zurückgebucht wurden.
  stock_restored?: number
  // Rückbuchung unvollständig (z.B. unbekannte art_nr) — der Rapport ist trotzdem weg.
  warnings?: string[]
}

/**
 * Löscht einen Rapport samt Kindzeilen und bucht Material ins Lager zurück.
 * Abgerechnete Rapporte sperrt der Server mit 409 — ohne Löschmöglichkeit landen
 * die Stunden eines doppelt erfassten Rapports sonst auf der nächsten Rechnung.
 */
export async function deleteProjectReport(
  projectId: string, reportId: number,
): Promise<DeleteReportResult> {
  return apiFetch<DeleteReportResult>(`/pwa/admin/projects/${projectId}/reports/${reportId}`, {
    method: 'DELETE',
  })
}
