import { SK } from './storageKeys'

const BASE_URL = import.meta.env.VITE_API_URL ?? ''

const TOKEN_KEY = SK.TOKEN

export function saveToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem(TOKEN_KEY)
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function csrfHeader(): Record<string, string> {
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/)
  return match ? { 'X-CSRF-Token': match[1] } : {}
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

// status 0 = Netzwerkfehler (kein Internet, DNS, Timeout)
export const isOfflineError = (e: unknown): boolean =>
  e instanceof ApiError && e.status === 0

export async function apiFetch(path: string, options: RequestInit = {}): Promise<unknown> {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
        ...csrfHeader(),
        ...(options.headers ?? {}),
      },
    })

    if (!res.ok) {
      let detail = res.statusText
      try {
        const body = await res.json()
        detail = body.detail ?? detail
      } catch {}
      throw new ApiError(res.status, detail)
    }

    return res.json()
  } catch (e) {
    if (e instanceof ApiError) throw e
    throw new ApiError(0, 'Keine Internetverbindung')
  }
}

export async function apiBlobFetch(path: string): Promise<{ blob: Blob; filename: string }> {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      credentials: 'include',
      headers: { ...authHeaders(), ...csrfHeader() },
    })

    if (!res.ok) {
      let detail = res.statusText
      try {
        const body = await res.json()
        detail = body.detail ?? detail
      } catch {}
      throw new ApiError(res.status, detail)
    }

    const disposition = res.headers.get('Content-Disposition') ?? ''
    const match = disposition.match(/filename="?([^"]+)"?/)
    const filename = match ? match[1] : 'download.pdf'

    return { blob: await res.blob(), filename }
  } catch (e) {
    if (e instanceof ApiError) throw e
    throw new ApiError(0, 'Keine Internetverbindung')
  }
}

export async function apiFormFetch(path: string, form: FormData): Promise<unknown> {
  // No Content-Type header — browser sets it with the multipart boundary
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { ...authHeaders(), ...csrfHeader() },
      body: form,
    })

    if (!res.ok) {
      let detail = res.statusText
      try {
        const body = await res.json()
        detail = body.detail ?? detail
      } catch {}
      throw new ApiError(res.status, detail)
    }

    return res.json()
  } catch (e) {
    if (e instanceof ApiError) throw e
    throw new ApiError(0, 'Keine Internetverbindung')
  }
}
