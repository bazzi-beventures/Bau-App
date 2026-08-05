import { describe, it, expect } from 'vitest'
import { initialProjectForm, isProjectFormDirty } from './ProjectDetailScreen'
import type { Project } from './ProjectsScreen'

// Basis für die „ungespeicherte Änderungen"-Abfrage: nur echte Änderungen an den
// Feldern, die gespeichert werden, dürfen die Maske als geändert markieren —
// sonst wird der Anwender bei jedem Zurück grundlos angehalten.

function makeProject(over: Partial<Project> = {}): Project {
  return {
    id: 'p-1',
    project_id_text: '2600001',
    name: 'Fassade Seehalde',
    kind: 'project',
    customer_id: 'c-1',
    customer: null,
    object_name: 'MFH Sonnhalde',
    object_address: 'Seestrasse 1, 8001 Zürich',
    art_der_arbeit: ['Neumontage', 'Reparatur'],
    projektleiter_id: 'staff-1',
    monteur_ids: ['staff-2', 'staff-3'],
    kontakte: [{ name: 'Beat Huber', kommentar: 'Hauswart', telefon: '079', email: '', is_site_contact: true }],
    eigentuemer: null,
    disposal_details: null,
    status: 'offen',
    is_closed: false,
    created_at: '2026-07-01T08:00:00Z',
    created_by: null,
    created_by_id: null,
    bemerkung: null,
    geruestfach: null,
    start_date: '2026-08-03',
    end_date: null,
    start_time: '07:30:00',
    end_time: null,
    ...over,
  }
}

describe('isProjectFormDirty', () => {
  it('ist false, solange nichts angefasst wurde', () => {
    const p = makeProject()
    expect(isProjectFormDirty(initialProjectForm(p), initialProjectForm(p))).toBe(false)
  })

  it('ist false für eine unberührte Neu-Maske (kein Projekt)', () => {
    expect(isProjectFormDirty(initialProjectForm(null), initialProjectForm(null))).toBe(false)
  })

  it('erkennt eine geänderte Texteingabe', () => {
    const base = initialProjectForm(makeProject())
    expect(isProjectFormDirty(base, { ...base, name: 'Fassade Seehalde 2' })).toBe(true)
  })

  it('erkennt einen gesetzten Projektnamen in der Neu-Maske', () => {
    const base = initialProjectForm(null)
    expect(isProjectFormDirty(base, { ...base, name: 'Neubau West' })).toBe(true)
  })

  it('erkennt eine abgewählte Rechnungsadress-Abweichung', () => {
    const base = initialProjectForm(makeProject({ billing_name: 'Verwaltung AG' }))
    expect(base.billingDiffers).toBe(true)
    expect(isProjectFormDirty(base, { ...base, billingDiffers: false })).toBe(true)
  })

  it('ignoriert die Reihenfolge bei Monteuren und Leistungsarten', () => {
    const base = initialProjectForm(makeProject())
    const reordered = {
      ...base,
      monteurIds: ['staff-3', 'staff-2'],
      artDerArbeit: ['Reparatur', 'Neumontage'],
    }
    expect(isProjectFormDirty(base, reordered)).toBe(false)
  })

  it('erkennt einen zusätzlich zugewiesenen Monteur', () => {
    const base = initialProjectForm(makeProject())
    expect(isProjectFormDirty(base, { ...base, monteurIds: [...base.monteurIds, 'staff-9'] })).toBe(true)
  })

  it('wertet einen fehlenden is_site_contact wie false (kein Phantom-Dirty)', () => {
    const base = initialProjectForm(makeProject({
      kontakte: [{ name: 'Beat Huber', kommentar: '', telefon: '079', email: '' }],
    }))
    const touched = {
      ...base,
      kontakte: [{ name: 'Beat Huber', kommentar: '', telefon: '079', email: '', is_site_contact: false }],
    }
    expect(isProjectFormDirty(base, touched)).toBe(false)
  })

  it('erkennt einen gesetzten Baustellenkontakt', () => {
    const base = initialProjectForm(makeProject({
      kontakte: [{ name: 'Beat Huber', kommentar: '', telefon: '079', email: '' }],
    }))
    const touched = {
      ...base,
      kontakte: [{ name: 'Beat Huber', kommentar: '', telefon: '079', email: '', is_site_contact: true }],
    }
    expect(isProjectFormDirty(base, touched)).toBe(true)
  })

  it('erkennt einen ausgefüllten Eigentümer', () => {
    const base = initialProjectForm(makeProject())
    expect(isProjectFormDirty(base, {
      ...base,
      eigentuemer: { ...base.eigentuemer, name: 'Erbengemeinschaft Meier' },
    })).toBe(true)
  })

  it('erkennt geänderte Terminfelder', () => {
    const base = initialProjectForm(makeProject())
    expect(isProjectFormDirty(base, { ...base, endDate: '2026-08-10' })).toBe(true)
  })
})

describe('initialProjectForm', () => {
  it('kürzt Datums-/Zeitwerte auf die Formularformate', () => {
    const form = initialProjectForm(makeProject({
      start_date: '2026-08-03T00:00:00Z',
      start_time: '07:30:00',
    }))
    expect(form.startDate).toBe('2026-08-03')
    expect(form.startTime).toBe('07:30')
  })

  it('liefert für ein neues Projekt durchgehend leere Werte', () => {
    const form = initialProjectForm(null)
    expect(form.name).toBe('')
    expect(form.artDerArbeit).toEqual([])
    expect(form.monteurIds).toEqual([])
    expect(form.kontakte).toEqual([])
    expect(form.billingDiffers).toBe(false)
    expect(form.eigentuemer).toEqual({ name: '', adresse: '', telefon: '', email: '' })
  })
})
