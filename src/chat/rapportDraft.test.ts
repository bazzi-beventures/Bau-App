import { describe, it, expect, beforeEach } from 'vitest'
import {
  saveDraft, loadDraft, clearDraft, isEmptyDraft, draftKey,
  DRAFT_MAX_AGE_MS, RapportDraftState,
} from './rapportDraft'

const USER = 'user-1'
const NOW = 1_700_000_000_000

function baseState(overrides: Partial<RapportDraftState> = {}): RapportDraftState {
  return {
    messages: [{ id: 1, role: 'bot', text: 'Hallo', timestamp: '10:00' }],
    kleinCollected: false,
    ersatzCollected: false,
    collectedKlein: null,
    collectedErsatz: [],
    pendingConfirm: false,
    pendingDisambiguation: false,
    pendingQuoteQuestion: false,
    pendingSignReportId: null,
    downloadReportId: null,
    ...overrides,
  }
}

beforeEach(() => localStorage.clear())

describe('rapportDraft', () => {
  it('isEmptyDraft: nur Begrüssung, nichts gesammelt/pending → leer', () => {
    expect(isEmptyDraft(baseState())).toBe(true)
  })

  it('isEmptyDraft: sobald der Nutzer geschrieben hat → nicht leer', () => {
    const s = baseState({
      messages: [
        { id: 1, role: 'bot', text: 'Hallo', timestamp: '10:00' },
        { id: 2, role: 'user', text: 'Neuer Rapport', timestamp: '10:01' },
      ],
    })
    expect(isEmptyDraft(s)).toBe(false)
  })

  it('isEmptyDraft: gesammeltes Ersatzteil zählt als nicht leer', () => {
    const s = baseState({ collectedErsatz: [{ art_nr: 'A1', amount: 1, name: 'Motor', unit: 'Stk' }] })
    expect(isEmptyDraft(s)).toBe(false)
  })

  it('speichert einen nicht-leeren Draft und lädt ihn zurück', () => {
    const s = baseState({
      pendingConfirm: true,
      messages: [
        { id: 1, role: 'bot', text: 'Hallo', timestamp: '10:00' },
        { id: 2, role: 'user', text: 'Neuer Rapport', timestamp: '10:01' },
      ],
    })
    saveDraft(USER, s, NOW)

    const loaded = loadDraft(USER, NOW)
    expect(loaded?.pendingConfirm).toBe(true)
    expect(loaded?.messages).toHaveLength(2)
  })

  it('löscht bei leerem Zustand einen bestehenden Draft', () => {
    saveDraft(USER, baseState({ pendingConfirm: true }), NOW)
    expect(localStorage.getItem(draftKey(USER))).not.toBeNull()

    saveDraft(USER, baseState(), NOW) // wieder leer → entfernt
    expect(localStorage.getItem(draftKey(USER))).toBeNull()
  })

  it('verwirft abgelaufene Entwürfe (älter als Staleness) und räumt sie auf', () => {
    saveDraft(USER, baseState({ pendingConfirm: true }), NOW)
    const later = NOW + DRAFT_MAX_AGE_MS + 1

    expect(loadDraft(USER, later)).toBeNull()
    expect(localStorage.getItem(draftKey(USER))).toBeNull()
  })

  it('behält frische Entwürfe (innerhalb Staleness)', () => {
    saveDraft(USER, baseState({ pendingConfirm: true }), NOW)
    expect(loadDraft(USER, NOW + DRAFT_MAX_AGE_MS - 1)).not.toBeNull()
  })

  it('trennt Drafts pro Mitarbeiter', () => {
    saveDraft('a', baseState({ pendingConfirm: true }), NOW)
    expect(loadDraft('b', NOW)).toBeNull()
    expect(loadDraft('a', NOW)).not.toBeNull()
  })

  it('clearDraft entfernt den Draft', () => {
    saveDraft(USER, baseState({ pendingConfirm: true }), NOW)
    clearDraft(USER)
    expect(loadDraft(USER, NOW)).toBeNull()
  })

  it('kaputtes JSON → null statt Crash', () => {
    localStorage.setItem(draftKey(USER), '{kaputt')
    expect(loadDraft(USER, NOW)).toBeNull()
  })
})
