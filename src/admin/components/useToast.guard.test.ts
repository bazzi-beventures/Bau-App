import { describe, it, expect } from 'vitest'

// Ratchet: Toasts nur noch über useToast/<ToastHost/>.
//
// Vor der Konsolidierung war `function showToast(...)` 23× in 19 Dateien lokal
// implementiert — mit vier divergierenden Signaturen und Timeouts und ohne
// Timer-Cleanup beim Unmount. Dieser Scan verhindert, dass die 24. Kopie
// nachwächst: neue Screens holen sich `const { toast, showToast } = useToast()`
// und rendern `<ToastHost toast={toast} />`.
//
// Gescannt wird über import.meta.glob (?raw) statt über node:fs — die App hat
// bewusst keine Node-Typen im tsconfig (Muster aus projectRefById.test.ts).
const SOURCES = import.meta.glob('../../**/*.{ts,tsx}', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

// Fängt Funktions- wie Konstanten-Form (`function showToast` / `const showToast =`);
// die Destrukturierung `const { toast, showToast } = useToast()` matcht bewusst nicht.
const LOCAL_SHOW_TOAST = /(?:function showToast\s*\(|const showToast\s*=)/

describe('Toast-Konsolidierung', () => {
  // Ohne diese Proben wäre der Ratchet auch dann grün, wenn der Glob ins Leere
  // greift oder das Muster nichts mehr trifft.
  it('scannt die Quellen und erkennt lokale showToast-Implementierungen', () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(50)
    expect(LOCAL_SHOW_TOAST.test("function showToast(msg: string) {")).toBe(true)
    expect(LOCAL_SHOW_TOAST.test("const showToast = useCallback(")).toBe(true)
    expect(LOCAL_SHOW_TOAST.test("const { toast, showToast } = useToast()")).toBe(false)
  })

  it('keine lokale showToast-Implementierung ausserhalb von useToast', () => {
    const offenders = Object.entries(SOURCES)
      .filter(([path]) => !/\.test\.tsx?$/.test(path) && !path.endsWith('useToast.tsx'))
      .filter(([, src]) => LOCAL_SHOW_TOAST.test(src))
      .map(([path]) => path)
    expect(offenders).toEqual([])
  })
})
