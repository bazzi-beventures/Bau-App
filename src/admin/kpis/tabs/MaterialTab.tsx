import { useState, useMemo } from 'react'
import { useKpiData } from '../useKpiData'
import type { KpiMaterialRow, ColumnDef, FilterGroup } from '../types'
import KpiCards from '../components/KpiCards'
import DataTable from '../components/DataTable'
import BiBarChart from '../components/BiBarChart'
import FilterPanel from '../components/FilterPanel'

const chf = (v: unknown) => typeof v === 'number' ? `CHF ${v.toLocaleString('de-CH', { minimumFractionDigits: 0 })}` : '—'
const num = (v: unknown) => typeof v === 'number' ? v.toLocaleString('de-CH', { maximumFractionDigits: 1 }) : '—'

const COLUMNS: ColumnDef<KpiMaterialRow>[] = [
  { key: 'art_nr', label: 'Art.-Nr.' },
  { key: 'artikelname', label: 'Artikel' },
  { key: 'kategorie', label: 'Kategorie' },
  { key: 'lagerbestand', label: 'Bestand', align: 'right', format: num },
  { key: 'lagerwert', label: 'Lagerwert', align: 'right', format: chf },
  { key: 'total_verbrauch', label: 'Verbrauch', align: 'right', format: num },
  { key: 'reichweite_tage', label: 'Reichweite', align: 'right', format: (v) => v != null ? `${v} Tage` : '—' },
]

export default function MaterialTab() {
  const { data, loading, error } = useKpiData<KpiMaterialRow>('vw_kpi_material')
  const [selected, setSelected] = useState<Record<string, Set<string>>>({})

  const filterGroups = useMemo<FilterGroup[]>(() => {
    if (!data) return []
    const cats: Record<string, number> = {}
    data.forEach((r) => { const c = r.kategorie ?? '(leer)'; cats[c] = (cats[c] || 0) + 1 })
    const kritisch = data.filter((r) => r.lager_kritisch).length
    const ok = data.length - kritisch
    return [
      {
        key: 'kategorie',
        label: 'Kategorie',
        options: Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([v, c]) => ({ value: v, count: c })),
      },
      {
        key: 'lager_kritisch',
        label: 'Lagerstatus',
        options: [
          { value: 'OK', count: ok },
          { value: 'Kritisch', count: kritisch },
        ],
      },
    ]
  }, [data])

  const sel = useMemo(() => {
    if (Object.keys(selected).length > 0) return selected
    const init: Record<string, Set<string>> = {}
    filterGroups.forEach((g) => { init[g.key] = new Set(g.options.map((o) => o.value)) })
    return init
  }, [filterGroups, selected])

  const filtered = useMemo(() => {
    if (!data) return []
    return data.filter((r) => {
      const catSel = sel['kategorie']
      if (catSel && catSel.size > 0 && !catSel.has(r.kategorie ?? '(leer)')) return false
      const lagSel = sel['lager_kritisch']
      if (lagSel && lagSel.size > 0) {
        const v = r.lager_kritisch ? 'Kritisch' : 'OK'
        if (!lagSel.has(v)) return false
      }
      return true
    })
  }, [data, sel])

  const chartData = useMemo(
    () => filtered
      .filter((r) => r.total_verbrauch > 0)
      .sort((a, b) => b.total_verbrauch - a.total_verbrauch)
      .slice(0, 15)
      .map((r) => ({ name: r.artikelname.slice(0, 16), Verbrauch: r.total_verbrauch, Reichweite: r.reichweite_tage ?? 0 })),
    [filtered],
  )

  const cards = useMemo(() => {
    if (!filtered.length) return []
    const aktiv = filtered.filter((r) => r.ist_aktiv).length
    const kritisch = filtered.filter((r) => r.lager_kritisch).length
    const lagerwert = filtered.reduce((s, r) => s + r.lagerwert, 0)
    const v30 = filtered.reduce((s, r) => s + r.verbrauch_30_tage, 0)
    return [
      { label: 'Aktive Artikel', value: String(aktiv) },
      { label: 'Lager kritisch', value: String(kritisch), color: kritisch > 0 ? '#f87171' : '#22c55e' },
      { label: 'Lagerwert', value: chf(lagerwert) },
      { label: 'Verbrauch 30d', value: num(v30) as string },
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
          <DataTable data={filtered} columns={COLUMNS} defaultSort={{ key: 'total_verbrauch', dir: 'desc' }} />
        </div>
        <div className="kpi-bi-side">
          <FilterPanel groups={filterGroups} selected={sel} onToggle={onToggle} onToggleAll={onToggleAll} />
          <BiBarChart
            data={chartData}
            xKey="name"
            bars={[
              { dataKey: 'Verbrauch', color: '#3b82f6', label: 'Verbrauch (Stk)' },
              { dataKey: 'Reichweite', color: '#22c55e', label: 'Reichweite (Tage)' },
            ]}
          />
        </div>
      </div>
    </div>
  )
}
