import { describe, it, expect } from 'vitest'
import { compareProjectsChronologically, sortProjectsChronologically } from './sortProjects'

// Der Auslöser: die Kachelliste zeigte am selben Tag 11:00 vor 09:00 vor 16:00 —
// sie übernahm einfach die Reihenfolge des Servers (nach Name).

function p(name: string, start_date: string | null, start_time: string | null = null) {
  return { name, start_date, start_time }
}

describe('compareProjectsChronologically', () => {
  it('sortiert innerhalb eines Tages nach Startzeit', () => {
    const sorted = sortProjectsChronologically([
      p('Müller', '2026-08-13', '11:00:00'),
      p('Siegrist', '2026-08-13', '09:00:00'),
      p('Walch', '2026-08-13', '16:00:00'),
    ])
    expect(sorted.map(x => x.name)).toEqual(['Siegrist', 'Müller', 'Walch'])
  })

  it('sortiert zuerst nach Datum', () => {
    const sorted = sortProjectsChronologically([
      p('Übermorgen', '2026-08-15', '07:00:00'),
      p('Heute spät', '2026-08-13', '17:00:00'),
      p('Morgen', '2026-08-14', '08:00:00'),
    ])
    expect(sorted.map(x => x.name)).toEqual(['Heute spät', 'Morgen', 'Übermorgen'])
  })

  it('hängt Einsätze ohne Startzeit hinter die des Tages mit Zeit', () => {
    const sorted = sortProjectsChronologically([
      p('Ganztags', '2026-08-13', null),
      p('Nachmittag', '2026-08-13', '14:00:00'),
    ])
    expect(sorted.map(x => x.name)).toEqual(['Nachmittag', 'Ganztags'])
  })

  it('hängt Projekte ganz ohne Termin ans Ende', () => {
    const sorted = sortProjectsChronologically([
      p('Ohne Termin', null),
      p('Nächste Woche', '2026-08-20', '08:00:00'),
      p('Heute', '2026-08-13', '08:00:00'),
    ])
    expect(sorted.map(x => x.name)).toEqual(['Heute', 'Nächste Woche', 'Ohne Termin'])
  })

  it('bricht Gleichstand über den Namen — auch ganz ohne Termin', () => {
    const sorted = sortProjectsChronologically([
      p('Zaun', null),
      p('Abbruch', null),
      p('Bad', '2026-08-13', '08:00:00'),
      p('Anbau', '2026-08-13', '08:00:00'),
    ])
    expect(sorted.map(x => x.name)).toEqual(['Anbau', 'Bad', 'Abbruch', 'Zaun'])
  })

  it('lässt die Eingabeliste unverändert', () => {
    const input = [p('B', '2026-08-14'), p('A', '2026-08-13')]
    sortProjectsChronologically(input)
    expect(input.map(x => x.name)).toEqual(['B', 'A'])
  })

  it('behandelt fehlende start_time wie null (ältere API)', () => {
    const withTime = { name: 'Mit Zeit', start_date: '2026-08-13', start_time: '10:00:00' }
    const withoutField = { name: 'Ohne Feld', start_date: '2026-08-13' }
    expect(compareProjectsChronologically(withoutField, withTime)).toBeGreaterThan(0)
  })
})
