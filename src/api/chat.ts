import { apiFetch, apiFormFetch } from './client'

export interface ChatResponse {
  reply: string
  action_taken: string | null
  transcription?: string
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
  | 'report_sick' | 'cancel_sick'
  | 'query_vacation' | 'query_overtime'

export async function zeitAction(action: ZeitAction, date?: string): Promise<ChatResponse> {
  return apiFetch(`/pwa/zeit/${action}`, {
    method: 'POST',
    body: JSON.stringify(date ? { date } : {}),
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
