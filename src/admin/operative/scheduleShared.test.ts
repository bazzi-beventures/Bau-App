import { describe, it, expect } from 'vitest'
import { addressLocality, crewMembers, crewShortLabels, pairKey, staffShortLabel } from './scheduleShared'
import type { Project } from './ProjectsScreen'

// Reine Formatier-Helfer der Einsatzplanung — ohne DOM testbar.

describe('addressLocality', () => {
  it('nimmt die Ortschaft hinter der PLZ', () => {
    expect(addressLocality('Hofstettweg 5, 8405 Winterthur')).toBe('Winterthur')
    expect(addressLocality('8405 Winterthur')).toBe('Winterthur')
    expect(addressLocality('Hofstettweg 5\n8405 Winterthur')).toBe('Winterthur')
  })

  it('ignoriert ein angehängtes Land', () => {
    expect(addressLocality('Bahnhofstrasse 1, 8001 Zürich, Schweiz')).toBe('Zürich')
  })

  it('verwechselt eine Hausnummer nicht mit einer PLZ', () => {
    expect(addressLocality('Bahnhofstrasse 1234, Seuzach')).toBe('Seuzach')
  })

  it('gibt ohne erkennbare Ortschaft nichts zurück', () => {
    expect(addressLocality('Hofstettweg 5')).toBe('')
    expect(addressLocality('')).toBe('')
    expect(addressLocality(null)).toBe('')
  })

  it('nimmt eine reine Ortsangabe als Ortschaft', () => {
    expect(addressLocality('Winterthur')).toBe('Winterthur')
  })
})

describe('staffShortLabel', () => {
  it('nutzt das gepflegte Kürzel', () => {
    expect(staffShortLabel({ id: 's1', name: 'Marvin Walser', kuerzel: 'mw' })).toBe('MW')
  })

  it('fällt ohne Kürzel auf die Initialen zurück', () => {
    expect(staffShortLabel({ id: 's1', name: 'Marvin Walser' })).toBe('MW')
    expect(staffShortLabel({ id: 's2', name: 'Kevin De Florian' })).toBe('KD')
    expect(staffShortLabel({ id: 's3', name: 'Cher', kuerzel: '  ' })).toBe('C')
  })
})

describe('crewShortLabels', () => {
  const staff = [
    { id: 's1', name: 'Marvin Walser', kuerzel: 'MW' },
    { id: 's2', name: 'Kevin Almeida', kuerzel: 'KA' },
    { id: 's3', name: 'Boris Widmer', kuerzel: 'BW' },
    { id: 's4', name: 'Maja Joos', kuerzel: 'MJ' },
  ]
  const entry = (ids: string[]) => ({ monteur_ids: ids } as unknown as Project)

  it('liefert die Kürzel des Termin-Teams in Reihenfolge, der erste ist Lead', () => {
    expect(crewShortLabels(entry(['s2', 's1']), staff)).toEqual([
      { label: 'KA', lead: true },
      { label: 'MW', lead: false },
    ])
  })

  it('deckelt lange Teams mit +n (der Deckel ist nie Lead)', () => {
    expect(crewShortLabels(entry(['s1', 's2', 's3', 's4']), staff)).toEqual([
      { label: 'MW', lead: true },
      { label: 'KA', lead: false },
      { label: 'BW', lead: false },
      { label: '+1', lead: false },
    ])
  })

  it('ignoriert unbekannte und fehlende Monteure', () => {
    // Steht eine Karteileiche vorne, rückt der erste bekannte Monteur als Lead nach —
    // sonst hätte der Einsatz gar keinen sichtbaren Lead.
    expect(crewShortLabels(entry(['weg', 's1']), staff)).toEqual([{ label: 'MW', lead: true }])
    expect(crewShortLabels(entry([]), staff)).toEqual([])
  })
})

describe('crewMembers', () => {
  const staff = [
    { id: 's1', name: 'Marvin Walser', kuerzel: 'MW' },
    { id: 's2', name: 'Kevin Almeida', kuerzel: 'KA' },
  ]
  const entry = (ids: string[]) => ({ monteur_ids: ids } as unknown as Project)

  it('markiert genau den zuerst gewählten Monteur als Lead', () => {
    expect(crewMembers(entry(['s2', 's1']), staff)).toEqual([
      { id: 's2', name: 'Kevin Almeida', short: 'KA', lead: true },
      { id: 's1', name: 'Marvin Walser', short: 'MW', lead: false },
    ])
  })

  it('liefert für einen Einsatz ohne Team eine leere Liste', () => {
    expect(crewMembers({} as unknown as Project, staff)).toEqual([])
  })
})

describe('pairKey', () => {
  it('normalisiert das Adresspaar unabhängig von der Reihenfolge', () => {
    expect(pairKey('B-Weg 2', 'A-Weg 1')).toBe(pairKey(' A-Weg 1 ', 'B-Weg 2'))
  })

  it('gibt für leere oder identische Adressen null', () => {
    expect(pairKey('A-Weg 1', 'A-Weg 1')).toBeNull()
    expect(pairKey('', 'A-Weg 1')).toBeNull()
    expect(pairKey('A-Weg 1', null)).toBeNull()
  })
})
