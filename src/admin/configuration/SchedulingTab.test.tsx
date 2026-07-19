import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ConfigurationScreen from './ConfigurationScreen'
import { getSchedulingConfig, updateSchedulingConfig } from '../../api/admin'

// Client-apiFetch neutralisieren: der Default-Tab (Wochenplan) lädt beim Mount.
vi.mock('../../api/client', () => ({
  apiFetch: vi.fn().mockResolvedValue({}),
  ApiError: class ApiError extends Error {},
}))

// Echte Konstanten (SCHEDULING_KINDS/FIELDS) behalten, nur die zwei Calls mocken.
vi.mock('../../api/admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/admin')>()
  return { ...actual, getSchedulingConfig: vi.fn(), updateSchedulingConfig: vi.fn() }
})

const mockGet = vi.mocked(getSchedulingConfig)
const mockUpdate = vi.mocked(updateSchedulingConfig)

const DEFAULTS = {
  fields: { address: true, projektleiter: false, customer: false, bemerkung: false },
  colors: {
    project: '#3081ab', teamsitzung: '#7c3aed', lagerarbeit: '#d97706',
    werkstatt: '#0d9488', sonstiges: '#475569',
  },
  grey_after: '',
}

beforeEach(() => {
  vi.clearAllMocks()
})

async function openTab() {
  const user = userEvent.setup()
  render(<ConfigurationScreen userRole="superadmin" />)
  await user.click(screen.getByRole('button', { name: 'Einsatzplanung' }))
  return user
}

describe('SchedulingTab', () => {
  it('lädt die Config und füllt Defaults auf (Adresse an, Projektleiter aus)', async () => {
    mockGet.mockResolvedValue({ config: {}, defaults: DEFAULTS })
    await openTab()

    const address = await screen.findByLabelText('Adresse (Objekt)')
    expect(address).toBeChecked()
    expect(screen.getByLabelText('Projektleiter')).not.toBeChecked()
  })

  it('Checkbox-Änderung aktiviert Speichern und sendet die neue Config', async () => {
    mockGet.mockResolvedValue({ config: {}, defaults: DEFAULTS })
    mockUpdate.mockResolvedValue({ config: { ...DEFAULTS, fields: { ...DEFAULTS.fields, projektleiter: true } } })
    const user = await openTab()

    await screen.findByLabelText('Adresse (Objekt)')
    const saveBtn = screen.getByRole('button', { name: 'Speichern' })
    expect(saveBtn).toBeDisabled()  // noch nichts geändert

    await user.click(screen.getByLabelText('Projektleiter'))
    expect(saveBtn).not.toBeDisabled()

    await user.click(saveBtn)
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1))
    const sent = mockUpdate.mock.calls[0][0]
    expect(sent.fields.projektleiter).toBe(true)
    expect(sent.fields.address).toBe(true)
    expect(sent.colors.project).toBe('#3081ab')
  })

  it('Config-Overrides gewinnen über Defaults', async () => {
    mockGet.mockResolvedValue({
      config: { fields: { bemerkung: true }, colors: { teamsitzung: '#111111' } },
      defaults: DEFAULTS,
    })
    await openTab()

    expect(await screen.findByLabelText('Bemerkung')).toBeChecked()
  })

  it('Ausgrau-Uhrzeit wird geladen und mitgespeichert', async () => {
    mockGet.mockResolvedValue({ config: { grey_after: '12:00' }, defaults: DEFAULTS })
    mockUpdate.mockResolvedValue({ config: { ...DEFAULTS, grey_after: '13:30' } })
    const user = await openTab()

    const timeInput = await screen.findByLabelText('Ausgrauen ab Uhrzeit')
    expect(timeInput).toHaveValue('12:00')

    const saveBtn = screen.getByRole('button', { name: 'Speichern' })
    expect(saveBtn).toBeDisabled()  // noch nichts geändert

    await user.clear(timeInput)
    await user.type(timeInput, '13:30')
    expect(saveBtn).not.toBeDisabled()

    await user.click(saveBtn)
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1))
    expect(mockUpdate.mock.calls[0][0].grey_after).toBe('13:30')
  })
})
