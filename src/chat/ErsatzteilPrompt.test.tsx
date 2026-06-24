import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ErsatzteilPrompt from './ErsatzteilPrompt'
import { fetchFrequentMaterials, recordErsatzteile } from '../api/chat'

vi.mock('../api/chat', () => ({
  fetchFrequentMaterials: vi.fn(),
  recordErsatzteile: vi.fn(),
}))

const mockFetch = vi.mocked(fetchFrequentMaterials)
const mockRecord = vi.mocked(recordErsatzteile)

const LIST = [
  { id: 'f1', art_nr: 'A1', name: 'Motor', unit: 'Stk', calc_vk: 250 },
  { id: 'f2', art_nr: 'B2', name: 'Kette', unit: 'm', calc_vk: 12 },
]

beforeEach(() => {
  vi.clearAllMocks()
  mockRecord.mockResolvedValue({ status: 'ok', recorded: 0 })
})

describe('ErsatzteilPrompt', () => {
  it('überspringt den Schritt (onDone) wenn keine Teile kuratiert sind', async () => {
    mockFetch.mockResolvedValue([])
    const onDone = vi.fn()
    render(<ErsatzteilPrompt reportId={42} onDone={onDone} />)

    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(mockRecord).not.toHaveBeenCalled()
    expect(screen.queryByText('Ersatzteile verbraucht?')).not.toBeInTheDocument()
  })

  it('bucht ausgewählte Teile mit Menge und ruft onDone', async () => {
    mockFetch.mockResolvedValue(LIST)
    const onDone = vi.fn()
    const user = userEvent.setup()
    render(<ErsatzteilPrompt reportId={42} onDone={onDone} />)

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

    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(mockRecord).toHaveBeenCalledTimes(1)
    const [reportId, items] = mockRecord.mock.calls[0]
    expect(reportId).toBe(42)
    expect(items).toEqual(
      expect.arrayContaining([
        { art_nr: 'A1', amount: 3 },
        { art_nr: 'B2', amount: 1 },
      ]),
    )
    expect(items).toHaveLength(2)
  })

  it('sendet bei "Nichts verbraucht" eine leere Liste', async () => {
    mockFetch.mockResolvedValue(LIST)
    const onDone = vi.fn()
    const user = userEvent.setup()
    render(<ErsatzteilPrompt reportId={7} onDone={onDone} />)

    await screen.findByText('Ersatzteile verbraucht?')
    await user.click(screen.getByRole('button', { name: 'Nichts verbraucht' }))

    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(mockRecord).toHaveBeenCalledWith(7, [])
  })

  it('hält "Erfassen" deaktiviert, solange nichts gewählt ist', async () => {
    mockFetch.mockResolvedValue(LIST)
    render(<ErsatzteilPrompt reportId={1} onDone={vi.fn()} />)

    const erfassen = await screen.findByRole('button', { name: /Erfassen/ })
    expect(erfassen).toBeDisabled()
  })
})
