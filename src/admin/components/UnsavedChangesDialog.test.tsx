import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { UnsavedChangesDialog } from './UnsavedChangesDialog'

function renderDialog(props: Partial<React.ComponentProps<typeof UnsavedChangesDialog>> = {}) {
  const { container } = render(
    <UnsavedChangesDialog onSave={vi.fn()} onDiscard={vi.fn()} onCancel={vi.fn()} {...props} />,
  )
  return container.querySelector('.admin-confirm-actions')!
}

// Die Buttons schrumpfen nicht (.admin-btn: white-space: nowrap). Bei langen
// Beschriftungen ragten sie deshalb aus der Dialogbox heraus — der Test hält
// fest, dass sie in dem Fall gestapelt werden.
describe('UnsavedChangesDialog — Button-Anordnung', () => {
  it('lässt kurze Standard-Beschriftungen nebeneinander', () => {
    const actions = renderDialog()

    expect(actions.className).not.toContain('admin-confirm-actions-stacked')
  })

  it('stapelt satzlange Beschriftungen', () => {
    const actions = renderDialog({
      saveLabel: 'Entwurf behalten',
      discardLabel: 'Entwurf verwerfen',
      cancelLabel: 'Zurück zum Formular',
    })

    expect(actions.className).toContain('admin-confirm-actions-stacked')
    expect(screen.getByRole('button', { name: 'Entwurf behalten' })).toBeInTheDocument()
  })

  it('springt beim Speichern nicht zwischen den Anordnungen', () => {
    const labels = { saveLabel: 'Sichern', savingLabel: 'Wird gesichert…' }

    expect(renderDialog(labels).className).toBe(renderDialog({ ...labels, saving: true }).className)
  })
})
