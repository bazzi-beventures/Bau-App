import { useEffect, useState } from 'react'
import { apiFetch } from '../../api/client'
import ProjectDetailScreen from './ProjectDetailScreen'

export interface Termin {
  datum: string
  uhrzeit: string
  notiz: string
}

export interface Kontakt {
  name: string
  kommentar: string
  telefon: string
  email: string
}

export interface DisposalDetails {
  material: string
  menge: string
  entsorger: string
  nachweis_url: string
  bemerkung: string
}

export type ProjectStatus = 'offen' | 'abgeschlossen'

export interface EmbeddedCustomer {
  id: string
  name: string | null
  billing_name: string | null
  address: string | null
  billing_address: string | null
  object_address: string | null
  email: string | null
  phone: string | null
}

export interface ProjectInvoiceSummary {
  invoice_number: string
  total_amount: number
  status: string
  created_at: string
  pdf_url: string | null
}

export interface ProjectQuoteSummary {
  quote_number: string
  total_amount: number
  status: string
  created_at: string
  pdf_url: string | null
}

export interface Project {
  id: string
  project_id_text: string | null
  name: string
  customer_id: string | null
  customer: EmbeddedCustomer | null
  object_address: string | null
  local_contact_name: string | null
  local_contact_phone: string | null
  art_der_arbeit: string | null
  projektleiter_id: string | null
  monteur_ids: string[]
  termine: Termin[]
  kontakte: Kontakt[]
  disposal_details: DisposalDetails | null
  is_warranty?: boolean
  wartung_interval_months?: number | null
  wartung_last_at?: string | null
  wartung_next_due_at?: string | null
  status: ProjectStatus
  is_closed: boolean
  created_at: string
  created_by: string | null
  created_by_id: string | null
  bemerkung: string | null
  invoice?: ProjectInvoiceSummary | null
  quote?: ProjectQuoteSummary | null
}

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  offen: 'Offen',
  abgeschlossen: 'Abgeschlossen',
}

export const PROJECT_STATUS_BADGE: Record<ProjectStatus, string> = {
  offen: 'admin-badge-active',
  abgeschlossen: 'admin-badge-closed',
}

const DOC_STATUS_BADGE: Record<string, string> = {
  ausstehend: 'admin-badge-open',
  offen: 'admin-badge-open',
  gesendet: 'admin-badge-sent',
  bezahlt: 'admin-badge-paid',
  entwurf: 'admin-badge-draft',
  akzeptiert: 'admin-badge-approved',
  abgelehnt: 'admin-badge-rejected',
  archiviert: 'admin-badge-closed',
}

type ProjectSortKey = 'project_id_text' | 'name' | 'customer_name' | 'status' | 'created_at'

export function projectCustomerName(p: { customer?: EmbeddedCustomer | null }): string {
  const c = p.customer
  return c?.billing_name || c?.name || ''
}

export function projectCustomerEmail(p: { customer?: EmbeddedCustomer | null }): string {
  return p.customer?.email || ''
}

export function projectBillingAddress(p: { customer?: EmbeddedCustomer | null }): string {
  const c = p.customer
  return c?.billing_address || c?.address || ''
}
type SortDir = 'asc' | 'desc'

const STATUS_ORDER: Record<ProjectStatus, number> = {
  offen: 0,
  abgeschlossen: 1,
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <span style={{ marginLeft: 4, opacity: active ? 1 : 0.3, fontSize: 11 }}>
      {active && dir === 'desc' ? '↓' : '↑'}
    </span>
  )
}

export default function ProjectsScreen() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showClosed, setShowClosed] = useState(false)
  const [sortKey, setSortKey] = useState<ProjectSortKey>('created_at')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
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

  function toggleSort(key: ProjectSortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const filtered = projects.filter(p => {
    const effectiveStatus: ProjectStatus = p.status ?? (p.is_closed ? 'abgeschlossen' : 'offen')
    if (!showClosed && effectiveStatus === 'abgeschlossen') return false
    const q = search.toLowerCase()
    return p.name.toLowerCase().includes(q)
      || projectCustomerName(p).toLowerCase().includes(q)
      || (p.project_id_text || '').toLowerCase().includes(q)
  }).sort((a, b) => {
    const sA: ProjectStatus = a.status ?? (a.is_closed ? 'abgeschlossen' : 'offen')
    const sB: ProjectStatus = b.status ?? (b.is_closed ? 'abgeschlossen' : 'offen')
    let aVal: string | number
    let bVal: string | number
    switch (sortKey) {
      case 'project_id_text': aVal = a.project_id_text || ''; bVal = b.project_id_text || ''; break
      case 'name':          aVal = a.name; bVal = b.name; break
      case 'customer_name': aVal = projectCustomerName(a); bVal = projectCustomerName(b); break
      case 'status':        aVal = STATUS_ORDER[sA]; bVal = STATUS_ORDER[sB]; break
      case 'created_at':    aVal = a.created_at; bVal = b.created_at; break
    }
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
    }
    return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number)
  })

  const open = filtered.filter(p => (p.status ?? (p.is_closed ? 'abgeschlossen' : 'offen')) !== 'abgeschlossen').length
  const closed = filtered.filter(p => (p.status ?? (p.is_closed ? 'abgeschlossen' : 'offen')) === 'abgeschlossen').length

  const thStyle: React.CSSProperties = { cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }

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
            placeholder="Projekt-ID, Name oder Kunde suchen…"
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
                <th style={thStyle} onClick={() => toggleSort('project_id_text')}>
                  Projekt-ID <SortIcon active={sortKey === 'project_id_text'} dir={sortDir} />
                </th>
                <th style={thStyle} onClick={() => toggleSort('name')}>
                  Projektname <SortIcon active={sortKey === 'name'} dir={sortDir} />
                </th>
                <th style={thStyle} onClick={() => toggleSort('customer_name')}>
                  Kunde <SortIcon active={sortKey === 'customer_name'} dir={sortDir} />
                </th>
                <th>Offerte</th>
                <th>Rechnung</th>
                <th style={thStyle} onClick={() => toggleSort('status')}>
                  Status <SortIcon active={sortKey === 'status'} dir={sortDir} />
                </th>
                <th style={thStyle} onClick={() => toggleSort('created_at')}>
                  Erstellt <SortIcon active={sortKey === 'created_at'} dir={sortDir} />
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="admin-table-empty">Keine Projekte gefunden.</td></tr>
              ) : filtered.map(p => {
                const effectiveStatus: ProjectStatus = p.status ?? (p.is_closed ? 'abgeschlossen' : 'offen')
                return (
                  <tr key={p.id} onClick={() => setSelected(p)}>
                    <td style={{ color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                      {p.project_id_text || '—'}
                    </td>
                    <td><strong>{p.name}</strong></td>
                    <td>{projectCustomerName(p) || '—'}</td>
                    <td>
                      {p.quote ? (
                        <span className={`admin-badge ${DOC_STATUS_BADGE[p.quote.status] || 'admin-badge-draft'}`}>
                          {p.quote.status}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td>
                      {p.invoice ? (
                        <span className={`admin-badge ${DOC_STATUS_BADGE[p.invoice.status] || 'admin-badge-draft'}`}>
                          {p.invoice.status}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td>
                      <span className={`admin-badge ${PROJECT_STATUS_BADGE[effectiveStatus]}`}>
                        {PROJECT_STATUS_LABELS[effectiveStatus]}
                      </span>
                    </td>
                    <td style={{ color: 'var(--muted)' }}>
                      {new Date(p.created_at).toLocaleDateString('de-CH')}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
