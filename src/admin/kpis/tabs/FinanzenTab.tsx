import { useState, useMemo } from 'react'
import { useKpiData } from '../useKpiData'
import type { KpiFinanzenMonatRow, ColumnDef } from '../types'
import KpiCards from '../components/KpiCards'
import DataTable from '../components/DataTable'
import BiBarChart from '../components/BiBarChart'

const chf = (v: unknown) => typeof v === 'number' ? `CHF ${v.toLocaleString('de-CH', { minimumFractionDigits: 0 })}` : '—'
const num = (v: unknown) => typeof v === 'number' ? v.toLocaleString('de-CH', { maximumFractionDigits: 1 }) : '—'

const COLUMNS: ColumnDef<KpiFinanzenMonatRow>[] = [
  { key: 'jahr_monat', label: 'Monat' },
  { key: 'arbeitsstunden', label: 'Stunden', align: 'right', format: num },
  { key: 'lohnkosten', label: 'Lohnkosten', align: 'right', format: chf },
  { key: 'materialkosten', label: 'Materialkosten', align: 'right', format: chf },
  { key: 'total_kosten', label: 'Total Kosten', align: 'right', format: chf },
  { key: 'rechnungen_betrag', label: 'Rechnungen', align: 'right', format: chf },
  { key: 'offerten_betrag', label: 'Offerten', align: 'right', format: chf },
]

export default function FinanzenTab() {
  const { data, loading, error } = useKpiData<KpiFinanzenMonatRow>('vw_kpi_finanzen_monat')
  const currentYear = new Date().getFullYear()
  const [yearFilter, setYearFilter] = useState<number | null>(null) // null = all

  const availableYears = useMemo(() => {
    const years = Array.from(new Set((data ?? []).map((r) => r.jahr))).sort((a, b) => b - a)
    return years.slice(0, 3)
  }, [data])

  const yearPresets: { key: number | null; label: string }[] = [
    { key: null, label: 'Alles' },
    ...availableYears.map((y) => ({ key: y, label: String(y) })),
  ]

  const filtered = useMemo(
    () => yearFilter == null ? (data ?? []) : (data ?? []).filter((r) => r.jahr === yearFilter),
    [data, yearFilter],
  )

  const chartData = useMemo(
    () =>
      filtered
        .slice()
        .sort((a, b) => a.jahr_monat.localeCompare(b.jahr_monat))
        .map((r) => ({ name: r.jahr_monat, Kosten: r.total_kosten, Rechnungen: r.rechnungen_betrag })),
    [filtered],
  )

  const cards = useMemo(() => {
    if (!filtered.length) return []
    const ytd = yearFilter != null ? filtered : filtered.filter((r) => r.jahr === currentYear)
    const kostenYtd = ytd.reduce((s, r) => s + r.total_kosten, 0)
    const umsatzYtd = ytd.reduce((s, r) => s + r.rechnungen_bezahlt_betrag, 0)
    const debiTage = ytd.filter((r) => r.debitorenlaufzeit_tage > 0)
    const avgDebi = debiTage.length ? debiTage.reduce((s, r) => s + r.debitorenlaufzeit_tage, 0) / debiTage.length : 0
    const offAkz = ytd.reduce((s, r) => s + r.offerten_akzeptiert, 0)
    const yearLabel = yearFilter != null ? String(yearFilter) : String(currentYear)
    return [
      { label: `Kosten ${yearLabel}`, value: chf(kostenYtd) },
      { label: `Umsatz ${yearLabel}`, value: chf(umsatzYtd), color: '#22c55e' },
      { label: 'Ø Debitorenlaufzeit', value: `${avgDebi.toFixed(0)} Tage` },
      { label: 'Offerten akzeptiert', value: String(offAkz) },
    ]
  }, [filtered, yearFilter, currentYear])

  if (loading) return <div className="admin-loading"><div className="kpi-admin-spinner" />Laden…</div>
  if (error) return <div className="admin-error">{error}</div>

  return (
    <div className="kpi-bi-layout">
      {/* Year presets */}
      <div className="kpi-date-presets">
        {yearPresets.map((p) => (
          <button
            key={String(p.key)}
            className={`kpi-date-btn${yearFilter === p.key ? ' active' : ''}`}
            onClick={() => setYearFilter(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* KPI Cards */}
      <KpiCards cards={cards} columns={4} />

      {/* Chart — full width */}
      <BiBarChart
        data={chartData}
        xKey="name"
        bars={[
          { dataKey: 'Kosten', color: '#f87171', label: 'Kosten' },
          { dataKey: 'Rechnungen', color: '#22c55e', label: 'Rechnungen' },
        ]}
        height={300}
      />

      {/* Table — full width */}
      <DataTable data={filtered} columns={COLUMNS} defaultSort={{ key: 'jahr_monat', dir: 'desc' }} />
    </div>
  )
}
