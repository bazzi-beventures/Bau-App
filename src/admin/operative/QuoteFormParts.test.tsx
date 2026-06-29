import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SkontoFieldset } from './QuoteFormParts'

describe('SkontoFieldset', () => {
  it('rendert beide Felder mit den übergebenen Werten', () => {
    render(
      <SkontoFieldset skontoPct="2" skontoDays="10" onPctChange={() => {}} onDaysChange={() => {}} />
    )
    expect(screen.getByText('Skonto')).toBeInTheDocument()
    expect(screen.getByDisplayValue('2')).toBeInTheDocument()
    expect(screen.getByDisplayValue('10')).toBeInTheDocument()
  })

  it('meldet Eingaben über onPctChange / onDaysChange', async () => {
    const onPct = vi.fn()
    const onDays = vi.fn()
    const user = userEvent.setup()
    render(
      <SkontoFieldset skontoPct="" skontoDays="" onPctChange={onPct} onDaysChange={onDays} />
    )
    // Felder über ihre Labels ansteuern (title-Attribut spielt keine Rolle).
    const inputs = screen.getAllByRole('textbox')
    await user.type(inputs[0], '3')
    await user.type(inputs[1], '7')
    expect(onPct).toHaveBeenCalledWith('3')
    expect(onDays).toHaveBeenCalledWith('7')
  })

  it('weist darauf hin, dass das Total unverändert bleibt', () => {
    render(
      <SkontoFieldset skontoPct="" skontoDays="" onPctChange={() => {}} onDaysChange={() => {}} />
    )
    expect(screen.getByText(/Total bleibt unverändert/i)).toBeInTheDocument()
  })
})
