import { useEffect, useState } from 'react'
import { apiFetch } from '../../api/client'
import ProjectDetailScreen from './ProjectDetailScreen'

export interface Project {
  id: string
  name: string
  customer_name: string | null
  customer_email: string | null
  customer_address: string | null
  is_closed: boolean
  created_at: string
}

export default function ProjectsScreen() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showClosed, setShowClosed] = useState(false)
  const [selected, setSelected] = useState<Project | null>(null)
  const [showNew, setShowNew] = useState(false)

  async function load() {
    setLoading(true)
    try {
      setProjects(await apiFetch('/pwa/admin/projects') as Project[])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const filtered = projects.filter(p => {
    if (!showClosed && p.is_closed) return false
    const q = search.toLowerCase()
    return (
      p.name.toLowerCase().includes(q) ||
      (p.customer_name || '').toLowerCase().includes(q)
    )
  })

  const open = filtered.filter(p => !p.is_closed).length
  const closed = filtered.filter(p => p.is_closed).length

  if (selected || showNew) {
    return (
      <ProjectDetailScreen
        project={showNew ? null : selected}
        onClose={() => { setSelected(null); setShowNew(false) }}
        onSaved={() => { setSelected(null); setShowNew(false); load() }}
      />
    )
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Projekte</div>
          <div className="admin-page-subtitle">{open} offen{showClosed ? `, ${closed} geschlossen` : ''}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className={`admin-btn admin-btn-sm ${showClosed ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
            onClick={() => setShowClosed(s => !s)}
          >
            {showClosed ? 'Geschlossene ausblenden' : 'Geschlossene anzeigen'}
          </button>
          <button className="admin-btn admin-btn-primary" onClick={() => setShowNew(true)}>
            <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 0 1 1 1v5h5a1 1 0 1 1 0 2h-5v5a1 1 0 1 1-2 0v-5H4a1 1 0 1 1 0-2h5V4a1 1 0 0 1 1-1z" clipRule="evenodd"/></svg>
            Neues Projekt
          </button>
        </div>
      </div>

      <div className="admin-table-wrap">
        <div className="admin-filter-bar">
          <input
            className="admin-search"
            placeholder="Name oder Kunde suchen…"
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
                <th>Projektname</th>
                <th>Kunde</th>
                <th>E-Mail</th>
                <th>Status</th>
                <th>Erstellt</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={5} className="admin-table-empty">Keine Projekte gefunden.</td></tr>
              ) : filtered.map(p => (
                <tr key={p.id} onClick={() => setSelected(p)}>
                  <td><strong>{p.name}</strong></td>
                  <td>{p.customer_name || '—'}</td>
                  <td style={{ color: 'var(--muted)' }}>{p.customer_email || '—'}</td>
                  <td>
                    <span className={`admin-badge ${p.is_closed ? 'admin-badge-closed' : 'admin-badge-active'}`}>
                      {p.is_closed ? 'Geschlossen' : 'Offen'}
                    </span>
                  </td>
                  <td style={{ color: 'var(--muted)' }}>
                    {new Date(p.created_at).toLocaleDateString('de-CH')}
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
