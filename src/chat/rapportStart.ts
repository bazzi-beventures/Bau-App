import { RapportDraftState } from './rapportDraft'

// Was passiert, wenn der Monteur im Projekt-Detail auf «Rapport erstellen» tippt?
//
// Der Knopf schickte bisher bedingungslos ein «Neuer Rapport für Projekt X» in den
// Chat. Wartete dort noch ein Rapport auf «Speichern», war er damit weg: der Client
// verlor `pendingConfirm`, der Server überschrieb seinen Puffer beim nächsten
// log_report — ohne Warnung, ohne Spur. Genau so gehen erfasste Stunden verloren,
// wenn jemand zwischendurch aufs Projekt schaut und über denselben Knopf zurückgeht
// (der Projekt-Detail hat keinen eigenen «zurück zum Rapport»-Weg).
export type RapportStartAction =
  // Nichts in Arbeit → neuen Rapport beginnen.
  | { kind: 'start' }
  // Derselbe Rapport läuft schon → nur hineinspringen, keine neue Startnachricht.
  | { kind: 'resume' }
  // Ein anderer Rapport ist unfertig → erst fragen, sonst geht er verloren.
  | { kind: 'confirm-discard'; pendingProject: string | null }

/** Hat der Entwurf einen Rapport, der bei einem Neustart verloren ginge? */
function hasUnfinishedRapport(draft: RapportDraftState): boolean {
  // pendingConfirm: erfasst, aber noch nicht gespeichert — echter Datenverlust.
  // pendingSignReportId: gespeichert, aber die Unterschrift steht noch aus — der
  // Rapport bliebe unsigniert liegen.
  return draft.pendingConfirm || draft.pendingSignReportId !== null
}

export function planRapportStart(
  draft: RapportDraftState | null,
  projectName: string,
): RapportStartAction {
  if (!draft || !hasUnfinishedRapport(draft)) return { kind: 'start' }
  // Gleiches Projekt: der Monteur will offensichtlich zurück in seinen laufenden
  // Rapport, nicht einen zweiten anfangen. Ohne Rückfrage weiterlaufen lassen.
  if (draft.pendingProject && draft.pendingProject === projectName) return { kind: 'resume' }
  return { kind: 'confirm-discard', pendingProject: draft.pendingProject ?? null }
}

/** Text der Rückfrage, bevor ein unfertiger Rapport verworfen wird. */
export function discardPrompt(pendingProject: string | null, nextProject: string): string {
  const which = pendingProject ? `für «${pendingProject}»` : 'in Arbeit'
  return (
    `Du hast noch einen Rapport ${which}, der nicht gespeichert ist.\n\n`
    + `OK = diesen Rapport verwerfen und für «${nextProject}» neu beginnen.\n`
    + 'Abbrechen = zurück zum laufenden Rapport.'
  )
}
