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

let sessionExpiredHandled = false

// Wird von App.tsx aufgerufen sobald der User sich wieder einloggt,
// damit eine spaetere, zweite abgelaufene Session erneut ein Event ausloesen kann.
export function resetSessionExpiredFlag() { sessionExpiredHandled = false }

function handleExpiredSession(status: number, detail: string, path: string): boolean {
  // Auth-Endpoints sind der Wiedereinstiegspunkt — dort nicht feuern (sonst Loop bei Falsch-Passwort)
  if (path.startsWith('/pwa/auth/')) return false
  const expired = status === 401 || (status === 403 && detail === 'csrf_invalid')
  if (!expired) return false
  if (sessionExpiredHandled) return true
  sessionExpiredHandled = true
  clearToken()
  window.dispatchEvent(new CustomEvent('auth:expired'))
  return true
}

async function parseErrorDetail(res: Response): Promise<string> {
  let detail = res.statusText
  try {
    const body = await res.json()
    detail = body.detail ?? detail
  } catch {}
  return detail
}

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
      const detail = await parseErrorDetail(res)
      if (handleExpiredSession(res.status, detail, path)) {
        throw new ApiError(res.status, 'Sitzung abgelaufen')
      }
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
      const detail = await parseErrorDetail(res)
      if (handleExpiredSession(res.status, detail, path)) {
        throw new ApiError(res.status, 'Sitzung abgelaufen')
      }
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

/**
 * SSE-Streaming-Fetch. Öffnet einen POST-Request gegen `path`, parst SSE-Events
 * (`data: <json>\n\n`) und yieldet das geparste Objekt pro Event.
 *
 * Das Backend muss `text/event-stream` zurückliefern. Bei 4xx/5xx wird ApiError
 * geworfen — der Caller kann dann auf nicht-streamendes apiFetch zurückfallen.
 */
export async function* apiStreamFetch(
  path: string,
  body: unknown,
): AsyncGenerator<Record<string, unknown>, void, void> {
  let res: Response
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...authHeaders(),
        ...csrfHeader(),
      },
      body: JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, 'Keine Internetverbindung')
  }

  if (!res.ok) {
    const detail = await parseErrorDetail(res)
    if (handleExpiredSession(res.status, detail, path)) {
      throw new ApiError(res.status, 'Sitzung abgelaufen')
    }
    throw new ApiError(res.status, detail)
  }

  if (!res.body) {
    throw new ApiError(0, 'Stream nicht verfügbar')
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buf = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      // SSE events sind durch \n\n getrennt; jede Zeile beginnt mit "data: "
      let boundary = buf.indexOf('\n\n')
      while (boundary !== -1) {
        const raw = buf.slice(0, boundary)
        buf = buf.slice(boundary + 2)
        const dataLines = raw
          .split('\n')
          .filter(l => l.startsWith('data:'))
          .map(l => l.slice(5).trimStart())
        if (dataLines.length > 0) {
          const payload = dataLines.join('\n')
          try {
            yield JSON.parse(payload) as Record<string, unknown>
          } catch {
            // Malformed event — überspringen
          }
        }
        boundary = buf.indexOf('\n\n')
      }
    }
  } finally {
    try { reader.releaseLock() } catch {}
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
      const detail = await parseErrorDetail(res)
      if (handleExpiredSession(res.status, detail, path)) {
        throw new ApiError(res.status, 'Sitzung abgelaufen')
      }
      throw new ApiError(res.status, detail)
    }

    return res.json()
  } catch (e) {
    if (e instanceof ApiError) throw e
    throw new ApiError(0, 'Keine Internetverbindung')
  }
}
