import { useEffect, useState } from 'react'
import { fetchKpis, KpiCategory, KpiItem, KpiStatus } from '../../api/kpis'

const CATEGORIES: { id: KpiCategory; label: string; color: string }[] = [
  { id: 'mandanten',   label: 'Mandant & Nutzer',   color: '#0d9488' },
  { id: 'pricing',     label: 'Pricing & Supplier', color: '#7c3aed' },
  { id: 'projekte',    label: 'Projekte & Reports', color: '#b45309' },
  { id: 'arbeitszeit', label: 'Arbeitszeit & HR',   color: '#15803d' },
  { id: 'finanzen',    label: 'Finanzen',            color: '#be123c' },
  { id: 'material',    label: 'Material & Lager',   color: '#4338ca' },
]

const STATUS_COLOR: Record<KpiStatus, string> = {
  normal:   '#93bcd4',
  good:     '#22c55e',
  warning:  '#f59e0b',
  critical: '#f87171',
}

function KpiCard({ item }: { item: KpiItem }) {
  return (
    <div className="kpi-admin-card">
      <div className="kpi-admin-card-label">{item.label}</div>
      <div className="kpi-admin-card-value">
        {item.value}
        {item.unit && <span className="kpi-admin-card-unit"> {item.unit}</span>}
      </div>
      <div
        className="kpi-admin-card-dot"
        style={{ background: STATUS_COLOR[item.status] }}
        title={item.status}
      />
    </div>
  )
}

export default function KpiScreen() {
  const [activeTab, setActiveTab] = useState<KpiCategory>('projekte')
  const [kpis, setKpis] = useState<KpiItem[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setKpis(null)
    setError(null)
    fetchKpis(activeTab)
      .then((res) => { if (!cancelled) { setKpis(res.kpis); setLoading(false) } })
      .catch(() => { if (!cancelled) { setError('Daten konnten nicht geladen werden.'); setLoading(false) } })
    return () => { cancelled = true }
  }, [activeTab])

  const activeMeta = CATEGORIES.find(c => c.id === activeTab)!

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Kennzahlen</div>
          <div className="admin-page-subtitle">Live-KPIs aus allen Bereichen</div>
        </div>
      </div>

      {/* Category tabs */}
      <div className="kpi-admin-tabs">
        {CATEGORIES.map(cat => (
          <button
            key={cat.id}
            className={`kpi-admin-tab${activeTab === cat.id ? ' active' : ''}`}
            style={activeTab === cat.id ? { borderBottomColor: cat.color, color: cat.color } : {}}
            onClick={() => setActiveTab(cat.id)}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* KPI grid */}
      <div className="kpi-admin-content">
        {loading && (
          <div className="admin-loading">
            <div className="kpi-admin-spinner" style={{ borderTopColor: activeMeta.color }} />
            Laden…
          </div>
        )}

        {error && (
          <div className="admin-error">{error}</div>
        )}

        {kpis && (
          <div className="kpi-admin-grid">
            {kpis.map((item, i) => (
              <KpiCard key={i} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
