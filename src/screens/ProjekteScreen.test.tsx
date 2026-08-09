import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProjekteScreen from './ProjekteScreen'
import { apiFetch } from '../api/client'

// Rapport-Sperre in der Mitarbeiter-PWA (Feature rapport_offerten_annahme_pflicht):
// Das Backend liefert pro Projekt `rapport_blocked`; ist es gesetzt, ist der
// Rapport-Knopf ausgegraut und ein Hinweis erklärt warum. Die eigentliche
// Durchsetzung liegt serverseitig im Rapport-Chat — hier geht es nur um die
// sichtbare Hälfte.

vi.mock('../api/client', () => ({
  apiFetch: vi.fn(),
  apiFormFetch: vi.fn(),
  apiUrl: (p: string) => p,
  isNetworkError: () => false,
  ApiError: class ApiError extends Error {
    status: number
    constructor(status = 500, msg = '') { super(msg); this.status = status }
  },
}))

const mockFetch = vi.mocked(apiFetch)

function project(over: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    name: 'MFH Sonnhalde',
    kind: 'project',
    art_der_arbeit: ['Montage'],
    customer_id: null,
    customer: null,
    object_name: null,
    object_address: null,
    start_date: null,
    end_date: null,
    start_time: null,
    end_time: null,
    kontakte: [],
    bemerkung: null,
    geruestfach: null,
    ...over,
  }
}

// Projektliste per GET, Detail-Ressourcen (files/comments/tasks/reports) leer,
// sofern der Test nichts anderes vorgibt.
function routeFetch(projects: Record<string, unknown>[], extra: Record<string, unknown> = {}) {
  mockFetch.mockImplementation((path: string) => {
    if (path === '/pwa/projects') return Promise.resolve(projects)
    if (path in extra) return Promise.resolve(extra[path])
    return Promise.resolve([])
  })
}

function report(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    report_date: '2026-08-05',
    description: 'Storen montiert',
    created_by: 'Max Muster',
    signature_timestamp: null,
    invoice_id: null,
    created_at: '2026-08-05T16:00:00Z',
    source: 'chat',
    is_own: true,
    ...over,
  }
}

const NOOP = {
  onNavHome: () => {},
  onNavRapport: () => {},
  onNavArbeitszeit: () => {},
  onNavProfile: () => {},
  onLoggedOut: () => {},
}

async function openProject(
  projects: Record<string, unknown>[],
  onStartRapport = vi.fn(),
  extra: Record<string, unknown> = {},
) {
  const user = userEvent.setup()
  routeFetch(projects, extra)
  render(<ProjekteScreen {...NOOP} onStartRapport={onStartRapport} />)

  await waitFor(() => expect(screen.getByText('MFH Sonnhalde')).toBeInTheDocument())
  await user.click(screen.getByText('MFH Sonnhalde'))
  const button = await screen.findByRole('button', { name: /Rapport erstellen/ })
  return { user, button, onStartRapport }
}

beforeEach(() => {
  mockFetch.mockReset()
})

describe('ProjekteScreen — Rapport-Sperre', () => {
  it('sperrt den Rapport-Knopf, solange keine Offerte angenommen ist', async () => {
    const { user, button, onStartRapport } = await openProject([
      project({ rapport_blocked: true }),
    ])

    expect(button).toBeDisabled()
    expect(screen.getByText(/noch nicht angenommen/)).toBeInTheDocument()

    await user.click(button)
    expect(onStartRapport).not.toHaveBeenCalled()
  })

  it('lässt den Rapport zu, sobald eine Offerte angenommen ist', async () => {
    const { user, button, onStartRapport } = await openProject([
      project({ rapport_blocked: false }),
    ])

    expect(button).toBeEnabled()
    expect(screen.queryByText(/noch nicht angenommen/)).not.toBeInTheDocument()

    await user.click(button)
    expect(onStartRapport).toHaveBeenCalledWith('MFH Sonnhalde')
  })

  it('behandelt ein fehlendes Feld als "nicht gesperrt" (ältere API)', async () => {
    const { button } = await openProject([project()])
    expect(button).toBeEnabled()
  })
})

// Der Fallback selbst liegt im Backend (db.project_contacts_with_customer_fallback) —
// hier zählt nur, dass der abgeleitete Eintrag als solcher gekennzeichnet wird und der
// Monteur nicht denkt, jemand habe diese Person für die Baustelle benannt.
describe('ProjekteScreen — Kontakt aus dem Kundenstamm', () => {
  it('kennzeichnet einen vom Kunden abgeleiteten Kontakt', async () => {
    await openProject([project({
      kontakte: [{
        name: 'Muster AG', kommentar: 'Kunde', telefon: '079 111 22 33',
        email: 'info@muster.ch', is_site_contact: false, from_customer: true,
      }],
    })])

    expect(screen.getByText('Muster AG')).toBeInTheDocument()
    expect(screen.getByText(/keine Ansprechperson hinterlegt/)).toBeInTheDocument()
  })

  it('zeigt bei einer echten Ansprechperson deren Kommentar', async () => {
    await openProject([project({
      kontakte: [{ name: 'Herr Meier', kommentar: 'Bauleiter', telefon: '079 5', email: '' }],
    })])

    expect(screen.getByText('Bauleiter')).toBeInTheDocument()
    expect(screen.queryByText(/keine Ansprechperson hinterlegt/)).not.toBeInTheDocument()
  })
})

// Adressen sind Kartenlinks: der Monteur tippt sie an und landet in der Navigation,
// statt sie abzutippen.
describe('ProjekteScreen — Adressen als Kartenlink', () => {
  function customer(over: Record<string, unknown> = {}) {
    return {
      id: 'c1', name: 'Muster AG', billing_name: null, address: null,
      billing_address: null, object_address: null, email: null, phone: null,
      ...over,
    }
  }

  it('verlinkt die Objektadresse auf Google Maps', async () => {
    await openProject([project({ object_address: 'Bahnhofstrasse 1, 8001 Zürich' })])

    const link = screen.getByRole('link', { name: /Bahnhofstrasse 1, 8001 Zürich in Google Maps/ })
    expect(link).toHaveAttribute(
      'href',
      'https://www.google.com/maps/search/?api=1&query=Bahnhofstrasse%201%2C%208001%20Z%C3%BCrich',
    )
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('zeigt die Kundenadresse zusätzlich, wenn sie von der Objektadresse abweicht', async () => {
    await openProject([project({
      object_address: 'Baustelle 5, 8001 Zürich',
      customer: customer({ address: 'Büroweg 2, 6000 Luzern' }),
    })])

    expect(screen.getByText('Kundenadresse')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Büroweg 2, 6000 Luzern in Google Maps/ })).toBeInTheDocument()
  })

  it('lässt die Kundenadresse weg, wenn sie mit der Objektadresse identisch ist', async () => {
    await openProject([project({
      object_address: 'Baustelle 5, 8001 Zürich',
      customer: customer({ address: 'Baustelle 5, 8001 Zürich' }),
    })])

    expect(screen.queryByText('Kundenadresse')).not.toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /Baustelle 5, 8001 Zürich in Google Maps/ })).toHaveLength(1)
  })

  it('fällt ohne Projekt-Objektadresse auf die des Kunden zurück', async () => {
    await openProject([project({
      object_address: null,
      customer: customer({ object_address: 'Objektweg 9, 3000 Bern' }),
    })])

    expect(screen.getByRole('link', { name: /Objektweg 9, 3000 Bern in Google Maps/ })).toBeInTheDocument()
  })
})

// Rapporte des Projekts im Detail: der Monteur soll sehen, was erfasst wurde — auch
// von Kollegen — und das PDF öffnen können. Löschen bleibt auf eigene, unsignierte
// und unverrechnete Rapporte beschränkt (der Server prüft dieselben Regeln nochmals).
describe('ProjekteScreen — Rapporte des Projekts', () => {
  const REPORTS_PATH = '/pwa/projects/p1/reports'

  it('listet den erfassten Rapport mit Ansehen-Knopf', async () => {
    await openProject([project()], vi.fn(), { [REPORTS_PATH]: [report()] })

    expect(await screen.findByText('Rapporte')).toBeInTheDocument()
    expect(screen.getByText('05.08.2026')).toBeInTheDocument()
    expect(screen.getByText('Storen montiert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Ansehen/ })).toBeInTheDocument()
  })

  it('zeigt den Rapport eines Kollegen ohne Löschen-Knopf', async () => {
    await openProject([project()], vi.fn(), {
      [REPORTS_PATH]: [report({ is_own: false, created_by: 'Anna Beispiel' })],
    })

    expect(await screen.findByText('Anna Beispiel')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Ansehen/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Löschen' })).not.toBeInTheDocument()
  })

  it('sperrt das Löschen des eigenen Rapports, sobald er unterschrieben ist', async () => {
    await openProject([project()], vi.fn(), {
      [REPORTS_PATH]: [report({ signature_timestamp: '2026-08-05T17:00:00Z' })],
    })

    expect(await screen.findByText('unterschrieben')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Löschen' })).not.toBeInTheDocument()
  })

  it('lässt den eigenen, unsignierten Rapport löschen', async () => {
    await openProject([project()], vi.fn(), { [REPORTS_PATH]: [report()] })

    expect(await screen.findByRole('button', { name: 'Löschen' })).toBeInTheDocument()
  })
})
