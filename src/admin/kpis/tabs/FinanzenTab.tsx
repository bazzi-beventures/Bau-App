import { useMemo } from 'react'
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

  const chartData = useMemo(
    () => (data ?? [])
      .slice()
      .sort((a, b) => a.jahr_monat.localeCompare(b.jahr_monat))
      .slice(-12)
      .map((r) => ({ name: r.jahr_monat, Kosten: r.total_kosten, Rechnungen: r.rechnungen_betrag })),
    [data],
  )

  const cards = useMemo(() => {
    if (!data?.length) return []
    const currentYear = new Date().getFullYear()
    const ytd = data.filter((r) => r.jahr === currentYear)
    const kostenYtd = ytd.reduce((s, r) => s + r.total_kosten, 0)
    const umsatzYtd = ytd.reduce((s, r) => s + r.rechnungen_bezahlt_betrag, 0)
    const debiTage = ytd.filter((r) => r.debitorenlaufzeit_tage > 0)
    const avgDebi = debiTage.length ? debiTage.reduce((s, r) => s + r.debitorenlaufzeit_tage, 0) / debiTage.length : 0
    const offAkz = ytd.reduce((s, r) => s + r.offerten_akzeptiert, 0)
    return [
      { label: `Kosten ${currentYear}`, value: chf(kostenYtd) },
      { label: `Umsatz ${currentYear}`, value: chf(umsatzYtd), color: '#22c55e' },
      { label: 'Ø Debitorenlaufzeit', value: `${avgDebi.toFixed(0)} Tage` },
      { label: `Offerten akzeptiert`, value: String(offAkz) },
    ]
  }, [data])

  if (loading) return <div className="admin-loading"><div className="kpi-admin-spinner" />Laden…</div>
  if (error) return <div className="admin-error">{error}</div>

  return (
    <div className="kpi-bi-layout">
      <KpiCards cards={cards} />
      <div className="kpi-bi-content">
        <div className="kpi-bi-main">
          <DataTable data={data ?? []} columns={COLUMNS} defaultSort={{ key: 'jahr_monat', dir: 'desc' }} />
        </div>
        <div className="kpi-bi-side">
          <BiBarChart
            data={chartData}
            xKey="name"
            bars={[
              { dataKey: 'Kosten', color: '#f87171', label: 'Kosten' },
              { dataKey: 'Rechnungen', color: '#22c55e', label: 'Rechnungen' },
            ]}
          />
        </div>
      </div>
    </div>
  )
}
