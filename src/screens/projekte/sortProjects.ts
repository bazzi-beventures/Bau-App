// Chronologische Reihenfolge der Einsätze in "Meine Projekte".
//
// Der Monteur liest die Liste als Tagesablauf: was zuerst kommt, steht oben.
// Das Backend liefert zwar schon sortiert (get_open_projects_for_tenant), die
// Ansicht darf sich darauf aber nicht verlassen — sie gruppiert nach Datum, und
// eine Gruppe wäre bei abweichender Server-Ordnung still in der falschen
// Reihenfolge (genau der Fall, der auffiel: 11:00 vor 09:00 vor 16:00).

export interface SortableProject {
  name: string
  start_date: string | null
  start_time?: string | null
}

// Ohne Termin ans Ende — nicht an den Anfang: ein Projekt ohne Datum ist keine
// Aufgabe für "jetzt", sondern eines, das noch disponiert werden muss.
function compareNullsLast(a: string | null | undefined, b: string | null | undefined): number {
  const av = a || ''
  const bv = b || ''
  if (!av && !bv) return 0
  if (!av) return 1
  if (!bv) return -1
  return av.localeCompare(bv)
}

/** Datum → Startzeit → Name. Datum/Zeit fehlen jeweils nach hinten. */
export function compareProjectsChronologically(a: SortableProject, b: SortableProject): number {
  // ISO-Strings (YYYY-MM-DD / HH:MM[:SS]) sind lexikografisch = chronologisch,
  // solange die Länge stimmt — "9:00" käme falsch, aus Postgres kommt aber
  // immer "09:00:00".
  const byDate = compareNullsLast(a.start_date, b.start_date)
  if (byDate !== 0) return byDate
  const byTime = compareNullsLast(a.start_time, b.start_time)
  if (byTime !== 0) return byTime
  return a.name.localeCompare(b.name, 'de-CH')
}

/** Kopie der Liste in chronologischer Reihenfolge (mutiert die Eingabe nicht). */
export function sortProjectsChronologically<P extends SortableProject>(projects: P[]): P[] {
  return [...projects].sort(compareProjectsChronologically)
}
