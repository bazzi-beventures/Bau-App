import { KleinmaterialSelection } from './KleinmaterialPrompt'
import { ErsatzteilSelection } from './ErsatzteilPrompt'
import { DisambiguationOption, SummaryItem } from '../api/chat'

// Zwischenspeicher für einen in Arbeit befindlichen Rapport. Der ChatScreen hält
// seinen State sonst nur im Speicher und verliert alles beim Unmount (Navigation
// zur Hauptmaske). Dieser Draft überlebt Navigation und Reload, damit ein
// angefangener Rapport nicht neu eingegeben werden muss.

export interface DraftMessage {
  id: number
  role: 'user' | 'bot'
  text: string
  transcription?: string
  timestamp: string
  action_taken?: string | null
  disambiguation?: DisambiguationOption[]
}

export interface RapportDraftState {
  messages: DraftMessage[]
  kleinCollected: boolean
  ersatzCollected: boolean
  collectedKlein: KleinmaterialSelection | null
  collectedErsatz: ErsatzteilSelection[]
  // Hauptmaterialien aus der Zusammenfassung — für die Gesamt-Übersicht vor dem
  // Speichern (zusammen mit Klein-/Ersatzteilen), damit die Anzeige dem PDF entspricht.
  summaryItems: SummaryItem[]
  pendingConfirm: boolean
  pendingDisambiguation: boolean
  pendingQuoteQuestion: boolean
  pendingSignReportId: number | null
  downloadReportId: number | null
}

interface StoredDraft extends RapportDraftState {
  savedAt: number
}

// Entwürfe, die älter als das sind, gelten als abgelaufen und werden verworfen —
// verhindert, dass ein tagealter Rapport-Zwischenstand wieder auftaucht.
export const DRAFT_MAX_AGE_MS = 12 * 60 * 60 * 1000  // 12 Stunden

// Gleiche Prefix-Konvention wie `quote-draft:` (Offert-Zwischenstand). Pro
// Mitarbeiter geschlüsselt, damit auf einem geteilten Gerät kein Draft leakt.
export function draftKey(userId: string): string {
  return `rapport-draft:${userId}`
}

// Ist der Zustand "leer" (nur die Begrüssung, nichts gesammelt/pending)? Solche
// Zustände müssen nicht persistiert werden — und ein zurückgesetzter ChatScreen
// löscht so den Draft automatisch wieder.
export function isEmptyDraft(d: RapportDraftState): boolean {
  const onlyGreeting = d.messages.length <= 1
  const nothingCollected = !d.collectedKlein && d.collectedErsatz.length === 0
  const nothingPending = !d.pendingConfirm && !d.pendingDisambiguation &&
    !d.pendingQuoteQuestion && d.pendingSignReportId === null && d.downloadReportId === null
  return onlyGreeting && nothingCollected && nothingPending
}

export function saveDraft(userId: string, state: RapportDraftState, now: number): void {
  try {
    if (isEmptyDraft(state)) { localStorage.removeItem(draftKey(userId)); return }
    const stored: StoredDraft = { ...state, savedAt: now }
    localStorage.setItem(draftKey(userId), JSON.stringify(stored))
  } catch {
    // Storage voll / privat / blockiert — Persistenz ist best-effort.
  }
}

export function loadDraft(userId: string, now: number): RapportDraftState | null {
  try {
    const raw = localStorage.getItem(draftKey(userId))
    if (!raw) return null
    const d = JSON.parse(raw) as StoredDraft
    if (!d || !Array.isArray(d.messages)) return null
    if (typeof d.savedAt !== 'number' || now - d.savedAt > DRAFT_MAX_AGE_MS) {
      localStorage.removeItem(draftKey(userId))
      return null
    }
    return d
  } catch {
    return null
  }
}

export function clearDraft(userId: string): void {
  try { localStorage.removeItem(draftKey(userId)) } catch { /* best-effort */ }
}
