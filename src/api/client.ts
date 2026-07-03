const BASE_URL = import.meta.env.VITE_API_URL ?? ''

// Absolute URL für direkte Browser-Navigation (z.B. <a href> in neuem Tab).
// Backend liegt auf anderer Origin als die PWA — relative Pfade würden auf
// die PWA-Origin zeigen. Cookies werden trotzdem mitgesendet (SameSite=None).
export const apiUrl = (path: string): string => `${BASE_URL}${path}`

// Auth läuft ausschliesslich via httpOnly-Cookie (pwa_session). Kein Token in
// localStorage → XSS kann ihn nicht stehlen. Cross-Origin (GitHub Pages →
// Railway) funktioniert via SameSite=None; Secure Cookies + credentials:'include'.
// CSRF-Schutz: Server prüft Origin-Header serverseitig (siehe agents/app.py).

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

// status 0 = fetch ist mit TypeError abgebrochen. Das passiert bei echtem
// Verbindungsabbruch (kein Internet, DNS, Timeout) — aber auch bei CORS-Block,
// Cert-Fehler, Mixed-Content oder einem Backend, das diesen Origin nicht mehr
// akzeptiert. Beim Bevenetures-Domain-Wechsel hat genau das die App auf alten
// Installationen in eine Endlos-Offline-Queue geschoben (Origin gewechselt,
// Backend hat alten Origin geblockt, Browser war online, App hielt sich für
// offline und queuete jede Aktion).
//
// Daher: nur als "offline" zählen, wenn der Browser selbst sagt, dass er
// offline ist. Sonst echten Fehler nach oben durchreichen.
export const isOfflineError = (e: unknown): boolean =>
  e instanceof ApiError &&
  e.status === 0 &&
  typeof navigator !== 'undefined' &&
  navigator.onLine === false

// status 0 unabhängig vom onLine-Flag — fängt auch "verbunden, aber kein
// Durchkommen" (Funkloch mit Empfangsbalken, Timeout). Kann aber genauso ein
// CORS-/Cert-/Origin-Problem sein (siehe oben). Deshalb NUR in Flows verwenden,
// die in eine Offline-Queue mit Versuchs-Deckel (MAX_DRAIN_ATTEMPTS) schreiben —
// ohne Deckel droht wieder die Endlos-Queue vom Bevenetures-Domain-Wechsel.
export const isNetworkError = (e: unknown): boolean =>
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

export interface ApiFetchOptions extends RequestInit {
  // Bricht den Request nach dieser Zeit ab (wird zu ApiError status 0). Für
  // Aktionen mit Offline-Queue: im Funkloch hängt fetch sonst minutenlang,
  // bevor die Aktion überhaupt gequeued werden kann.
  timeoutMs?: number
}

export async function apiFetch(path: string, options: ApiFetchOptions = {}): Promise<unknown> {
  const { timeoutMs, ...init } = options
  const controller = timeoutMs !== undefined ? new AbortController() : null
  const timer = controller !== null ? setTimeout(() => controller.abort(), timeoutMs) : null
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      ...(controller !== null ? { signal: controller.signal } : {}),
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
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
  } finally {
    if (timer !== null) clearTimeout(timer)
  }
}

// Liest den Datei-Namen aus dem Content-Disposition-Header. Unterstuetzt
// sowohl filename="..." als auch das RFC-5987-Format filename*=utf-8''<urlencoded>,
// das FastAPI/Starlette automatisch verwenden, sobald der Name Leerzeichen
// oder Sonderzeichen enthaelt — z.B. "Einsatzplanung Gehlhaar Test KW 19.pdf".
export function parseDispositionFilename(disposition: string): string | null {
  const m5987 = disposition.match(/filename\*\s*=\s*([^']*)''([^;]+)/i)
  if (m5987) {
    try { return decodeURIComponent(m5987[2].trim()) } catch { /* fall through */ }
  }
  const mPlain = disposition.match(/filename\s*=\s*"?([^"]+?)"?(?:;|$)/i)
  return mPlain ? mPlain[1] : null
}

export async function apiBlobFetch(path: string): Promise<{ blob: Blob; filename: string }> {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      credentials: 'include',
    })

    if (!res.ok) {
      const detail = await parseErrorDetail(res)
      if (handleExpiredSession(res.status, detail, path)) {
        throw new ApiError(res.status, 'Sitzung abgelaufen')
      }
      throw new ApiError(res.status, detail)
    }

    const disposition = res.headers.get('Content-Disposition') ?? ''
    const filename = parseDispositionFilename(disposition) ?? 'download.pdf'

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
