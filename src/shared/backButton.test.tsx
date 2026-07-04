import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render } from '@testing-library/react'
import { useBackButton, consumeBack, backHandlerCount, _resetBackHandlers } from './backButton'

// Test-Overlay, das nur den Hook registriert.
function Overlay({ active, onBack }: { active: boolean; onBack: () => void }) {
  useBackButton(active, onBack)
  return null
}

beforeEach(() => { _resetBackHandlers() })

describe('backButton-Stack', () => {
  it('consumeBack gibt false zurück, wenn kein Overlay offen ist', () => {
    expect(consumeBack()).toBe(false)
  })

  it('registriert einen Handler bei active=true und ruft ihn bei consumeBack', () => {
    const onBack = vi.fn()
    render(<Overlay active onBack={onBack} />)

    expect(backHandlerCount()).toBe(1)
    expect(consumeBack()).toBe(true)
    expect(onBack).toHaveBeenCalledTimes(1)
    expect(backHandlerCount()).toBe(0)
  })

  it('registriert nichts, solange active=false', () => {
    render(<Overlay active={false} onBack={vi.fn()} />)
    expect(backHandlerCount()).toBe(0)
  })

  it('schliesst LIFO — das zuletzt geöffnete Overlay zuerst', () => {
    const first = vi.fn()
    const second = vi.fn()
    render(
      <>
        <Overlay active onBack={first} />
        <Overlay active onBack={second} />
      </>,
    )

    expect(backHandlerCount()).toBe(2)
    consumeBack()
    expect(second).toHaveBeenCalledTimes(1)
    expect(first).not.toHaveBeenCalled()
    consumeBack()
    expect(first).toHaveBeenCalledTimes(1)
  })

  it('entfernt den Handler beim Unmount (kein Leak)', () => {
    const { unmount } = render(<Overlay active onBack={vi.fn()} />)
    expect(backHandlerCount()).toBe(1)
    unmount()
    expect(backHandlerCount()).toBe(0)
  })

  it('ruft immer die neueste onBack-Referenz auf', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = render(<Overlay active onBack={first} />)
    rerender(<Overlay active onBack={second} />)

    consumeBack()
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })
})
