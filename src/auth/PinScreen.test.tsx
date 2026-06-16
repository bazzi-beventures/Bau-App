import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PinScreen from './PinScreen'
import { ApiError } from '../api/client'
import { loginWithPassword, requestPasswordReset } from '../api/admin'

// Nur die Auth-API mocken. TenantLogo wird aus ../App importiert (zieht sonst die
// gesamte App in den Test) → durch einen leichten Stub ersetzen.
vi.mock('../api/admin', () => ({
  loginWithPassword: vi.fn(),
  requestPasswordReset: vi.fn(),
}))
vi.mock('../App', () => ({ TenantLogo: () => null }))

const mockLogin = vi.mocked(loginWithPassword)
const mockReset = vi.mocked(requestPasswordReset)

const PW_PLACEHOLDER = '••••••••'

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})

function renderScreen() {
  const onLoggedIn = vi.fn()
  render(<PinScreen logoUrl="logo.png" onLoggedIn={onLoggedIn} />)
  return { onLoggedIn, user: userEvent.setup() }
}

describe('PinScreen — Login', () => {
  it('meldet erfolgreich an: speichert tenant_slug und ruft onLoggedIn', async () => {
    mockLogin.mockResolvedValue({ tenant_slug: 'acme' })
    const { onLoggedIn, user } = renderScreen()

    await user.type(screen.getByPlaceholderText('benutzername'), 'testuser')
    await user.type(screen.getByPlaceholderText(PW_PLACEHOLDER), 'geheim123')
    await user.click(screen.getByRole('button', { name: 'Anmelden' }))

    await waitFor(() => expect(onLoggedIn).toHaveBeenCalled())
    expect(mockLogin).toHaveBeenCalledWith('testuser', 'geheim123')
    expect(localStorage.getItem('tenantSlug')).toBe('acme')
  })

  it('zeigt bei 401 "Benutzername oder Passwort falsch."', async () => {
    mockLogin.mockRejectedValue(new ApiError(401, 'unauthorized'))
    const { onLoggedIn, user } = renderScreen()

    await user.type(screen.getByPlaceholderText('benutzername'), 'wrong')
    await user.type(screen.getByPlaceholderText(PW_PLACEHOLDER), 'wrong')
    await user.click(screen.getByRole('button', { name: 'Anmelden' }))

    expect(await screen.findByText('Benutzername oder Passwort falsch.')).toBeInTheDocument()
    expect(onLoggedIn).not.toHaveBeenCalled()
  })

  it('zeigt bei 429 die Rate-Limit-Meldung', async () => {
    mockLogin.mockRejectedValue(new ApiError(429, 'too many'))
    const { user } = renderScreen()

    await user.type(screen.getByPlaceholderText('benutzername'), 'user')
    await user.type(screen.getByPlaceholderText(PW_PLACEHOLDER), 'pass')
    await user.click(screen.getByRole('button', { name: 'Anmelden' }))

    expect(await screen.findByText('Zu viele Versuche. Bitte warte 15 Minuten.')).toBeInTheDocument()
  })

  it('hält den Anmelden-Button deaktiviert, solange Felder leer sind', async () => {
    const { user } = renderScreen()
    const button = screen.getByRole('button', { name: 'Anmelden' })

    expect(button).toBeDisabled()
    await user.type(screen.getByPlaceholderText('benutzername'), 'user')
    expect(button).toBeDisabled()
    await user.type(screen.getByPlaceholderText(PW_PLACEHOLDER), 'pass')
    expect(button).toBeEnabled()
  })
})

describe('PinScreen — Passwort-Sichtbarkeit', () => {
  it('schaltet zwischen Passwort- und Klartext-Anzeige um', async () => {
    const { user } = renderScreen()
    const input = screen.getByPlaceholderText(PW_PLACEHOLDER)
    expect(input).toHaveAttribute('type', 'password')

    await user.click(screen.getByRole('button', { name: 'Passwort anzeigen' }))
    expect(input).toHaveAttribute('type', 'text')

    await user.click(screen.getByRole('button', { name: 'Passwort verbergen' }))
    expect(input).toHaveAttribute('type', 'password')
  })
})

describe('PinScreen — Passwort vergessen', () => {
  it('sendet den Reset-Link (E-Mail kleingeschrieben) und zeigt die Bestätigung', async () => {
    mockReset.mockResolvedValue(undefined)
    const { user } = renderScreen()

    await user.click(screen.getByRole('button', { name: 'Passwort vergessen?' }))
    await user.type(screen.getByPlaceholderText('name@firma.ch'), 'User@Firma.ch')
    await user.click(screen.getByRole('button', { name: 'Link senden' }))

    await waitFor(() => expect(mockReset).toHaveBeenCalledWith('user@firma.ch'))
    expect(await screen.findByText(/Falls ein Konto mit dieser E-Mail existiert/)).toBeInTheDocument()
  })
})
