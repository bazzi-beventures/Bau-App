import { useState, useMemo } from 'react'
import { useKpiData } from '../useKpiData'
import type { KpiMitarbeiterRow, ColumnDef, FilterGroup } from '../types'
import KpiCards from '../components/KpiCards'
import DataTable from '../components/DataTable'
import BiBarChart from '../components/BiBarChart'
import FilterPanel from '../components/FilterPanel'

const num = (v: unknown) => typeof v === 'number' ? v.toLocaleString('de-CH', { maximumFractionDigits: 1 }) : '—'

const COLUMNS: ColumnDef<KpiMitarbeiterRow>[] = [
  { key: 'mitarbeiter_name', label: 'Name' },
  { key: 'funktion', label: 'Funktion' },
  { key: 'total_rapportstunden', label: 'Rapportstd.', align: 'right', format: num },
  { key: 'total_stempelstunden', label: 'Stempelstd.', align: 'right', format: num },
  { key: 'ueberstunden_saldo_stunden', label: 'Überstunden', align: 'right', format: num },
  { key: 'ferientage_verbraucht', label: 'Ferien', align: 'right' },
  { key: 'krankheitstage', label: 'Krank', align: 'right' },
]

export default function ArbeitszeitTab() {
  const { data, loading, error } = useKpiData<KpiMitarbeiterRow>('vw_kpi_mitarbeiter')
  const [selected, setSelected] = useState<Record<string, Set<string>>>({})

  const filterGroups = useMemo<FilterGroup[]>(() => {
    if (!data) return []
    const funcs: Record<string, number> = {}
    data.forEach((r) => { const f = r.funktion ?? '(leer)'; funcs[f] = (funcs[f] || 0) + 1 })
    return [{
      key: 'funktion',
      label: 'Funktion',
      options: Object.entries(funcs).sort((a, b) => b[1] - a[1]).map(([v, c]) => ({ value: v, count: c })),
    }]
  }, [data])

  const sel = useMemo(() => {
    if (Object.keys(selected).length > 0) return selected
    const init: Record<string, Set<string>> = {}
    filterGroups.forEach((g) => { init[g.key] = new Set(g.options.map((o) => o.value)) })
    return init
  }, [filterGroups, selected])

  const filtered = useMemo(() => {
    if (!data) return []
    const fSel = sel['funktion']
    if (!fSel || fSel.size === 0) return data
    return data.filter((r) => fSel.has(r.funktion ?? '(leer)'))
  }, [data, sel])

  const chartData = useMemo(
    () => filtered
      .filter((r) => r.total_rapportstunden > 0 || r.total_stempelstunden > 0)
      .sort((a, b) => b.total_rapportstunden - a.total_rapportstunden)
      .slice(0, 15)
      .map((r) => ({ name: r.kuerzel || r.mitarbeiter_name.slice(0, 10), Rapport: r.total_rapportstunden, Stempel: r.total_stempelstunden })),
    [filtered],
  )

  const cards = useMemo(() => {
    if (!filtered.length) return []
    const aktiv = filtered.filter((r) => r.total_rapportstunden > 0).length
    const avgStd = filtered.reduce((s, r) => s + r.durchschnitt_stunden_pro_tag, 0) / filtered.length
    const totalOt = filtered.reduce((s, r) => s + r.ueberstunden_saldo_stunden, 0)
    const totalKrank = filtered.reduce((s, r) => s + r.krankheitstage, 0)
    return [
      { label: 'Mitarbeiter aktiv', value: String(aktiv) },
      { label: 'Ø Stunden/Tag', value: num(avgStd) as string },
      { label: 'Total Überstunden', value: num(totalOt) as string, color: totalOt > 0 ? '#f59e0b' : '#22c55e' },
      { label: 'Krankheitstage', value: String(totalKrank), color: totalKrank > 10 ? '#f87171' : undefined },
    ]
  }, [filtered])

  function onToggle(groupKey: string, value: string) {
    setSelected((prev) => {
      const next = { ...prev }
      const s = new Set(sel[groupKey] ?? [])
      s.has(value) ? s.delete(value) : s.add(value)
      next[groupKey] = s
      return next
    })
  }
  function onToggleAll(groupKey: string, selectAll: boolean) {
    setSelected((prev) => {
      const next = { ...prev }
      const g = filterGroups.find((g) => g.key === groupKey)
      next[groupKey] = selectAll && g ? new Set(g.options.map((o) => o.value)) : new Set()
      return next
    })
  }

  if (loading) return <div className="admin-loading"><div className="kpi-admin-spinner" />Laden…</div>
  if (error) return <div className="admin-error">{error}</div>

  return (
    <div className="kpi-bi-layout">
      <KpiCards cards={cards} />
      <div className="kpi-bi-content">
        <div className="kpi-bi-main">
          <DataTable data={filtered} columns={COLUMNS} defaultSort={{ key: 'total_rapportstunden', dir: 'desc' }} />
        </div>
        <div className="kpi-bi-side">
          <FilterPanel groups={filterGroups} selected={sel} onToggle={onToggle} onToggleAll={onToggleAll} />
          <BiBarChart
            data={chartData}
            xKey="name"
            bars={[
              { dataKey: 'Rapport', color: '#f59e0b', label: 'Rapportstunden' },
              { dataKey: 'Stempel', color: '#3b82f6', label: 'Stempelstunden' },
            ]}
          />
        </div>
      </div>
    </div>
  )
}
