import { useEffect, useState } from 'react'
import { getAdminStaff, StaffMember } from '../../api/admin'
import StaffDetailScreen from './StaffDetailScreen'

interface Props {
  onNav?: (screen: string, id?: string) => void
}

export default function StaffScreen({ onNav }: Props) {
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<StaffMember | null>(null)
  const [showNew, setShowNew] = useState(false)

  async function load() {
    setLoading(true)
    try {
      setStaff(await getAdminStaff())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const filtered = staff.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.funktion || '').toLowerCase().includes(search.toLowerCase()) ||
    (s.email || '').toLowerCase().includes(search.toLowerCase())
  )

  if (selected || showNew) {
    return (
      <StaffDetailScreen
        member={showNew ? null : selected}
        onClose={() => { setSelected(null); setShowNew(false) }}
        onSaved={() => { setSelected(null); setShowNew(false); load() }}
      />
    )
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Mitarbeiter</div>
          <div className="admin-page-subtitle">{staff.length} Einträge</div>
        </div>
        <button className="admin-btn admin-btn-primary" onClick={() => setShowNew(true)}>
          <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 0 1 1 1v5h5a1 1 0 1 1 0 2h-5v5a1 1 0 1 1-2 0v-5H4a1 1 0 1 1 0-2h5V4a1 1 0 0 1 1-1z" clipRule="evenodd"/></svg>
          Neuer Mitarbeiter
        </button>
      </div>

      <div className="admin-table-wrap">
        <div className="admin-filter-bar">
          <input
            className="admin-search"
            placeholder="Name, Funktion oder E-Mail suchen…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="admin-loading"><div className="admin-spinner" /> Laden…</div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Kürzel</th>
                <th>Funktion</th>
                <th>E-Mail</th>
                <th>Rolle</th>
                <th>Stundenlohn</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="admin-table-empty">Keine Mitarbeiter gefunden.</td></tr>
              ) : filtered.map(s => (
                <tr key={s.id} onClick={() => setSelected(s)}>
                  <td><strong>{s.name}</strong></td>
                  <td>{s.kuerzel || '—'}</td>
                  <td>{s.funktion || '—'}</td>
                  <td style={{ color: 'var(--muted)' }}>{s.email || '—'}</td>
                  <td>
                    {s.role
                      ? <span className={`admin-badge ${s.role === 'admin' ? 'admin-badge-admin' : 'admin-badge-active'}`}>{s.role}</span>
                      : <span className="admin-badge admin-badge-draft">—</span>
                    }
                  </td>
                  <td>{s.hourly_rate ? `CHF ${s.hourly_rate.toFixed(2)}/h` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
