import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import type { KpiNutzungAdoptionRow, KpiNutzungAktionRow } from '../kpis/types'

// Recharts in jsdom vermeiden (misst 0-Grösse, verrauscht die Tests).
vi.mock('../kpis/components/BiBarChart', () => ({ default: () => null }))

const fetchKpiView = vi.fn()
vi.mock('../../api/kpiViews', () => ({
  fetchKpiView: (view: string, filters?: Record<string, string>) => fetchKpiView(view, filters),
}))

import UsageScreen from './UsageScreen'

const heute = new Date().toISOString().slice(0, 10)

function aktion(over: Partial<KpiNutzungAktionRow> = {}): KpiNutzungAktionRow {
  return {
    tenant_id: 't-1', datum: heute, action: 'admin_send_quote',
    entity: 'pwa_admin', platform: 'pwa_admin', aktionen: 1, benutzer: 1, ...over,
  }
}

function konto(over: Partial<KpiNutzungAdoptionRow> = {}): KpiNutzungAdoptionRow {
  return {
    tenant_id: 't-1', user_id: 'u-1', benutzer_name: 'Hans Muster', rolle: 'admin',
    is_active: true, konto_erstellt: '2026-01-15T08:00:00Z',
    zuletzt_gesehen: `${heute}T07:30:00Z`, ...over,
  }
}

const AKTIONEN = [
  aktion({ action: 'admin_send_quote', aktionen: 10, benutzer: 2 }),
  aktion({ action: 'admin_update_quote', aktionen: 5, benutzer: 3 }),
  aktion({ action: 'admin_send_invoice', aktionen: 5, benutzer: 1 }),
]

const MODULE = ['quotes', 'invoicing', 'scheduling', 'aftersales']

function setup(aktionen = AKTIONEN, konten = [konto()], module = MODULE) {
  fetchKpiView.mockImplementation((view: string) =>
    Promise.resolve(view === 'vw_kpi_nutzung_aktion' ? aktionen : konten),
  )
  return render(<UsageScreen enabledModules={module} />)
}

/** Die Tabelle, die auf eine Überschrift FOLGT — nicht die erste im Container:
 *  alle drei Tabellen hängen als Geschwister im selben .kpi-bi-layout. */
async function tableAfter(heading: RegExp): Promise<HTMLTableElement> {
  const h = await screen.findByText(heading)
  let node: Element | null = h.nextElementSibling
  while (node) {
    const table = node.querySelector('table')
    if (table) return table as HTMLTableElement
    node = node.nextElementSibling
  }
  throw new Error(`Keine Tabelle nach der Überschrift ${heading}`)
}

async function rowsAfter(heading: RegExp) {
  return Array.from((await tableAfter(heading)).querySelectorAll('tbody tr'))
}

/** Spaltenköpfe ohne Sortierpfeil. */
async function headersAfter(heading: RegExp) {
  return Array.from((await tableAfter(heading)).querySelectorAll('thead th'))
    .map(th => (th.textContent ?? '').replace(/[▲▼]/g, '').trim())
}

beforeEach(() => fetchKpiView.mockReset())

describe('UsageScreen — Kacheln', () => {
  it('zählt genutzte gegen aktive Module', async () => {
    setup()
    // quotes + invoicing haben Aktionen, scheduling + aftersales nicht.
    expect(await screen.findByText('2 / 4')).toBeTruthy()
    expect(screen.getByText('2 aktiv, aber ungenutzt')).toBeTruthy()
  })

  it('summiert die Aktionen', async () => {
    setup()
    await waitFor(() => expect(screen.getByText('20')).toBeTruthy())
  })

  it('nimmt beim Benutzer-Maximum den Tageswert, nicht die Summe', async () => {
    // Drei Zeilen desselben Tages mit benutzer 2/3/1: die Summe (6) wäre falsch,
    // weil jede Zeile COUNT(DISTINCT) über dieselben Personen ist.
    setup()
    const kachel = await screen.findByText('Aktive Benutzer (max./Tag)')
    expect(within(kachel.parentElement!).getByText('3')).toBeTruthy()
  })

  it('zählt Konten ohne Aktivität im Zeitraum', async () => {
    setup(AKTIONEN, [
      konto({ user_id: 'u-1' }),
      konto({ user_id: 'u-2', benutzer_name: 'Nie Da', zuletzt_gesehen: null }),
      konto({ user_id: 'u-3', benutzer_name: 'Lang Weg', zuletzt_gesehen: '2020-01-01T00:00:00Z' }),
    ])
    expect(await screen.findByText('2 / 3')).toBeTruthy()
  })

  it('lässt deaktivierte Konten aus der Zahl heraus', async () => {
    // Ein stillgelegtes Konto ohne Aktivität ist kein Befund, sondern erwartet —
    // mitgezählt würde die Kachel bei jedem Austritt schlechter aussehen.
    setup(AKTIONEN, [
      konto({ user_id: 'u-1' }),
      konto({ user_id: 'u-2', benutzer_name: 'Ausgetreten', is_active: false, zuletzt_gesehen: null }),
    ])
    expect(await screen.findByText('0 / 1')).toBeTruthy()
  })
})

describe('UsageScreen — Modul-Inventar', () => {
  it('stellt aktive Module ohne Aktionen nach oben', async () => {
    setup()
    const rows = await rowsAfter(/Modul-Inventar/)
    const erste = rows.slice(0, 2).map(r => r.querySelector('td')!.textContent)
    expect(erste.sort()).toEqual(['aftersales', 'scheduling'])
    expect(rows[0].textContent).toContain('ungenutzt')
  })

  it('summiert Aktionen über alle Aktionen eines Moduls', async () => {
    setup()
    const rows = await rowsAfter(/Modul-Inventar/)
    const quotes = rows.find(r => r.textContent?.startsWith('quotes'))!
    // admin_send_quote (10) + admin_update_quote (5)
    expect(quotes.textContent).toContain('15')
  })

  it('zeigt auch Module, die Aktionen haben aber abgeschaltet wurden', async () => {
    setup(AKTIONEN, [konto()], ['quotes'])
    const rows = await rowsAfter(/Modul-Inventar/)
    const invoicing = rows.find(r => r.textContent?.startsWith('invoicing'))
    expect(invoicing).toBeTruthy()
    expect(invoicing!.textContent).toContain('nicht aktiv')
  })
})

describe('UsageScreen — Adoption', () => {
  it('markiert Konten, die nie eingeloggt waren', async () => {
    setup(AKTIONEN, [konto({ benutzer_name: 'Nie Da', zuletzt_gesehen: null })])
    const rows = await rowsAfter(/Adoption/)
    expect(rows[0].textContent).toContain('Nie Da')
    expect(rows[0].querySelector('.usage-dead')?.textContent).toBe('nie')
  })

  it('stellt "nie eingeloggt" ganz nach oben, nicht ans Ende', async () => {
    // Als null sortierte DataTable die Zeile über `?? ''` als leeren String —
    // ausgerechnet der wichtigste Eintrag stand damit zuunterst.
    setup(AKTIONEN, [
      konto({ user_id: 'u-1', benutzer_name: 'Gestern Da' }),
      konto({ user_id: 'u-2', benutzer_name: 'Nie Da', zuletzt_gesehen: null }),
      konto({ user_id: 'u-3', benutzer_name: 'Vor Monaten', zuletzt_gesehen: '2026-04-02T10:00:00Z' }),
    ])
    const rows = await rowsAfter(/Adoption/)
    expect(rows.map(r => r.querySelector('td')!.textContent))
      .toEqual(['Nie Da', 'Vor Monaten', 'Gestern Da'])
  })

  it('nennt keine Aktionszahl pro Person', async () => {
    // Spec §5: die Tabelle darf kein Leistungsbild ergeben. Bricht, sobald
    // jemand eine Aktions-Spalte ergänzt.
    setup()
    const kopf = await headersAfter(/Adoption/)
    expect(kopf).toEqual(['Benutzer', 'Rolle', 'Konto', 'Zuletzt gesehen', 'vor Tagen', 'Konto seit'])
  })
})

describe('UsageScreen — Aktionen', () => {
  it('übersetzt Aktionsschlüssel und nennt das Modul', async () => {
    setup()
    const rows = await rowsAfter(/Nach Aktion/)
    expect(rows[0].textContent).toContain('Offerte versendet')
    expect(rows[0].textContent).toContain('quotes')
  })

  it('weist auf nicht zugeordnete Aktionen hin', async () => {
    setup([aktion({ action: 'voellig_neue_sache', aktionen: 4 })])
    expect(await screen.findByText(/Aktionen ohne Modul-Zuordnung/)).toBeTruthy()
  })
})
