import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../../api/client'
import {
  getFrequentMaterials, addFrequentMaterial, removeFrequentMaterial, reorderFrequentMaterials,
  FrequentMaterial,
} from '../../api/admin'
import { MaterialCombobox, MaterialOption } from './MaterialCombobox'
import { fmtCHF } from '../utils/format'

/**
 * Kuratierte "häufig benutzte Ersatzteile" pflegen (Tab im Material-Bereich,
 * sichtbar sobald der Workflow `ersatzteil_prompt` aktiv ist).
 *
 * Hier nur die Artikel-Auswahl + Reihenfolge — die Menge gibt der Mitarbeiter
 * beim Rapport-Abschluss ein. Gebuchte Teile werden als verrechenbare
 * material_usage-Position gebucht (VK aus dem Aufschlag, Lagerabbuchung).
 *
 * Rendert KEIN eigenes `admin-page` — der Tab-Container in MaterialsScreen liefert
 * das Layout.
 */
export default function FrequentMaterialsPanel() {
  const [materials, setMaterials] = useState<MaterialOption[]>([])
  const [curated, setCurated] = useState<FrequentMaterial[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function reloadCurated() {
    setCurated(await getFrequentMaterials())
  }

  useEffect(() => {
    Promise.all([
      apiFetch('/pwa/admin/materials') as Promise<MaterialOption[]>,
      getFrequentMaterials(),
    ])
      .then(([m, c]) => { setMaterials(m); setCurated(c) })
      .catch(() => setError('Laden fehlgeschlagen'))
      .finally(() => setLoading(false))
  }, [])

  // Bereits kuratierte art_nr ausblenden, damit kein Doppel-Hinzufügen angeboten wird.
  const curatedArtNrs = useMemo(() => new Set(curated.map(c => c.art_nr)), [curated])
  const selectable = useMemo(
    () => materials.filter(m => !curatedArtNrs.has(m.art_nr)),
    [materials, curatedArtNrs],
  )

  async function add(artNr: string) {
    if (!artNr || busy) return
    setBusy(true)
    setError('')
    try {
      await addFrequentMaterial(artNr)
      await reloadCurated()
    } catch {
      setError('Hinzufügen fehlgeschlagen')
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    setBusy(true)
    setError('')
    try {
      await removeFrequentMaterial(id)
      await reloadCurated()
    } catch {
      setError('Entfernen fehlgeschlagen')
    } finally {
      setBusy(false)
    }
  }

  async function move(index: number, dir: -1 | 1) {
    const next = [...curated]
    const target = index + dir
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setCurated(next)  // optimistisch
    setBusy(true)
    setError('')
    try {
      await reorderFrequentMaterials(next.map(c => c.id))
    } catch {
      setError('Reihenfolge speichern fehlgeschlagen')
      await reloadCurated()
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="admin-loading"><div className="admin-spinner" /> Laden…</div>

  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16, maxWidth: 640 }}>
        Diese Artikel werden dem Mitarbeiter beim Rapport-Abschluss als Schnellauswahl
        angeboten (Mehrfachauswahl + Menge). Aktiviert via Workflow „Häufig benutzte
        Ersatzteile beim Rapport abfragen" (Konfiguration → Workflows).
      </div>

      {error && <div className="admin-form-error" style={{ marginBottom: 12 }}>{error}</div>}

      <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
        Produkt hinzufügen
      </label>
      <div style={{ display: 'flex', marginBottom: 20, maxWidth: 560 }}>
        <MaterialCombobox
          materials={selectable}
          supplierMap={{}}
          supplierFilter=""
          categoryFilter=""
          value=""
          onChange={add}
        />
      </div>

      {curated.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>Noch keine Produkte ausgewählt.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 640 }}>
          {curated.map((c, i) => (
            <div
              key={c.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                background: 'var(--surface2)', borderRadius: 6, fontSize: 13,
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <button type="button" className="admin-btn admin-btn-secondary" disabled={busy || i === 0}
                  onClick={() => move(i, -1)} style={{ fontSize: 10, padding: '0 6px', lineHeight: '14px' }}>▲</button>
                <button type="button" className="admin-btn admin-btn-secondary" disabled={busy || i === curated.length - 1}
                  onClick={() => move(i, 1)} style={{ fontSize: 10, padding: '0 6px', lineHeight: '14px' }}>▼</button>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ color: 'var(--muted)' }}>{c.art_nr}</span> — {c.name}
                {!c.is_active && (
                  <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--accent-red)' }}>(inaktiv)</span>
                )}
              </div>
              <div style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                {fmtCHF(c.calc_vk)} / {c.unit}
              </div>
              <button type="button" className="admin-btn admin-btn-secondary" disabled={busy}
                onClick={() => remove(c.id)} style={{ fontSize: 12, padding: '2px 8px' }}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
