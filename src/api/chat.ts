import { apiFetch, apiBlobFetch, apiFormFetch, apiStreamFetch } from './client'

export interface DisambiguationOption {
  name: string
  art_nr: string
  manufacturer?: string
  category?: string
}

// Ein Hauptmaterial aus der Rapport-Zusammenfassung (vom LLM erkannt/aufgelöst).
export interface SummaryItem {
  name: string
  amount: number
  unit?: string
  art_nr?: string
}

/**
 * Maschinenlesbares Ergebnis einer Zeit-Aktion — für die Offline-Queue, die den
 * deutschen Antworttext nicht parsen soll. Siehe services/pwa_timekeeping.py.
 *   applied  — hat gewirkt                        → aus der Queue entfernen
 *   noop     — Zustand war schon so (Doppel-Tap)  → aus der Queue entfernen
 *   rejected — dauerhaft nicht anwendbar          → Queue anhalten, Korrekturantrag
 *   retry    — vorübergehender Fehler             → Queue anhalten, später erneut
 */
export type ZeitOutcome = 'applied' | 'noop' | 'rejected' | 'retry'

export interface ChatResponse {
  reply: string
  action_taken: string | null
  outcome?: ZeitOutcome
  transcription?: string
  report_id?: number | string
  correction_id?: string
  disambiguation?: DisambiguationOption[]
  pending_summary?: {
    project: string
    date: string
    staff: { name: string; hours: number }[]
    items: SummaryItem[]
    // Einbauort des Einsatzes (reports.einbauort). Nur bei Mandanten mit
    // Feature-Flag `material_standort` und nur, wenn der Monteur ihn genannt hat.
    einbauort?: string
    // Vorauswahl der Leistungsart-Chips (aus dem Projekt geerbt).
    art_der_arbeit?: string[]
  }
}

export type ChatStreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'result'; result: ChatResponse }

/**
 * Streamt eine Chat-Nachricht. Yieldet pro Backend-SSE-Event:
 *   - { type: 'delta', text }       — Text-Chunk während der Bot tippt
 *   - { type: 'result', result }    — Terminal-Event mit pending_summary etc.
 *
 * Caller bekommt am Ende garantiert genau ein "result"-Event.
 *
 * `project` wird NUR mit der Startnachricht aus dem Projekt-Detail mitgeschickt und
 * bindet den Rapport server-seitig an genau dieses Projekt. Ohne die Angabe müsste
 * der Server das Projekt bei jedem Turn aus dem Gesprächsverlauf raten — und lag
 * daneben, sobald der Monteur nur noch Stunden nachreichte.
 */
export async function* sendMessageStream(text: string, project?: string | null): AsyncGenerator<ChatStreamEvent, void, void> {
  const body = project ? { text, project } : { text }
  for await (const raw of apiStreamFetch('/pwa/chat/message', body)) {
    const t = raw.type
    if (t === 'delta' && typeof raw.text === 'string') {
      yield { type: 'delta', text: raw.text }
    } else if (t === 'result' && raw.result && typeof raw.result === 'object') {
      yield { type: 'result', result: raw.result as ChatResponse }
    }
  }
}

export async function sendVoice(blob: Blob): Promise<ChatResponse> {
  const form = new FormData()
  form.append('audio', blob, 'recording.webm')
  return apiFormFetch<ChatResponse>('/pwa/chat/voice', form)
}

export type ZeitAction =
  | 'clock_in' | 'clock_out'
  | 'start_break' | 'end_break'
  | 'query_vacation' | 'query_overtime'

export interface ZeitActionOptions {
  date?: string
  recorded_at?: string
  art_der_arbeit?: string
}

export async function zeitAction(action: ZeitAction, opts: ZeitActionOptions = {}): Promise<ChatResponse> {
  return apiFetch<ChatResponse>(`/pwa/zeit/${action}`, {
    method: 'POST',
    body: JSON.stringify(opts),
    // Stempel haben eine Offline-Queue: lieber nach 15s abbrechen und queuen,
    // als im Funkloch minutenlang im Spinner zu hängen.
    timeoutMs: 15_000,
  })
}

export interface CorrectionPayload {
  date: string
  clock_in: string
  clock_out: string
  break_minutes: number
  reason: string
}

export async function submitCorrectionRequest(payload: CorrectionPayload): Promise<ChatResponse> {
  return apiFetch<ChatResponse>('/pwa/zeit/correction-request', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

// Stand eines Korrekturantrags — die PWA pollt ihn nach dem Absenden.
export interface CorrectionStatus {
  status: string
  review_note: string
  session_date: string
}

export async function getCorrectionStatus(correctionId: string): Promise<CorrectionStatus> {
  return apiFetch<CorrectionStatus>(`/pwa/zeit/correction-request/${correctionId}`, {
    method: 'GET',
  })
}

export interface ConfirmExtras {
  // Vor dem Speichern im Chat gesammelte Zusatz-Positionen.
  kleinmaterial?: { amount_chf: number | null; count: number; scope: string } | null
  ersatzteile?: { art_nr: string; amount: number }[]
  // Angekreuzte Leistungsart (reports.art_der_arbeit). undefined = nichts gesagt,
  // dann bleibt die Vorbelegung aus dem Projekt stehen; [] heisst "keine".
  art_der_arbeit?: string[]
}

export async function confirmReport(extras: ConfirmExtras = {}): Promise<ChatResponse> {
  return apiFetch<ChatResponse>('/pwa/chat/confirm', {
    method: 'POST',
    body: JSON.stringify({
      kleinmaterial: extras.kleinmaterial ?? null,
      ersatzteile: extras.ersatzteile ?? [],
      art_der_arbeit: extras.art_der_arbeit ?? null,
    }),
  })
}

export async function cancelReport(): Promise<ChatResponse> {
  return apiFetch<ChatResponse>('/pwa/chat/cancel', { method: 'POST' })
}

export async function signReport(reportId: number, signatureBase64: string): Promise<void> {
  await apiFetch(`/pwa/chat/sign/${reportId}`, {
    method: 'POST',
    body: JSON.stringify({ signature_base64: signatureBase64 }),
  })
}

// `awaitSignature`: wurde der Rapport GERADE unterschrieben? Dann rennt der Client
// gegen den Hintergrund-Task, der die Unterschrift persistiert — der Server wartet
// bis zu zehn Sekunden auf sie, statt ein Dokument ohne die eben geleistete
// Unterschrift zu liefern. Für einen pendenten Rapport ist dieselbe Warteschleife
// sinnlos: sein PDF (der Zwischenstand) liegt bereits, und der Monteur sähe nur
// zehn Sekunden «PDF wird erstellt…».
export async function downloadRapportPdf(
  reportId: number,
  awaitSignature = true,
): Promise<{ blob: Blob; filename: string }> {
  return apiBlobFetch(`/pwa/chat/report/${reportId}/pdf?await_signature=${awaitSignature}`)
}

// Selbstkorrektur: eigenen Rapport löschen (falscher Auftrag, doppelt erfasst).
// Server erlaubt nur eigene, unsignierte und unverrechnete Rapporte — Stunden,
// Material und Fotos gehen mit, das Material wird ins Lager zurückgebucht.
export async function deleteOwnRapport(reportId: number): Promise<void> {
  await apiFetch(`/pwa/chat/report/${reportId}`, { method: 'DELETE' })
}

// Rapporte eines Projekts (Mitarbeiter-PWA, Projekt-Detail) — auch die der Kollegen,
// sonst schreibt der zweite Mann denselben Tag nochmals. `is_own` trägt die
// Selbstkorrektur: nur eigene Rapporte sind löschbar (der Server prüft dieselbe
// Regel nochmals).
export interface ProjectReport {
  id: number
  report_date: string
  description: string | null
  created_by: string | null
  signature_timestamp: string | null
  invoice_id: number | null
  // Hängt der Rapport an einer Rechnung, die der Kunde bereits hat (gesendet/
  // bezahlt)? Nur dann ist die Unterschrift endgültig weg. Die blosse Verknüpfung
  // sperrt sie nicht mehr — die Rechnungsaggregation nimmt auch unsignierte
  // Rapporte mit, und die waren danach nie mehr nachsignierbar.
  invoice_locked?: boolean
  created_at: string
  source: string | null
  is_own: boolean
}

export async function fetchProjectReports(projectId: string): Promise<ProjectReport[]> {
  return apiFetch<ProjectReport[]>(`/pwa/projects/${projectId}/reports`)
}

// ─── Häufig benutzte Ersatzteile (Rapport-Abschluss) ─────────

export interface FrequentMaterialOption {
  id: string
  art_nr: string
  name: string
  unit: string
  calc_vk: number
}

export async function fetchFrequentMaterials(): Promise<FrequentMaterialOption[]> {
  return apiFetch<FrequentMaterialOption[]>('/pwa/chat/frequent-materials', { method: 'GET' })
}

// ─── Material-Picker / Artikel-Katalog (Rapport-Abschluss) ───

export interface GalleryMaterialOption {
  art_nr: string
  name: string
  unit: string
  category?: string | null
  calc_vk: number
  image_url?: string | null   // frisch signierte URL (privater Bucket); fehlt bei Artikeln ohne Bild → Platzhalter
}

// Alle aktiven Artikel (mit Bild zuerst, ohne Bild danach) — lazy beim Öffnen des Popups geladen.
export async function fetchMaterialGallery(): Promise<GalleryMaterialOption[]> {
  return apiFetch<GalleryMaterialOption[]>('/pwa/chat/material-gallery', { method: 'GET' })
}

// Billiges Gating (count-only): entscheidet, ob der Katalog-Button gezeigt wird.
export async function fetchMaterialGalleryCount(): Promise<number> {
  const res = await apiFetch('/pwa/chat/material-gallery/count', { method: 'GET' }) as { count: number }
  return res?.count ?? 0
}

export async function disambiguateMaterial(art_nr: string): Promise<ChatResponse> {
  return apiFetch<ChatResponse>('/pwa/chat/disambiguate', {
    method: 'POST',
    body: JSON.stringify({ art_nr }),
  })
}

export async function uploadPhoto(file: File): Promise<ChatResponse> {
  const form = new FormData()
  form.append('photo', file, file.name)
  return apiFormFetch<ChatResponse>('/pwa/chat/photo', form)
}

export interface MonthlyReportData {
  type: 'monthly'
  staff_name: string
  monat_name: string
  jahr: number
  erstellt_am: string
  tage: { datum: string; wochentag: string; clock_in: string; clock_out: string; pause_min: number; stunden_str: string }[]
  arbeitstage: number
  total_stunden_str: string
  soll_stunden_str: string
  ueberstunden_min: number
  ueberstunden_str: string
}

export interface WeeklyReportData {
  type: 'weekly'
  period_label: string
  period_start: string
  period_end: string
  staff_name: string
  days: { date: string; weekday: string; clock_in: string; clock_out: string; break_min: number; net_hours: number; projects: string; absence: string }[]
  total_net_hours: number
  soll_hours: number
  saldo: number
}

export type ReportData = MonthlyReportData | WeeklyReportData

export async function fetchMonthlyData(): Promise<MonthlyReportData> {
  return apiFetch<MonthlyReportData>('/pwa/report/monthly-data', { method: 'GET' })
}

export async function fetchWeeklyData(period: 'this_week' | 'last_week'): Promise<WeeklyReportData> {
  return apiFetch<WeeklyReportData>(`/pwa/report/weekly-data?period=${period}`, { method: 'GET' })
}

// ─── Absenzen ──────────────────────────────────────────────

export interface UserAbsence {
  id: string
  staff_name: string
  type: string
  date_start: string
  date_end: string
  status: string
  comment: string | null
}

export interface AbsenceCreatePayload {
  absence_type: 'vacation' | 'sick' | 'military' | 'other'
  date_start: string
  date_end: string
  comment?: string
}

export async function fetchMyAbsences(): Promise<UserAbsence[]> {
  return apiFetch<UserAbsence[]>('/pwa/absences', { method: 'GET' })
}

export async function createAbsenceRequest(payload: AbsenceCreatePayload): Promise<UserAbsence> {
  return apiFetch<UserAbsence>('/pwa/absences', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export interface VacationEntitlement {
  entitlement: number
  used: number
  taken: number
  planned: number
  remaining: number
  source: string
}

export async function fetchVacationEntitlement(): Promise<VacationEntitlement> {
  return apiFetch<VacationEntitlement>('/pwa/vacation-entitlement', { method: 'GET' })
}
