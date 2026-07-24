import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../../api/client'
import { getMe } from '../../api/auth'
import { isFeatureEnabled } from '../../api/modules'
import ProjectDetailScreen from './ProjectDetailScreen'
import { ProjectStatus, PROJECT_STATUS_LABELS, PROJECT_STATUS_BADGE } from '../constants/statuses'
import { ProjektleiterFilter } from '../components/ProjektleiterFilter'
import { AdminCardList } from '../components/AdminCardList'
import { useIsMobile } from '../useIsMobile'

export interface Kontakt {
  name: string
  kommentar: string
  telefon: string
  email: string
  is_site_contact?: boolean
}

// Eigentümer des Objekts — eigene Rolle, getrennt vom Auftraggeber (customer),
// Rechnungsempfänger (customer.billing_*) und Baustellenkontakt (kontakte).
export interface Eigentuemer {
  name: string
  adresse: string
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

export type ProjectKind = 'project' | 'teamsitzung' | 'lagerarbeit' | 'werkstatt' | 'sonstiges'

export const PROJECT_KIND_LABELS: Record<ProjectKind, string> = {
  project: 'Projekt',
  teamsitzung: 'Teamsitzung',
  lagerarbeit: 'Lagerarbeit',
  werkstatt: 'Werkstatt',
  sonstiges: 'Sonstiges',
}

export interface Project {
  id: string
  project_id_text: string | null
  name: string
  kind: ProjectKind
  customer_id: string | null
  customer: EmbeddedCustomer | null
  object_name: string | null
  object_address: string | null
  art_der_arbeit: string[] | null
  projektleiter_id: string | null
  monteur_ids: string[]
  kontakte: Kontakt[]
  eigentuemer: Eigentuemer | null
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
  geruestfach: number | null
  start_date: string | null
  end_date: string | null
  start_time: string | null
  end_time: string | null
  invoice?: ProjectInvoiceSummary | null
  quote?: ProjectQuoteSummary | null
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

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <span style={{ marginLeft: 4, opacity: active ? 1 : 0.3, fontSize: 11 }}>
      {active && dir === 'desc' ? '↓' : '↑'}
    </span>
  )
}

interface ProjectsScreenProps {
  openNew?: boolean
  onConsumedNew?: () => void
}

interface ProjectsListResponse {
  rows: Project[]
  total: number
  open_count: number
  closed_count: number
  archived_count: number
  page: number
  page_size: number
}

const PAGE_SIZE = 50

export default function ProjectsScreen({ openNew, onConsumedNew }: ProjectsScreenProps = {}) {
  const [data, setData] = useState<ProjectsListResponse>({
    rows: [], total: 0, open_count: 0, closed_count: 0, archived_count: 0, page: 1, page_size: PAGE_SIZE,
  })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [showClosed, setShowClosed] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [sortKey, setSortKey] = useState<ProjectSortKey>('created_at')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [page, setPage] = useState(1)
  // Direkteingabe der Seitenzahl (Sprung). String, um Zwischenzustände beim Tippen zu erlauben.
  const [pageInput, setPageInput] = useState('1')
  const [selected, setSelected] = useState<Project | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [projektleiterFilter, setProjektleiterFilter] = useState<string | null>(null)
  const isMobile = useIsMobile()
  const [projektleiterOptions, setProjektleiterOptions] = useState<{ id: string; name: string }[]>([])
  // id → Name für ALLE Mitarbeiter (nicht nur Projektleiter-geflaggte): löst
  // projektleiter_id in der Spalte auf, auch wenn der PL kein PL-Flag (mehr) hat.
  const [staffNameById, setStaffNameById] = useState<Record<string, string>>({})
  // Tenant-spezifische Projektleiter-Spalte (Feature-Flag, Default aus).
  const [showProjektleiterCol, setShowProjektleiterCol] = useState(false)

  useEffect(() => {
    apiFetch('/pwa/admin/staff')
      .then(res => {
        const staff = res as { id: string; name: string; projektleiter: boolean }[]
        setStaffNameById(Object.fromEntries(staff.map(s => [s.id, s.name])))
        setProjektleiterOptions(
          staff
            .filter(s => s.projektleiter)
            .map(s => ({ id: s.id, name: s.name }))
            .sort((a, b) => a.name.localeCompare(b.name))
        )
      })
      .catch(() => { setProjektleiterOptions([]); setStaffNameById({}) })
  }, [])

  useEffect(() => {
    getMe()
      .then(me => setShowProjektleiterCol(isFeatureEnabled(me, 'projektleiter_spalte')))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (openNew) {
      setShowNew(true)
      onConsumedNew?.()
    }
  }, [openNew, onConsumedNew])

  // Suche: 300ms Debounce, damit nicht jeder Tastendruck einen Roundtrip ausloest.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  // Filter/Suche/Sort aendern → zurueck auf Seite 1.
  useEffect(() => { setPage(1) }, [showClosed, showArchived, debouncedSearch, sortKey, sortDir, projektleiterFilter])

  // Eingabefeld mit der aktiven Seite synchron halten (Pfeile, Filter-Reset, Sprung).
  useEffect(() => { setPageInput(String(page)) }, [page])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // Archiv-Ansicht hat Vorrang; sonst offen (Default) bzw. offen+geschlossen.
      const statusParam = showArchived ? 'archived' : (showClosed ? 'all' : 'open')
      const params = new URLSearchParams({
        status: statusParam,
        sort: sortKey,
        dir: sortDir,
        page: String(page),
        page_size: String(PAGE_SIZE),
      })
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (projektleiterFilter) params.set('projektleiter_id', projektleiterFilter)
      const res = await apiFetch(`/pwa/admin/projects/list?${params.toString()}`) as ProjectsListResponse
      setData(res)
    } finally {
      setLoading(false)
    }
  }, [showClosed, showArchived, debouncedSearch, sortKey, sortDir, page, projektleiterFilter])

  useEffect(() => { load() }, [load])

  function toggleSort(key: ProjectSortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const { rows, total, open_count, closed_count, archived_count } = data
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(page * PAGE_SIZE, total)

  // Seitensprung: Eingabe auf [1, totalPages] klemmen; Ungültiges auf aktuelle Seite zurücksetzen.
  function commitPageInput() {
    const n = parseInt(pageInput, 10)
    const clamped = Number.isNaN(n) ? page : Math.min(totalPages, Math.max(1, n))
    setPage(clamped)
    setPageInput(String(clamped))
  }

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
          <div className="admin-page-subtitle">
            {open_count} offen, {closed_count} geschlossen{archived_count > 0 ? `, ${archived_count} archiviert` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className={`admin-btn admin-btn-sm ${showArchived ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
            onClick={() => setShowArchived(s => !s)}
          >
            {showArchived ? 'Archiv ausblenden' : `Archiv${archived_count > 0 ? ` (${archived_count})` : ''}`}
          </button>
          <button
            className={`admin-btn admin-btn-sm ${showClosed ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
            disabled={showArchived}
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
          <ProjektleiterFilter
            options={projektleiterOptions}
            value={projektleiterFilter}
            onChange={setProjektleiterFilter}
          />
        </div>

        {loading ? (
          <div className="admin-loading"><div className="admin-spinner" /> Laden…</div>
        ) : isMobile ? (
          <AdminCardList
            items={rows}
            keyFor={p => p.id}
            onItemClick={p => setSelected(p)}
            empty="Keine Projekte gefunden."
            renderCard={p => {
              const effectiveStatus: ProjectStatus = p.status ?? (p.is_closed ? 'abgeschlossen' : 'offen')
              return (
                <>
                  <div className="admin-card-head">
                    <span className="admin-card-title">{p.name}</span>
                    <span className={`admin-badge ${PROJECT_STATUS_BADGE[effectiveStatus]}`}>
                      {PROJECT_STATUS_LABELS[effectiveStatus]}
                    </span>
                  </div>
                  <div className="admin-card-meta">
                    {p.project_id_text || '—'} · {projectCustomerName(p) || '—'}
                  </div>
                  <div className="admin-card-meta">
                    Offerte: {p.quote ? p.quote.status : '—'} · Rechnung: {p.invoice ? p.invoice.status : '—'} · {new Date(p.created_at).toLocaleDateString('de-CH')}
                  </div>
                </>
              )
            }}
          />
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
                {showProjektleiterCol && <th>Projektleiter</th>}
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
              {rows.length === 0 ? (
                <tr><td colSpan={showProjektleiterCol ? 8 : 7} className="admin-table-empty">Keine Projekte gefunden.</td></tr>
              ) : rows.map(p => {
                const effectiveStatus: ProjectStatus = p.status ?? (p.is_closed ? 'abgeschlossen' : 'offen')
                return (
                  <tr key={p.id} onClick={() => setSelected(p)}>
                    <td style={{ color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                      {p.project_id_text || '—'}
                    </td>
                    <td><strong>{p.name}</strong></td>
                    <td>{projectCustomerName(p) || '—'}</td>
                    {showProjektleiterCol && (
                      <td>{p.projektleiter_id ? (staffNameById[p.projektleiter_id] || '—') : '—'}</td>
                    )}
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

        {total > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid var(--border)', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>
              {rangeStart}–{rangeEnd} von {total}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                className="admin-btn admin-btn-sm admin-btn-secondary"
                disabled={page <= 1 || loading}
                onClick={() => setPage(p => Math.max(1, p - 1))}
              >
                ← Zurück
              </button>
              <span style={{ fontSize: 13, color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                Seite
                <input
                  type="number"
                  min={1}
                  max={totalPages}
                  value={pageInput}
                  disabled={loading}
                  onChange={e => setPageInput(e.target.value)}
                  onFocus={e => e.target.select()}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitPageInput() } }}
                  onBlur={commitPageInput}
                  aria-label="Zur Seite springen"
                  style={{ width: 52, textAlign: 'center', padding: '2px 4px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, background: 'var(--bg, #fff)', color: 'inherit' }}
                />
                / {totalPages}
              </span>
              <button
                className="admin-btn admin-btn-sm admin-btn-secondary"
                disabled={page >= totalPages || loading}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              >
                Weiter →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
