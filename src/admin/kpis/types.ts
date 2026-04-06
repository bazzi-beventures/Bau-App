/* ── TypeScript-Interfaces für Supabase KPI-Views ─────────── */

export interface KpiDashboardRow {
  tenant_id: string
  mitarbeiter_aktiv: number
  abwesende_heute: number
  projekte_aktiv: number
  projekte_abgeschlossen: number
  stunden_aktueller_monat: number
  stunden_vormonat: number
  stunden_veraenderung_pct: number
  lohnkosten_aktueller_monat: number
  materialkosten_aktueller_monat: number
  kosten_aktueller_monat: number
  umsatz_aktueller_monat: number
  offene_rechnungen_anzahl: number
  offene_rechnungen_betrag: number
  offene_offerten_anzahl: number
  lager_kritisch_anzahl: number
  ueberstunden_gesamt_stunden: number
}

export interface KpiProjektRow {
  tenant_id: string
  projekt_id: string
  projekt_nummer: string | null
  projekt_name: string
  kunde_name: string | null
  distanz_km: number | null
  ist_abgeschlossen: boolean
  anzahl_rapporte: number
  erster_rapport: string | null
  letzter_rapport: string | null
  total_arbeitsstunden: number
  total_lohnkosten: number
  anzahl_mitarbeiter: number
  mitarbeiter_liste: string | null
  total_materialkosten: number
  anzahl_artikel: number
  total_kosten: number
  offerte_nummer: string | null
  offerte_betrag: number
  offerte_status: string | null
  differenz_offerte_ist: number | null
  rechnung_id: number | null
  rechnung_nummer: string | null
  rechnung_betrag: number
  rechnung_status: string | null
  rechnung_bezahlt_am: string | null
  erster_einsatz: string | null
  letzter_einsatz: string | null
  projektdauer_tage: number
}

export interface KpiFinanzenMonatRow {
  tenant_id: string
  jahr: number
  monat: number
  jahr_monat: string
  monat_name: string
  anzahl_rapporte: number
  arbeitsstunden: number
  lohnkosten: number
  mitarbeiter_aktiv: number
  projekte_aktiv: number
  materialkosten: number
  total_kosten: number
  rechnungen_erstellt: number
  rechnungen_betrag: number
  rechnungen_bezahlt_anzahl: number
  rechnungen_bezahlt_betrag: number
  debitorenlaufzeit_tage: number
  offerten_erstellt: number
  offerten_betrag: number
  offerten_akzeptiert: number
  offerten_abgelehnt: number
}

export interface KpiMitarbeiterRow {
  tenant_id: string
  staff_id: string
  mitarbeiter_name: string
  kuerzel: string
  funktion: string | null
  stundensatz: number | null
  total_rapportstunden: number
  anzahl_projekte: number
  total_stempelstunden: number
  total_pausenstunden: number
  anzahl_arbeitstage: number
  differenz_stempel_rapport: number
  durchschnitt_stunden_pro_tag: number
  ueberstunden_saldo_minuten: number
  ueberstunden_saldo_stunden: number
  ferientage_verbraucht: number
  krankheitstage: number
  erster_einsatz: string | null
  letzter_arbeitstag: string | null
  letzter_rapport: string | null
}

export interface KpiMaterialRow {
  tenant_id: string
  material_id: string
  art_nr: string
  artikelname: string
  kategorie: string | null
  einheit: string | null
  einzelpreis: number
  einkaufspreis: number | null
  ist_aktiv: boolean
  lagerbestand: number
  mindestbestand: number
  lager_kritisch: boolean
  lagerwert: number
  total_verbrauch: number
  total_verbrauchskosten: number
  anzahl_projekte: number
  verbrauch_30_tage: number
  verbrauch_90_tage: number
  reichweite_tage: number | null
  erster_verbrauch: string | null
  letzter_verbrauch: string | null
}

export interface CategoryPricingRow {
  id: string
  tenant_id: string
  category: string
  margin_factor: number
  base_installation_fee: number | null
  notes: string | null
}

export interface SupplierPricingRow {
  id: string
  tenant_id: string
  supplier_id: string
  category: string | null
  markup_pct: number
}

/* ── Generische Hilfstypen ───────────────────────────── */

export interface ColumnDef<T> {
  key: keyof T & string
  label: string
  align?: 'left' | 'right'
  format?: (value: unknown, row: T) => string
}

export interface SortState {
  key: string
  dir: 'asc' | 'desc'
}

export interface FilterGroup {
  key: string
  label: string
  options: { value: string; count: number }[]
}
