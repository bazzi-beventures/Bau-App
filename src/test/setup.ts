// Globales Vitest-Setup für alle Testdateien (siehe vite.config.ts → test.setupFiles).
import '@testing-library/jest-dom'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// jsdom unter Node 25 liefert hier kein funktionsfähiges Storage-Objekt
// (localStorage ist ein leeres {} ohne getItem/clear). Der App-Code nutzt das
// globale `localStorage` direkt → wir installieren einen In-Memory-Storage-Polyfill,
// damit Source und Tests dieselbe, funktionierende Implementierung sehen.
class MemoryStorage implements Storage {
  private store = new Map<string, string>()
  get length() { return this.store.size }
  clear() { this.store.clear() }
  getItem(key: string) { return this.store.has(key) ? this.store.get(key)! : null }
  setItem(key: string, value: string) { this.store.set(key, String(value)) }
  removeItem(key: string) { this.store.delete(key) }
  key(index: number) { return Array.from(this.store.keys())[index] ?? null }
}

function installStorage(name: 'localStorage' | 'sessionStorage') {
  const storage = new MemoryStorage()
  for (const target of [globalThis, window] as object[]) {
    Object.defineProperty(target, name, { value: storage, writable: true, configurable: true })
  }
}

installStorage('localStorage')
installStorage('sessionStorage')

// React-Komponenten nach jedem Test aus dem jsdom-Dokument entfernen.
afterEach(() => {
  cleanup()
})
