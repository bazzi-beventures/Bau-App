// Storage-Schema-Migrations für Client-State (localStorage).
//
// Bei jeder Breaking-Change an persistierten Keys:
//   1. APP_DATA_VERSION um 1 erhöhen
//   2. Migrationsschritt unter MIGRATIONS anhängen
// So entfällt manuelles "Cache löschen" beim Nutzer.

import { SK } from './storageKeys'

export const APP_DATA_VERSION = 3
const STORAGE_VERSION_KEY = 'app_data_version'

// Zentrale Whitelist: Keys, die als "aktiv genutzt" gelten. Alles andere
// ist Legacy/Müll und wird beim Schema-Wechsel entfernt.
// Bei neuen localStorage-Keys in der App: hier ergänzen.
function isKnownKey(k: string): boolean {
  // Aktuelle auth/tenant keys (env-suffixed)
  if (k === SK.TOKEN) return true
  if (k === SK.TENANT_SLUG) return true
  if (k === SK.AUTHORIZED_USER_ID) return true
  if (k === SK.DISPLAY_NAME) return true
  // App-State
  if (k === 'my-time-stempel-state') return true
  if (k === 'zeit_offline_queue') return true
  if (k === 'admin-theme') return true
  // Infrastruktur
  if (k === STORAGE_VERSION_KEY) return true
  if (k === 'app_build_id') return true
  return false
}

// Keys, die bei einem Fallback-Wipe (unbekannte Zukunftsversion) minimal
// erhalten bleiben — Nutzer bleibt eingeloggt.
const SURVIVE_WIPE: readonly string[] = [SK.TOKEN, SK.TENANT_SLUG]

type Migration = {
  from: number
  to: number
  run: () => void
}

// v0 → v1: Whitelist-basierter Großputz. Entfernt alle unbekannten
// Legacy-Keys aus früheren Versionen (unsuffixed Tokens aus Commit ab6eb14,
// Theme-Tokens aus div. Design-Umstellungen etc.). Aktive App-State-Keys
// (Stempel, Offline-Queue, Theme, Auth) überleben unverändert.
const migration_0_to_1: Migration = {
  from: 0,
  to: 1,
  run: () => {
    const toRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && !isKnownKey(k)) toRemove.push(k)
    }
    for (const k of toRemove) localStorage.removeItem(k)
  },
}

// v1 → v2: UserInfo-Shape bekommt `username`. Storage-Keys bleiben unverändert —
// der Username kommt aus /pwa/me beim nächsten App-Load. Kein Wipe nötig.
const migration_1_to_2: Migration = {
  from: 1,
  to: 2,
  run: () => {
    // no-op
  },
}

// v2 → v3: Project-Shape ändert sich (customer via FK-Embed statt denormalisiert;
// Kontakt-Feld `rolle` → `kommentar`). Gecachte Listen sind nicht in localStorage —
// no-op reicht, damit versionsbasierte Fallback-Wipes bei unbekannten Clients greifen.
const migration_2_to_3: Migration = {
  from: 2,
  to: 3,
  run: () => {
    // no-op
  },
}

const MIGRATIONS: Migration[] = [migration_0_to_1, migration_1_to_2, migration_2_to_3]

function readVersion(): number {
  const raw = localStorage.getItem(STORAGE_VERSION_KEY)
  const n = raw === null ? 0 : parseInt(raw, 10)
  return Number.isFinite(n) ? n : 0
}

function wipeExceptAuth(): void {
  const keep: Record<string, string> = {}
  for (const k of SURVIVE_WIPE) {
    const v = localStorage.getItem(k)
    if (v !== null) keep[k] = v
  }
  localStorage.clear()
  for (const [k, v] of Object.entries(keep)) localStorage.setItem(k, v)
}

export function runStorageMigrations(): void {
  try {
    let current = readVersion()
    if (current === APP_DATA_VERSION) return

    // Zukunfts-Version gespeichert (z. B. nach Rollback): Wipe ist sicherer
    // als blind weiterlaufen mit unbekanntem Shape.
    if (current > APP_DATA_VERSION) {
      wipeExceptAuth()
      localStorage.setItem(STORAGE_VERSION_KEY, String(APP_DATA_VERSION))
      return
    }

    while (current < APP_DATA_VERSION) {
      const step = MIGRATIONS.find(m => m.from === current)
      if (!step) {
        // Keine definierte Migration → selektiver Wipe als Fallback.
        // Nutzer bleibt via Token eingeloggt, App startet mit frischem State.
        wipeExceptAuth()
        current = APP_DATA_VERSION
        break
      }
      step.run()
      current = step.to
    }
    localStorage.setItem(STORAGE_VERSION_KEY, String(APP_DATA_VERSION))
  } catch (err) {
    // Niemals die App wegen Migration-Bug blockieren.
    console.error('[storageMigrations] failed', err)
  }
}
