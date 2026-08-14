import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ErsatzteilPrompt from './ErsatzteilPrompt'
import { fetchFrequentMaterials, fetchMaterialGalleryCount, fetchMaterialGallery } from '../api/chat'

vi.mock('../api/chat', () => ({
  fetchFrequentMaterials: vi.fn(),
  fetchMaterialGalleryCount: vi.fn(),
  fetchMaterialGallery: vi.fn(),
}))

const mockFetch = vi.mocked(fetchFrequentMaterials)
const mockCount = vi.mocked(fetchMaterialGalleryCount)
const mockGallery = vi.mocked(fetchMaterialGallery)

const LIST = [
  { id: 'f1', art_nr: 'A1', name: 'Motor', unit: 'Stk', calc_vk: 250 },
  { id: 'f2', art_nr: 'B2', name: 'Kette', unit: 'm', calc_vk: 12 },
]

beforeEach(() => {
  vi.clearAllMocks()
  mockCount.mockResolvedValue(0)   // Default: keine Foto-Artikel → wie bisher (kein Foto-Button)
  mockGallery.mockResolvedValue([])
})

describe('ErsatzteilPrompt', () => {
  it('überspringt den Schritt (onSubmit []) wenn keine Teile kuratiert sind', async () => {
    mockFetch.mockResolvedValue([])
    const onSubmit = vi.fn()
    render(<ErsatzteilPrompt onSubmit={onSubmit} />)

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith([]))
    expect(screen.queryByText('Ersatzteile verbraucht?')).not.toBeInTheDocument()
  })

  it('sammelt ausgewählte Teile mit Menge und ruft onSubmit', async () => {
    mockFetch.mockResolvedValue(LIST)
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<ErsatzteilPrompt onSubmit={onSubmit} />)

    expect(await screen.findByText('Ersatzteile verbraucht?')).toBeInTheDocument()

    // Beide Teile anhaken
    const checkboxes = screen.getAllByRole('checkbox')
    await user.click(checkboxes[0])  // A1 → Menge 1
    await user.click(checkboxes[1])  // B2 → Menge 1

    // A1 auf Menge 3 hochzählen (Stepper-+ erscheint pro gewählter Zeile)
    const plusButtons = screen.getAllByRole('button', { name: '+' })
    await user.click(plusButtons[0])
    await user.click(plusButtons[0])

    await user.click(screen.getByRole('button', { name: /Erfassen/ }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    const [items] = onSubmit.mock.calls[0]
    expect(items).toEqual(
      expect.arrayContaining([
        { art_nr: 'A1', amount: 3, name: 'Motor', unit: 'Stk' },
        { art_nr: 'B2', amount: 1, name: 'Kette', unit: 'm' },
      ]),
    )
    expect(items).toHaveLength(2)
  })

  // ── Einbauort (Feature `material_standort`) ────────────────────────────
  // Der Ort ist freiwillig: er erscheint nur bei gewählter Zeile, nur mit Flag,
  // und ein leeres Feld darf NICHT als '' in der Datenbank landen — sonst liesse
  // sich «nicht erfasst» nicht mehr von «bewusst leer» unterscheiden.

  it('zeigt kein Einbauort-Feld ohne das Flag', async () => {
    mockFetch.mockResolvedValue(LIST)
    const user = userEvent.setup()
    render(<ErsatzteilPrompt onSubmit={vi.fn()} />)

    await screen.findByText('Ersatzteile verbraucht?')
    await user.click(screen.getAllByRole('checkbox')[0])
    expect(screen.queryByPlaceholderText(/Einbauort/)).not.toBeInTheDocument()
  })

  it('zeigt das Einbauort-Feld erst bei gewählter Zeile', async () => {
    mockFetch.mockResolvedValue(LIST)
    const user = userEvent.setup()
    render(<ErsatzteilPrompt onSubmit={vi.fn()} showLocation />)

    await screen.findByText('Ersatzteile verbraucht?')
    expect(screen.queryByPlaceholderText(/Einbauort/)).not.toBeInTheDocument()
    await user.click(screen.getAllByRole('checkbox')[0])
    expect(screen.getAllByPlaceholderText(/Einbauort/)).toHaveLength(1)
  })

  it('gibt den erfassten Einbauort mit, leere bleiben weg', async () => {
    mockFetch.mockResolvedValue(LIST)
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<ErsatzteilPrompt onSubmit={onSubmit} showLocation />)

    await screen.findByText('Ersatzteile verbraucht?')
    const checkboxes = screen.getAllByRole('checkbox')
    await user.click(checkboxes[0])
    await user.click(checkboxes[1])
    // Nur bei der ersten Zeile einen Ort eintippen.
    await user.type(screen.getAllByPlaceholderText(/Einbauort/)[0], 'Wohnzimmer Süd')
    await user.click(screen.getByRole('button', { name: /Erfassen/ }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    const [items] = onSubmit.mock.calls[0]
    expect(items).toEqual(
      expect.arrayContaining([
        { art_nr: 'A1', amount: 1, name: 'Motor', unit: 'Stk', location: 'Wohnzimmer Süd' },
        { art_nr: 'B2', amount: 1, name: 'Kette', unit: 'm' },
      ]),
    )
  })

  it('sendet bei "Nichts verbraucht" eine leere Liste', async () => {
    mockFetch.mockResolvedValue(LIST)
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<ErsatzteilPrompt onSubmit={onSubmit} />)

    await screen.findByText('Ersatzteile verbraucht?')
    await user.click(screen.getByRole('button', { name: 'Nichts verbraucht' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith([]))
  })

  it('hält "Erfassen" deaktiviert, solange nichts gewählt ist', async () => {
    mockFetch.mockResolvedValue(LIST)
    render(<ErsatzteilPrompt onSubmit={vi.fn()} />)

    const erfassen = await screen.findByRole('button', { name: /Erfassen/ })
    expect(erfassen).toBeDisabled()
  })

  it('zeigt keinen Katalog-Button, wenn es keine aktiven Artikel gibt', async () => {
    mockFetch.mockResolvedValue(LIST)
    mockCount.mockResolvedValue(0)
    render(<ErsatzteilPrompt onSubmit={vi.fn()} />)

    await screen.findByText('Ersatzteile verbraucht?')
    expect(screen.queryByRole('button', { name: /Katalog/ })).not.toBeInTheDocument()
  })

  it('rendert den Schritt mit Katalog-Button auch ohne kuratierte Liste, wenn Artikel existieren', async () => {
    mockFetch.mockResolvedValue([])   // keine kuratierten Ersatzteile …
    mockCount.mockResolvedValue(5)    // … aber 5 aktive Katalog-Artikel
    const onSubmit = vi.fn()
    render(<ErsatzteilPrompt onSubmit={onSubmit} />)

    expect(await screen.findByText('Ersatzteile verbraucht?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Katalog/ })).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()   // Schritt wird NICHT übersprungen
  })
})
