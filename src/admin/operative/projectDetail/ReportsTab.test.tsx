import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReportsTab } from './tabs'
import type { ProjectReport } from './tabs'

function makeReport(over: Partial<ProjectReport> = {}): ProjectReport {
  return {
    id: 1,
    report_date: '2026-07-21',
    description: 'Arbeiten gemäss Offerte',
    created_by: 'Chef',
    pdf_url: null,
    storage_path: null,
    signature_timestamp: null,
    invoice_id: null,
    created_at: '2026-07-21T10:00:00Z',
    source: 'chat',
    ...over,
  }
}

describe('ReportsTab — Badge-Logik', () => {
  it('zeigt «Manuell» für einen admin_manual-Rapport ohne Unterschrift', () => {
    render(<ReportsTab reports={[makeReport({ source: 'admin_manual' })]} />)
    expect(screen.getByText('Manuell')).toBeInTheDocument()
    expect(screen.queryByText('Pendent')).not.toBeInTheDocument()
    expect(screen.queryByText('Unterschrieben')).not.toBeInTheDocument()
  })

  it('zeigt «Pendent» für einen Chat-Rapport ohne Unterschrift', () => {
    render(<ReportsTab reports={[makeReport({ source: 'chat' })]} />)
    expect(screen.getByText('Pendent')).toBeInTheDocument()
  })

  it('zeigt «Unterschrieben» wenn signiert (Vorrang vor Manuell)', () => {
    render(<ReportsTab reports={[makeReport({ source: 'admin_manual', signature_timestamp: '2026-07-21T12:00:00Z' })]} />)
    expect(screen.getByText('Unterschrieben')).toBeInTheDocument()
    expect(screen.queryByText('Manuell')).not.toBeInTheDocument()
  })

  it('zeigt «Abgerechnet» mit Vorrang, auch bei manuellem Rapport', () => {
    render(<ReportsTab reports={[makeReport({ source: 'admin_manual', invoice_id: 7 })]} />)
    expect(screen.getByText('Abgerechnet')).toBeInTheDocument()
    expect(screen.queryByText('Manuell')).not.toBeInTheDocument()
  })
})

describe('ReportsTab — Erstellen-Button', () => {
  it('zeigt «+ Neuer Rapport» und feuert onShowCreateForm', async () => {
    const onShow = vi.fn()
    render(<ReportsTab reports={[]} onShowCreateForm={onShow} />)
    const btn = screen.getByRole('button', { name: '+ Neuer Rapport' })
    await userEvent.click(btn)
    expect(onShow).toHaveBeenCalledTimes(1)
  })

  it('zeigt den Button nicht ohne onShowCreateForm-Prop', () => {
    render(<ReportsTab reports={[]} />)
    expect(screen.queryByRole('button', { name: '+ Neuer Rapport' })).not.toBeInTheDocument()
  })
})

describe('ReportsTab — Löschen', () => {
  it('zeigt keinen Löschen-Knopf ohne onDelete-Prop', () => {
    render(<ReportsTab reports={[makeReport()]} />)
    expect(screen.queryByRole('button', { name: 'Löschen' })).not.toBeInTheDocument()
  })

  it('zeigt Löschen für einen pendenten Rapport', () => {
    render(<ReportsTab reports={[makeReport()]} onDelete={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Löschen' })).toBeInTheDocument()
  })

  it('zeigt Löschen auch für einen unterschriebenen Rapport (PL verantwortet das Projekt)', () => {
    render(<ReportsTab reports={[makeReport({ signature_timestamp: '2026-07-21T12:00:00Z' })]} onDelete={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Löschen' })).toBeInTheDocument()
  })

  it('zeigt KEIN Löschen für einen abgerechneten Rapport', () => {
    // Die Positionen stehen auf einer Rechnung — der Server sperrt es ebenfalls (409).
    render(<ReportsTab reports={[makeReport({ invoice_id: 7 })]} onDelete={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Löschen' })).not.toBeInTheDocument()
  })

  it('löscht erst nach Bestätigung im Dialog', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined)
    render(<ReportsTab reports={[makeReport({ id: 99 })]} onDelete={onDelete} />)

    await userEvent.click(screen.getByRole('button', { name: 'Löschen' }))
    expect(onDelete).not.toHaveBeenCalled()          // Dialog offen, noch nichts passiert

    await userEvent.click(screen.getByRole('button', { name: 'Endgültig löschen' }))
    expect(onDelete).toHaveBeenCalledWith(99)
  })

  it('bricht ohne Löschen ab', async () => {
    const onDelete = vi.fn()
    render(<ReportsTab reports={[makeReport()]} onDelete={onDelete} />)
    await userEvent.click(screen.getByRole('button', { name: 'Löschen' }))
    await userEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('warnt im Dialog zusätzlich bei unterschriebenem Rapport', async () => {
    render(<ReportsTab reports={[makeReport({ signature_timestamp: '2026-07-21T12:00:00Z' })]} onDelete={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Löschen' }))
    expect(screen.getByText('Dieser Rapport ist vom Kunden unterschrieben.')).toBeInTheDocument()
  })
})

describe('ReportsTab — hochgeladene Rapporte', () => {
  const uploadProps = {
    files: [],
    uploading: false,
    uploadingCategory: null,
    onUploadFile: vi.fn(),
    onDeleteFile: vi.fn(),
    onRenameFile: vi.fn(),
  }

  it('zeigt die Upload-Sektion, wenn die Datei-Props gesetzt sind', () => {
    render(<ReportsTab reports={[]} {...uploadProps} />)
    expect(screen.getByText('Hochgeladene Rapporte (Papier / Fremdsystem)')).toBeInTheDocument()
  })

  it('zeigt die Sektion nicht ohne Datei-Props', () => {
    render(<ReportsTab reports={[]} />)
    expect(screen.queryByText('Hochgeladene Rapporte (Papier / Fremdsystem)')).not.toBeInTheDocument()
  })

  it('listet nur Dateien der Kategorie rapport', () => {
    const files = [
      { id: 'f-1', filename: 'papier-rapport.pdf', file_url: null, storage_path: 'p/1', mime_type: 'application/pdf', category: 'rapport' as const, created_at: '2026-07-27T08:00:00Z' },
      { id: 'f-2', filename: 'baustellenfoto.jpg', file_url: null, storage_path: 'p/2', mime_type: 'image/jpeg', category: 'fotos' as const, created_at: '2026-07-27T08:00:00Z' },
    ]
    render(<ReportsTab reports={[]} {...uploadProps} files={files} />)
    expect(screen.getByText('papier-rapport.pdf')).toBeInTheDocument()
    expect(screen.queryByText('baustellenfoto.jpg')).not.toBeInTheDocument()
  })
})

describe('ReportsTab — Papier-Rapport', () => {
  it('verlinkt das Blanko-PDF, wenn paperRapportUrl gesetzt ist', () => {
    render(<ReportsTab reports={[]} paperRapportUrl="https://api.test/pwa/admin/projects/p-1/paper-rapport.pdf" />)
    const link = screen.getByRole('link', { name: 'Papier-Rapport (PDF)' })
    expect(link).toHaveAttribute('href', 'https://api.test/pwa/admin/projects/p-1/paper-rapport.pdf')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('zeigt den Link nicht ohne paperRapportUrl-Prop', () => {
    render(<ReportsTab reports={[]} onShowCreateForm={vi.fn()} />)
    expect(screen.queryByRole('link', { name: 'Papier-Rapport (PDF)' })).not.toBeInTheDocument()
  })
})

describe('ReportsTab — Bearbeiten', () => {
  it('zeigt Bearbeiten für einen manuellen, unverrechneten Rapport', async () => {
    const onEdit = vi.fn()
    render(<ReportsTab reports={[makeReport({ id: 9, source: 'admin_manual' })]} onEdit={onEdit} />)
    await userEvent.click(screen.getByRole('button', { name: 'Bearbeiten' }))
    expect(onEdit).toHaveBeenCalledWith(9)
  })

  it('zeigt Bearbeiten nicht am Chat-Rapport', () => {
    // Was der Monteur diktiert hat, schreibt der Projektleiter nicht um — für ihn
    // bleibt es beim Löschen und Neuerfassen.
    render(<ReportsTab reports={[makeReport({ source: 'chat' })]} onEdit={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Bearbeiten' })).not.toBeInTheDocument()
  })

  it('zeigt Bearbeiten nicht am abgerechneten Rapport', () => {
    render(<ReportsTab reports={[makeReport({ source: 'admin_manual', invoice_id: 7 })]} onEdit={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Bearbeiten' })).not.toBeInTheDocument()
  })

  it('zeigt Bearbeiten nicht am unterschriebenen Rapport', () => {
    render(<ReportsTab
      reports={[makeReport({ source: 'admin_manual', signature_timestamp: '2026-07-21T12:00:00Z' })]}
      onEdit={vi.fn()}
    />)
    expect(screen.queryByRole('button', { name: 'Bearbeiten' })).not.toBeInTheDocument()
  })

  it('zeigt den Knopf nicht ohne onEdit-Prop', () => {
    render(<ReportsTab reports={[makeReport({ source: 'admin_manual' })]} />)
    expect(screen.queryByRole('button', { name: 'Bearbeiten' })).not.toBeInTheDocument()
  })
})
