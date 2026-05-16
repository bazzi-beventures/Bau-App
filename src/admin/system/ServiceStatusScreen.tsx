import { useEffect, useState } from 'react'
import {
  getHealthStatus, getHealthHistory,
  HealthStatusResponse, HealthHistoryResponse, HistoryDay, DayUptime,
  ServiceHealth, ServiceName, ServiceStatus,
} from '../../api/serviceHealth'

const SERVICE_LABELS: Record<ServiceName, string> = {
  railway: 'Railway (Backend)',
  supabase: 'Supabase (Datenbank)',
  mistral: 'Mistral (KI)',
}

const SERVICE_DESCRIPTIONS: Record<ServiceName, string> = {
  railway: 'Hostet die FastAPI-Anwendung — Probe alle 5 Min',
  supabase: 'Hostet die PostgreSQL-DB — Probe alle 5 Min',
  mistral: 'KI-API für Chat/KPI/Material — Probe alle 15 Min',
}

const HISTORY_RANGES = [30, 90, 180, 365] as const
type HistoryRange = typeof HISTORY_RANGES[number]

function dotColor(status: ServiceStatus | undefined, uptimePct: number): string {
  if (status === 'down') return '#ef4444'
  if (status === 'slow' || uptimePct < 99) return '#f59e0b'
  if (uptimePct < 95) return '#ef4444'
  return '#10b981'
}

function statusBadge(status: ServiceStatus | undefined): { text: string; bg: string; fg: string } {
  if (status === 'ok') return { text: 'ONLINE', bg: '#dcfce7', fg: '#166534' }
  if (status === 'slow') return { text: 'LANGSAM', bg: '#fef3c7', fg: '#92400e' }
  if (status === 'down') return { text: 'OFFLINE', bg: '#fee2e2', fg: '#991b1b' }
  return { text: 'KEIN CHECK', bg: '#e5e7eb', fg: '#374151' }
}

function timeAgo(iso: string | undefined | null): string {
  if (!iso) return '—'
  const then = new Date(iso).getTime()
  const diff = Date.now() - then
  if (isNaN(diff)) return '—'
  const s = Math.floor(diff / 1000)
  if (s < 60) return `vor ${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `vor ${m} Min`
  const h = Math.floor(m / 60)
  if (h < 24) return `vor ${h}h`
  const d = Math.floor(h / 24)
  return `vor ${d}d`
}

function uptimeCellColor(pct: number | null): string {
  if (pct == null) return 'var(--surface)'
  if (pct >= 99.5) return '#dcfce7'
  if (pct >= 95) return '#fef3c7'
  return '#fee2e2'
}

function uptimeCellFg(pct: number | null): string {
  if (pct == null) return 'var(--text-muted)'
  if (pct >= 99.5) return '#166534'
  if (pct >= 95) return '#92400e'
  return '#991b1b'
}

function formatDay(day: string): string {
  // YYYY-MM-DD → DD.MM.
  const [, m, d] = day.split('-')
  return `${d}.${m}.`
}

function StatusCard({ name, data }: { name: ServiceName; data: ServiceHealth }) {
  const status = data.latest?.status
  const badge = statusBadge(status)
  const dot = dotColor(status, data.uptime_24h.uptime_pct)

  return (
    <div className="kpi-admin-card" style={{ minHeight: 180 }}>
      <div className="kpi-admin-card-dot" style={{ background: dot }} />
      <div className="kpi-admin-card-label">{SERVICE_LABELS[name]}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4, marginBottom: 12 }}>
        <span
          style={{
            display: 'inline-block',
            padding: '3px 8px',
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.04em',
            background: badge.bg,
            color: badge.fg,
          }}
        >
          {badge.text}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {timeAgo(data.latest?.checked_at)}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13 }}>
        <div>
          <div style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Uptime 24h
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 600 }}>
            {data.uptime_24h.checks > 0 ? `${data.uptime_24h.uptime_pct.toFixed(2)}%` : '—'}
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>
            {data.uptime_24h.ok}/{data.uptime_24h.checks} Checks
          </div>
        </div>
        <div>
          <div style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Uptime 7d
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 600 }}>
            {data.uptime_7d.checks > 0 ? `${data.uptime_7d.uptime_pct.toFixed(2)}%` : '—'}
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>
            {data.uptime_7d.ok}/{data.uptime_7d.checks} Checks
          </div>
        </div>
      </div>

      <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--text-muted)' }}>
        <div>{SERVICE_DESCRIPTIONS[name]}</div>
        {data.latest?.response_ms != null && (
          <div style={{ marginTop: 4 }}>
            Letzte Antwortzeit: <span style={{ fontFamily: 'var(--mono)' }}>{data.latest.response_ms} ms</span>
            {' · '}Ø 24h: <span style={{ fontFamily: 'var(--mono)' }}>{data.uptime_24h.avg_ms ?? '—'} ms</span>
          </div>
        )}
        {data.latest?.error && (
          <div style={{ marginTop: 4, color: '#991b1b' }}>
            Fehler: {data.latest.error}
          </div>
        )}
      </div>
    </div>
  )
}

function UptimeCell({ uptime }: { uptime: DayUptime | null }) {
  const pct = uptime ? uptime.uptime_pct : null
  return (
    <td
      title={uptime ? `${uptime.checks} Checks · Ø ${uptime.avg_ms ?? '—'} ms` : 'Keine Daten'}
      style={{
        padding: '6px 10px',
        textAlign: 'right',
        fontFamily: 'var(--mono)',
        fontSize: 13,
        background: uptimeCellColor(pct),
        color: uptimeCellFg(pct),
        borderRadius: 4,
      }}
    >
      {pct != null ? `${pct.toFixed(2)}%` : '—'}
    </td>
  )
}

function HistoryTable({ days }: { days: HistoryDay[] }) {
  if (days.length === 0) {
    return (
      <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>
        Noch keine Historie verfügbar — Daten sammeln sich an, sobald die Workflows laufen.
      </div>
    )
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '4px 2px', fontSize: 13 }}>
        <thead>
          <tr style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <th style={{ padding: '6px 10px', textAlign: 'left' }}>Tag</th>
            <th style={{ padding: '6px 10px', textAlign: 'right' }}>Railway</th>
            <th style={{ padding: '6px 10px', textAlign: 'right' }}>Supabase</th>
            <th style={{ padding: '6px 10px', textAlign: 'right' }}>Mistral</th>
          </tr>
        </thead>
        <tbody>
          {days.map(d => (
            <tr key={d.day}>
              <td style={{ padding: '6px 10px', fontFamily: 'var(--mono)', color: 'var(--text)' }}>
                {formatDay(d.day)}
              </td>
              <UptimeCell uptime={d.railway} />
              <UptimeCell uptime={d.supabase} />
              <UptimeCell uptime={d.mistral} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function ServiceStatusScreen() {
  const [data, setData] = useState<HealthStatusResponse | null>(null)
  const [history, setHistory] = useState<HealthHistoryResponse | null>(null)
  const [historyRange, setHistoryRange] = useState<HistoryRange>(30)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  async function load(range: HistoryRange = historyRange) {
    try {
      const [status, hist] = await Promise.all([getHealthStatus(), getHealthHistory(range)])
      setData(status)
      setHistory(hist)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler beim Laden')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const id = setInterval(() => load(), 60_000)
    return () => clearInterval(id)
  }, [])

  function changeRange(r: HistoryRange) {
    setHistoryRange(r)
    setLoading(true)
    load(r)
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Service-Status</div>
          <div className="admin-page-subtitle">
            Externes Monitoring via GitHub Actions — wird automatisch alle 60 Sek aktualisiert
          </div>
        </div>
        <button className="admin-btn-secondary" onClick={() => load()} disabled={loading}>
          {loading ? 'Lädt…' : 'Aktualisieren'}
        </button>
      </div>

      {error && (
        <div style={{ padding: 16, background: '#fee2e2', color: '#991b1b', borderRadius: 8, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {data && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 16,
        }}>
          <StatusCard name="railway" data={data.services.railway} />
          <StatusCard name="supabase" data={data.services.supabase} />
          <StatusCard name="mistral" data={data.services.mistral} />
        </div>
      )}

      {!data && !error && (
        <div className="admin-loading">Lädt…</div>
      )}

      {history && (
        <div style={{ marginTop: 32 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Tages-Historie</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Uptime pro Tag. Tage älter als 30 Tage werden automatisch aggregiert, Rohdaten gelöscht.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {HISTORY_RANGES.map(r => (
                <button
                  key={r}
                  onClick={() => changeRange(r)}
                  className={historyRange === r ? 'admin-btn' : 'admin-btn-secondary'}
                  style={{ padding: '4px 10px', fontSize: 12 }}
                >
                  {r}d
                </button>
              ))}
            </div>
          </div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
            <HistoryTable days={history.days} />
          </div>
        </div>
      )}

      <div style={{ marginTop: 24, padding: 14, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--text-muted)' }}>
        <strong style={{ color: 'var(--text)' }}>Wie das funktioniert:</strong> Drei GitHub-Actions-Workflows pingen
        Railway, Supabase und Mistral und schreiben jedes Resultat in eine Tabelle.
        Die Karten oben zeigen den aktuellen Status + Uptime 24h/7d aus den Rohdaten.
        Die Tages-Historie kombiniert frische Rohdaten (letzte 30 Tage) mit dem verdichteten Tages-Aggregat (älter).
        GitHub-Cron läuft im Best-Effort-Modus — geringe Verzögerungen sind normal.
      </div>
    </div>
  )
}
