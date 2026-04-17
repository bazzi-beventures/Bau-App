import { apiFetch, apiBlobFetch, apiFormFetch } from './client'

export interface DisambiguationOption {
  name: string
  art_nr: string
  manufacturer?: string
  category?: string
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
    items: { name: string; amount: number; unit?: string; art_nr?: string }[]
  }
}

export async function sendMessage(text: string): Promise<ChatResponse> {
  return apiFetch('/pwa/chat/message', {
    method: 'POST',
    body: JSON.stringify({ text }),
  }) as Promise<ChatResponse>
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

export async function confirmReport(): Promise<ChatResponse> {
  return apiFetch('/pwa/chat/confirm', { method: 'POST' }) as Promise<ChatResponse>
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
  remaining: number
  source: string
}

export async function fetchVacationEntitlement(): Promise<VacationEntitlement> {
  return apiFetch('/pwa/vacation-entitlement', { method: 'GET' }) as Promise<VacationEntitlement>
}
