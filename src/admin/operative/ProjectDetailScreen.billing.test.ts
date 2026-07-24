import { describe, it, expect } from 'vitest'
import { hasBillableReport } from './ProjectDetailScreen'

// Regression zur Billing-Heuristik: ein manuell erfasster Rapport (admin_manual,
// per Design ohne Unterschrift) muss als Rechnungsbasis zählen — sonst wird
// fälschlich use_quote=true erzwungen und die Offerte statt des Rapports
// verrechnet.
describe('hasBillableReport', () => {
  it('erkennt einen unterschriebenen Rapport als Rechnungsbasis', () => {
    expect(hasBillableReport([{ signature_timestamp: '2026-07-21T10:00:00Z' }])).toBe(true)
  })

  it('erkennt einen manuell erfassten Rapport (admin_manual) ohne Unterschrift', () => {
    expect(hasBillableReport([{ signature_timestamp: null, source: 'admin_manual' }])).toBe(true)
  })

  it('ignoriert einen Chat-Rapport ohne Unterschrift', () => {
    expect(hasBillableReport([{ signature_timestamp: null, source: 'chat' }])).toBe(false)
  })

  it('ist false für eine leere Rapportliste', () => {
    expect(hasBillableReport([])).toBe(false)
  })

  it('ein einziger verrechenbarer Rapport unter mehreren genügt', () => {
    expect(
      hasBillableReport([
        { signature_timestamp: null, source: 'chat' },
        { signature_timestamp: null, source: 'admin_manual' },
      ]),
    ).toBe(true)
  })
})
