import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { apiFetch, ApiError } from '../../api/client'
import {
  getTenantModules, updateTenantModules, TenantModulesResponse,
  getTenantFeatures, updateTenantFeature,
  TenantFeaturesResponse, FeatureRegistryEntry, FeatureFieldSchema,
  getTenantTravelCost, updateTenantTravelCost, TravelCostRow,
} from '../../api/admin'
import {
  listHelpDocs, uploadHelpDoc, deleteHelpDoc, triggerHelpReindex, getHelpReindexStatus,
  HelpDoc, ReindexStatus,
} from '../../api/help'

// Modul-Kategorien für die gruppierte Darstellung im Module-Tab.
// 'notifications' wird zusätzlich nach Kanal (Mail/Push) unterteilt.
type ModuleCategory = 'operativ' | 'hr' | 'analyse' | 'ki' | 'notifications' | 'other'
type NotifChannel = 'mail' | 'push'

interface ModuleMeta {
  label: string
  desc: string
  category: ModuleCategory
  channel?: NotifChannel  // nur relevant für category 'notifications'
}

const MODULE_LABELS: Record<string, ModuleMeta> = {
  timekeeping:      { label: 'Zeiterfassung',     desc: 'Stempeln, Sessions, Pausen für Mitarbeiter', category: 'operativ' },
  scheduling:       { label: 'Einsatzplanung',    desc: 'Wochenplan inkl. interne Einsätze', category: 'operativ' },
  quotes:           { label: 'Offerten',          desc: 'Offerten mit PDF-Generierung', category: 'operativ' },
  invoicing:        { label: 'Rechnungen',        desc: 'Rechnungen mit PDF-Generierung', category: 'operativ' },
  payment_matching: { label: 'Zahlungsabgleich',  desc: 'CAMT-Bankauszug einlesen und Zahlungseingänge automatisch mit Rechnungen abgleichen (benötigt Rechnungen)', category: 'operativ' },
  inventory:        { label: 'Lager',             desc: 'Bestände & Lagerbewegungen (Material-Katalog bleibt verfügbar)', category: 'operativ' },
  hr:               { label: 'HR',                desc: 'Absenzen, Ferien, HR-Berichte', category: 'hr' },
  arg_compliance:   { label: 'ArG-Compliance',    desc: 'Arbeitsgesetz-Verstoss-Erkennung (benötigt HR + Zeiterfassung)', category: 'hr' },
  kpis:             { label: 'Kennzahlen',        desc: 'KPI-Dashboard', category: 'analyse' },
  ai:               { label: 'AI-Funktionen',     desc: 'Mistral-Chat, Voxtral-Voice, KPI-Insights', category: 'ki' },
  help_bot:         { label: 'Hilfe-Bot',         desc: 'In-App-Hilfe per Chat über die Bedien-Handbücher', category: 'ki' },
  // Benachrichtigungen — Mail
  hr_weekly_report: { label: 'Wochen-HR-Übersicht', desc: 'Wöchentliches HR-Journal per Mail am Montag (benötigt HR). Journal & Überstunden-Salden werden weiterhin erstellt — nur die Mail entfällt.', category: 'notifications', channel: 'mail' },
  violation_emails: { label: 'ArG-Verstoss-Mails', desc: 'Wöchentliche Verstoss-E-Mails an die Admins (benötigt ArG-Compliance)', category: 'notifications', channel: 'mail' },
  kpis_email:       { label: 'KPI-Analyse-Mail',  desc: 'Wöchentliche KI-Kennzahlen-Analyse per Mail am Montag (benötigt Kennzahlen)', category: 'notifications', channel: 'mail' },
  // Benachrichtigungen — Push
  clock_in_reminder:{ label: 'Einstempel-Erinnerung', desc: 'Push werktags um 07:15 an eingeplante, noch nicht eingestempelte Mitarbeiter (benötigt Zeiterfassung)', category: 'notifications', channel: 'push' },
  clock_out_reminder:{ label: 'Ausstempel-Erinnerung', desc: 'Abend-Push (Standard 18:00, einstellbar) an Mitarbeiter, die noch eingestempelt sind — verhindert die automatische Schliessung um 23:59 (benötigt Zeiterfassung)', category: 'notifications', channel: 'push' },
  auto_clockout_correction_reminder:{ label: 'Korrektur-Erinnerung (Folgetag)', desc: 'Morgen-Push (Standard 07:00, einstellbar) an Mitarbeiter, deren Session am Vortag automatisch um 23:59 geschlossen wurde (benötigt HR + Zeiterfassung)', category: 'notifications', channel: 'push' },
  approval_push:{ label: 'Genehmigungs-Push', desc: 'Sofort-Push an Mitarbeiter, wenn ihr Ferien- oder Korrekturantrag genehmigt oder abgelehnt wurde', category: 'notifications', channel: 'push' },
  admin_clock_in_push:{ label: 'Einstempel-Bestätigung', desc: 'Push an Mitarbeiter, wenn ein Admin sie über die Massen-Einstempel-Maske einstempelt (benötigt Zeiterfassung)', category: 'notifications', channel: 'push' },
  morning_briefing:{ label: 'Morgen-Briefing', desc: 'Push beim Einstempeln mit den heutigen Baustellen + Adressen (benötigt Einsatzplanung + Zeiterfassung)', category: 'notifications', channel: 'push' },
  project_change_push:{ label: 'Projektänderungs-Push', desc: 'Sofort-Push an betroffene Monteure, wenn Einsatztag, Startzeit oder Team eines Projekts geändert wird (benötigt Einsatzplanung)', category: 'notifications', channel: 'push' },
}

// Module mit zusätzlich konfigurierbarer Uhrzeit. Das An/Aus ist das Modul-Toggle;
// die Uhrzeit liegt als Feature-Flag (feature_flags.<feature>.time, HH:MM) und wird
// inline unter dem Toggle gepflegt. Defaults spiegeln feature_registry.py.
const MODULE_TIME_FEATURE: Record<string, { feature: string; default: string }> = {
  clock_out_reminder: { feature: 'clock_out_reminder_time', default: '18:00' },
  auto_clockout_correction_reminder: { feature: 'auto_clockout_correction_reminder_time', default: '07:00' },
}

const CATEGORY_ORDER: ModuleCategory[] = ['operativ', 'hr', 'analyse', 'ki', 'notifications', 'other']
const CATEGORY_LABELS: Record<ModuleCategory, string> = {
  operativ: 'Operativ',
  hr: 'HR & Compliance',
  analyse: 'Analyse',
  ki: 'KI & Hilfe',
  notifications: 'Benachrichtigungen',
  other: 'Sonstige',
}
const CHANNEL_ORDER: NotifChannel[] = ['mail', 'push']
const CHANNEL_LABELS: Record<NotifChannel, string> = { mail: 'Mail', push: 'Push' }

interface WeeklyPlanEntry {
  week_number: number
  target_hours: number
  note: string
}

interface OvertimeSettings {
  overtime_reset_month: number
  overtime_reset_day: number
  overtime_reset_policy: 'full_reset' | 'carry_all' | 'carry_max_hours'
  overtime_carry_max_hours: number
  soll_stunden_woche: number
  vacation_default_days: number
  vacation_50plus_days: number
  vacation_age_threshold: number
}

const MONTHS_DE = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
]

function isoWeeksInYear(year: number): number {
  const jan1 = new Date(year, 0, 1).getDay()
  const dec31 = new Date(year, 11, 31).getDay()
  return (jan1 === 4 || dec31 === 4) ? 53 : 52
}

interface ConfigProps {
  userRole?: string
}

export default function ConfigurationScreen({ userRole }: ConfigProps) {
  const isSuperadmin = userRole === 'superadmin'
  const [tab, setTab] = useState<'weekly-plan' | 'year-end' | 'modules' | 'notifications' | 'workflows' | 'travel-cost' | 'help-docs'>('weekly-plan')
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  function showToast(msg: string, type: 'success' | 'error') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Konfiguration</div>
          <div className="admin-page-subtitle">Wochenplan und Jahresabschluss</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, padding: '0 0 16px 0', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 16 }}>
        <button
          className={`admin-btn ${tab === 'weekly-plan' ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
          onClick={() => setTab('weekly-plan')}
        >
          Wochenplan
        </button>
        <button
          className={`admin-btn ${tab === 'year-end' ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
          onClick={() => setTab('year-end')}
        >
          Jahresabschluss
        </button>
        {isSuperadmin && (
          <button
            className={`admin-btn ${tab === 'modules' ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
            onClick={() => setTab('modules')}
          >
            Module
          </button>
        )}
        {isSuperadmin && (
          <button
            className={`admin-btn ${tab === 'notifications' ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
            onClick={() => setTab('notifications')}
          >
            Benachrichtigungen
          </button>
        )}
        {isSuperadmin && (
          <button
            className={`admin-btn ${tab === 'workflows' ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
            onClick={() => setTab('workflows')}
          >
            Workflows
          </button>
        )}
        {isSuperadmin && (
          <button
            className={`admin-btn ${tab === 'travel-cost' ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
            onClick={() => setTab('travel-cost')}
          >
            Fahrtkosten
          </button>
        )}
        {isSuperadmin && (
          <button
            className={`admin-btn ${tab === 'help-docs' ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
            onClick={() => setTab('help-docs')}
          >
            Hilfe-Bot
          </button>
        )}
      </div>

      {tab === 'weekly-plan' && <WeeklyPlanTab onToast={showToast} />}
      {tab === 'year-end' && <YearEndTab onToast={showToast} />}
      {tab === 'modules' && isSuperadmin && <ModulesTab onToast={showToast} view="modules" />}
      {tab === 'notifications' && isSuperadmin && <ModulesTab onToast={showToast} view="notifications" />}
      {tab === 'workflows' && isSuperadmin && <WorkflowsTab onToast={showToast} />}
      {tab === 'travel-cost' && isSuperadmin && <TravelCostTab onToast={showToast} />}
      {tab === 'help-docs' && isSuperadmin && <HelpDocsTab onToast={showToast} />}

      {toast && (
        <div className="admin-toast-container">
          <div className={`admin-toast ${toast.type}`}>{toast.msg}</div>
        </div>
      )}
    </div>
  )
}

function WeeklyPlanTab({ onToast }: { onToast: (msg: string, type: 'success' | 'error') => void }) {
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const [defaultHours, setDefaultHours] = useState<number>(40)
  const [entries, setEntries] = useState<Map<number, WeeklyPlanEntry>>(new Map())
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const [plan, settings] = await Promise.all([
        apiFetch(`/pwa/admin/hr/weekly-plan?year=${year}`) as Promise<WeeklyPlanEntry[]>,
        apiFetch(`/pwa/admin/hr/overtime-reset-settings`) as Promise<{ soll_stunden_woche: number }>,
      ])
      setDefaultHours(settings.soll_stunden_woche ?? 40)
      const map = new Map<number, WeeklyPlanEntry>()
      for (const e of plan) map.set(e.week_number, e)
      setEntries(map)
      setDirty(false)
    } catch {
      onToast('Laden fehlgeschlagen', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [year])

  function setWeek(week: number, target_hours: number, note: string) {
    const next = new Map(entries)
    next.set(week, { week_number: week, target_hours, note })
    setEntries(next)
    setDirty(true)
  }

  function clearWeek(week: number) {
    const next = new Map(entries)
    next.delete(week)
    setEntries(next)
    setDirty(true)
  }

  async function save() {
    setSaving(true)
    try {
      await apiFetch(`/pwa/admin/hr/weekly-plan`, {
        method: 'PUT',
        body: JSON.stringify({ year, entries: Array.from(entries.values()) }),
      })
      onToast('Wochenplan gespeichert', 'success')
      setDirty(false)
    } catch {
      onToast('Speichern fehlgeschlagen', 'error')
    } finally {
      setSaving(false)
    }
  }

  function fillAll(hours: number) {
    const next = new Map(entries)
    for (let w = 1; w <= weeksInYear; w++) {
      next.set(w, { week_number: w, target_hours: hours, note: next.get(w)?.note ?? '' })
    }
    setEntries(next)
    setDirty(true)
  }

  const weeksInYear = isoWeeksInYear(year)

  return (
    <>
      <div className="admin-table-wrap" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="admin-form-group">
            <label className="admin-form-label">Jahr</label>
            <input
              type="number"
              className="admin-form-input"
              value={year}
              min={2020}
              max={2100}
              onChange={e => setYear(parseInt(e.target.value) || currentYear)}
              style={{ width: 120 }}
            />
          </div>
          <div style={{ flex: 1, minWidth: 200, fontSize: 13, color: 'var(--muted)' }}>
            Standard (Tenant): <strong>{defaultHours} h/Woche</strong>. Einträge überschreiben den Standard für einzelne Kalenderwochen (z. B. Ferienwochen, Feiertagswochen).
          </div>
          <button
            className="admin-btn admin-btn-secondary"
            onClick={() => fillAll(defaultHours)}
            disabled={loading || saving}
          >
            Alle KW mit {defaultHours}h füllen
          </button>
          <button
            className="admin-btn admin-btn-primary"
            onClick={save}
            disabled={!dirty || saving || loading}
          >
            {saving ? 'Speichern…' : 'Speichern'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="admin-loading"><div className="admin-spinner" /> Wochenplan wird geladen…</div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th style={{ width: 80 }}>KW</th>
                <th style={{ width: 160 }}>Soll-Stunden</th>
                <th>Notiz (optional)</th>
                <th style={{ width: 80 }}></th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: weeksInYear }, (_, i) => i + 1).map(w => {
                const entry = entries.get(w)
                const effective = entry?.target_hours ?? defaultHours
                return (
                  <tr key={w}>
                    <td style={{ fontWeight: 600 }}>KW {w.toString().padStart(2, '0')}</td>
                    <td>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        max="80"
                        className="admin-form-input"
                        value={entry?.target_hours ?? ''}
                        placeholder={`${defaultHours} (Standard)`}
                        onChange={e => {
                          const v = e.target.value
                          if (v === '') { clearWeek(w); return }
                          setWeek(w, parseFloat(v), entry?.note ?? '')
                        }}
                        style={{
                          width: 130,
                          color: entry ? undefined : 'var(--muted)',
                        }}
                      />
                      <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--muted)' }}>
                        = {effective}h
                      </span>
                    </td>
                    <td>
                      <input
                        type="text"
                        className="admin-form-input"
                        value={entry?.note ?? ''}
                        placeholder="z. B. Betriebsferien"
                        maxLength={100}
                        onChange={e => {
                          const v = e.target.value
                          if (!entry && !v) return
                          setWeek(w, entry?.target_hours ?? defaultHours, v)
                        }}
                      />
                    </td>
                    <td>
                      {entry && (
                        <button
                          className="admin-btn admin-btn-secondary"
                          style={{ fontSize: 11, padding: '3px 8px' }}
                          onClick={() => clearWeek(w)}
                        >
                          Zurücksetzen
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

function YearEndTab({ onToast }: { onToast: (msg: string, type: 'success' | 'error') => void }) {
  const [settings, setSettings] = useState<OvertimeSettings | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const result = await apiFetch('/pwa/admin/hr/overtime-reset-settings') as OvertimeSettings
      setSettings(result)
      setDirty(false)
    } catch {
      onToast('Laden fehlgeschlagen', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function update<K extends keyof OvertimeSettings>(key: K, value: OvertimeSettings[K]) {
    if (!settings) return
    setSettings({ ...settings, [key]: value })
    setDirty(true)
  }

  async function save() {
    if (!settings) return
    setSaving(true)
    try {
      await apiFetch('/pwa/admin/hr/overtime-reset-settings', {
        method: 'PUT',
        body: JSON.stringify(settings),
      })
      onToast('Einstellungen gespeichert', 'success')
      setDirty(false)
    } catch {
      onToast('Speichern fehlgeschlagen', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading || !settings) {
    return <div className="admin-loading"><div className="admin-spinner" /> Einstellungen werden geladen…</div>
  }

  const daysInMonth = new Date(new Date().getFullYear(), settings.overtime_reset_month, 0).getDate()

  return (
    <div className="admin-table-wrap" style={{ padding: 24, maxWidth: 720 }}>
      <div style={{ marginBottom: 20, fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
        Am konfigurierten Reset-Datum wird jeder Mitarbeiter-Saldo gemäss Policy gesaldet.
        Der Reset-Scheduler läuft täglich um 03:00 und prüft, ob heute das Reset-Datum ist.
        Vor dem Reset wird der bisherige Saldo in <code>overtime_yearly_cutoff</code> archiviert.
      </div>

      <div style={{ display: 'grid', gap: 16 }}>
        <div>
          <label className="admin-form-label">Standard-Wochensoll (h)</label>
          <input
            type="number"
            step="0.5"
            min="1"
            max="80"
            className="admin-form-input"
            value={settings.soll_stunden_woche}
            onChange={e => update('soll_stunden_woche', parseFloat(e.target.value) || 40)}
            style={{ width: 160 }}
          />
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
            Wird als Default für alle Wochen verwendet, sofern keine Ausnahme im Wochenplan hinterlegt ist.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label className="admin-form-label">Reset-Monat</label>
            <select
              className="admin-form-input"
              value={settings.overtime_reset_month}
              onChange={e => update('overtime_reset_month', parseInt(e.target.value))}
            >
              {MONTHS_DE.map((name, i) => (
                <option key={i + 1} value={i + 1}>{name}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label className="admin-form-label">Reset-Tag</label>
            <input
              type="number"
              min="1"
              max={daysInMonth}
              className="admin-form-input"
              value={settings.overtime_reset_day}
              onChange={e => update('overtime_reset_day', Math.min(daysInMonth, Math.max(1, parseInt(e.target.value) || 1)))}
            />
          </div>
        </div>

        <div>
          <label className="admin-form-label">Policy</label>
          <select
            className="admin-form-input"
            value={settings.overtime_reset_policy}
            onChange={e => update('overtime_reset_policy', e.target.value as OvertimeSettings['overtime_reset_policy'])}
          >
            <option value="full_reset">Voller Reset — Saldo wird auf 0 gesetzt</option>
            <option value="carry_all">Alles übertragen — Saldo bleibt unverändert</option>
            <option value="carry_max_hours">Maximal übertragen — bis zu X Stunden werden übernommen</option>
          </select>
        </div>

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 16, marginTop: 4 }}>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12, lineHeight: 1.6 }}>
            Ferienanspruch pro Mitarbeiter und Jahr. Ab der Altersgrenze gilt der erhöhte Anspruch automatisch.
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <label className="admin-form-label">Standard-Ferientage / Jahr</label>
              <input
                type="number"
                min="0"
                max="60"
                className="admin-form-input"
                value={settings.vacation_default_days}
                onChange={e => update('vacation_default_days', parseInt(e.target.value) || 0)}
              />
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <label className="admin-form-label">Ferientage ab Altersgrenze</label>
              <input
                type="number"
                min="0"
                max="60"
                className="admin-form-input"
                value={settings.vacation_50plus_days}
                onChange={e => update('vacation_50plus_days', parseInt(e.target.value) || 0)}
              />
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <label className="admin-form-label">Altersgrenze (Jahre)</label>
              <input
                type="number"
                min="0"
                max="120"
                className="admin-form-input"
                value={settings.vacation_age_threshold}
                onChange={e => update('vacation_age_threshold', parseInt(e.target.value) || 0)}
              />
            </div>
          </div>
        </div>

        {settings.overtime_reset_policy === 'carry_max_hours' && (
          <div>
            <label className="admin-form-label">Max. Übertrag (h)</label>
            <input
              type="number"
              step="0.5"
              min="0"
              max="500"
              className="admin-form-input"
              value={settings.overtime_carry_max_hours}
              onChange={e => update('overtime_carry_max_hours', parseFloat(e.target.value) || 0)}
              style={{ width: 160 }}
            />
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
              Gilt in beide Richtungen: Positive Übertragung max. +{settings.overtime_carry_max_hours}h, Minusstunden max. −{settings.overtime_carry_max_hours}h.
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          <button
            className="admin-btn admin-btn-primary"
            onClick={save}
            disabled={!dirty || saving}
          >
            {saving ? 'Speichern…' : 'Speichern'}
          </button>
          <button
            className="admin-btn admin-btn-secondary"
            onClick={load}
            disabled={saving || !dirty}
          >
            Verwerfen
          </button>
        </div>
      </div>
    </div>
  )
}

function ModulesTab({ onToast, view }: { onToast: (msg: string, type: 'success' | 'error') => void; view: 'modules' | 'notifications' }) {
  const [data, setData] = useState<TenantModulesResponse | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  // Reminder-Uhrzeiten (Feature-Flags): feature-key -> HH:MM. Nur im Notifications-View relevant.
  const [reminderTimes, setReminderTimes] = useState<Record<string, string>>({})

  async function load() {
    setLoading(true)
    try {
      const result = await getTenantModules()
      setData(result)
      setSelected(new Set(result.enabled_modules))
      // Aktuelle Reminder-Uhrzeiten aus den Feature-Overrides ziehen (nur Notifications-Tab).
      if (view === 'notifications') {
        try {
          const features = await getTenantFeatures()
          const times: Record<string, string> = {}
          for (const { feature, default: def } of Object.values(MODULE_TIME_FEATURE)) {
            const ov = features.overrides?.[feature] as { time?: string } | undefined
            times[feature] = (ov?.time as string) || def
          }
          setReminderTimes(times)
        } catch { /* Uhrzeiten optional — Toggle funktioniert auch ohne */ }
      }
    } catch {
      onToast('Laden fehlgeschlagen', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function saveReminderTime(feature: string, time: string) {
    setReminderTimes(prev => ({ ...prev, [feature]: time }))
    try {
      await updateTenantFeature(feature, { time })
      onToast('Uhrzeit gespeichert', 'success')
    } catch {
      onToast('Uhrzeit speichern fehlgeschlagen', 'error')
    }
  }

  useEffect(() => { load() }, [])

  if (loading || !data) {
    return <div className="admin-loading"><div className="admin-spinner" /> Module werden geladen…</div>
  }

  const dependencies = data.dependencies
  const dirty = !setEqual(selected, new Set(data.enabled_modules))

  // Live-Validierung: fehlende Dependencies pro Modul
  const errors: string[] = []
  for (const m of selected) {
    const deps = dependencies[m] ?? []
    const missing = deps.filter(d => !selected.has(d))
    if (missing.length > 0) {
      errors.push(`${MODULE_LABELS[m]?.label ?? m} benötigt: ${missing.map(d => MODULE_LABELS[d]?.label ?? d).join(', ')}`)
    }
  }

  function toggle(module: string) {
    const next = new Set(selected)
    if (next.has(module)) next.delete(module)
    else next.add(module)
    setSelected(next)
  }

  async function save() {
    if (errors.length > 0) {
      onToast('Bitte zuerst Dependency-Fehler beheben', 'error')
      return
    }
    setSaving(true)
    try {
      const result = await updateTenantModules(Array.from(selected).sort())
      setSelected(new Set(result.enabled_modules))
      setData(prev => prev ? { ...prev, enabled_modules: result.enabled_modules } : prev)
      onToast('Module gespeichert', 'success')
    } catch {
      onToast('Speichern fehlgeschlagen', 'error')
    } finally {
      setSaving(false)
    }
  }

  function renderModuleRow(m: string) {
    const meta = MODULE_LABELS[m] ?? { label: m, desc: '' }
    const deps = dependencies[m] ?? []
    const isOn = selected.has(m)
    return (
      <label
        key={m}
        style={{
          display: 'flex', gap: 12, padding: 12, alignItems: 'flex-start',
          border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8,
          background: isOn ? 'rgba(34,197,94,0.06)' : 'transparent',
          cursor: 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={isOn}
          onChange={() => toggle(m)}
          style={{ marginTop: 2 }}
        />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>
            {meta.label} <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--muted)' }}>({m})</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{meta.desc}</div>
          {deps.length > 0 && (
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
              Benötigt: {deps.map(d => MODULE_LABELS[d]?.label ?? d).join(', ')}
            </div>
          )}
          {MODULE_TIME_FEATURE[m] && isOn && (
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}
              onClick={e => { e.preventDefault(); e.stopPropagation() }}
            >
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>Uhrzeit:</span>
              <input
                type="time"
                value={reminderTimes[MODULE_TIME_FEATURE[m].feature] ?? MODULE_TIME_FEATURE[m].default}
                onClick={e => e.stopPropagation()}
                onChange={e => saveReminderTime(MODULE_TIME_FEATURE[m].feature, e.target.value)}
                style={{
                  padding: '4px 8px', borderRadius: 6, fontSize: 13,
                  border: '1px solid rgba(255,255,255,0.15)', background: 'transparent',
                  color: 'inherit',
                }}
              />
            </div>
          )}
        </div>
      </label>
    )
  }

  const visibleCategories = view === 'notifications'
    ? CATEGORY_ORDER.filter(c => c === 'notifications')
    : CATEGORY_ORDER.filter(c => c !== 'notifications')

  return (
    <div className="admin-table-wrap" style={{ padding: 24, maxWidth: 760 }}>
      <div style={{ marginBottom: 20, fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
        {view === 'notifications' ? (
          <>
            Steuere die automatischen Benachrichtigungen pro Mandant, gruppiert nach Kanal (Mail / Push).
            Manche benötigen ein zugehöriges Modul (z. B. die KPI-Analyse-Mail braucht <code>Kennzahlen</code>);
            fehlt eine Voraussetzung, aktiviere sie zuerst im Tab <strong>Module</strong>.
          </>
        ) : (
          <>
            Schalte Endpunkt-Features pro Mandant ein oder aus. Stammdaten (Kunden, Projekte, Material, Lieferanten,
            Preisregeln) bleiben immer verfügbar — sie sind Voraussetzung für mehrere Module.
            Abhängige Module (z. B. <code>arg_compliance</code>) lassen sich nur mit ihren Voraussetzungen aktivieren.
            Benachrichtigungen findest du im eigenen Tab <strong>Benachrichtigungen</strong>.
          </>
        )}
      </div>

      <div style={{ display: 'grid', gap: 20, marginBottom: 20 }}>
        {visibleCategories.map(cat => {
          const mods = data.known_modules.filter(m => (MODULE_LABELS[m]?.category ?? 'other') === cat)
          if (mods.length === 0) return null
          return (
            <div key={cat}>
              <div style={{
                fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
                textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8,
              }}>
                {CATEGORY_LABELS[cat]}
              </div>
              {cat === 'notifications' ? (
                CHANNEL_ORDER.map(ch => {
                  const chMods = mods.filter(m => MODULE_LABELS[m]?.channel === ch)
                  if (chMods.length === 0) return null
                  return (
                    <div key={ch} style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>
                        {CHANNEL_LABELS[ch]}
                      </div>
                      <div style={{ display: 'grid', gap: 8 }}>{chMods.map(renderModuleRow)}</div>
                    </div>
                  )
                })
              ) : (
                <div style={{ display: 'grid', gap: 8 }}>{mods.map(renderModuleRow)}</div>
              )}
            </div>
          )
        })}
      </div>

      {errors.length > 0 && (
        <div style={{
          padding: 12, marginBottom: 16, borderRadius: 8,
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
          fontSize: 13, color: '#fca5a5',
        }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Dependency-Fehler:</div>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12 }}>
        <button
          className="admin-btn admin-btn-primary"
          onClick={save}
          disabled={!dirty || saving || errors.length > 0}
        >
          {saving ? 'Speichern…' : 'Speichern'}
        </button>
        <button
          className="admin-btn admin-btn-secondary"
          onClick={load}
          disabled={saving || !dirty}
        >
          Verwerfen
        </button>
      </div>
    </div>
  )
}

function setEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false
  for (const v of a) if (!b.has(v)) return false
  return true
}

// ─── Fahrtkosten-Tab: Distanz-Staffelung pro Mandant ─────────────────────────
//
// Jede Zeile ist [km-Schwelle, CHF]. Die Distanz (km) wird bei Projekt-Anlage
// einmalig via Google Maps berechnet und auf den nächsten ganzen km aufgerundet;
// die erste Zeile, deren Schwelle ≥ diesem Wert ist, bestimmt den Pauschalbetrag.
// Der Preis der LETZTEN Zeile gilt automatisch für alle größeren Distanzen.
// Kein Override (null) ⇒ es greift die System-Default-Tabelle.

function validateTravelRows(rows: TravelCostRow[]): string[] {
  const errors: string[] = []
  if (rows.length === 0) {
    return ['Mindestens eine Zeile erforderlich (oder auf System-Default zurücksetzen).']
  }
  let prev: number | null = null
  rows.forEach((row, i) => {
    const km = row[0]
    const chf = row[1]
    if (km == null || !Number.isFinite(km) || km <= 0) {
      errors.push(`Zeile ${i + 1}: km-Schwelle muss eine positive Zahl sein.`)
      return
    }
    if (!Number.isFinite(chf) || chf < 0) {
      errors.push(`Zeile ${i + 1}: CHF muss ≥ 0 sein.`)
      return
    }
    if (prev != null && km <= prev) {
      errors.push(`Zeile ${i + 1}: km-Schwellen müssen streng aufsteigend sein.`)
    }
    prev = km
  })
  return errors
}

function TravelCostTab({ onToast }: { onToast: (msg: string, type: 'success' | 'error') => void }) {
  const [rows, setRows] = useState<TravelCostRow[]>([])
  const [isDefault, setIsDefault] = useState(true)
  const [defaultTable, setDefaultTable] = useState<TravelCostRow[]>([])
  const [original, setOriginal] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  function snapshot(useDefault: boolean, r: TravelCostRow[]): string {
    return JSON.stringify({ useDefault, rows: useDefault ? [] : r })
  }

  async function load() {
    setLoading(true)
    try {
      const res = await getTenantTravelCost()
      setDefaultTable(res.default_table)
      if (res.travel_cost_table && res.travel_cost_table.length > 0) {
        setRows(res.travel_cost_table)
        setIsDefault(false)
        setOriginal(snapshot(false, res.travel_cost_table))
      } else {
        setRows([])
        setIsDefault(true)
        setOriginal(snapshot(true, []))
      }
    } catch {
      onToast('Laden fehlgeschlagen', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  if (loading) {
    return <div className="admin-loading"><div className="admin-spinner" /> Fahrtkosten werden geladen…</div>
  }

  const errors = isDefault ? [] : validateTravelRows(rows)
  const dirty = snapshot(isDefault, rows) !== original

  function startCustom() {
    // Vom System-Default ableiten: numerische Zeilen übernehmen, die „∞"-Zeile fällt weg
    // (der Preis der letzten Zeile gilt ohnehin automatisch für alle größeren Distanzen).
    const seeded = defaultTable
      .filter(([km]) => km != null)
      .map(([km, chf]) => [km as number, chf] as TravelCostRow)
    setRows(seeded)
    setIsDefault(false)
  }

  function setRow(i: number, km: number | null, chf: number) {
    setRows(prev => prev.map((r, j) => (j === i ? [km, chf] : r)))
  }

  function addRow() {
    const lastKm = rows.length ? (rows[rows.length - 1][0] ?? 0) : 0
    setRows(prev => [...prev, [(lastKm || 0) + 1, 0]])
  }

  function removeRow(i: number) {
    setRows(prev => prev.filter((_, j) => j !== i))
  }

  async function save() {
    if (errors.length > 0) {
      onToast('Bitte zuerst Fehler beheben', 'error')
      return
    }
    setSaving(true)
    try {
      const payload = isDefault ? null : rows
      const res = await updateTenantTravelCost(payload)
      const saved = res.travel_cost_table
      if (saved && saved.length > 0) {
        setRows(saved)
        setIsDefault(false)
        setOriginal(snapshot(false, saved))
      } else {
        setRows([])
        setIsDefault(true)
        setOriginal(snapshot(true, []))
      }
      onToast('Fahrtkosten gespeichert', 'success')
    } catch {
      onToast('Speichern fehlgeschlagen', 'error')
    } finally {
      setSaving(false)
    }
  }

  function resetToDefault() {
    setIsDefault(true)
    setRows([])
  }

  const fmtKm = (km: number | null) => (km == null ? '∞ (und darüber)' : `bis ${km} km`)

  return (
    <div className="admin-table-wrap" style={{ padding: 24, maxWidth: 640 }}>
      <div style={{ marginBottom: 20, fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
        Fahrtkosten-Pauschale je nach Distanz (Firmensitz → Objektadresse). Die Distanz
        wird bei der Projekt-Anlage einmalig berechnet und auf den nächsten ganzen km
        aufgerundet. Es greift die erste Zeile, deren km-Schwelle ≥ der Distanz ist; der
        Preis der <strong>letzten</strong> Zeile gilt für alle größeren Distanzen.
        Diese Tabelle wird in Offerten <em>und</em> Rechnungen verwendet.
      </div>

      {isDefault ? (
        <>
          <div style={{
            padding: 12, marginBottom: 16, borderRadius: 8,
            background: 'rgba(59,130,171,0.08)', border: '1px solid rgba(59,130,171,0.25)',
            fontSize: 13,
          }}>
            Dieser Mandant nutzt aktuell die <strong>System-Standard-Tabelle</strong>.
          </div>
          <table className="admin-table" style={{ marginBottom: 16 }}>
            <thead>
              <tr><th>Distanz</th><th style={{ width: 140 }}>CHF</th></tr>
            </thead>
            <tbody>
              {defaultTable.map(([km, chf], i) => (
                <tr key={i}>
                  <td>{fmtKm(km)}</td>
                  <td>CHF {chf.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="admin-btn admin-btn-primary" onClick={startCustom}>
            Eigene Tabelle erstellen
          </button>
        </>
      ) : (
        <>
          <table className="admin-table" style={{ marginBottom: 12 }}>
            <thead>
              <tr>
                <th style={{ width: 160 }}>bis … km</th>
                <th style={{ width: 160 }}>CHF</th>
                <th style={{ width: 80 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([km, chf], i) => (
                <tr key={i}>
                  <td>
                    <input
                      type="number" min="0" step="1" className="admin-form-input"
                      value={km ?? ''}
                      onChange={e => setRow(i, e.target.value === '' ? null : parseFloat(e.target.value), chf)}
                      style={{ width: 130 }}
                    />
                    {i === rows.length - 1 && (
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>gilt auch darüber</div>
                    )}
                  </td>
                  <td>
                    <input
                      type="number" min="0" step="0.05" className="admin-form-input"
                      value={Number.isFinite(chf) ? chf : ''}
                      onChange={e => setRow(i, km, parseFloat(e.target.value) || 0)}
                      style={{ width: 130 }}
                    />
                  </td>
                  <td>
                    <button
                      className="admin-btn admin-btn-secondary"
                      style={{ fontSize: 11, padding: '3px 8px' }}
                      onClick={() => removeRow(i)}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <button
            className="admin-btn admin-btn-secondary"
            onClick={addRow}
            style={{ fontSize: 12, marginBottom: 16 }}
          >
            + Zeile
          </button>

          {errors.length > 0 && (
            <div style={{
              padding: 12, marginBottom: 16, borderRadius: 8,
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
              fontSize: 13, color: '#fca5a5',
            }}>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}

          <div style={{ display: 'flex', gap: 12 }}>
            <button
              className="admin-btn admin-btn-primary"
              onClick={save}
              disabled={!dirty || saving || errors.length > 0}
            >
              {saving ? 'Speichern…' : 'Speichern'}
            </button>
            <button
              className="admin-btn admin-btn-secondary"
              onClick={load}
              disabled={saving || !dirty}
            >
              Verwerfen
            </button>
            <button
              className="admin-btn admin-btn-secondary"
              onClick={resetToDefault}
              disabled={saving}
              style={{ marginLeft: 'auto' }}
            >
              Auf System-Standard zurücksetzen
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Workflows-Tab: konfigurierbare Feature-Flags pro Tenant ─────────────────

function WorkflowsTab({ onToast }: { onToast: (msg: string, type: 'success' | 'error') => void }) {
  const [data, setData] = useState<TenantFeaturesResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [draft, setDraft] = useState<Record<string, Record<string, unknown>>>({})
  const [savingKey, setSavingKey] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const result = await getTenantFeatures()
      setData(result)
      setDraft({ ...result.effective })
    } catch {
      onToast('Laden fehlgeschlagen', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  if (loading || !data) {
    return <div className="admin-loading"><div className="admin-spinner" /> Workflows werden geladen…</div>
  }

  function setField(featureKey: string, fieldKey: string, value: unknown) {
    setDraft(prev => ({
      ...prev,
      [featureKey]: { ...(prev[featureKey] ?? {}), [fieldKey]: value },
    }))
  }

  function isDirty(featureKey: string): boolean {
    const eff = data?.effective[featureKey] ?? {}
    const d = draft[featureKey] ?? {}
    const keys = new Set([...Object.keys(eff), ...Object.keys(d)])
    for (const k of keys) {
      if (JSON.stringify(eff[k]) !== JSON.stringify(d[k])) return true
    }
    return false
  }

  async function save(entry: FeatureRegistryEntry) {
    const value = draft[entry.key]
    setSavingKey(entry.key)
    try {
      const res = await updateTenantFeature(entry.key, value)
      setData(prev => prev ? {
        ...prev,
        overrides: { ...prev.overrides, [entry.key]: value },
        effective: { ...prev.effective, [entry.key]: res.effective },
      } : prev)
      setDraft(prev => ({ ...prev, [entry.key]: res.effective }))
      onToast(`${entry.label} gespeichert`, 'success')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Speichern fehlgeschlagen'
      onToast(msg, 'error')
    } finally {
      setSavingKey(null)
    }
  }

  function reset(featureKey: string) {
    setDraft(prev => ({ ...prev, [featureKey]: { ...(data?.effective[featureKey] ?? {}) } }))
  }

  // gruppiere Einträge nach category in der Reihenfolge data.categories
  const byCategory = new Map<string, FeatureRegistryEntry[]>()
  for (const cat of data.categories) byCategory.set(cat, [])
  for (const entry of data.registry) {
    if (!byCategory.has(entry.category)) byCategory.set(entry.category, [])
    byCategory.get(entry.category)!.push(entry)
  }

  return (
    <div className="admin-table-wrap" style={{ padding: 24, maxWidth: 880 }}>
      <div style={{ marginBottom: 20, fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
        Konfigurierbare Workflow-Bausteine pro Mandant. Module sind binär (an/aus) — Workflows
        haben zusätzlich Parameter (z. B. Pauschalbeträge, Erfassungs-Scope).
        Jeder Eintrag wird einzeln gespeichert.
      </div>

      {Array.from(byCategory.entries()).map(([cat, entries]) => {
        if (entries.length === 0) return null
        return (
          <div key={cat} style={{ marginBottom: 24 }}>
            <div style={{
              fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
              textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8,
            }}>
              {cat}
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              {entries.map(entry => {
                const current = draft[entry.key] ?? {}
                const enabled = !!current.enabled
                const dirty = isDirty(entry.key)
                return (
                  <div
                    key={entry.key}
                    style={{
                      padding: 16, borderRadius: 8,
                      border: '1px solid rgba(255,255,255,0.08)',
                      background: enabled ? 'rgba(34,197,94,0.06)' : 'transparent',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>
                          {entry.label}{' '}
                          <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--muted)' }}>
                            ({entry.key})
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, lineHeight: 1.5 }}>
                          {entry.description}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gap: 12 }}>
                      {entry.schema.map(field => (
                        <FeatureField
                          key={field.key}
                          field={field}
                          value={current[field.key]}
                          onChange={v => setField(entry.key, field.key, v)}
                          disabled={field.key !== 'enabled' && !enabled}
                        />
                      ))}
                    </div>

                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                      <button
                        className="admin-btn admin-btn-primary"
                        onClick={() => save(entry)}
                        disabled={!dirty || savingKey === entry.key}
                        style={{ fontSize: 12 }}
                      >
                        {savingKey === entry.key ? 'Speichern…' : 'Speichern'}
                      </button>
                      <button
                        className="admin-btn admin-btn-secondary"
                        onClick={() => reset(entry.key)}
                        disabled={!dirty || savingKey === entry.key}
                        style={{ fontSize: 12 }}
                      >
                        Verwerfen
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function FeatureField({
  field, value, onChange, disabled,
}: {
  field: FeatureFieldSchema
  value: unknown
  onChange: (v: unknown) => void
  disabled?: boolean
}) {
  if (field.type === 'bool') {
    return (
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
        <input
          type="checkbox"
          checked={!!value}
          onChange={e => onChange(e.target.checked)}
        />
        <span>{field.label}</span>
      </label>
    )
  }
  if (field.type === 'number') {
    return (
      <div style={{ opacity: disabled ? 0.5 : 1 }}>
        <label className="admin-form-label">{field.label}</label>
        <input
          type="number"
          className="admin-form-input"
          value={typeof value === 'number' ? value : ''}
          min={field.min}
          max={field.max}
          step={field.step}
          disabled={disabled}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          style={{ width: 160 }}
        />
        {field.help && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{field.help}</div>}
      </div>
    )
  }
  if (field.type === 'select') {
    return (
      <div style={{ opacity: disabled ? 0.5 : 1 }}>
        <label className="admin-form-label">{field.label}</label>
        <select
          className="admin-form-input"
          value={typeof value === 'string' ? value : ''}
          disabled={disabled}
          onChange={e => onChange(e.target.value)}
        >
          {(field.options ?? []).map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {field.help && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{field.help}</div>}
      </div>
    )
  }
  if (field.type === 'number_list') {
    const arr = Array.isArray(value) ? (value as number[]) : []
    return (
      <div style={{ opacity: disabled ? 0.5 : 1 }}>
        <label className="admin-form-label">{field.label}</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {arr.map((n, i) => (
            <div key={i} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <input
                type="number"
                className="admin-form-input"
                value={n}
                min={field.min}
                max={field.max}
                disabled={disabled}
                onChange={e => {
                  const next = [...arr]
                  next[i] = parseFloat(e.target.value) || 0
                  onChange(next)
                }}
                style={{ width: 90 }}
              />
              <button
                type="button"
                className="admin-btn admin-btn-secondary"
                disabled={disabled}
                onClick={() => onChange(arr.filter((_, j) => j !== i))}
                style={{ fontSize: 11, padding: '2px 6px' }}
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            className="admin-btn admin-btn-secondary"
            disabled={disabled}
            onClick={() => onChange([...arr, field.min ?? 0])}
            style={{ fontSize: 11, padding: '4px 10px' }}
          >
            + Wert
          </button>
        </div>
        {field.help && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{field.help}</div>}
      </div>
    )
  }
  return null
}

// ─── Hilfe-Bot-Tab: Handbücher hochladen/löschen + Reindex ───────────────────
//
// Die Handbücher liegen im privaten Bucket `help-docs` (Prefix {tenant_id}/) und
// werden über die /pwa/help/docs-Endpoints verwaltet. Nach einer Änderung muss der
// Reindex laufen, damit der Bot die neue Wissensbasis kennt.

const ACCEPT_HELP = '.md,.markdown,.txt,.pdf'

function formatBytes(n?: number | null): string {
  if (!n || n <= 0) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function HelpDocsTab({ onToast }: { onToast: (msg: string, type: 'success' | 'error') => void }) {
  const [docs, setDocs] = useState<HelpDoc[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [reindexing, setReindexing] = useState(false)
  const [status, setStatus] = useState<ReindexStatus | null>(null)
  const [moduleOff, setModuleOff] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const pollRef = useRef<number | null>(null)

  async function loadDocs() {
    setLoading(true)
    try {
      setDocs(await listHelpDocs())
      setModuleOff(false)
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) { setModuleOff(true); return }
      onToast('Handbücher laden fehlgeschlagen', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function loadStatus() {
    try { setStatus(await getHelpReindexStatus()) } catch { /* Status ist optional */ }
  }

  useEffect(() => {
    loadDocs()
    loadStatus()
    return () => { if (pollRef.current) window.clearInterval(pollRef.current) }
  }, [])

  // Solange ein Reindex läuft, den Status alle 2s nachladen.
  useEffect(() => {
    if (status?.state === 'running' && pollRef.current === null) {
      pollRef.current = window.setInterval(loadStatus, 2000)
    } else if (status?.state !== 'running' && pollRef.current !== null) {
      window.clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [status?.state])

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''  // erlaubt erneutes Wählen derselben Datei
    if (!file) return
    setUploading(true)
    try {
      await uploadHelpDoc(file)
      onToast(`„${file.name}" hochgeladen`, 'success')
      await loadDocs()
    } catch (err) {
      const detail = err instanceof ApiError ? err.message : ''
      onToast(`Upload fehlgeschlagen${detail ? ': ' + detail : ''}`, 'error')
    } finally {
      setUploading(false)
    }
  }

  async function onDelete(name: string) {
    if (!window.confirm(`„${name}" wirklich löschen?`)) return
    try {
      await deleteHelpDoc(name)
      onToast('Gelöscht', 'success')
      await loadDocs()
    } catch {
      onToast('Löschen fehlgeschlagen', 'error')
    }
  }

  async function onReindex() {
    setReindexing(true)
    try {
      await triggerHelpReindex()
      onToast('Reindex gestartet', 'success')
      await loadStatus()
    } catch (err) {
      const detail = err instanceof ApiError ? err.message : ''
      onToast(`Reindex fehlgeschlagen${detail ? ': ' + detail : ''}`, 'error')
    } finally {
      setReindexing(false)
    }
  }

  if (moduleOff) {
    return (
      <div className="admin-table-wrap" style={{ padding: 24, maxWidth: 720 }}>
        <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
          Das Modul <strong>Hilfe-Bot</strong> ist für diesen Mandanten nicht aktiv.
          Aktiviere es zuerst im Tab <strong>Module</strong>, um Handbücher zu verwalten.
        </div>
      </div>
    )
  }

  const running = status?.state === 'running'

  return (
    <div className="admin-table-wrap" style={{ padding: 24, maxWidth: 760 }}>
      <div style={{ marginBottom: 20, fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
        Handbücher (Markdown, Text oder PDF) für den In-App-Hilfe-Bot. Die Dateien liegen im
        privaten Bucket <code>help-docs</code>. Nach dem Hoch- oder Herunterladen den{' '}
        <strong>Reindex</strong> auslösen, damit der Bot die Änderungen kennt (läuft sonst
        automatisch nachts um 03:30).
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <input ref={fileRef} type="file" accept={ACCEPT_HELP} onChange={onPick} style={{ display: 'none' }} />
        <button
          className="admin-btn admin-btn-primary"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? 'Lädt hoch…' : '+ Handbuch hochladen'}
        </button>
        <button
          className="admin-btn admin-btn-secondary"
          onClick={onReindex}
          disabled={reindexing || running}
        >
          {running ? 'Reindex läuft…' : 'Neu indexieren'}
        </button>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>Erlaubt: .md, .txt, .pdf (max. 25 MB)</span>
      </div>

      {status && status.state !== 'idle' && (
        <div style={{
          padding: 12, marginBottom: 16, borderRadius: 8, fontSize: 13,
          background: status.state === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(59,130,171,0.08)',
          border: `1px solid ${status.state === 'error' ? 'rgba(239,68,68,0.3)' : 'rgba(59,130,171,0.25)'}`,
          color: status.state === 'error' ? '#fca5a5' : undefined,
        }}>
          {status.state === 'running' && 'Reindex läuft…'}
          {status.state === 'success' && `Reindex erfolgreich — ${status.chunks_indexed} Abschnitte aus ${status.files_processed} Datei(en) indexiert${status.files_skipped ? `, ${status.files_skipped} übersprungen` : ''}.`}
          {status.state === 'error' && `Reindex-Fehler: ${status.last_error ?? 'unbekannt'}`}
        </div>
      )}

      {loading ? (
        <div className="admin-loading"><div className="admin-spinner" /> Handbücher werden geladen…</div>
      ) : docs.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--muted)', padding: '12px 0' }}>
          Noch keine Handbücher hochgeladen.
        </div>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Datei</th>
              <th style={{ width: 120 }}>Grösse</th>
              <th style={{ width: 100 }}></th>
            </tr>
          </thead>
          <tbody>
            {docs.map(d => (
              <tr key={d.name}>
                <td style={{ fontWeight: 600 }}>{d.name}</td>
                <td>{formatBytes(d.size)}</td>
                <td>
                  <button
                    className="admin-btn admin-btn-secondary"
                    style={{ fontSize: 11, padding: '3px 8px' }}
                    onClick={() => onDelete(d.name)}
                  >
                    Löschen
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
