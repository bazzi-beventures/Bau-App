import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReportCreateForm } from './ReportCreateForm'
import type { ReportFormProject, ReportFormStaff } from './ReportCreateForm'
import type { ProjectQuote } from './projectDetail/tabs'
import { apiFetch } from '../../api/client'

// Nur den Netzwerk-Call mocken — der Rest (Formatierung, useBackButton, InfoHint)
// bleibt echt.
vi.mock('../../api/client', () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {},
}))

// MaterialCombobox durch ein schlichtes <select> ersetzen — die echte Combobox
// nutzt Portale/getBoundingClientRect/useIsMobile und ist im jsdom schwer zu
// bedienen. Der Kontrakt (value ⇄ onChange(art_nr)) bleibt erhalten.
vi.mock('./MaterialCombobox', () => ({
  MaterialCombobox: ({ value, onChange }: { value: string; onChange: (a: string) => void }) => (
    <select aria-label="Material" value={value} onChange={e => onChange(e.target.value)}>
      <option value="">— Material wählen —</option>
      <option value="STG123">STG123</option>
      <option value="STG999">STG999</option>
    </select>
  ),
}))

const mockFetch = vi.mocked(apiFetch)

// Die zuletzt an apiFetch übergebene POST-Nutzlast (Material-Zeilen laden vorher
// per GET nach — deshalb nicht blind calls[0] nehmen).
function lastPostBody(): Record<string, unknown> {
  const call = [...mockFetch.mock.calls].reverse().find(
    c => (c[1] as RequestInit | undefined)?.method === 'POST',
  )
  return JSON.parse((call![1] as RequestInit).body as string)
}

function postFired(): boolean {
  return mockFetch.mock.calls.some(c => (c[1] as RequestInit | undefined)?.method === 'POST')
}

const PROJECT: ReportFormProject = { id: 'p1', name: 'MFH Sonnhalde' }
const STAFF: ReportFormStaff[] = [
  { id: 's1', name: 'Anna' },
  { id: 's2', name: 'Bob' },
]

function makeQuote(over: Partial<ProjectQuote> = {}): ProjectQuote {
  return {
    id: 1,
    parent_id: 1,
    version: 1,
    quote_number: 'OFF-2026-014',
    total_amount: 12500,
    status: 'akzeptiert',
    created_at: '2026-07-20T10:00:00Z',
    pdf_url: null,
    xlsx_url: null,
    customer_email: null,
    ...over,
  }
}

function renderForm(quotes: ProjectQuote[] = [], onDone = vi.fn(), onCancel = vi.fn()) {
  render(
    <ReportCreateForm
      project={PROJECT}
      staff={STAFF}
      quotes={quotes}
      onDone={onDone}
      onCancel={onCancel}
    />,
  )
  return { onDone, onCancel }
}

beforeEach(() => {
  mockFetch.mockReset()
  mockFetch.mockResolvedValue({ report_id: 42 })
})

describe('ReportCreateForm', () => {
  it('fügt Mitarbeiter-Zeilen hinzu und entfernt sie wieder', async () => {
    const user = userEvent.setup()
    renderForm()

    expect(screen.getByLabelText('Mitarbeiter 1')).toBeInTheDocument()
    expect(screen.queryByLabelText('Mitarbeiter 2')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '+ Zeile' }))
    expect(screen.getByLabelText('Mitarbeiter 2')).toBeInTheDocument()

    // Zweite Zeile wieder entfernen.
    await user.click(screen.getAllByLabelText('Zeile entfernen')[1])
    expect(screen.queryByLabelText('Mitarbeiter 2')).not.toBeInTheDocument()
  })

  it('blockiert das Speichern ohne ausgewählten Mitarbeiter', async () => {
    const user = userEvent.setup()
    renderForm([makeQuote()])

    await user.click(screen.getByRole('button', { name: 'Rapport speichern' }))

    expect(mockFetch).not.toHaveBeenCalled()
    expect(screen.getByText('Mindestens ein Mitarbeiter mit Stunden erforderlich.')).toBeInTheDocument()
  })

  it('blockiert das Speichern bei leerem Arbeitsbeschrieb', async () => {
    const user = userEvent.setup()
    renderForm() // keine Offerte → Beschrieb leer

    await user.selectOptions(screen.getByLabelText('Mitarbeiter 1'), 's1')
    await user.type(screen.getByLabelText('Stunden 1'), '6')
    await user.click(screen.getByRole('button', { name: 'Rapport speichern' }))

    expect(mockFetch).not.toHaveBeenCalled()
    expect(screen.getByText('Arbeitsbeschrieb erforderlich.')).toBeInTheDocument()
  })

  it('sendet exakt { report_date, description, staff:[{staff_id, hours}] }', async () => {
    const user = userEvent.setup()
    const { onDone } = renderForm([makeQuote()])

    fireEvent.change(screen.getByLabelText('Datum *'), { target: { value: '2026-07-21' } })
    await user.selectOptions(screen.getByLabelText('Mitarbeiter 1'), 's1')
    await user.type(screen.getByLabelText('Stunden 1'), '6.5')
    await user.click(screen.getByRole('button', { name: 'Rapport speichern' }))

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/pwa/admin/projects/p1/reports')
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body as string)).toEqual({
      report_date: '2026-07-21',
      description: 'Arbeiten gemäss Offerte OFF-2026-014',
      staff: [{ staff_id: 's1', hours: 6.5 }],
    })
    await waitFor(() => expect(onDone).toHaveBeenCalled())
  })

  it('füllt den Arbeitsbeschrieb aus der Offerten-Nummer vor', () => {
    renderForm([makeQuote({ quote_number: 'OFF-2026-099' })])
    expect(screen.getByLabelText('Arbeitsbeschrieb *')).toHaveValue('Arbeiten gemäss Offerte OFF-2026-099')
  })

  it('lässt den Beschrieb leer, wenn keine Offerte existiert', () => {
    renderForm([])
    expect(screen.getByLabelText('Arbeitsbeschrieb *')).toHaveValue('')
  })

  it('lehnt doppelte Mitarbeiter ab', async () => {
    const user = userEvent.setup()
    renderForm([makeQuote()])

    await user.selectOptions(screen.getByLabelText('Mitarbeiter 1'), 's1')
    await user.type(screen.getByLabelText('Stunden 1'), '4')
    await user.click(screen.getByRole('button', { name: '+ Zeile' }))
    await user.selectOptions(screen.getByLabelText('Mitarbeiter 2'), 's1')
    await user.type(screen.getByLabelText('Stunden 2'), '3')
    await user.click(screen.getByRole('button', { name: 'Rapport speichern' }))

    expect(mockFetch).not.toHaveBeenCalled()
    expect(screen.getByText('Ein Mitarbeiter ist doppelt erfasst.')).toBeInTheDocument()
  })

  // ── Phase 2: Material ─────────────────────────────────────

  it('fügt Materialzeilen hinzu und entfernt sie wieder', async () => {
    const user = userEvent.setup()
    renderForm()

    // Standardmässig keine Materialzeile.
    expect(screen.queryByLabelText('Material')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '+ Materialposition' }))
    expect(screen.getAllByLabelText('Material')).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: '+ Materialposition' }))
    expect(screen.getAllByLabelText('Material')).toHaveLength(2)

    await user.click(screen.getAllByLabelText('Materialzeile entfernen')[1])
    expect(screen.getAllByLabelText('Material')).toHaveLength(1)
  })

  it('sendet nur vollständige Materialzeilen als { art_nr, amount } und lässt leere weg', async () => {
    const user = userEvent.setup()
    const { onDone } = renderForm([makeQuote()])

    await user.selectOptions(screen.getByLabelText('Mitarbeiter 1'), 's1')
    await user.type(screen.getByLabelText('Stunden 1'), '6')

    // Zeile 1 vollständig (Artikel + Menge), Zeile 2 bleibt leer → wird ausgeschlossen.
    await user.click(screen.getByRole('button', { name: '+ Materialposition' }))
    await user.click(screen.getByRole('button', { name: '+ Materialposition' }))
    await user.selectOptions(screen.getAllByLabelText('Material')[0], 'STG123')
    await user.type(screen.getByLabelText('Materialmenge 1'), '3,5') // Schweizer Komma

    await user.click(screen.getByRole('button', { name: 'Rapport speichern' }))

    await waitFor(() => expect(onDone).toHaveBeenCalled())
    const body = lastPostBody()
    expect(body.materials).toEqual([{ art_nr: 'STG123', amount: 3.5 }])
    // Kein Kleinmaterial-Key, solange kein Betrag erfasst wurde.
    expect(body).not.toHaveProperty('kleinmaterial')
  })

  it('schliesst eine Materialzeile ohne gewählten Artikel aus', async () => {
    const user = userEvent.setup()
    const { onDone } = renderForm([makeQuote()])

    await user.selectOptions(screen.getByLabelText('Mitarbeiter 1'), 's1')
    await user.type(screen.getByLabelText('Stunden 1'), '6')

    // Eine gültige Zeile und eine, die nur eine Menge hat, aber keinen Artikel …
    await user.click(screen.getByRole('button', { name: '+ Materialposition' }))
    await user.selectOptions(screen.getAllByLabelText('Material')[0], 'STG999')
    await user.type(screen.getByLabelText('Materialmenge 1'), '2')

    await user.click(screen.getByRole('button', { name: 'Rapport speichern' }))

    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(lastPostBody().materials).toEqual([{ art_nr: 'STG999', amount: 2 }])
  })

  it('blockiert eine Materialzeile mit Artikel aber ohne Menge', async () => {
    const user = userEvent.setup()
    renderForm([makeQuote()])

    await user.selectOptions(screen.getByLabelText('Mitarbeiter 1'), 's1')
    await user.type(screen.getByLabelText('Stunden 1'), '6')
    await user.click(screen.getByRole('button', { name: '+ Materialposition' }))
    await user.selectOptions(screen.getByLabelText('Material'), 'STG123')

    await user.click(screen.getByRole('button', { name: 'Rapport speichern' }))

    expect(postFired()).toBe(false)
    expect(screen.getByText('Materialposition: Menge muss grösser als 0 sein.')).toBeInTheDocument()
  })

  it('blockiert eine Materialzeile mit Menge aber ohne Artikel', async () => {
    const user = userEvent.setup()
    renderForm([makeQuote()])

    await user.selectOptions(screen.getByLabelText('Mitarbeiter 1'), 's1')
    await user.type(screen.getByLabelText('Stunden 1'), '6')
    await user.click(screen.getByRole('button', { name: '+ Materialposition' }))
    await user.type(screen.getByLabelText('Materialmenge 1'), '4')

    await user.click(screen.getByRole('button', { name: 'Rapport speichern' }))

    expect(postFired()).toBe(false)
    expect(screen.getByText('Materialposition: bitte zuerst einen Artikel wählen.')).toBeInTheDocument()
  })

  // ── Phase 2: Klein-/Schmiermaterial ───────────────────────

  it('sendet Kleinmaterial nur, wenn ein Betrag erfasst ist', async () => {
    const user = userEvent.setup()
    const { onDone } = renderForm([makeQuote()])

    await user.selectOptions(screen.getByLabelText('Mitarbeiter 1'), 's1')
    await user.type(screen.getByLabelText('Stunden 1'), '6')
    await user.type(screen.getByLabelText('Kleinmaterial Betrag'), '25')

    await user.click(screen.getByRole('button', { name: 'Rapport speichern' }))

    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(lastPostBody().kleinmaterial).toEqual({
      item_name: 'Kleinmaterial',
      count: 1,
      amount_chf: 25,
    })
  })

  it('lässt den Kleinmaterial-Key weg, wenn kein Betrag erfasst ist (Phase-1-Nutzlast)', async () => {
    const user = userEvent.setup()
    const { onDone } = renderForm([makeQuote()])

    // Nur Mitarbeiter + Beschrieb, Kleinmaterial-Betrag bleibt leer (Menge Default 1).
    await user.selectOptions(screen.getByLabelText('Mitarbeiter 1'), 's1')
    await user.type(screen.getByLabelText('Stunden 1'), '6')

    await user.click(screen.getByRole('button', { name: 'Rapport speichern' }))

    await waitFor(() => expect(onDone).toHaveBeenCalled())
    const body = lastPostBody()
    expect(body).not.toHaveProperty('kleinmaterial')
    expect(body).not.toHaveProperty('materials')
    // Exakt die Phase-1-Form.
    expect(body).toEqual({
      report_date: expect.any(String),
      description: 'Arbeiten gemäss Offerte OFF-2026-014',
      staff: [{ staff_id: 's1', hours: 6 }],
    })
  })

  it('blockiert Kleinmaterial mit Betrag aber ohne Menge', async () => {
    const user = userEvent.setup()
    renderForm([makeQuote()])

    await user.selectOptions(screen.getByLabelText('Mitarbeiter 1'), 's1')
    await user.type(screen.getByLabelText('Stunden 1'), '6')
    await user.clear(screen.getByLabelText('Kleinmaterial Menge'))
    await user.type(screen.getByLabelText('Kleinmaterial Betrag'), '25')

    await user.click(screen.getByRole('button', { name: 'Rapport speichern' }))

    expect(postFired()).toBe(false)
    expect(screen.getByText('Klein-/Schmiermaterial: Menge muss eine ganze Zahl grösser als 0 sein.')).toBeInTheDocument()
  })

  // ── Phase 2: warnings im 201 ──────────────────────────────

  it('behandelt warnings im 201 als Erfolg und ruft onDone', async () => {
    const user = userEvent.setup()
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    mockFetch.mockResolvedValue({ report_id: 7, warnings: ['Lager für STG123 nicht abgebucht'] })

    const { onDone } = renderForm([makeQuote()])
    await user.selectOptions(screen.getByLabelText('Mitarbeiter 1'), 's1')
    await user.type(screen.getByLabelText('Stunden 1'), '6')
    await user.click(screen.getByRole('button', { name: 'Rapport speichern' }))

    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('Lager für STG123 nicht abgebucht'))
    alertSpy.mockRestore()
  })

  // ── Phase 3: Material aus Offerte (Fixpreis-Positionen) ───────

  // material_items enthält eine Eventualposition (optional) — die wird beim
  // Übernehmen übersprungen. extra_product_items/-charge/installation dürfen NICHT
  // in die Zeilen wandern (die rechnet der rapportbasierte Rechnungspfad bereits
  // automatisch — sie hier zu tragen würde doppelt verrechnen).
  const QUOTE_DETAIL = {
    id: 1,
    quote_number: 'OFF-2026-014',
    material_items: [
      { description: 'Storen Typ X', quantity: 2, unit: 'Stk', unit_price: 450, total_price: 900 },
      { description: 'Motor 24V', quantity: 1, unit: 'Stk', unit_price: 300, total_price: 300, optional: true },
      { description: 'Kurbelstange', quantity: 3, unit: 'm', unit_price: 20, total_price: 60 },
    ],
    extra_product_items: [{ description: 'Produkt A', quantity: 1, unit: 'Stk', unit_price: 1000, total_price: 1000 }],
    extra_charge_items: [{ description: 'Zuschlag', total_price: 100 }],
    installation_items: [{ description: 'Montage', quantity: 1, unit: 'Psch', unit_price: 500, total_price: 500 }],
    special_items: [],
  }

  // apiFetch nach Method/URL routen: Rapport per POST, Offert-Detail per GET.
  function routeFetch(detail: Record<string, unknown> = QUOTE_DETAIL) {
    mockFetch.mockImplementation((path, options) => {
      if (options?.method === 'POST') return Promise.resolve({ report_id: 42 })
      if (typeof path === 'string' && path.startsWith('/pwa/admin/quotes/')) {
        return Promise.resolve(detail)
      }
      return Promise.resolve([]) // Material-Katalog o.ä.
    })
  }

  it('übernimmt nur material_items der Offerte (ohne Eventual-/Produkt-/Zuschlagspositionen)', async () => {
    const user = userEvent.setup()
    routeFetch()
    renderForm([makeQuote()])

    await user.click(screen.getByRole('button', { name: 'Material aus Offerte übernehmen' }))

    await waitFor(() => expect(screen.getByLabelText('Fixposition Bezeichnung 1')).toBeInTheDocument())
    // Zwei nicht-optionale material_items → zwei Zeilen.
    expect(screen.getByLabelText('Fixposition Bezeichnung 1')).toHaveValue('Storen Typ X')
    expect(screen.getByLabelText('Fixposition Menge 1')).toHaveValue('2')
    expect(screen.getByLabelText('Fixposition Einheit 1')).toHaveValue('Stk')
    expect(screen.getByLabelText('Fixposition Preis 1')).toHaveValue('450')
    expect(screen.getByLabelText('Fixposition Bezeichnung 2')).toHaveValue('Kurbelstange')
    expect(screen.queryByLabelText('Fixposition Bezeichnung 3')).not.toBeInTheDocument()
    // Eventualposition (Motor) übersprungen; Produkte/Zuschläge/Montage nicht übernommen.
    expect(screen.queryByDisplayValue('Motor 24V')).not.toBeInTheDocument()
    expect(screen.queryByDisplayValue('Produkt A')).not.toBeInTheDocument()
    expect(screen.queryByDisplayValue('Zuschlag')).not.toBeInTheDocument()
    expect(screen.queryByDisplayValue('Montage')).not.toBeInTheDocument()
    // Genau ein GET aufs Offert-Detail.
    expect(mockFetch).toHaveBeenCalledWith('/pwa/admin/quotes/1')
  })

  it('sendet die (bearbeiteten) Fixpositionen als fixed_materials', async () => {
    const user = userEvent.setup()
    routeFetch()
    const { onDone } = renderForm([makeQuote()])

    await user.selectOptions(screen.getByLabelText('Mitarbeiter 1'), 's1')
    await user.type(screen.getByLabelText('Stunden 1'), '6')

    await user.click(screen.getByRole('button', { name: 'Material aus Offerte übernehmen' }))
    await waitFor(() => expect(screen.getByLabelText('Fixposition Bezeichnung 1')).toHaveValue('Storen Typ X'))

    // Erste Zeile ist editierbar — Menge mit Schweizer Komma ändern.
    await user.clear(screen.getByLabelText('Fixposition Menge 1'))
    await user.type(screen.getByLabelText('Fixposition Menge 1'), '2,5')

    await user.click(screen.getByRole('button', { name: 'Rapport speichern' }))

    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(lastPostBody().fixed_materials).toEqual([
      { item_name: 'Storen Typ X', amount: 2.5, unit: 'Stk', unit_price: 450 },
      { item_name: 'Kurbelstange', amount: 3, unit: 'm', unit_price: 20 },
    ])
    // Regulärer Katalog-Material-Key bleibt unberührt (keine Katalogzeile erfasst).
    expect(lastPostBody()).not.toHaveProperty('materials')
  })

  it('lädt bei erneutem Klick neu statt zu duplizieren', async () => {
    const user = userEvent.setup()
    routeFetch()
    renderForm([makeQuote()])

    await user.click(screen.getByRole('button', { name: 'Material aus Offerte übernehmen' }))
    await waitFor(() => expect(screen.getAllByLabelText(/Fixposition Bezeichnung/)).toHaveLength(2))
    await user.click(screen.getByRole('button', { name: 'Material aus Offerte übernehmen' }))
    await waitFor(() => expect(screen.getAllByLabelText(/Fixposition Bezeichnung/)).toHaveLength(2))
  })

  it('behält eine von Hand erfasste Fixposition beim erneuten Übernehmen', async () => {
    const user = userEvent.setup()
    routeFetch()
    renderForm([makeQuote()])

    // Zuerst eine manuelle Position erfassen …
    await user.click(screen.getByRole('button', { name: '+ Position' }))
    await user.type(screen.getByLabelText('Fixposition Bezeichnung 1'), 'Handnotiz')
    // … dann Offerten-Material übernehmen: die manuelle Zeile bleibt erhalten.
    await user.click(screen.getByRole('button', { name: 'Material aus Offerte übernehmen' }))
    await waitFor(() => expect(screen.getAllByLabelText(/Fixposition Bezeichnung/)).toHaveLength(3))
    expect(screen.getByLabelText('Fixposition Bezeichnung 1')).toHaveValue('Handnotiz')
    expect(screen.getByLabelText('Fixposition Bezeichnung 2')).toHaveValue('Storen Typ X')
  })

  it('erlaubt eine frei erfasste Fixposition ohne Offerte', async () => {
    const user = userEvent.setup()
    const { onDone } = renderForm() // keine Offerte → Beschrieb leer

    await user.selectOptions(screen.getByLabelText('Mitarbeiter 1'), 's1')
    await user.type(screen.getByLabelText('Stunden 1'), '6')
    await user.type(screen.getByLabelText('Arbeitsbeschrieb *'), 'Reparatur')

    // "Material aus Offerte übernehmen" ist ohne Offerte deaktiviert.
    expect(screen.getByRole('button', { name: 'Material aus Offerte übernehmen' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: '+ Position' }))
    await user.type(screen.getByLabelText('Fixposition Bezeichnung 1'), 'Ersatzteil')
    await user.type(screen.getByLabelText('Fixposition Menge 1'), '4')
    await user.type(screen.getByLabelText('Fixposition Preis 1'), '12,5')

    await user.click(screen.getByRole('button', { name: 'Rapport speichern' }))

    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(lastPostBody().fixed_materials).toEqual([
      { item_name: 'Ersatzteil', amount: 4, unit: 'Stk', unit_price: 12.5 },
    ])
  })

  it('lässt den fixed_materials-Key weg, wenn keine Fixposition erfasst ist', async () => {
    const user = userEvent.setup()
    const { onDone } = renderForm([makeQuote()])

    await user.selectOptions(screen.getByLabelText('Mitarbeiter 1'), 's1')
    await user.type(screen.getByLabelText('Stunden 1'), '6')
    await user.click(screen.getByRole('button', { name: 'Rapport speichern' }))

    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(lastPostBody()).not.toHaveProperty('fixed_materials')
  })

  it('zeigt eine Inline-Meldung, wenn das Offert-Material nicht geladen werden kann', async () => {
    const user = userEvent.setup()
    mockFetch.mockRejectedValue(new Error('boom'))
    renderForm([makeQuote()])

    await user.click(screen.getByRole('button', { name: 'Material aus Offerte übernehmen' }))

    await waitFor(() =>
      expect(screen.getByText('Material der Offerte konnte nicht geladen werden.')).toBeInTheDocument(),
    )
    // Kein Absturz, keine Zeile erzeugt.
    expect(screen.queryByLabelText('Fixposition Bezeichnung 1')).not.toBeInTheDocument()
  })

  it('blockiert eine Fixposition mit Bezeichnung aber ohne Menge', async () => {
    const user = userEvent.setup()
    renderForm([makeQuote()])

    await user.selectOptions(screen.getByLabelText('Mitarbeiter 1'), 's1')
    await user.type(screen.getByLabelText('Stunden 1'), '6')
    await user.click(screen.getByRole('button', { name: '+ Position' }))
    await user.type(screen.getByLabelText('Fixposition Bezeichnung 1'), 'Ersatzteil')

    await user.click(screen.getByRole('button', { name: 'Rapport speichern' }))

    expect(postFired()).toBe(false)
    expect(screen.getByText('Fixposition: Menge muss grösser als 0 sein.')).toBeInTheDocument()
  })

  it('blockiert eine Fixposition mit Menge aber ohne Bezeichnung', async () => {
    const user = userEvent.setup()
    renderForm([makeQuote()])

    await user.selectOptions(screen.getByLabelText('Mitarbeiter 1'), 's1')
    await user.type(screen.getByLabelText('Stunden 1'), '6')
    await user.click(screen.getByRole('button', { name: '+ Position' }))
    await user.type(screen.getByLabelText('Fixposition Menge 1'), '3')

    await user.click(screen.getByRole('button', { name: 'Rapport speichern' }))

    expect(postFired()).toBe(false)
    expect(screen.getByText('Fixposition: bitte eine Bezeichnung erfassen.')).toBeInTheDocument()
  })
})
