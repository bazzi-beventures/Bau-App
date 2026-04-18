import { useEffect, useState } from 'react'
import { apiFetch } from '../../api/client'
import { SK } from '../../api/storageKeys'

const BASE_URL = import.meta.env.VITE_API_URL ?? ''

interface Session {
  id: string
  staff_name: string
  date: string
  clock_in: string
  clock_out: string | null
  break_minutes: number
  total_minutes: number | null
  violations?: string[]
}

interface LaborHour {
  staff_name: string
  project_name: string
  hours: number
  date: string
}

interface OvertimeInfo {
  total_net_hours: number
  soll_hours: number
  saldo: number
  absence_days: number
}

interface TimesheetData {
  sessions: Session[]
  labor_hours: LaborHour[]
  overtime_by_staff: Record<string, OvertimeInfo>
  soll_stunden_woche: number
}

interface DbViolation {
  id: string
  staff_name: string
  violation_date: string
  violation_type: string
  description: string
  severity: string
  acknowledged: boolean
  acknowledged_by: string | null
  acknowledged_at: string | null
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('de-CH', { weekday: 'short', day: '2-digit', month: '2-digit' })
}

function fmtHours(minutes: number | null) {
  if (minutes == null) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}:${m.toString().padStart(2, '0')} h`
}

function fmtDecimal(hours: number) {
  const sign = hours >= 0 ? '+' : ''
  return `${sign}${hours.toFixed(1)} h`
}

function fmtTime(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Zurich' })
}

// Group sessions by staff name
function groupByStaff(sessions: Session[]) {
  const map = new Map<string, Session[]>()
  for (const s of sessions) {
    const arr = map.get(s.staff_name) ?? []
    arr.push(s)
    map.set(s.staff_name, arr)
  }
  return map
}

export default function HrReportsScreen() {
  const now = new Date()
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const defaultTo = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)

  const [tab, setTab] = useState<'timesheet' | 'violations' | 'weekly-plan' | 'year-end'>('timesheet')
  const [dateFrom, setDateFrom] = useState(defaultFrom)
  const [dateTo, setDateTo] = useState(defaultTo)
  const [data, setData] = useState<TimesheetData | null>(null)
  const [loading, setLoading] = useState(false)
  const [expandedStaff, setExpandedStaff] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  const [violations, setViolations] = useState<DbViolation[]>([])
  const [violationsLoading, setViolationsLoading] = useState(false)
  const [acknowledging, setAcknowledging] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const result = await apiFetch(
        `/pwa/admin/hr/timesheet?date_from=${dateFrom}&date_to=${dateTo}`
      ) as TimesheetData
      setData(result)
      if (result.sessions.length > 0) {
        setExpandedStaff(result.sessions[0].staff_name)
      }
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  async function loadViolations() {
    setViolationsLoading(true)
    try {
      const result = await apiFetch(
        `/pwa/admin/hr/violations?date_from=${dateFrom}&date_to=${dateTo}`
      ) as DbViolation[]
      setViolations(result)
    } catch {
      setViolations([])
    } finally {
      setViolationsLoading(false)
    }
  }

  async function acknowledgeViolation(id: string) {
    setAcknowledging(id)
    try {
      await apiFetch(`/pwa/admin/hr/violations/${id}/acknowledge`, { method: 'PATCH' })
      setViolations(vs => vs.map(v => v.id === id ? { ...v, acknowledged: true } : v))
    } catch {
      setToast({ msg: 'Fehler beim Bestätigen', type: 'error' })
      setTimeout(() => setToast(null), 3000)
    } finally {
      setAcknowledging(null)
    }
  }

  useEffect(() => { load(); loadViolations() }, [])

  async function handleExport() {
    setExporting(true)
    try {
      const token = localStorage.getItem(SK.TOKEN)
      const res = await fetch(`${BASE_URL}/pwa/admin/hr/export-timesheets`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ date_from: dateFrom, date_to: dateTo }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(err.detail || 'Export fehlgeschlagen')
      }
      const blob = await res.blob()
      const disposition = res.headers.get('Content-Disposition') ?? ''
      const match = disposition.match(/filename="?([^"]+)"?/)
      const filename = match ? match[1] : `Stunden-Export_${dateFrom}_${dateTo}.xlsx`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      setToast({ msg: 'Export heruntergeladen', type: 'success' })
      setTimeout(() => setToast(null), 3000)
    } catch (err) {
      setToast({ msg: err instanceof Error ? err.message : 'Export fehlgeschlagen', type: 'error' })
      setTimeout(() => setToast(null), 3000)
    } finally {
      setExporting(false)
    }
  }

  const staffGroups = data ? groupByStaff(data.sessions) : new Map<string, Session[]>()

  function staffTotalHours(sessions: Session[]) {
    return sessions.reduce((sum, s) => sum + (s.total_minutes ?? 0), 0)
  }

  // Verstösse werden live aus den Sessions berechnet (admin_staff.py) und
  // zusätzlich vom Mitternachts-Job in arg_violations persistiert. Wir zeigen
  // beide Quellen zusammen und mergen über (staff, date, description).
  type UnifiedViolation = {
    key: string
    staff_name: string
    date: string
    description: string
    dbId: string | null
    acknowledged: boolean
    severity: string
  }
  const dbByKey = new Map<string, DbViolation>()
  for (const v of violations) {
    dbByKey.set(`${v.staff_name}|${v.violation_date}|${v.description}`, v)
  }
  const unifiedViolations: UnifiedViolation[] = []
  const seenKeys = new Set<string>()
  if (data) {
    for (const s of data.sessions) {
      for (const text of (s.violations ?? [])) {
        const key = `${s.staff_name}|${s.date}|${text}`
        if (seenKeys.has(key)) continue
        seenKeys.add(key)
        const db = dbByKey.get(key)
        unifiedViolations.push({
          key,
          staff_name: s.staff_name,
          date: s.date,
          description: text,
          dbId: db?.id ?? null,
          acknowledged: db?.acknowledged ?? false,
          severity: db?.severity ?? 'warning',
        })
      }
    }
  }
  for (const v of violations) {
    const key = `${v.staff_name}|${v.violation_date}|${v.description}`
    if (seenKeys.has(key)) continue
    seenKeys.add(key)
    unifiedViolations.push({
      key,
      staff_name: v.staff_name,
      date: v.violation_date,
      description: v.description,
      dbId: v.id,
      acknowledged: v.acknowledged,
      severity: v.severity,
    })
  }
  unifiedViolations.sort((a, b) => b.date.localeCompare(a.date))
  const unifiedBadgeCount = unifiedViolations.filter(v => !v.acknowledged).length

  function handleLoad() {
    load()
    loadViolations()
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">HR-Berichte</div>
          <div className="admin-page-subtitle">Arbeitszeitübersicht pro Mitarbeiter</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '0 0 16px 0', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 16 }}>
        <button
          className={`admin-btn ${tab === 'timesheet' ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
          onClick={() => setTab('timesheet')}
        >
          Zeiterfassung
        </button>
        <button
          className={`admin-btn ${tab === 'violations' ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
          onClick={() => setTab('violations')}
          style={{ position: 'relative' }}
        >
          Verstösse
          {unifiedBadgeCount > 0 && (
            <span style={{
              position: 'absolute', top: -6, right: -6,
              background: '#ef4444', color: '#fff',
              fontSize: 11, fontWeight: 700,
              borderRadius: 10, padding: '1px 6px', lineHeight: '16px',
            }}>
              {unifiedBadgeCount}
            </span>
          )}
        </button>
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
      </div>

      {/* Filter */}
      {(tab === 'timesheet' || tab === 'violations') && (
      <div className="admin-table-wrap" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="admin-form-group">
            <label className="admin-form-label">Von</label>
            <input type="date" className="admin-form-input" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ width: 160 }} />
          </div>
          <div className="admin-form-group">
            <label className="admin-form-label">Bis</label>
            <input type="date" className="admin-form-input" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ width: 160 }} />
          </div>
          <button className="admin-btn admin-btn-primary" onClick={handleLoad} disabled={loading || violationsLoading}>
            {loading || violationsLoading ? 'Laden…' : 'Laden'}
          </button>
          {tab === 'timesheet' && (
            <button className="admin-btn admin-btn-secondary" onClick={handleExport} disabled={exporting || loading}>
              {exporting ? 'Exportieren…' : 'XLSX Export'}
            </button>
          )}
        </div>
      </div>
      )}

      {/* ─── Violations Tab ─── */}
      {tab === 'violations' && (
        <>
          {(loading || violationsLoading) && <div className="admin-loading"><div className="admin-spinner" /> Verstösse werden geladen…</div>}
          {!loading && !violationsLoading && unifiedViolations.length === 0 && (
            <div className="admin-table-wrap">
              <div className="admin-table-empty" style={{ padding: 48 }}>Keine Verstösse im gewählten Zeitraum.</div>
            </div>
          )}
          {!loading && !violationsLoading && unifiedViolations.length > 0 && (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Datum</th>
                    <th>Mitarbeiter</th>
                    <th>Beschreibung</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {unifiedViolations.map(v => (
                    <tr key={v.key}>
                      <td className="secondary" style={{ whiteSpace: 'nowrap' }}>{fmtDate(v.date)}</td>
                      <td className="primary">{v.staff_name}</td>
                      <td style={{ fontSize: 13, color: 'var(--danger)' }}>{v.description}</td>
                      <td>
                        {v.acknowledged ? (
                          <span style={{ fontSize: 12, color: 'var(--success)' }}>Bestätigt</span>
                        ) : v.dbId ? (
                          <button
                            className="admin-btn admin-btn-secondary admin-btn-sm"
                            disabled={acknowledging === v.dbId}
                            onClick={() => acknowledgeViolation(v.dbId!)}
                          >
                            {acknowledging === v.dbId ? '…' : 'Bestätigen'}
                          </button>
                        ) : (
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Offen</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ─── Timesheet Tab ─── */}
      {tab === 'timesheet' && loading && <div className="admin-loading"><div className="admin-spinner" /> Zeiterfassungsdaten werden geladen…</div>}

      {tab === 'timesheet' && data && !loading && (
        <>
          {staffGroups.size === 0 ? (
            <div className="admin-table-wrap">
              <div className="admin-table-empty" style={{ padding: 48 }}>Keine Daten für diesen Zeitraum gefunden.</div>
            </div>
          ) : (
            Array.from(staffGroups.entries()).map(([staffName, sessions]) => {
              const totalMin = staffTotalHours(sessions)
              const isExpanded = expandedStaff === staffName
              const overtime = data.overtime_by_staff?.[staffName]

              return (
                <div key={staffName} className="admin-table-wrap" style={{ marginBottom: 14 }}>
                  {/* Staff-Header */}
                  <div
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '14px 16px', cursor: 'pointer', userSelect: 'none',
                    }}
                    onClick={() => setExpandedStaff(isExpanded ? null : staffName)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div className="admin-avatar" style={{ width: 34, height: 34 }}>
                        {staffName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{staffName}</div>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{sessions.length} Sessions</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                      {overtime && (
                        <div style={{ textAlign: 'right' }}>
                          <div style={{
                            fontWeight: 700, fontSize: 14,
                            color: overtime.saldo >= 0 ? '#22c55e' : '#ef4444',
                          }}>
                            {fmtDecimal(overtime.saldo)}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                            Saldo (Soll: {overtime.soll_hours.toFixed(1)}h)
                          </div>
                        </div>
                      )}
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 700, fontSize: 16 }}>{fmtHours(totalMin)}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>Total Netto</div>
                      </div>
                      <span style={{ color: 'var(--muted)', fontSize: 18 }}>{isExpanded ? '▲' : '▼'}</span>
                    </div>
                  </div>

                  {isExpanded && (
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Datum</th>
                          <th>Einstempeln</th>
                          <th>Ausstempeln</th>
                          <th>Pause</th>
                          <th>Netto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sessions.sort((a, b) => a.date.localeCompare(b.date)).map(s => (
                          <tr key={s.id}>
                            <td className="secondary">{fmtDate(s.date)}</td>
                            <td>{fmtTime(s.clock_in)}</td>
                            <td style={!s.clock_out ? { color: 'var(--danger)', fontWeight: 600 } : undefined}>
                              {fmtTime(s.clock_out)}
                            </td>
                            <td className="secondary">
                              {s.break_minutes > 0 ? `${s.break_minutes} min` : '—'}
                            </td>
                            <td className="primary">{fmtHours(s.total_minutes)}</td>
                          </tr>
                        ))}
                        <tr style={{ background: 'var(--surface-2)' }}>
                          <td colSpan={4} style={{ fontWeight: 700 }}>Total</td>
                          <td style={{ fontWeight: 700, color: 'var(--primary)' }}>{fmtHours(totalMin)}</td>
                        </tr>
                      </tbody>
                    </table>
                  )}
                </div>
              )
            })
          )}
        </>
      )}

      {tab === 'weekly-plan' && (
        <WeeklyPlanTab onToast={(msg, type) => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }} />
      )}

      {tab === 'year-end' && (
        <YearEndTab onToast={(msg, type) => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }} />
      )}

      {toast && (
        <div className="admin-toast-container">
          <div className={`admin-toast ${toast.type}`}>{toast.msg}</div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Wochenplan-Tab: Soll-Stunden pro KW
// ─────────────────────────────────────────────────────────────

interface WeeklyPlanEntry {
  week_number: number
  target_hours: number
  note: string
}

function isoWeeksInYear(year: number): number {
  // ISO 8601: year has 53 weeks iff Jan 1 or Dec 31 is a Thursday
  const jan1 = new Date(year, 0, 1).getDay()
  const dec31 = new Date(year, 11, 31).getDay()
  return (jan1 === 4 || dec31 === 4) ? 53 : 52
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

// ─────────────────────────────────────────────────────────────
// Jahresabschluss-Tab: Überstunden-Reset-Policy
// ─────────────────────────────────────────────────────────────

interface OvertimeSettings {
  overtime_reset_month: number
  overtime_reset_day: number
  overtime_reset_policy: 'full_reset' | 'carry_all' | 'carry_max_hours'
  overtime_carry_max_hours: number
  soll_stunden_woche: number
}

const MONTHS_DE = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
]

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
