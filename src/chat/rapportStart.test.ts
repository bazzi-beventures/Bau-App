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

  // Der Fall, der den Rapport mitten im Erfassen zerriss: der Monteur hat Stunden
  // getippt, aber die Zusammenfassung steht noch nicht (pendingConfirm=false). Das
  // galt bisher als "nichts Unfertiges" — der Knopf begann einen zweiten Rapport,
  // im Zweifel auf einem anderen Projekt.
  const inArbeit = (project: string) => draft({
    pendingProject: project,
    messages: [
      { id: 1, role: 'bot', text: 'Hallo', timestamp: '08:00' },
      { id: 2, role: 'user', text: 'Neuer Rapport für Projekt "Test 09.08."', timestamp: '08:01' },
      { id: 3, role: 'bot', text: 'Wie viele Stunden?', timestamp: '08:01' },
    ],
  })

  it('springt in den laufenden Rapport zurück, auch ohne Zusammenfassung', () => {
    expect(planRapportStart(inArbeit('Test 09.08.'), 'Test 09.08.')).toEqual({ kind: 'resume' })
  })

  it('fragt nach, bevor ein angefangener Rapport für ein anderes Projekt weicht', () => {
    expect(planRapportStart(inArbeit('MFH Sonnhalde'), 'Test 09.08.')).toEqual({
      kind: 'confirm-discard', pendingProject: 'MFH Sonnhalde',
    })
  })

  it('startet normal, wenn nur die Begrüssung dasteht', () => {
    const plan = planRapportStart(
      draft({
        pendingProject: 'Test 09.08.',
        messages: [{ id: 1, role: 'bot', text: 'Hallo', timestamp: '08:00' }],
      }),
      'Test 09.08.',
    )
    expect(plan).toEqual({ kind: 'start' })
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
