import { useMemo } from 'react'
import { useKpiData } from '../useKpiData'
import type { CategoryPricingRow, SupplierPricingRow, ColumnDef } from '../types'
import KpiCards from '../components/KpiCards'
import DataTable from '../components/DataTable'
import BiBarChart from '../components/BiBarChart'

const num = (v: unknown) => typeof v === 'number' ? v.toLocaleString('de-CH', { maximumFractionDigits: 2 }) : '—'
const chf = (v: unknown) => typeof v === 'number' ? `CHF ${v.toLocaleString('de-CH', { minimumFractionDigits: 0 })}` : '—'

const CAT_COLUMNS: ColumnDef<CategoryPricingRow>[] = [
  { key: 'category', label: 'Kategorie' },
  { key: 'margin_factor', label: 'Margenfaktor', align: 'right', format: num },
  { key: 'base_installation_fee', label: 'Installationsgebühr', align: 'right', format: chf },
  { key: 'notes', label: 'Notizen' },
]

const SUP_COLUMNS: ColumnDef<SupplierPricingRow>[] = [
  { key: 'supplier_id', label: 'Lieferant' },
  { key: 'category', label: 'Kategorie' },
  { key: 'markup_pct', label: 'Aufschlag %', align: 'right', format: (v) => typeof v === 'number' ? `${v}%` : '—' },
]

export default function PricingTab() {
  const { data: catData, loading: catLoad, error: catErr } = useKpiData<CategoryPricingRow>('category_pricing_rules')
  const { data: supData, loading: supLoad, error: supErr } = useKpiData<SupplierPricingRow>('supplier_pricing_rules')

  const loading = catLoad || supLoad
  const error = catErr || supErr

  const cards = useMemo(() => {
    const catRows = catData ?? []
    const supRows = supData ?? []
    const avgMargin = catRows.length ? catRows.reduce((s, r) => s + r.margin_factor, 0) / catRows.length : 0
    const avgMarkup = supRows.length ? supRows.reduce((s, r) => s + r.markup_pct, 0) / supRows.length : 0
    const suppliers = new Set(supRows.map((r) => r.supplier_id)).size
    return [
      { label: 'Kategorie-Regeln', value: String(catRows.length) },
      { label: 'Ø Margenfaktor', value: num(avgMargin) as string },
      { label: 'Lieferanten', value: String(suppliers) },
      { label: 'Ø Aufschlag', value: `${num(avgMarkup)}%` },
    ]
  }, [catData, supData])

  const chartData = useMemo(
    () => (catData ?? []).map((r) => ({ name: r.category.slice(0, 18), Marge: r.margin_factor })),
    [catData],
  )

  if (loading) return <div className="admin-loading"><div className="kpi-admin-spinner" />Laden…</div>
  if (error) return <div className="admin-error">{error}</div>

  return (
    <div className="kpi-bi-layout">
      <KpiCards cards={cards} />
      <div className="kpi-bi-content">
        <div className="kpi-bi-main">
          <h3 className="kpi-bi-section-title">Kategorie-Margen</h3>
          <DataTable data={catData ?? []} columns={CAT_COLUMNS} defaultSort={{ key: 'margin_factor', dir: 'desc' }} />
          <h3 className="kpi-bi-section-title" style={{ marginTop: 24 }}>Lieferanten-Aufschläge</h3>
          <DataTable data={supData ?? []} columns={SUP_COLUMNS} defaultSort={{ key: 'markup_pct', dir: 'desc' }} />
        </div>
        <div className="kpi-bi-side">
          <BiBarChart
            data={chartData}
            xKey="name"
            bars={[
              { dataKey: 'Marge', color: '#7c3aed', label: 'Margenfaktor' },
            ]}
          />
        </div>
      </div>
    </div>
  )
}
