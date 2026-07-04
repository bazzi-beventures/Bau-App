import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  scanMaterialCleanup, bulkSetMaterialStatus,
  MaterialCleanupScan, MaterialCleanupRow, MaterialSzenario,
} from '../../api/admin'
import { apiFetch, isOfflineError } from '../../api/client'
import { ConfirmDialog } from '../components/ConfirmDialog'

// SAP-klassische Status-Benennung — an EINER Stelle, damit der Begriff
// später in einer Zeile austauschbar bleibt (z.B. auf 'Gesperrt').
const STATUS_TERMS = { active: 'Aktiv', inactive: 'Löschvormerkung' }

interface Supplier { id: string; name: string; prefix: string }

// Kandidat-Buckets (Bereinigungs-Vorschläge) zuerst; die geschützten danach.
const SZENARIOS: { code: MaterialSzenario; label: string; candidate: boolean }[] = [
  { code: 'NEVER_USED_OLD',    label: 'Nie verwendet, alt (>1 J.)',            candidate: true  },
  { code: 'QUOTE_ONLY_OLD',    label: 'Nur offeriert, alt – nie verbaut',      candidate: true  },
  { code: 'STALE_USED',        label: 'Verwendet, aber veraltet (>1 J.)',      candidate: true  },
  { code: 'NEVER_USED_NEW',    label: 'Nie verwendet, neu (<1 J.)',            candidate: false },
  { code: 'QUOTE_ONLY_NEW',    label: 'Nur offeriert, neu – Rechnung evtl.',   candidate: false },
  { code: 'USED_PENDING',      label: 'Verwendet, noch nicht verrechnet',      candidate: false },
  { code: 'RAPPORT_MATERIAL',  label: 'Rapport-Material (verrechnet)',         candidate: false },
  { code: 'QUOTED_AND_BILLED', label: 'Offeriert & verrechnet',               candidate: false },
  { code: 'RECENTLY_USED',     label: `${STATUS_TERMS.active} – kürzlich verwendet (≤90 T)`, candidate: false },
]
const SZ_LABEL: Record<string, string> = Object.fromEntries(SZENARIOS.map(s => [s.code, s.label]))

export default function MaterialCleanupScreen() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [category, setCategory] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [status, setStatus] = useState('')            // '' = alle, 'active', 'inactive'
  const [szenario, setSzenario] = useState<MaterialSzenario | ''>('')

  const [scan, setScan] = useState<MaterialCleanupScan | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [confirm, setConfirm] = useState<{ targetActive: boolean } | null>(null)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  // Lieferanten + Kategorien für die Filter-Dropdowns.
  useEffect(() => {
    (async () => {
      try {
        const [sups, meta] = await Promise.all([
          apiFetch('/pwa/admin/suppliers') as Promise<Supplier[]>,
          apiFetch('/pwa/admin/materials/meta') as Promise<{ categories: string[] }>,
        ])
        setSuppliers(sups)
        setCategories(meta.categories ?? [])
      } catch { /* nicht blockierend */ }
    })()
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await scanMaterialCleanup({ category, supplier_id: supplierId, status, szenario })
      setScan(res)
    } catch (e) {
      setToast({ type: 'error', msg: isOfflineError(e) ? 'Keine Verbindung.' : 'Scan fehlgeschlagen.' })
    } finally {
      setLoading(false)
    }
  }, [category, supplierId, status, szenario])

  useEffect(() => { load() }, [load])
  // Filter/Szenario-Wechsel → Auswahl verwerfen.
  useEffect(() => { setSelected(new Set()) }, [category, supplierId, status, szenario])

  const supplierMap = useMemo(
    () => Object.fromEntries(suppliers.map(s => [s.id, s.name])) as Record<string, string>,
    [suppliers],
  )
  const counts = scan?.counts ?? {}
  const blocked = scan?.blocked ?? []
  const rows: MaterialCleanupRow[] = szenario ? (scan?.rows ?? []) : []
  const selectable = useMemo(() => rows.filter(r => !blocked.includes(r.szenario)), [rows, blocked])
  const allSelected = selectable.length > 0 && selectable.every(r => selected.has(r.art_nr))

  function toggle(artNr: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(artNr) ? next.delete(artNr) : next.add(artNr)
      return next
    })
  }
  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(selectable.map(r => r.art_nr)) : new Set())
  }

  async function applyStatus(targetActive: boolean) {
    setSubmitting(true)
    setToast(null)
    try {
      const res = await bulkSetMaterialStatus([...selected], targetActive)
      const parts = [`${res.updated} aktualisiert`]
      if (res.skipped_blocked) parts.push(`${res.skipped_blocked} gesperrt übersprungen`)
      setToast({ type: 'success', msg: parts.join(' · ') })
      setSelected(new Set())
      setConfirm(null)
      await load()
    } catch (e) {
      setToast({ type: 'error', msg: isOfflineError(e) ? 'Keine Verbindung — bitte erneut versuchen.' : 'Aktion fehlgeschlagen.' })
    } finally {
      setSubmitting(false)
    }
  }

  const szenarioBlocked = szenario ? blocked.includes(szenario) : false

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Materialdatenbereinigung</div>
          <div className="admin-page-subtitle">
            {scan ? `${scan.total} Artikel im Filter` : 'Laden…'}
            {' · '}Inaktiv = {STATUS_TERMS.inactive} (nur ausgeblendet, nie gelöscht, reversibel)
          </div>
        </div>
      </div>

      <div className="admin-table-wrap">
        <div className="admin-filter-bar">
          <select className="admin-form-select" style={{ width: 'auto', flexShrink: 0 }} value={category} onChange={e => setCategory(e.target.value)}>
            <option value="">Alle Artikelgruppen</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="admin-form-select" style={{ width: 'auto', flexShrink: 0 }} value={supplierId} onChange={e => setSupplierId(e.target.value)}>
            <option value="">Alle Lieferanten</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select className="admin-form-select" style={{ width: 'auto', flexShrink: 0 }} value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">Alle Status</option>
            <option value="active">{STATUS_TERMS.active}</option>
            <option value="inactive">{STATUS_TERMS.inactive}</option>
          </select>
        </div>

        {/* Szenario-Karten */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, padding: '4px 2px 14px' }}>
          {SZENARIOS.map(s => {
            const n = counts[s.code] ?? 0
            const active = szenario === s.code
            return (
              <button
                key={s.code}
                onClick={() => setSzenario(active ? '' : s.code)}
                title={s.label}
                style={{
                  textAlign: 'left', cursor: 'pointer', minWidth: 150, flex: '1 1 150px',
                  padding: '10px 12px', borderRadius: 8,
                  border: active ? '2px solid #2563eb' : '1px solid var(--admin-border, #e2e8f0)',
                  background: active ? '#eff6ff' : '#fff',
                  borderLeft: s.candidate ? '4px solid #dc2626' : (active ? '2px solid #2563eb' : '1px solid var(--admin-border, #e2e8f0)'),
                }}
              >
                <div style={{ fontSize: 20, fontWeight: 700, color: s.candidate ? '#dc2626' : '#0f172a' }}>{n}</div>
                <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.25 }}>{s.label}</div>
              </button>
            )
          })}
        </div>

        {loading ? (
          <div className="admin-loading"><div className="admin-spinner" /> Laden…</div>
        ) : !szenario ? (
          <div className="admin-table-empty" style={{ padding: 24 }}>
            Szenario oben wählen, um die Artikel zu laden und zu bereinigen.
          </div>
        ) : szenarioBlocked ? (
          <div className="admin-table-empty" style={{ padding: 24 }}>
            Aktiver Bestand ({SZ_LABEL[szenario]}) — Deaktivierung ist gesperrt.
          </div>
        ) : (
          <>
            {scan?.truncated && (
              <div className="admin-page-subtitle" style={{ padding: '0 2px 8px', color: '#b45309' }}>
                Anzeige auf {scan.max_bulk} Artikel begrenzt — Filter enger setzen, um alle zu sehen.
              </div>
            )}
            <table className="admin-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={e => toggleAll(e.target.checked)}
                      disabled={selectable.length === 0 || submitting}
                      title="Alle auswählen"
                    />
                  </th>
                  <th>Art.-Nr.</th>
                  <th>Bezeichnung</th>
                  <th>Lieferant</th>
                  <th>Artikelgruppe</th>
                  <th>Alter</th>
                  <th>Letzte Nutzung</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={8} className="admin-table-empty">Keine Artikel in diesem Szenario.</td></tr>
                ) : rows.map(r => (
                  <tr key={r.art_nr} style={{ cursor: 'pointer' }} onClick={() => !submitting && toggle(r.art_nr)}>
                    <td onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(r.art_nr)}
                        onChange={() => toggle(r.art_nr)}
                        disabled={submitting}
                      />
                    </td>
                    <td className="primary">{r.art_nr}</td>
                    <td>
                      {r.name}
                      {r.dq_no_supplier && <span className="admin-badge admin-badge-admin" style={{ marginLeft: 6 }}>kein Lieferant</span>}
                      {r.dq_no_price && <span className="admin-badge admin-badge-admin" style={{ marginLeft: 6 }}>kein Preis</span>}
                    </td>
                    <td>{r.supplier_id ? (supplierMap[r.supplier_id] ?? '—') : '—'}</td>
                    <td>{r.category ?? '—'}</td>
                    <td>{r.age_days != null ? `${r.age_days} T` : '—'}</td>
                    <td>{r.last_usage_date ?? '—'}</td>
                    <td>
                      <span className={`admin-badge ${r.is_active ? 'admin-badge-active' : 'admin-badge-draft'}`}>
                        {r.is_active ? STATUS_TERMS.active : STATUS_TERMS.inactive}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ display: 'flex', gap: 10, padding: '12px 2px' }}>
              <button
                className="admin-btn admin-btn-danger"
                onClick={() => setConfirm({ targetActive: false })}
                disabled={submitting || selected.size === 0}
              >
                Auf {STATUS_TERMS.inactive} setzen ({selected.size})
              </button>
              <button
                className="admin-btn admin-btn-secondary"
                onClick={() => setConfirm({ targetActive: true })}
                disabled={submitting || selected.size === 0}
              >
                Reaktivieren ({selected.size})
              </button>
            </div>
          </>
        )}
      </div>

      {confirm && (
        <ConfirmDialog
          title={confirm.targetActive ? 'Artikel reaktivieren?' : `Auf ${STATUS_TERMS.inactive} setzen?`}
          message={confirm.targetActive ? (
            <>{selected.size} Artikel wieder auf <strong>{STATUS_TERMS.active}</strong> setzen — sie erscheinen wieder in der Tenant-Ansicht.</>
          ) : (
            <>{selected.size} Artikel auf <strong>{STATUS_TERMS.inactive}</strong> setzen. Sie verschwinden aus der Tenant-Ansicht, bleiben aber vollständig in der Datenbank und können jederzeit reaktiviert werden. Es wird nichts gelöscht.</>
          )}
          confirmLabel={confirm.targetActive ? 'Ja, reaktivieren' : `Ja, auf ${STATUS_TERMS.inactive} setzen`}
          busyLabel="Speichern…"
          busy={submitting}
          variant={confirm.targetActive ? 'primary' : 'danger'}
          onCancel={() => setConfirm(null)}
          onConfirm={() => applyStatus(confirm.targetActive)}
        />
      )}

      {toast && (
        <div className="admin-toast-container">
          <div className={`admin-toast ${toast.type}`}>{toast.msg}</div>
        </div>
      )}
    </div>
  )
}
