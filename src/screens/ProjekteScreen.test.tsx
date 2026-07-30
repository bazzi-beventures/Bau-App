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

// Projektliste per GET, Detail-Ressourcen (files/comments/tasks) leer.
function routeFetch(projects: Record<string, unknown>[]) {
  mockFetch.mockImplementation((path: string) => {
    if (path === '/pwa/projects') return Promise.resolve(projects)
    return Promise.resolve([])
  })
}

const NOOP = {
  onNavHome: () => {},
  onNavRapport: () => {},
  onNavArbeitszeit: () => {},
  onNavProfile: () => {},
  onLoggedOut: () => {},
}

async function openProject(projects: Record<string, unknown>[], onStartRapport = vi.fn()) {
  const user = userEvent.setup()
  routeFetch(projects)
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
