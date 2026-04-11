import { useState, useMemo } from 'react'
import { useKpiData } from '../useKpiData'
import type { KpiProjektRow, ColumnDef, FilterGroup } from '../types'
import KpiCards from '../components/KpiCards'
import DataTable from '../components/DataTable'
import BiBarChart from '../components/BiBarChart'
import FilterPanel from '../components/FilterPanel'

const chf = (v: unknown) => typeof v === 'number' ? `CHF ${v.toLocaleString('de-CH', { minimumFractionDigits: 0 })}` : '—'
const num = (v: unknown) => typeof v === 'number' ? v.toLocaleString('de-CH', { maximumFractionDigits: 1 }) : '—'

const COLUMNS: ColumnDef<KpiProjektRow>[] = [
  { key: 'projekt_name', label: 'Projekt' },
  { key: 'anzahl_rapporte', label: 'Rapporte', align: 'right' },
  { key: 'total_arbeitsstunden', label: 'Stunden', align: 'right', format: num },
  { key: 'total_lohnkosten', label: 'Lohnkosten', align: 'right', format: chf },
  { key: 'total_materialkosten', label: 'Materialkosten', align: 'right', format: chf },
  { key: 'total_kosten', label: 'Total Kosten', align: 'right', format: chf },
]

export default function ProjekteTab() {
  const { data, loading, error } = useKpiData<KpiProjektRow>('vw_kpi_projekt')
  const [selected, setSelected] = useState<Record<string, Set<string>>>({})

  const filterGroups = useMemo<FilterGroup[]>(() => {
    if (!data) return []
    const counts = { offen: 0, abgeschlossen: 0 }
    data.forEach((r) => r.ist_abgeschlossen ? counts.abgeschlossen++ : counts.offen++)

    const mitarbeiterCounts = new Map<string, number>()
    data.forEach((r) => {
      if (r.mitarbeiter_liste) {
        r.mitarbeiter_liste.split(',').forEach((m) => {
          const name = m.trim()
          if (name) mitarbeiterCounts.set(name, (mitarbeiterCounts.get(name) ?? 0) + 1)
        })
      }
    })
    const mitarbeiterOptions = Array.from(mitarbeiterCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({ value, count }))

    return [
      {
        key: 'status',
        label: 'Status',
        options: [
          { value: 'offen', count: counts.offen },
          { value: 'abgeschlossen', count: counts.abgeschlossen },
        ],
      },
      ...(mitarbeiterOptions.length > 0 ? [{
        key: 'mitarbeiter',
        label: 'Mitarbeiter',
        options: mitarbeiterOptions,
      }] : []),
    ]
  }, [data])

  // Init filters: all selected
  const sel = useMemo(() => {
    if (Object.keys(selected).length > 0) return selected
    const init: Record<string, Set<string>> = {}
    filterGroups.forEach((g) => { init[g.key] = new Set(g.options.map((o) => o.value)) })
    return init
  }, [filterGroups, selected])

  const filtered = useMemo(() => {
    if (!data) return []
    const statusSel = sel['status']
    const mitarbeiterSel = sel['mitarbeiter']
    return data.filter((r) => {
      if (statusSel && statusSel.size > 0) {
        const v = r.ist_abgeschlossen ? 'abgeschlossen' : 'offen'
        if (!statusSel.has(v)) return false
      }
      if (mitarbeiterSel && mitarbeiterSel.size > 0) {
        const names = r.mitarbeiter_liste ? r.mitarbeiter_liste.split(',').map((m) => m.trim()) : []
        if (!names.some((n) => mitarbeiterSel.has(n))) return false
      }
      return true
    })
  }, [data, sel])

  const chartData = useMemo(
    () => filtered
      .filter((r) => r.total_kosten > 0)
      .sort((a, b) => b.total_kosten - a.total_kosten)
      .slice(0, 12)
      .map((r) => ({ name: r.projekt_name.slice(0, 18), Lohnkosten: r.total_lohnkosten, Materialkosten: r.total_materialkosten })),
    [filtered],
  )

  const cards = useMemo(() => {
    if (!filtered.length) return []
    const aktiv = filtered.filter((r) => !r.ist_abgeschlossen).length
    const stunden = filtered.reduce((s, r) => s + r.total_arbeitsstunden, 0)
    const kosten = filtered.reduce((s, r) => s + r.total_kosten, 0)
    const diffs = filtered.filter((r) => r.differenz_offerte_ist != null)
    const avgDiff = diffs.length ? diffs.reduce((s, r) => s + (r.differenz_offerte_ist ?? 0), 0) / diffs.length : 0
    return [
      { label: 'Projekte aktiv', value: String(aktiv) },
      { label: 'Total Stunden', value: num(stunden) as string },
      { label: 'Total Kosten', value: chf(kosten) },
      { label: 'Ø Diff Offerte/Ist', value: chf(avgDiff), color: avgDiff >= 0 ? '#22c55e' : '#f87171' },
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
      <KpiCards cards={cards} columns={2} />
      <div className="kpi-bi-content">
        <div className="kpi-bi-main">
          <DataTable data={filtered} columns={COLUMNS} defaultSort={{ key: 'total_kosten', dir: 'desc' }} />
        </div>
        <div className="kpi-bi-side">
          <FilterPanel groups={filterGroups} selected={sel} onToggle={onToggle} onToggleAll={onToggleAll} />
          <BiBarChart
            data={chartData}
            xKey="name"
            bars={[
              { dataKey: 'Lohnkosten', color: '#f59e0b', label: 'Lohnkosten' },
              { dataKey: 'Materialkosten', color: '#3b82f6', label: 'Materialkosten' },
            ]}
          />
        </div>
      </div>
    </div>
  )
}
