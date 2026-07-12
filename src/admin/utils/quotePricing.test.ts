import { describe, it, expect } from 'vitest'
import { parseNum, vkFromEk, factorToPct, pctToFactor } from './quotePricing'

describe('parseNum', () => {
  it('akzeptiert Punkt und Schweizer Dezimalkomma', () => {
    expect(parseNum('12.50')).toBe(12.5)
    expect(parseNum('12,50')).toBe(12.5)
  })

  it('liefert 0 statt NaN bei leerer oder unlesbarer Eingabe', () => {
    expect(parseNum('')).toBe(0)
    expect(parseNum('abc')).toBe(0)
  })

  it('behält das Vorzeichen von Rabatt-Positionen', () => {
    expect(parseNum('-80,25')).toBe(-80.25)
  })
})

describe('vkFromEk', () => {
  it('rechnet VK = EK × (1 + Aufschlag), aufgerundet auf 0.50', () => {
    // Griesser-Beispiel aus dem Review: 513.18 × 1.75 = 898.065 → 898.50
    expect(vkFromEk(513.18, 75)).toBe(898.5)
  })

  it('rundet immer auf, nie ab', () => {
    expect(vkFromEk(100, 0)).toBe(100)      // 100.00 bleibt
    expect(vkFromEk(100.01, 0)).toBe(100.5) // 100.01 → 100.50
    expect(vkFromEk(100.5, 0)).toBe(100.5)  // exakt auf Schritt
    expect(vkFromEk(100.51, 0)).toBe(101)   // → 101.00
  })

  it('behandelt Aufschlag 0 als reine Weitergabe des EK', () => {
    expect(vkFromEk(42.5, 0)).toBe(42.5)
  })

  it('liefert 0 bei EK 0', () => {
    expect(vkFromEk(0, 75)).toBe(0)
  })
})

describe('factorToPct / pctToFactor', () => {
  it('ist zueinander invers für typische Aufschläge', () => {
    for (const pct of [0, 20, 50, 75, 33.33]) {
      expect(factorToPct(pctToFactor(pct))).toBeCloseTo(pct, 2)
    }
  })

  it('factorToPct: 1.75 → 75', () => {
    expect(factorToPct(1.75)).toBe(75)
  })

  it('pctToFactor: 75 → 1.75', () => {
    expect(pctToFactor(75)).toBe(1.75)
  })

  it('vermeidet Float-Rauschen (1.2 statt 1.2000000000000002)', () => {
    expect(pctToFactor(20)).toBe(1.2)
    expect(factorToPct(1.2)).toBe(20)
  })
})
