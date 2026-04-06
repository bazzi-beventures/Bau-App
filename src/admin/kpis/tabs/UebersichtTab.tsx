import { useMemo } from 'react'
import { useKpiData } from '../useKpiData'
import type { KpiDashboardRow } from '../types'

const chf = (v: number) => `CHF ${v.toLocaleString('de-CH', { minimumFractionDigits: 0 })}`

export default function UebersichtTab() {
  const { data, loading, error } = useKpiData<KpiDashboardRow>('vw_kpi_dashboard')

  const row = useMemo(() => data?.[0] ?? null, [data])

  if (loading) return <div className="admin-loading"><div className="kpi-admin-spinner" />Laden…</div>
  if (error) return <div className="admin-error">{error}</div>
  if (!row) return <div className="admin-loading" style={{ color: '#6b7280' }}>Keine Daten verfügbar</div>

  const pct = row.stunden_veraenderung_pct
  const pctColor = pct > 0 ? '#22c55e' : pct < 0 ? '#f87171' : '#6b7280'
  const pctSign = pct > 0 ? '+' : ''

  const tiles = [
    { label: 'Mitarbeiter aktiv', value: String(row.mitarbeiter_aktiv), sub: `${row.abwesende_heute} abwesend heute` },
    { label: 'Projekte aktiv', value: String(row.projekte_aktiv), sub: `${row.projekte_abgeschlossen} abgeschlossen` },
    { label: 'Stunden (Monat)', value: row.stunden_aktueller_monat.toLocaleString('de-CH', { maximumFractionDigits: 0 }), sub: `${pctSign}${pct}% vs. Vormonat`, subColor: pctColor },
    { label: 'Kosten (Monat)', value: chf(row.kosten_aktueller_monat), sub: `Lohn: ${chf(row.lohnkosten_aktueller_monat)}` },
    { label: 'Umsatz (Monat)', value: chf(row.umsatz_aktueller_monat), color: '#22c55e' },
    { label: 'Offene Rechnungen', value: `${row.offene_rechnungen_anzahl}`, sub: chf(row.offene_rechnungen_betrag), color: row.offene_rechnungen_anzahl > 5 ? '#f59e0b' : undefined },
    { label: 'Lager kritisch', value: String(row.lager_kritisch_anzahl), color: row.lager_kritisch_anzahl > 0 ? '#f87171' : '#22c55e' },
    { label: 'Überstunden (gesamt)', value: `${row.ueberstunden_gesamt_stunden.toLocaleString('de-CH')} h`, color: row.ueberstunden_gesamt_stunden > 40 ? '#f59e0b' : undefined },
  ]

  return (
    <div className="kpi-bi-layout">
      <div className="kpi-bi-exec-grid">
        {tiles.map((t, i) => (
          <div key={i} className="kpi-bi-exec-card">
            <div className="kpi-bi-exec-label">{t.label}</div>
            <div className="kpi-bi-exec-value" style={t.color ? { color: t.color } : undefined}>{t.value}</div>
            {t.sub && <div className="kpi-bi-exec-sub" style={t.subColor ? { color: t.subColor } : undefined}>{t.sub}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}
