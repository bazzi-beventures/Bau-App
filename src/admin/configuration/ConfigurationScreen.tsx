import { useEffect, useState } from 'react'
import { apiFetch } from '../../api/client'
import { getTenantModules, updateTenantModules, TenantModulesResponse } from '../../api/admin'

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
  const [tab, setTab] = useState<'weekly-plan' | 'year-end' | 'modules' | 'notifications'>('weekly-plan')
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
      </div>

      {tab === 'weekly-plan' && <WeeklyPlanTab onToast={showToast} />}
      {tab === 'year-end' && <YearEndTab onToast={showToast} />}
      {tab === 'modules' && isSuperadmin && <ModulesTab onToast={showToast} view="modules" />}
      {tab === 'notifications' && isSuperadmin && <ModulesTab onToast={showToast} view="notifications" />}

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

  async function load() {
    setLoading(true)
    try {
      const result = await getTenantModules()
      setData(result)
      setSelected(new Set(result.enabled_modules))
    } catch {
      onToast('Laden fehlgeschlagen', 'error')
    } finally {
      setLoading(false)
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
