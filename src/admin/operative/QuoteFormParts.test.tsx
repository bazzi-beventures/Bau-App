import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SkontoFieldset, pdfUploadErrorMessage } from './QuoteFormParts'
import { ApiError } from '../../api/client'

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

// Kundenmeldung: "PDF lädt, dann passiert nichts, ich muss nochmal hochladen."
// Eine der Ursachen war eine leere Fehlermeldung — die Formulare rendern mit
// `{pdfError && …}`, ein Leerstring zeigt dort nichts an.
describe('pdfUploadErrorMessage', () => {
  const setOnline = (v: boolean) =>
    Object.defineProperty(navigator, 'onLine', { value: v, configurable: true })
  afterEach(() => setOnline(true))

  it('gibt bei abgebrochener Verbindung NICHT "kein Internet" aus, wenn der Browser online ist', () => {
    // ApiError(0) heisst nur "fetch abgebrochen". Auf dem OCR-Endpoint ist das
    // fast immer der Proxy, der waehrend der laufenden Analyse dichtmacht.
    setOnline(true)
    const msg = pdfUploadErrorMessage(new ApiError(0, 'Keine Internetverbindung'))
    expect(msg).toMatch(/Verbindung zum Server ist abgebrochen/i)
    expect(msg).not.toMatch(/Keine Internetverbindung/i)
  })

  it('meldet echtes Offline nur, wenn der Browser sich selbst offline meldet', () => {
    setOnline(false)
    expect(pdfUploadErrorMessage(new ApiError(0, 'egal'))).toMatch(/Keine Internetverbindung/i)
  })

  it('reicht die Serverantwort durch (z.B. das 422-Detail des OCR-Endpoints)', () => {
    const msg = pdfUploadErrorMessage(new ApiError(422, 'PDF-Extraktion fehlgeschlagen: ungültiges JSON'))
    expect(msg).toBe('PDF-Extraktion fehlgeschlagen: ungültiges JSON')
  })

  it('liefert nie einen Leerstring — auch nicht bei leerer oder fremder Fehlerform', () => {
    expect(pdfUploadErrorMessage(new ApiError(500, ''))).not.toBe('')
    expect(pdfUploadErrorMessage(new Error('   '))).not.toBe('')
    expect(pdfUploadErrorMessage(undefined)).not.toBe('')
    expect(pdfUploadErrorMessage({ irgendwas: true })).not.toBe('')
  })
})
