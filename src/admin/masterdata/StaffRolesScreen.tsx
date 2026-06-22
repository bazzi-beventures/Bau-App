import { useEffect, useState } from 'react'
import { StaffRole, getStaffRoles, upsertStaffRole } from '../../api/admin'

export default function StaffRolesScreen() {
  const [roles, setRoles] = useState<StaffRole[]>([])
  const [loading, setLoading] = useState(true)
  // Pro Funktion der aktuell im Eingabefeld stehende Satz (als String, damit man frei tippen kann)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [savingName, setSavingName] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [toast, setToast] = useState<string | null>(null)

  const [newName, setNewName] = useState('')
  const [newRate, setNewRate] = useState('')

  async function load() {
    setLoading(true)
    try {
      const data = await getStaffRoles()
      setRoles(data)
      setDrafts(Object.fromEntries(data.map(r => [r.name, String(r.hourly_rate ?? '')])))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  function parseRate(v: string): number | null {
    const n = parseFloat(v.replace(',', '.'))
    return Number.isFinite(n) && n >= 0 ? n : null
  }

  async function saveRole(name: string) {
    const rate = parseRate(drafts[name] ?? '')
    if (rate === null) {
      setError(`Ungültiger Satz für "${name}" — bitte eine Zahl ≥ 0 eingeben.`)
      return
    }
    setError('')
    setSavingName(name)
    try {
      await upsertStaffRole(name, rate)
      showToast(`Stundensatz für "${name}" gespeichert`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Speichern')
    } finally {
      setSavingName(null)
    }
  }

  async function addRole(e: React.FormEvent) {
    e.preventDefault()
    const name = newName.trim()
    const rate = parseRate(newRate)
    if (!name) { setError('Bitte einen Funktionsnamen eingeben.'); return }
    if (rate === null) { setError('Bitte einen gültigen Stundensatz eingeben.'); return }
    if (roles.some(r => r.name.toLowerCase() === name.toLowerCase())) {
      setError(`Funktion "${name}" existiert bereits.`); return
    }
    setError('')
    setSavingName('__new__')
    try {
      await upsertStaffRole(name, rate)
      showToast(`Funktion "${name}" angelegt`)
      setNewName('')
      setNewRate('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Anlegen')
    } finally {
      setSavingName(null)
    }
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Funktionen</div>
          <div className="admin-page-subtitle">Stundensätze pro Funktion — werden in Offerten als Lohnpositionen verwendet</div>
        </div>
      </div>

      {error && <div className="admin-form-error" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="admin-table-wrap">
        {loading ? (
          <div className="admin-loading"><div className="admin-spinner" /> Laden…</div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Funktion</th>
                <th style={{ width: 200 }}>Stundensatz (CHF/h)</th>
                <th style={{ width: 120 }}></th>
              </tr>
            </thead>
            <tbody>
              {roles.length === 0 ? (
                <tr><td colSpan={3} className="admin-table-empty">Noch keine Funktionen vorhanden.</td></tr>
              ) : roles.map(r => {
                const changed = (drafts[r.name] ?? '') !== String(r.hourly_rate ?? '')
                return (
                  <tr key={r.name}>
                    <td><strong>{r.name}</strong></td>
                    <td>
                      <input
                        className="admin-form-input"
                        style={{ maxWidth: 160 }}
                        value={drafts[r.name] ?? ''}
                        onChange={e => setDrafts(prev => ({ ...prev, [r.name]: e.target.value }))}
                        placeholder="z.B. 121.00"
                        inputMode="decimal"
                      />
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="admin-btn admin-btn-primary admin-btn-sm"
                        onClick={() => saveRole(r.name)}
                        disabled={!changed || savingName === r.name}
                      >
                        {savingName === r.name ? 'Speichern…' : 'Speichern'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <form onSubmit={addRole} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 20, flexWrap: 'wrap' }}>
        <div className="admin-form-group" style={{ margin: 0 }}>
          <label className="admin-form-label">Neue Funktion</label>
          <input
            className="admin-form-input"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="z.B. Polier"
          />
        </div>
        <div className="admin-form-group" style={{ margin: 0 }}>
          <label className="admin-form-label">Stundensatz (CHF/h)</label>
          <input
            className="admin-form-input"
            style={{ maxWidth: 160 }}
            value={newRate}
            onChange={e => setNewRate(e.target.value)}
            placeholder="z.B. 110.00"
            inputMode="decimal"
          />
        </div>
        <button className="admin-btn admin-btn-secondary" type="submit" disabled={savingName === '__new__'}>
          {savingName === '__new__' ? 'Anlegen…' : '+ Funktion'}
        </button>
      </form>

      {toast && (
        <div className="admin-toast-container">
          <div className="admin-toast success">{toast}</div>
        </div>
      )}
    </div>
  )
}
