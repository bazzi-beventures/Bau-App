import { useEffect, useState } from 'react'
import { apiFetch } from '../../api/client'
import UserDetailScreen from './UserDetailScreen'

export interface AuthUser {
  id: string
  email: string | null
  display_name: string | null
  role: string
  platform: string
  is_active: boolean
  created_at: string
  consent_version: string | null
}

export default function UsersScreen() {
  const [users, setUsers] = useState<AuthUser[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<AuthUser | null>(null)
  const [showNew, setShowNew] = useState(false)

  async function load() {
    setLoading(true)
    try {
      setUsers(await apiFetch('/pwa/admin/users') as AuthUser[])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const filtered = users.filter(u => {
    const q = search.toLowerCase()
    return (
      (u.display_name || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q)
    )
  })

  if (selected || showNew) {
    return (
      <UserDetailScreen
        user={showNew ? null : selected}
        onClose={() => { setSelected(null); setShowNew(false) }}
        onSaved={() => { setSelected(null); setShowNew(false); load() }}
      />
    )
  }

  const active = users.filter(u => u.is_active).length

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Benutzerverwaltung</div>
          <div className="admin-page-subtitle">{active} aktive Benutzer</div>
        </div>
        <button className="admin-btn admin-btn-primary" onClick={() => setShowNew(true)}>
          <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 0 1 1 1v5h5a1 1 0 1 1 0 2h-5v5a1 1 0 1 1-2 0v-5H4a1 1 0 1 1 0-2h5V4a1 1 0 0 1 1-1z" clipRule="evenodd"/></svg>
          Neuer Benutzer
        </button>
      </div>

      <div className="admin-table-wrap">
        <div className="admin-filter-bar">
          <input
            className="admin-search"
            placeholder="Name, E-Mail oder Rolle suchen…"
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
                <th>E-Mail</th>
                <th>Rolle</th>
                <th>Plattform</th>
                <th>Status</th>
                <th>Consent</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="admin-table-empty">Keine Benutzer gefunden.</td></tr>
              ) : filtered.map(u => (
                <tr key={u.id} onClick={() => setSelected(u)}>
                  <td><strong>{u.display_name || '—'}</strong></td>
                  <td style={{ color: 'var(--muted)' }}>{u.email || '—'}</td>
                  <td>
                    <span className={`admin-badge ${u.role === 'admin' || u.role === 'management' || u.role === 'superadmin' ? 'admin-badge-admin' : 'admin-badge-active'}`}>
                      {u.role}
                    </span>
                  </td>
                  <td style={{ color: 'var(--muted)', fontSize: 12 }}>{u.platform}</td>
                  <td>
                    <span className={`admin-badge ${u.is_active ? 'admin-badge-active' : 'admin-badge-rejected'}`}>
                      {u.is_active ? 'Aktiv' : 'Inaktiv'}
                    </span>
                  </td>
                  <td>
                    <span className={`admin-badge ${u.consent_version ? 'admin-badge-approved' : 'admin-badge-draft'}`}>
                      {u.consent_version ? 'Ja' : 'Ausstehend'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
