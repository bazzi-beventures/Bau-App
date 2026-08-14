import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ConfirmDialog } from './ConfirmDialog'

function renderDialog(warning?: React.ReactNode) {
  render(
    <ConfirmDialog
      title="Projekt abschliessen?"
      message="Wird für Mitarbeiter ausgeblendet."
      warning={warning}
      onConfirm={vi.fn()}
      onCancel={vi.fn()}
    />,
  )
}

describe('ConfirmDialog — Warnhinweis', () => {
  it('zeigt den Hinweis, ohne das Bestätigen zu sperren', () => {
    renderDialog('Achtung: Für dieses Projekt sind noch 2 Rechnungen offen.')

    expect(screen.getByText('Achtung: Für dieses Projekt sind noch 2 Rechnungen offen.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Bestätigen' })).toBeEnabled()
  })

  it('lässt den Kasten weg, wenn der Hinweis leer ist', () => {
    // Aufrufer reichen den Hinweis direkt durch — ein leerer String darf keinen
    // leeren Warnkasten erzeugen.
    const { container } = render(
      <ConfirmDialog
        title="Projekt abschliessen?"
        message="Wird für Mitarbeiter ausgeblendet."
        warning=""
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(container.querySelector('.admin-confirm-warning')).toBeNull()
  })
})
