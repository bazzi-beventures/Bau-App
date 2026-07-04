import { useEffect, useRef } from 'react'

// Globaler Stack von "Zurück-Interceptoren". Overlays (Modals, Bild-Lightbox,
// Wizard-Schritte) registrieren hier einen Handler, solange sie offen sind. Der
// zentrale popstate-Handler in App.tsx ruft beim Hardware-/Browser-Zurück den
// obersten Handler auf (schliesst das Overlay) STATT zur Hauptmaske zu navigieren.
//
// Warum ein zentraler Stack statt je ein eigener popstate-Listener pro Modal:
// App.tsx hat bereits einen globalen popstate-Listener, der auf jedem Sub-Screen
// zur Hauptmaske springt. Zwei unabhängige Listener würden beide feuern → man
// landet trotzdem auf Home. Der Stack zentralisiert die Entscheidung in App.tsx.

type BackHandler = () => void

const stack: BackHandler[] = []

function pushHandler(handler: BackHandler): () => void {
  stack.push(handler)
  return () => {
    const i = stack.lastIndexOf(handler)
    if (i >= 0) stack.splice(i, 1)
  }
}

// Vom zentralen popstate-Handler aufgerufen: ruft den obersten Handler auf und
// entfernt ihn. Gibt true zurück, wenn ein Overlay den Zurück konsumiert hat
// (⇒ App soll NICHT zur Hauptmaske navigieren).
export function consumeBack(): boolean {
  const handler = stack.pop()
  if (!handler) return false
  handler()
  return true
}

export function backHandlerCount(): number {
  return stack.length
}

// Nur für Tests: Stack zurücksetzen.
export function _resetBackHandlers(): void {
  stack.length = 0
}

// Registriert `onBack` als Zurück-Handler, solange `active` true ist (z.B. Modal
// offen). Der jeweils zuletzt geöffnete (oberste) Layer wird beim Zurück zuerst
// geschlossen (LIFO). onBack darf sich pro Render ändern — es wird via Ref stabil
// gehalten, damit die Registrierung nicht bei jedem Render neu erfolgt.
export function useBackButton(active: boolean, onBack: () => void): void {
  const ref = useRef(onBack)
  useEffect(() => { ref.current = onBack })
  useEffect(() => {
    if (!active) return
    return pushHandler(() => ref.current())
  }, [active])
}
