import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ErsatzteilPrompt from './ErsatzteilPrompt'
import { fetchFrequentMaterials } from '../api/chat'

vi.mock('../api/chat', () => ({
  fetchFrequentMaterials: vi.fn(),
}))

const mockFetch = vi.mocked(fetchFrequentMaterials)

const LIST = [
  { id: 'f1', art_nr: 'A1', name: 'Motor', unit: 'Stk', calc_vk: 250 },
  { id: 'f2', art_nr: 'B2', name: 'Kette', unit: 'm', calc_vk: 12 },
]

beforeEach(() => {
  vi.clearAllMocks()
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
})
