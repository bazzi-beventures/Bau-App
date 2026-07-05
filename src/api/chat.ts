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

export interface ChatResponse {
  reply: string
  action_taken: string | null
  transcription?: string
  report_id?: number | string
  correction_id?: string
  disambiguation?: DisambiguationOption[]
  pending_summary?: {
    project: string
    date: string
    staff: { name: string; hours: number }[]
    items: SummaryItem[]
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
 */
export async function* sendMessageStream(text: string): AsyncGenerator<ChatStreamEvent, void, void> {
  for await (const raw of apiStreamFetch('/pwa/chat/message', { text })) {
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
  return apiFormFetch('/pwa/chat/voice', form) as Promise<ChatResponse>
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
  return apiFetch(`/pwa/zeit/${action}`, {
    method: 'POST',
    body: JSON.stringify(opts),
    // Stempel haben eine Offline-Queue: lieber nach 15s abbrechen und queuen,
    // als im Funkloch minutenlang im Spinner zu hängen.
    timeoutMs: 15_000,
  }) as Promise<ChatResponse>
}

export interface CorrectionPayload {
  date: string
  clock_in: string
  clock_out: string
  break_minutes: number
  reason: string
}

export async function submitCorrectionRequest(payload: CorrectionPayload): Promise<ChatResponse> {
  return apiFetch('/pwa/zeit/correction-request', {
    method: 'POST',
    body: JSON.stringify(payload),
  }) as Promise<ChatResponse>
}

export async function getCorrectionStatus(correctionId: string): Promise<{ status: string; review_note: string; session_date: string }> {
  return apiFetch(`/pwa/zeit/correction-request/${correctionId}`, {
    method: 'GET',
  }) as Promise<{ status: string; review_note: string; session_date: string }>
}

export interface ConfirmExtras {
  // Vor dem Speichern im Chat gesammelte Zusatz-Positionen.
  kleinmaterial?: { amount_chf: number | null; count: number; scope: string } | null
  ersatzteile?: { art_nr: string; amount: number }[]
}

export async function confirmReport(extras: ConfirmExtras = {}): Promise<ChatResponse> {
  return apiFetch('/pwa/chat/confirm', {
    method: 'POST',
    body: JSON.stringify({
      kleinmaterial: extras.kleinmaterial ?? null,
      ersatzteile: extras.ersatzteile ?? [],
    }),
  }) as Promise<ChatResponse>
}

export async function cancelReport(): Promise<ChatResponse> {
  return apiFetch('/pwa/chat/cancel', { method: 'POST' }) as Promise<ChatResponse>
}

export async function signReport(reportId: number, signatureBase64: string): Promise<void> {
  await apiFetch(`/pwa/chat/sign/${reportId}`, {
    method: 'POST',
    body: JSON.stringify({ signature_base64: signatureBase64 }),
  })
}

export async function downloadRapportPdf(reportId: number): Promise<{ blob: Blob; filename: string }> {
  return apiBlobFetch(`/pwa/chat/report/${reportId}/pdf`)
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
  return apiFetch('/pwa/chat/frequent-materials', { method: 'GET' }) as Promise<FrequentMaterialOption[]>
}

// ─── Foto-Material-Picker (Rapport-Abschluss) ────────────────

export interface GalleryMaterialOption {
  art_nr: string
  name: string
  unit: string
  category?: string | null
  calc_vk: number
  image_url?: string | null   // frisch signierte URL (privater Bucket)
}

// Alle aktiven Artikel mit Foto — lazy beim Öffnen des Popups geladen.
export async function fetchMaterialGallery(): Promise<GalleryMaterialOption[]> {
  return apiFetch('/pwa/chat/material-gallery', { method: 'GET' }) as Promise<GalleryMaterialOption[]>
}

// Billiges Gating (count-only): entscheidet, ob der Foto-Button gezeigt wird.
export async function fetchMaterialGalleryCount(): Promise<number> {
  const res = await apiFetch('/pwa/chat/material-gallery/count', { method: 'GET' }) as { count: number }
  return res?.count ?? 0
}

export async function disambiguateMaterial(art_nr: string): Promise<ChatResponse> {
  return apiFetch('/pwa/chat/disambiguate', {
    method: 'POST',
    body: JSON.stringify({ art_nr }),
  }) as Promise<ChatResponse>
}

export async function uploadPhoto(file: File): Promise<ChatResponse> {
  const form = new FormData()
  form.append('photo', file, file.name)
  return apiFormFetch('/pwa/chat/photo', form) as Promise<ChatResponse>
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
  return apiFetch('/pwa/report/monthly-data', { method: 'GET' }) as Promise<MonthlyReportData>
}

export async function fetchWeeklyData(period: 'this_week' | 'last_week'): Promise<WeeklyReportData> {
  return apiFetch(`/pwa/report/weekly-data?period=${period}`, { method: 'GET' }) as Promise<WeeklyReportData>
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
  return apiFetch('/pwa/absences', { method: 'GET' }) as Promise<UserAbsence[]>
}

export async function createAbsenceRequest(payload: AbsenceCreatePayload): Promise<UserAbsence> {
  return apiFetch('/pwa/absences', {
    method: 'POST',
    body: JSON.stringify(payload),
  }) as Promise<UserAbsence>
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
  return apiFetch('/pwa/vacation-entitlement', { method: 'GET' }) as Promise<VacationEntitlement>
}
