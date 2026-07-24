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
