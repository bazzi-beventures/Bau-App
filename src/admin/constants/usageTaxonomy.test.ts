import { describe, it, expect } from 'vitest'
import {
  KNOWN_ACTIONS, PSEUDO_MODULES, UNMAPPED,
  actionLabel, moduleLabel, moduleOfAction,
} from './usageTaxonomy'

// Spiegel von config.KNOWN_MODULES (Python). Muss zusammenpassen — ein Tippfehler
// im Modulschlüssel liesse die Zeile im Modul-Inventar sonst neben dem echten
// Modul stehen, statt sich mit ihm zu verrechnen.
//
// BEWUSST nicht der TS-Typ ModuleName aus api/modules.ts: der kennt nur 19 der
// 25 Module — es fehlen die Hintergrund-Module ohne eigenen Screen
// (clock_out_reminder, approval_push, morning_briefing …). Spec §7f.
const KNOWN_MODULES = [
  'timekeeping', 'scheduling', 'quotes', 'invoicing', 'payment_matching',
  'inventory', 'hr', 'arg_compliance', 'violation_emails', 'kpis', 'kpis_email',
  'ai', 'help_bot', 'clock_in_reminder', 'hr_weekly_report', 'clock_out_reminder',
  'auto_clockout_correction_reminder', 'approval_push', 'morning_briefing',
  'project_change_push', 'admin_clock_in_push', 'aftersales', 'document_backup',
  'rapport_check_mail', 'task_board',
]

describe('moduleOfAction', () => {
  it('ordnet jede bekannte Aktion einem Modul oder Pseudomodul zu', () => {
    const erlaubt = new Set([...KNOWN_MODULES, ...Object.keys(PSEUDO_MODULES)])
    const offen = KNOWN_ACTIONS.filter(a => !erlaubt.has(moduleOfAction(a)))
    expect(offen).toEqual([])
  })

  it('liefert UNMAPPED statt zu werfen, wenn keine Regel greift', () => {
    expect(moduleOfAction('voellig_neue_sache')).toBe(UNMAPPED)
    expect(moduleOfAction('')).toBe(UNMAPPED)
  })

  // Diese sieben treffen mehrere Regeln — hier entscheidet die Reihenfolge, und
  // genau hier ging es beim Bauen schief (report_kleinmaterial_recorded landete
  // unter 'inventory', weil /material/ vor der Rapport-Regel stand).
  it.each([
    ['report_kleinmaterial_recorded',      'rapport'],
    ['admin_paper_rapport_pdf',            'rapport'],
    ['admin_update_tenant_scheduling',     'konfiguration'],
    ['admin_update_project_schedule',      'scheduling'],
    ['admin_create_project_task_template', 'task_board'],
    ['admin_reconcile_camt',               'payment_matching'],
    ['admin_extract_quote_pdf',            'quotes'],
  ])('%s → %s', (action, modul) => {
    expect(moduleOfAction(action)).toBe(modul)
  })

  it('hält den rohen Audit-Trail aus db/ getrennt', () => {
    for (const a of ['INSERT', 'UPDATE', 'DELETE', 'ANONYMIZE']) {
      expect(moduleOfAction(a)).toBe('datenkorrektur')
    }
  })
})

describe('actionLabel', () => {
  it('hat für jede bekannte Aktion einen deutschen Namen', () => {
    for (const a of KNOWN_ACTIONS) {
      expect(actionLabel(a)).not.toBe('')
      expect(actionLabel(a)).not.toBe(a)
    }
  })

  it('bereitet Unbekanntes lesbar auf, statt roh oder leer zu bleiben', () => {
    expect(actionLabel('admin_foo_bar')).toBe('Foo bar')
    expect(actionLabel('etwas_neues')).toBe('Etwas neues')
  })
})

describe('moduleLabel', () => {
  it('benennt Pseudomodule aus, echte Module bleiben ihr Schlüssel', () => {
    expect(moduleLabel('rapport')).toBe('Rapporte')
    expect(moduleLabel('quotes')).toBe('quotes')
    expect(moduleLabel(UNMAPPED)).toBe('nicht zugeordnet')
  })
})
