import { useEffect, useMemo, useState } from 'react'
import { getErrorLogs, ErrorLogRow, ErrorLogTenant, ErrorLevel } from '../../api/errorLogs'
import type { ColumnDef } from '../kpis/types'
import DataTable from '../kpis/components/DataTable'
import '../kpis/kpi-dashboard.css'

// ── Datums-Helfer (lokale Zeitzone) ──
const isoLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

type PresetId = 'heute' | '7t' | '30t' | 'custom'

function presetRange(id: Exclude<PresetId, 'custom'>): { von: string; bis: string } {
  const today = new Date()
  switch (id) {
    case 'heute': return { von: isoLocal(today), bis: isoLocal(today) }
    case '7t': return { von: isoLocal(addDays(today, -6)), bis: isoLocal(today) }
    case '30t': return { von: isoLocal(addDays(today, -29)), bis: isoLocal(today) }
  }
}

const PRESETS: { id: Exclude<PresetId, 'custom'>; label: string }[] = [
  { id: 'heute', label: 'Heute' },
  { id: '7t', label: '7 Tage' },
  { id: '30t', label: '30 Tage' },
]

const LEVEL_STYLE: Record<ErrorLevel, { bg: string; fg: string; label: string }> = {
  warning: { bg: '#fef3c7', fg: '#92400e', label: 'WARN' },
  error: { bg: '#fee2e2', fg: '#991b1b', label: 'ERROR' },
  critical: { bg: '#4c0519', fg: '#fecdd3', label: 'CRIT' },
}

function LevelBadge({ level }: { level: ErrorLevel }) {
  const s = LEVEL_STYLE[level] ?? LEVEL_STYLE.error
  return (
    <span style={{
      background: s.bg, color: s.fg, borderRadius: 4, padding: '2px 6px',
      fontSize: 11, fontWeight: 700, letterSpacing: 0.3,
    }}>{s.label}</span>
  )
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('de-CH', {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

export default function ErrorLogsScreen() {
  const [preset, setPreset] = useState<PresetId>('7t')
  const [von, setVon] = useState<string>(() => presetRange('7t').von)
  const [bis, setBis] = useState<string>(() => presetRange('7t').bis)
  const [tenantId, setTenantId] = useState<string>('')

  const [rows, setRows] = useState<ErrorLogRow[]>([])
  const [tenants, setTenants] = useState<ErrorLogTenant[]>([])
  const [capped, setCapped] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<ErrorLogRow | null>(null)

  function applyPreset(id: Exclude<PresetId, 'custom'>) {
    const r = presetRange(id)
    setVon(r.von); setBis(r.bis); setPreset(id)
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(null)
    // Ganztägiges Fenster in lokaler Zeit; occurred_at ist UTC — für ein
    // Transparenz-Dashboard ist die Tages-Näherung bewusst gut genug.
    getErrorLogs({ since: `${von}T00:00:00`, until: `${bis}T23:59:59`, tenantId: tenantId || undefined })
      .then((res) => {
        if (cancelled) return
        setRows(res.rows)
        setTenants(res.tenants)
        setCapped(res.capped)
      })
      .catch((e) => { if (!cancelled) setError(e?.message ?? 'Fehler beim Laden') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [von, bis, tenantId])

  const columns = useMemo<ColumnDef<ErrorLogRow>[]>(() => [
    { key: 'occurred_at', label: 'Zeit', format: (v) => fmtTime(String(v)) },
    { key: 'tenant_name', label: 'Mandant', format: (v) => (v ? String(v) : 'Plattform') },
    { key: 'level', label: 'Level', render: (_v, row) => <LevelBadge level={row.level} /> },
    { key: 'source', label: 'Quelle' },
    { key: 'error_type', label: 'Typ', format: (v) => (v ? String(v) : '—') },
    {
      key: 'message', label: 'Meldung',
      render: (_v, row) => (
        <span
          title={row.message}
          onClick={() => setSelected(row)}
          style={{
            cursor: 'pointer', color: '#2563eb', display: 'inline-block',
            maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            verticalAlign: 'bottom',
          }}
        >{row.message}</span>
      ),
    },
  ], [])

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Error-Logs</div>
          <div className="admin-page-subtitle">
            Backend-Fehler aller Mandanten — reine Ansicht, live aus error_log
          </div>
        </div>
      </div>

      {/* Filter: Zeit-Presets + freie von/bis-Auswahl + Mandant */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end', marginBottom: 16 }}>
        <div className="kpi-date-presets">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              className={`kpi-date-btn${preset === p.id ? ' active' : ''}`}
              onClick={() => applyPreset(p.id)}
            >{p.label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', fontSize: 12, gap: 4 }}>
            von
            <input type="date" value={von} max={bis}
              onChange={(e) => { setVon(e.target.value); setPreset('custom') }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', fontSize: 12, gap: 4 }}>
            bis
            <input type="date" value={bis} min={von}
              onChange={(e) => { setBis(e.target.value); setPreset('custom') }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', fontSize: 12, gap: 4 }}>
            Mandant
            <select value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
              <option value="">Alle Mandanten</option>
              {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
        </div>
      </div>

      {loading && <div className="admin-loading"><div className="kpi-admin-spinner" />Laden…</div>}
      {error && !loading && <div className="admin-error">{error}</div>}

      {!loading && !error && (
        <>
          {capped && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
              Nur die neuesten 500 Treffer im Zeitraum werden angezeigt — Fenster ggf. enger wählen.
            </div>
          )}
          <DataTable data={rows} columns={columns} defaultSort={{ key: 'occurred_at', dir: 'desc' }} />
        </>
      )}

      {selected && (
        <div style={{
          marginTop: 16, border: '1px solid var(--border, #e5e7eb)', borderRadius: 8,
          padding: 16, background: 'var(--surface, #fff)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <strong>{selected.error_type ?? 'Fehler'} · {selected.source}</strong>
            <button className="kpi-date-btn" onClick={() => setSelected(null)}>Schliessen</button>
          </div>
          <div style={{ fontSize: 13, marginBottom: 4 }}>
            <b>Zeit:</b> {fmtTime(selected.occurred_at)} · <b>Mandant:</b> {selected.tenant_name ?? 'Plattform'}
            {selected.fingerprint && <> · <b>Signatur:</b> <code>{selected.fingerprint}</code></>}
          </div>
          <div style={{ fontSize: 13, marginBottom: 8 }}><b>Meldung:</b> {selected.message}</div>
          {selected.context && Object.keys(selected.context).length > 0 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Kontext</div>
              <pre style={{
                background: 'var(--code-bg, #f6f8fa)', padding: 10, borderRadius: 6,
                fontSize: 12, overflowX: 'auto', margin: '0 0 8px',
              }}>{JSON.stringify(selected.context, null, 2)}</pre>
            </>
          )}
          {selected.traceback && (
            <>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Traceback</div>
              <pre style={{
                background: 'var(--code-bg, #f6f8fa)', padding: 10, borderRadius: 6,
                fontSize: 12, overflowX: 'auto', margin: 0, maxHeight: 360,
              }}>{selected.traceback}</pre>
            </>
          )}
        </div>
      )}
    </div>
  )
}
