// Blockierendes Teil-Gate für ESLint — das Gegenstück zum Ruff-Gate der
// Backend-CI (docs/specs/refactoring-folgethemen.md §2, Ratchet-Muster aus §1).
//
// Warum nicht einfach `eslint .` blockierend schalten: der Bestand trägt noch
// Errors (Stand 2026-08-23: 3) und 89 Warnings. Ein Voll-Gate wäre ab dem ersten
// Tag rot und damit wertlos. Stattdessen blockieren genau die Regeln, deren
// Bestand auf 0 steht — so kann er dort nicht wieder wachsen, während der Rest
// im informativen Lauf sichtbar bleibt.
//
// Eine Regel kommt hinzu, sobald ihr Bestand 0 ist. Umgekehrt darf hier NIE
// etwas herausgenommen werden, um einen Lauf grün zu bekommen — dann ist der
// Findings-Fix die Aufgabe, nicht die Liste.
import { ESLint } from 'eslint'

const GATED = [
  'react-hooks/refs',      // Ref-Zugriff im Render-Rumpf
  'react-hooks/purity',    // unreine Aufrufe (Date.now(), Math.random()) im Render
  'react-hooks/globals',   // Modul-Variablen im Render mutiert
  'no-empty',              // leerer Block ohne erklärenden Kommentar
]

const eslint = new ESLint()
const results = await eslint.lintFiles(['.'])

const treffer = results.flatMap(r =>
  r.messages
    .filter(m => GATED.includes(m.ruleId))
    .map(m => `${r.filePath}:${m.line}:${m.column}  ${m.ruleId}  ${m.message.split('\n')[0]}`),
)

if (treffer.length > 0) {
  console.error(`ESLint-Gate: ${treffer.length} Treffer in gesperrten Regeln\n`)
  for (const t of treffer) console.error('  ' + t)
  console.error(`\nGesperrte Regeln: ${GATED.join(', ')}`)
  console.error('Diese Regeln sind repo-weit sauber und sollen es bleiben.')
  process.exit(1)
}

console.log(`ESLint-Gate sauber — keine Treffer in: ${GATED.join(', ')}`)
