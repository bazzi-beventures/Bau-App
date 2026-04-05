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
