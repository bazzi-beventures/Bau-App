import { apiFetch, apiStreamFetch } from './client'

export type HelpSource = {
  section: string
  source_file?: string
  similarity?: number
}

export type HelpEvent =
  | { type: 'delta'; text: string }
  | { type: 'sources'; sources: HelpSource[]; cached?: boolean }
  | { type: 'done' }
  | { type: 'error'; message: string }

export async function* askHelp(question: string): AsyncGenerator<HelpEvent, void, void> {
  for await (const ev of apiStreamFetch('/pwa/help/ask', { question })) {
    yield ev as HelpEvent
  }
}

export type ReindexState = 'idle' | 'running' | 'success' | 'error'

export interface ReindexStatus {
  state: ReindexState
  started_at: string | null
  finished_at: string | null
  folder_id: string
  files_total: number
  files_processed: number
  files_skipped: number
  chunks_indexed: number
  errors: string[]
  last_error: string | null
}

export async function triggerReindex(): Promise<{ status: string; tenant_id: string }> {
  return (await apiFetch('/pwa/help/reindex', { method: 'POST' })) as { status: string; tenant_id: string }
}

export async function getReindexStatus(): Promise<ReindexStatus> {
  return (await apiFetch('/pwa/help/reindex/status')) as ReindexStatus
}
