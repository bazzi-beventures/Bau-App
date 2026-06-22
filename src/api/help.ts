import { apiStreamFetch } from './client'

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
