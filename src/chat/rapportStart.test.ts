import { describe, it, expect } from 'vitest'
import { discardPrompt, planRapportStart } from './rapportStart'
import { RapportDraftState } from './rapportDraft'

// Regression: ein Monteur hatte 5h erfasst, die Zusammenfassung stand da
// («Bericht so speichern?»), er schaute zwischendurch aufs Projekt und tippte dort
// erneut auf «Rapport erstellen» — der Knopf schickte bedingungslos eine neue
// Startnachricht und der erfasste Rapport war weg, ohne Warnung.

function draft(over: Partial<RapportDraftState> = {}): RapportDraftState {
  return {
    messages: [],
    kleinCollected: false,
    ersatzCollected: false,
    collectedKlein: null,
    collectedErsatz: [],
    summaryItems: [],
    pendingConfirm: false,
    pendingDisambiguation: false,
    pendingQuoteQuestion: false,
    pendingSignReportId: null,
    downloadReportId: null,
    ...over,
  }
}

describe('planRapportStart', () => {
  it('startet normal, wenn kein Entwurf existiert', () => {
    expect(planRapportStart(null, 'Test 09.08.')).toEqual({ kind: 'start' })
  })

  it('startet normal, wenn der Entwurf nichts Unfertiges enthält', () => {
    expect(planRapportStart(draft({ messages: [] }), 'Test 09.08.')).toEqual({ kind: 'start' })
  })

  it('fragt nach, wenn ein anderer Rapport auf das Speichern wartet', () => {
    const plan = planRapportStart(
      draft({ pendingConfirm: true, pendingProject: 'MFH Sonnhalde' }),
      'Test 09.08.',
    )
    expect(plan).toEqual({ kind: 'confirm-discard', pendingProject: 'MFH Sonnhalde' })
  })

  it('springt ohne Rückfrage in den laufenden Rapport desselben Projekts', () => {
    const plan = planRapportStart(
      draft({ pendingConfirm: true, pendingProject: 'Test 09.08.' }),
      'Test 09.08.',
    )
    expect(plan).toEqual({ kind: 'resume' })
  })

  it('fragt auch, wenn der gespeicherte Rapport noch auf die Unterschrift wartet', () => {
    const plan = planRapportStart(
      draft({ pendingSignReportId: 42, pendingProject: 'MFH Sonnhalde' }),
      'Test 09.08.',
    )
    expect(plan).toEqual({ kind: 'confirm-discard', pendingProject: 'MFH Sonnhalde' })
  })

  it('fragt bei einem Entwurf ohne Projektangabe (ältere App-Version)', () => {
    const plan = planRapportStart(draft({ pendingConfirm: true }), 'Test 09.08.')
    expect(plan).toEqual({ kind: 'confirm-discard', pendingProject: null })
  })
})

describe('discardPrompt', () => {
  it('nennt beide Projekte, damit klar ist was verloren geht', () => {
    const text = discardPrompt('MFH Sonnhalde', 'Test 09.08.')
    expect(text).toContain('MFH Sonnhalde')
    expect(text).toContain('Test 09.08.')
  })

  it('kommt ohne bekanntes Projekt aus', () => {
    expect(discardPrompt(null, 'Test 09.08.')).toContain('in Arbeit')
  })
})
