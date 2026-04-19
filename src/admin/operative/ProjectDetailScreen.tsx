import { useEffect, useRef, useState } from 'react'
import { apiFetch, apiFormFetch } from '../../api/client'
import { getMe } from '../../api/auth'
import { AddressAutocomplete } from '../components/AddressAutocomplete'
import { Kontakt, Project, ProjectStatus, PROJECT_STATUS_LABELS, PROJECT_STATUS_BADGE, Termin, DisposalDetails } from './ProjectsScreen'
import { Customer } from './CustomersScreen'
import { QuoteCreateForm, QUOTE_STATUS_LABELS, QUOTE_STATUS_BADGE } from './QuotesScreen'
import { WORK_TYPES } from '../../api/workTypes'

interface StaffMember {
  id: string
  name: string
  projektleiter: boolean
  authorized_user_id: string | null
}

interface ProjectApproval {
  id: string
  title: string
  filename: string
  file_url: string | null
  mime_type: string | null
  requested_by_user_id: string | null
  requested_by_name: string | null
  approver_user_id: string | null
  approver_name: string | null
  status: 'pending' | 'approved' | 'rejected'
  decided_at: string | null
  decision_note: string | null
  created_at: string
}

const APPROVAL_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendent',
  approved: 'Freigegeben',
  rejected: 'Abgelehnt',
}

const APPROVAL_STATUS_BADGE: Record<string, string> = {
  pending: 'admin-badge-open',
  approved: 'admin-badge-paid',
  rejected: 'admin-badge-closed',
}

interface ProjectFile {
  id: string
  filename: string
  file_url: string | null
  mime_type: string | null
  created_at: string
}

interface ProjectComment {
  id: string
  author_name: string | null
  text: string
  created_at: string
}

interface ProjectQuote {
  id: number
  parent_id: number | null
  version: number
  quote_number: string
  total_amount: number
  status: string
  created_at: string
  pdf_url: string | null
  customer_email: string | null
}

interface ProjectInvoice {
  id: number
  parent_id: number | null
  version: number
  invoice_number: string
  total_amount: number
  status: string
  created_at: string
  paid_at: string | null
  pdf_url: string | null
}

function fmtCHF(amount: number) {
  return `CHF ${amount.toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const INVOICE_STATUS_LABELS: Record<string, string> = {
  ausstehend: 'Ausstehend',
  offen: 'Offen',
  gesendet: 'Gesendet',
  bezahlt: 'Bezahlt',
  archiviert: 'Archiviert',
  inaktiv: 'Inaktiv',
}

const INVOICE_STATUS_BADGE: Record<string, string> = {
  ausstehend: 'admin-badge-open',
  offen: 'admin-badge-open',
  gesendet: 'admin-badge-sent',
  bezahlt: 'admin-badge-paid',
  archiviert: 'admin-badge-closed',
  inaktiv: 'admin-badge-draft',
}

function groupByParent<T extends { id: number; parent_id: number | null; version: number }>(items: T[]): T[][] {
  const groups = new Map<number, T[]>()
  for (const item of items) {
    const key = item.parent_id ?? item.id
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(item)
  }
  const result = Array.from(groups.values())
  for (const g of result) g.sort((a, b) => b.version - a.version)
  result.sort((a, b) => {
    const aDate = (a[0] as unknown as { created_at: string }).created_at
    const bDate = (b[0] as unknown as { created_at: string }).created_at
    return new Date(bDate).getTime() - new Date(aDate).getTime()
  })
  return result
}

interface Props {
  project: Project | null
  onClose: () => void
  onSaved: () => void
}

const STATUS_SEQUENCE: ProjectStatus[] = ['offen', 'bestellung_ausgeloest', 'demontage', 'abgeschlossen']

const STATUS_ACCENT: Record<ProjectStatus, string> = {
  offen: 'var(--success)',
  bestellung_ausgeloest: 'var(--warning)',
  demontage: 'var(--primary)',
  abgeschlossen: 'var(--text-muted)',
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function ProjectDetailScreen({ project, onClose, onSaved }: Props) {
  const isNew = !project

  const [name, setName] = useState(project?.name ?? '')
  const [customerId, setCustomerId] = useState(project?.customer_id ?? '')
  const [customerName, setCustomerName] = useState(project?.customer_name ?? '')
  const [customerEmail, setCustomerEmail] = useState(project?.customer_email ?? '')
  const [customerAddress, setCustomerAddress] = useState(project?.customer_address ?? '')
  const [auftraggeber, setAuftraggeber] = useState(project?.auftraggeber ?? '')
  const [eigentuemer, setEigentuemer] = useState(project?.eigentuemer ?? '')
  const [artDerArbeit, setArtDerArbeit] = useState(project?.art_der_arbeit ?? '')
  const [bemerkung, setBemerkung] = useState(project?.bemerkung ?? '')
  const [projektleiterId, setProjektleiterId] = useState(project?.projektleiter_id ?? '')
  const [monteurIds, setMonteurIds] = useState<string[]>(project?.monteur_ids ?? [])
  const [termine, setTermine] = useState<Termin[]>(project?.termine ?? [])
  const [kontakte, setKontakte] = useState<Kontakt[]>(project?.kontakte ?? [])
  const EMPTY_DISPOSAL: DisposalDetails = { material: '', menge: '', entsorger: '', nachweis_url: '', bemerkung: '' }
  const [disposal, setDisposal] = useState<DisposalDetails>(project?.disposal_details ?? EMPTY_DISPOSAL)
  const updateDisposal = (field: keyof DisposalDetails, value: string) => setDisposal(prev => ({ ...prev, [field]: value }))
  const disposalEmpty = (d: DisposalDetails) => !d.material && !d.menge && !d.entsorger && !d.nachweis_url && !d.bemerkung
  const [wartungInterval, setWartungInterval] = useState<string>(project?.wartung_interval_months?.toString() ?? '')
  const [wartungLastAt, setWartungLastAt] = useState<string>(project?.wartung_last_at ?? '')
  const [wartungNextDueAt, setWartungNextDueAt] = useState<string>(project?.wartung_next_due_at ?? '')
  function recomputeNextDue(lastAt: string, intervalMonths: string) {
    const n = parseInt(intervalMonths, 10)
    if (!lastAt || !Number.isFinite(n) || n <= 0) return ''
    const d = new Date(lastAt); d.setMonth(d.getMonth() + n)
    return d.toISOString().slice(0, 10)
  }

  const [customers, setCustomers] = useState<Customer[]>([])
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [saving, setSaving] = useState(false)
  const [settingStatus, setSettingStatus] = useState(false)
  const [error, setError] = useState('')
  const [confirmClose, setConfirmClose] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  // Wiedereröffnen
  const [confirmReopen, setConfirmReopen] = useState(false)
  const [reopenReason, setReopenReason] = useState<'fehler' | 'garantiefall'>('fehler')
  const [reopening, setReopening] = useState(false)

  // Dateien
  const [files, setFiles] = useState<ProjectFile[]>([])
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Kommentare
  const [comments, setComments] = useState<ProjectComment[]>([])
  const [newComment, setNewComment] = useState('')
  const [addingComment, setAddingComment] = useState(false)

  // Offerten & Rechnungen
  const [quotes, setQuotes] = useState<ProjectQuote[]>([])
  const [invoices, setInvoices] = useState<ProjectInvoice[]>([])
  const [showQuoteForm, setShowQuoteForm] = useState(false)
  const [generatingInvoice, setGeneratingInvoice] = useState(false)
  const [regeneratingQuoteId, setRegeneratingQuoteId] = useState<number | null>(null)
  const [useAcceptedQuote, setUseAcceptedQuote] = useState(false)

  // Bestellfreigaben
  const [approvals, setApprovals] = useState<ProjectApproval[]>([])
  const [showApprovalForm, setShowApprovalForm] = useState(false)
  const [approvalTitle, setApprovalTitle] = useState('')
  const [approvalApproverUserId, setApprovalApproverUserId] = useState('')
  const [approvalFile, setApprovalFile] = useState<File | null>(null)
  const [creatingApproval, setCreatingApproval] = useState(false)
  const [decidingApprovalId, setDecidingApprovalId] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const approvalFileInputRef = useRef<HTMLInputElement>(null)

  const effectiveStatus: ProjectStatus = project?.status ?? (project?.is_closed ? 'abgeschlossen' : 'offen')
  const isClosed = effectiveStatus === 'abgeschlossen'

  useEffect(() => {
    apiFetch('/pwa/admin/staff').then((data: unknown) => {
      const arr = data as { id: string; name: string; projektleiter?: boolean; authorized_user_id?: string | null }[]
      setStaff(arr.map(s => ({
        id: s.id,
        name: s.name,
        projektleiter: s.projektleiter ?? false,
        authorized_user_id: s.authorized_user_id ?? null,
      })))
    }).catch(() => {})
    apiFetch('/pwa/admin/customers').then((data: unknown) => {
      setCustomers(data as Customer[])
    }).catch(() => {})
    getMe().then(me => setCurrentUserId(me.authorized_user_id)).catch(() => {})
  }, [])

  useEffect(() => {
    if (!project) return
    apiFetch(`/pwa/admin/projects/${project.id}/files`).then(d => setFiles(d as ProjectFile[])).catch(() => {})
    apiFetch(`/pwa/admin/projects/${project.id}/comments`).then(d => setComments(d as ProjectComment[])).catch(() => {})
    reloadQuotes()
    reloadInvoices()
    reloadApprovals()
  }, [project?.id])

  async function reloadApprovals() {
    if (!project) return
    try {
      const d = await apiFetch(`/pwa/admin/projects/${project.id}/approvals`) as ProjectApproval[]
      setApprovals(d)
    } catch { /* ignore */ }
  }

  async function handleCreateApproval(e: React.FormEvent) {
    e.preventDefault()
    if (!project || !approvalTitle.trim() || !approvalApproverUserId || !approvalFile) return
    setCreatingApproval(true)
    try {
      const form = new FormData()
      form.append('title', approvalTitle.trim())
      form.append('approver_user_id', approvalApproverUserId)
      form.append('file', approvalFile)
      await apiFormFetch(`/pwa/admin/projects/${project.id}/approvals`, form)
      setShowApprovalForm(false)
      setApprovalTitle('')
      setApprovalApproverUserId('')
      setApprovalFile(null)
      if (approvalFileInputRef.current) approvalFileInputRef.current.value = ''
      showToast('Freigabe-Anfrage gesendet')
      await reloadApprovals()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Fehler beim Anlegen')
    } finally {
      setCreatingApproval(false)
    }
  }

  async function handleDecideApproval(approvalId: string, decision: 'approve' | 'reject') {
    let note: string | undefined
    if (decision === 'reject') {
      const input = window.prompt('Grund für Ablehnung (optional):')
      if (input === null) return
      note = input || undefined
    }
    setDecidingApprovalId(approvalId)
    try {
      await apiFetch(`/pwa/admin/approvals/${approvalId}/${decision}`, {
        method: 'POST',
        body: JSON.stringify({ note: note ?? null }),
      })
      showToast(decision === 'approve' ? 'Freigabe erteilt' : 'Freigabe abgelehnt')
      await reloadApprovals()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setDecidingApprovalId(null)
    }
  }

  async function handleDeleteApproval(approvalId: string) {
    if (!window.confirm('Pendente Freigabe wirklich löschen?')) return
    try {
      await apiFetch(`/pwa/admin/approvals/${approvalId}`, { method: 'DELETE' })
      showToast('Freigabe gelöscht')
      await reloadApprovals()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Fehler beim Löschen')
    }
  }

  async function reloadQuotes() {
    if (!project) return
    try {
      const d = await apiFetch(`/pwa/admin/projects/${project.id}/quotes`) as ProjectQuote[]
      setQuotes(d)
    } catch { /* ignore */ }
  }

  async function reloadInvoices() {
    if (!project) return
    try {
      const d = await apiFetch(`/pwa/admin/projects/${project.id}/invoices`) as ProjectInvoice[]
      setInvoices(d)
    } catch { /* ignore */ }
  }

  async function handleRegenerateQuote(quoteId: number) {
    setRegeneratingQuoteId(quoteId)
    try {
      await apiFetch(`/pwa/admin/quotes/${quoteId}/regenerate`, { method: 'POST' })
      showToast('Neue Version erstellt')
      await reloadQuotes()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Fehler beim Regenerieren')
    } finally {
      setRegeneratingQuoteId(null)
    }
  }

  async function handleGenerateInvoice() {
    if (!project) return
    setGeneratingInvoice(true)
    try {
      await apiFetch('/pwa/admin/invoices/generate', {
        method: 'POST',
        body: JSON.stringify({ project_name: project.name, use_quote: useAcceptedQuote }),
      })
      showToast('Rechnung erstellt')
      await reloadInvoices()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Fehler beim Erstellen')
    } finally {
      setGeneratingInvoice(false)
    }
  }

  async function handleUpdateQuoteStatus(quoteId: number, status: string) {
    try {
      await apiFetch(`/pwa/admin/quotes/${quoteId}/status`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      })
      await reloadQuotes()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Fehler')
    }
  }

  async function handleMarkInvoicePaid(invoiceId: number) {
    try {
      await apiFetch(`/pwa/admin/invoices/${invoiceId}/mark-paid`, { method: 'POST' })
      await reloadInvoices()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Fehler')
    }
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  function handleSelectCustomer(id: string) {
    setCustomerId(id)
    if (!id) return
    const c = customers.find(x => x.id === id)
    if (!c) return
    setCustomerName(c.name)
    setCustomerEmail(c.email ?? '')
    setCustomerAddress(c.address ?? '')
  }

  // ── Termine helpers ──────────────────────────────────────────
  function addTermin() {
    setTermine(prev => [...prev, { datum: '', uhrzeit: '', notiz: '' }])
  }
  function updateTermin(i: number, field: keyof Termin, value: string) {
    setTermine(prev => prev.map((t, idx) => idx === i ? { ...t, [field]: value } : t))
  }
  function removeTermin(i: number) {
    setTermine(prev => prev.filter((_, idx) => idx !== i))
  }

  // ── Kontakte helpers ─────────────────────────────────────────
  function addKontakt() {
    setKontakte(prev => [...prev, { name: '', rolle: 'Objekt', telefon: '', email: '' }])
  }
  function updateKontakt(i: number, field: keyof Kontakt, value: string) {
    setKontakte(prev => prev.map((k, idx) => idx === i ? { ...k, [field]: value } : k))
  }
  function removeKontakt(i: number) {
    setKontakte(prev => prev.filter((_, idx) => idx !== i))
  }

  function toggleMonteur(id: string) {
    setMonteurIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setError('')
    setSaving(true)
    try {
      const method = isNew ? 'POST' : 'PATCH'
      const url = isNew ? '/pwa/admin/projects' : `/pwa/admin/projects/${project!.id}`
      await apiFetch(url, {
        method,
        body: JSON.stringify({
          name: name.trim(),
          customer_id: customerId || null,
          customer_name: customerName || null,
          customer_email: customerEmail || null,
          customer_address: customerAddress || null,
          auftraggeber: auftraggeber || null,
          eigentuemer: eigentuemer || null,
          art_der_arbeit: artDerArbeit || null,
          bemerkung: bemerkung || null,
          projektleiter_id: projektleiterId || null,
          monteur_ids: monteurIds,
          termine,
          kontakte,
          disposal_details: artDerArbeit === 'Demontage' && !disposalEmpty(disposal) ? disposal : null,
          wartung_interval_months: wartungInterval ? parseInt(wartungInterval, 10) : null,
          wartung_last_at: wartungLastAt || null,
          wartung_next_due_at: wartungNextDueAt || null,
        }),
      })
      onSaved()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fehler beim Speichern')
    } finally {
      setSaving(false)
    }
  }

  async function handleSetStatus(newStatus: ProjectStatus) {
    if (!project) return
    if (newStatus === 'abgeschlossen') {
      setConfirmClose(true)
      return
    }
    setSettingStatus(true)
    try {
      await apiFetch(`/pwa/admin/projects/${encodeURIComponent(project.name)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      })
      showToast(`Status: ${PROJECT_STATUS_LABELS[newStatus]}`)
      setTimeout(onSaved, 1000)
    } catch {
      setError('Fehler beim Setzen des Status')
    } finally {
      setSettingStatus(false)
    }
  }

  async function handleClose() {
    if (!project) return
    setSettingStatus(true)
    try {
      await apiFetch(`/pwa/admin/projects/${encodeURIComponent(project.name)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'abgeschlossen' }),
      })
      showToast('Projekt geschlossen')
      setTimeout(onSaved, 1000)
    } catch {
      setError('Fehler beim Schliessen')
    } finally {
      setSettingStatus(false)
      setConfirmClose(false)
    }
  }

  async function handleReopen() {
    if (!project) return
    setReopening(true)
    try {
      await apiFetch(`/pwa/admin/projects/${project.id}/reopen`, { method: 'POST' })
      if (reopenReason === 'garantiefall') {
        await apiFetch(`/pwa/admin/projects/${project.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ name: project.name, art_der_arbeit: 'Reparatur', is_warranty: true }),
        })
      }
      showToast('Projekt wiedereröffnet')
      setTimeout(onSaved, 1000)
    } catch {
      setError('Fehler beim Wiedereröffnen')
    } finally {
      setReopening(false)
      setConfirmReopen(false)
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!project || !e.target.files?.length) return
    const file = e.target.files[0]
    const form = new FormData()
    form.append('file', file)
    setUploading(true)
    try {
      await apiFormFetch(`/pwa/admin/projects/${project.id}/files`, form)
      const updated = await apiFetch(`/pwa/admin/projects/${project.id}/files`) as ProjectFile[]
      setFiles(updated)
      showToast('Datei hochgeladen')
    } catch {
      setError('Fehler beim Hochladen')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleDeleteFile(fileId: string) {
    if (!project) return
    try {
      await apiFetch(`/pwa/admin/projects/${project.id}/files/${fileId}`, { method: 'DELETE' })
      setFiles(prev => prev.filter(f => f.id !== fileId))
    } catch {
      setError('Fehler beim Löschen')
    }
  }

  async function handleAddComment() {
    if (!project || !newComment.trim()) return
    setAddingComment(true)
    try {
      await apiFetch(`/pwa/admin/projects/${project.id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ text: newComment.trim() }),
      })
      const updated = await apiFetch(`/pwa/admin/projects/${project.id}/comments`) as ProjectComment[]
      setComments(updated)
      setNewComment('')
    } catch {
      setError('Fehler beim Speichern des Kommentars')
    } finally {
      setAddingComment(false)
    }
  }

  return (
    <div className="admin-page">
      <div
        className="admin-page-header"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          background: 'var(--bg, #0c2840)',
          margin: '-28px -32px 24px',
          padding: '20px 32px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div>
          <div className="admin-page-title">{isNew ? 'Neues Projekt' : project.name}</div>
          <div className="admin-page-subtitle" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {isNew ? 'Projekt anlegen' : (
              <>
                <span className={`admin-badge ${PROJECT_STATUS_BADGE[effectiveStatus]}`} style={{ fontSize: 12 }}>
                  {PROJECT_STATUS_LABELS[effectiveStatus]}
                </span>
                {project?.created_at && (
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                    Eröffnet am {fmtDate(project.created_at)}
                  </span>
                )}
              </>
            )}
          </div>
        </div>
        <button className="admin-btn admin-btn-secondary" onClick={onClose}>← Zurück</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20, alignItems: 'start' }}>
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {error && <div className="admin-form-error">{error}</div>}

          {/* ── Projektdaten ─────────────────────────────────── */}
          <div className="admin-table-wrap" style={{ padding: 24 }}>
            <div className="admin-section-title">Projektdaten</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="admin-form-group">
                <label className="admin-form-label">Projektname *</label>
                <input className="admin-form-input" value={name} onChange={e => setName(e.target.value)} required />
              </div>
              <div className="admin-form-group">
                <label className="admin-form-label">Art der Arbeit</label>
                <select className="admin-form-select" value={artDerArbeit} onChange={e => setArtDerArbeit(e.target.value)}>
                  <option value="">— auswählen —</option>
                  {WORK_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div className="admin-form-group">
                <label className="admin-form-label">
                  Bemerkung
                  <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--danger)', fontWeight: 600 }}>
                    wird für Monteure rot hervorgehoben
                  </span>
                </label>
                <textarea
                  className="admin-form-input"
                  value={bemerkung}
                  onChange={e => setBemerkung(e.target.value)}
                  placeholder="Wichtiger Hinweis für Monteure…"
                  rows={3}
                  style={{ resize: 'vertical' }}
                />
              </div>
            </div>
          </div>

          {/* ── Auftraggeber & Eigentümer ─────────────────────── */}
          <div className="admin-table-wrap" style={{ padding: 24 }}>
            <div className="admin-section-title">Auftraggeber & Eigentümer</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="admin-form-group">
                <label className="admin-form-label">Auftraggeber</label>
                <input className="admin-form-input" value={auftraggeber} onChange={e => setAuftraggeber(e.target.value)} />
              </div>
              <div className="admin-form-group">
                <label className="admin-form-label">Eigentümer</label>
                <input className="admin-form-input" value={eigentuemer} onChange={e => setEigentuemer(e.target.value)} />
              </div>
            </div>
          </div>

          {/* ── Kundenkontakt ─────────────────────────────────── */}
          <div className="admin-table-wrap" style={{ padding: 24, overflow: 'visible' }}>
            <div className="admin-section-title">Kundenkontakt</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="admin-form-group">
                <label className="admin-form-label">Kunde aus Kundenstamm</label>
                <select
                  className="admin-form-select"
                  value={customerId}
                  onChange={e => handleSelectCustomer(e.target.value)}
                >
                  <option value="">— manuell eintragen —</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name}{c.address ? ` · ${c.address}` : ''}</option>
                  ))}
                </select>
              </div>
              <div className="admin-form-group">
                <label className="admin-form-label">Kundenname</label>
                <input className="admin-form-input" value={customerName} onChange={e => { setCustomerName(e.target.value); setCustomerId('') }} />
              </div>
              <div className="admin-form-group">
                <label className="admin-form-label">Kunden-E-Mail</label>
                <input className="admin-form-input" type="email" value={customerEmail} onChange={e => { setCustomerEmail(e.target.value); setCustomerId('') }} />
              </div>
              <div className="admin-form-group">
                <label className="admin-form-label">Kundenadresse</label>
                <AddressAutocomplete className="admin-form-input" value={customerAddress} onChange={v => { setCustomerAddress(v); setCustomerId('') }} />
              </div>
            </div>
          </div>

          {/* ── Termine ──────────────────────────────────────── */}
          <div className="admin-table-wrap" style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div className="admin-section-title" style={{ margin: 0 }}>Termine</div>
              <button type="button" className="admin-btn admin-btn-sm admin-btn-secondary" onClick={addTermin}>
                + Termin hinzufügen
              </button>
            </div>
            {termine.length === 0 && (
              <div style={{ color: 'var(--muted)', fontSize: 13 }}>Keine Termine eingetragen.</div>
            )}
            {termine.map((t, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr auto', gap: 10, marginBottom: 10, alignItems: 'end' }}>
                <div className="admin-form-group" style={{ margin: 0 }}>
                  <label className="admin-form-label">Datum</label>
                  <input className="admin-form-input" type="date" value={t.datum} onChange={e => updateTermin(i, 'datum', e.target.value)} />
                </div>
                <div className="admin-form-group" style={{ margin: 0 }}>
                  <label className="admin-form-label">Uhrzeit</label>
                  <input className="admin-form-input" type="time" value={t.uhrzeit} onChange={e => updateTermin(i, 'uhrzeit', e.target.value)} />
                </div>
                <div className="admin-form-group" style={{ margin: 0 }}>
                  <label className="admin-form-label">Notiz</label>
                  <input className="admin-form-input" value={t.notiz} onChange={e => updateTermin(i, 'notiz', e.target.value)} placeholder="optional" />
                </div>
                <button type="button" className="admin-btn admin-btn-sm admin-btn-danger" style={{ marginBottom: 1 }} onClick={() => removeTermin(i)}>
                  ✕
                </button>
              </div>
            ))}
          </div>

          {/* ── Ansprechpersonen ──────────────────────────────── */}
          <div className="admin-table-wrap" style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div className="admin-section-title" style={{ margin: 0 }}>Ansprechpersonen</div>
              <button type="button" className="admin-btn admin-btn-sm admin-btn-secondary" onClick={addKontakt}>
                + Kontakt hinzufügen
              </button>
            </div>
            {kontakte.length === 0 && (
              <div style={{ color: 'var(--muted)', fontSize: 13 }}>Keine Ansprechpersonen eingetragen.</div>
            )}
            {kontakte.map((k, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 2fr auto', gap: 10, marginBottom: 10, alignItems: 'end' }}>
                <div className="admin-form-group" style={{ margin: 0 }}>
                  <label className="admin-form-label">Name</label>
                  <input className="admin-form-input" value={k.name} onChange={e => updateKontakt(i, 'name', e.target.value)} />
                </div>
                <div className="admin-form-group" style={{ margin: 0 }}>
                  <label className="admin-form-label">Rolle</label>
                  <select className="admin-form-select" value={k.rolle} onChange={e => updateKontakt(i, 'rolle', e.target.value)}>
                    <option value="Objekt">Objekt</option>
                    <option value="Auftraggeber">Auftraggeber</option>
                  </select>
                </div>
                <div className="admin-form-group" style={{ margin: 0 }}>
                  <label className="admin-form-label">Telefon</label>
                  <input className="admin-form-input" value={k.telefon} onChange={e => updateKontakt(i, 'telefon', e.target.value)} />
                </div>
                <div className="admin-form-group" style={{ margin: 0 }}>
                  <label className="admin-form-label">E-Mail</label>
                  <input className="admin-form-input" type="email" value={k.email} onChange={e => updateKontakt(i, 'email', e.target.value)} />
                </div>
                <button type="button" className="admin-btn admin-btn-sm admin-btn-danger" style={{ marginBottom: 1 }} onClick={() => removeKontakt(i)}>
                  ✕
                </button>
              </div>
            ))}
          </div>

          {/* ── Entsorgung (nur bei Demontage) ────────────────── */}
          {artDerArbeit === 'Demontage' && (
            <div className="admin-table-wrap" style={{ padding: 24 }}>
              <div className="admin-section-title">Entsorgung</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="admin-form-group">
                  <label className="admin-form-label">Material</label>
                  <input className="admin-form-input" value={disposal.material} onChange={e => updateDisposal('material', e.target.value)} placeholder="z.B. Aluminium-Storen, Rollladen-Lamellen" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div className="admin-form-group" style={{ margin: 0 }}>
                    <label className="admin-form-label">Menge</label>
                    <input className="admin-form-input" value={disposal.menge} onChange={e => updateDisposal('menge', e.target.value)} placeholder="z.B. 12 Stk · 45 kg" />
                  </div>
                  <div className="admin-form-group" style={{ margin: 0 }}>
                    <label className="admin-form-label">Entsorger</label>
                    <input className="admin-form-input" value={disposal.entsorger} onChange={e => updateDisposal('entsorger', e.target.value)} placeholder="Firma / Sammelstelle" />
                  </div>
                </div>
                <div className="admin-form-group">
                  <label className="admin-form-label">Nachweis (URL)</label>
                  <input className="admin-form-input" type="url" value={disposal.nachweis_url} onChange={e => updateDisposal('nachweis_url', e.target.value)} placeholder="Link zu Entsorgungsbeleg / Foto" />
                </div>
                <div className="admin-form-group">
                  <label className="admin-form-label">Bemerkung</label>
                  <textarea className="admin-form-input" value={disposal.bemerkung} onChange={e => updateDisposal('bemerkung', e.target.value)} rows={2} style={{ resize: 'vertical' }} />
                </div>
              </div>
            </div>
          )}

          {/* ── Wartungs-Intervall ────────────────────────────── */}
          <div className="admin-table-wrap" style={{ padding: 24 }}>
            <div className="admin-section-title">Wartung</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
              Optional: Wartungs-Intervall (in Monaten) + letzter Service → nächste Fälligkeit wird automatisch berechnet.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
              <div className="admin-form-group" style={{ margin: 0 }}>
                <label className="admin-form-label">Intervall (Monate)</label>
                <input
                  className="admin-form-input" type="number" min="1" step="1"
                  value={wartungInterval}
                  onChange={e => {
                    const v = e.target.value
                    setWartungInterval(v)
                    setWartungNextDueAt(recomputeNextDue(wartungLastAt, v))
                  }}
                  placeholder="z.B. 12"
                />
              </div>
              <div className="admin-form-group" style={{ margin: 0 }}>
                <label className="admin-form-label">Letzter Service</label>
                <input
                  className="admin-form-input" type="date"
                  value={wartungLastAt}
                  onChange={e => {
                    const v = e.target.value
                    setWartungLastAt(v)
                    setWartungNextDueAt(recomputeNextDue(v, wartungInterval))
                  }}
                />
              </div>
              <div className="admin-form-group" style={{ margin: 0 }}>
                <label className="admin-form-label">Nächste Fälligkeit</label>
                <input
                  className="admin-form-input" type="date"
                  value={wartungNextDueAt}
                  onChange={e => setWartungNextDueAt(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* ── Zuständigkeiten ───────────────────────────────── */}
          <div className="admin-table-wrap" style={{ padding: 24 }}>
            <div className="admin-section-title">Zuständigkeiten</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="admin-form-group">
                <label className="admin-form-label">Projektleiter</label>
                <select className="admin-form-select" value={projektleiterId} onChange={e => setProjektleiterId(e.target.value)}>
                  <option value="">— auswählen —</option>
                  {staff.filter(s => s.projektleiter || s.id === projektleiterId).map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="admin-form-group">
                <label className="admin-form-label">Monteure</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                  {staff.length === 0 && (
                    <span style={{ color: 'var(--muted)', fontSize: 13 }}>Keine Mitarbeiter gefunden.</span>
                  )}
                  {staff.map(s => (
                    <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, padding: '4px 10px', borderRadius: 6, background: monteurIds.includes(s.id) ? 'var(--primary)' : 'var(--surface-2)', color: monteurIds.includes(s.id) ? '#fff' : 'var(--text)', border: '1px solid', borderColor: monteurIds.includes(s.id) ? 'var(--primary)' : 'var(--border)' }}>
                      <input
                        type="checkbox"
                        style={{ display: 'none' }}
                        checked={monteurIds.includes(s.id)}
                        onChange={() => toggleMonteur(s.id)}
                      />
                      {s.name}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" className="admin-btn admin-btn-secondary" onClick={onClose}>Abbrechen</button>
            <button type="submit" className="admin-btn admin-btn-primary" disabled={saving || !name.trim()}>
              {saving ? 'Speichern…' : 'Speichern'}
            </button>
          </div>
        </form>

        {/* ── Seitenleiste ──────────────────────────────────── */}
        {!isNew && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="admin-table-wrap" style={{ padding: 20 }}>
              <div className="admin-section-title">Status</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                {STATUS_SEQUENCE.filter(s => s !== 'abgeschlossen').map(s => {
                  const isCurrent = effectiveStatus === s
                  const accent = STATUS_ACCENT[s]
                  return (
                    <button
                      key={s}
                      type="button"
                      disabled={isCurrent || settingStatus || isClosed}
                      className="admin-btn admin-btn-secondary"
                      style={{
                        width: '100%',
                        justifyContent: 'center',
                        fontWeight: isCurrent ? 700 : undefined,
                        color: isCurrent ? accent : undefined,
                        borderColor: isCurrent ? accent : undefined,
                        outline: isCurrent ? `2px solid ${accent}` : undefined,
                        outlineOffset: isCurrent ? '2px' : undefined,
                      }}
                      onClick={() => handleSetStatus(s)}
                    >
                      {isCurrent && '● '}{PROJECT_STATUS_LABELS[s]}
                    </button>
                  )
                })}
                {!isClosed && (
                  <button
                    type="button"
                    disabled={settingStatus}
                    className="admin-btn admin-btn-danger"
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={() => setConfirmClose(true)}
                  >
                    Abschliessen
                  </button>
                )}
                {isClosed && (
                  <button
                    type="button"
                    disabled={reopening}
                    className="admin-btn admin-btn-secondary"
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={() => setConfirmReopen(true)}
                  >
                    Wiedereröffnen
                  </button>
                )}
              </div>
              <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 14 }}>
                Abgeschlossene Projekte werden für Mitarbeiter ausgeblendet.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Dateien ──────────────────────────────────────────── */}
      {!isNew && (
        <div className="admin-table-wrap" style={{ padding: 24, marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div className="admin-section-title" style={{ margin: 0 }}>Dokumente & Fotos</div>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                style={{ display: 'none' }}
                onChange={handleUpload}
              />
              <button
                type="button"
                className="admin-btn admin-btn-sm admin-btn-secondary"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? 'Wird hochgeladen…' : '+ Datei hochladen'}
              </button>
            </div>
          </div>
          {files.length === 0 && (
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>Noch keine Dateien hochgeladen.</div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {files.map(f => (
              <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: 18 }}>{f.mime_type === 'application/pdf' ? '📄' : '🖼️'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {f.file_url
                    ? <a href={f.file_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, fontWeight: 500, color: 'var(--primary)', textDecoration: 'none', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.filename}</a>
                    : <span style={{ fontSize: 13, fontWeight: 500 }}>{f.filename}</span>
                  }
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{formatDateTime(f.created_at)}</div>
                </div>
                <button
                  type="button"
                  className="admin-btn admin-btn-sm admin-btn-danger"
                  onClick={() => handleDeleteFile(f.id)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Offerten ─────────────────────────────────────────── */}
      {!isNew && (
        <div className="admin-table-wrap" style={{ padding: 24, marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div className="admin-section-title" style={{ margin: 0 }}>Offerten</div>
            <button
              type="button"
              className="admin-btn admin-btn-sm admin-btn-primary"
              onClick={() => setShowQuoteForm(true)}
            >
              + Neue Offerte
            </button>
          </div>
          {quotes.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>Noch keine Offerten.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {groupByParent(quotes).map(group => {
                const latest = group[0]
                return (
                  <div key={latest.parent_id ?? latest.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, background: 'var(--surface-2)' }}>
                    {group.map((q, idx) => (
                      <div key={q.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 4px', borderTop: idx > 0 ? '1px dashed var(--border)' : 'none' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, minWidth: 32, color: idx === 0 ? 'var(--primary)' : 'var(--muted)' }}>V{q.version}</span>
                        <span style={{ fontFamily: 'monospace', fontSize: 12, minWidth: 130 }}>{q.quote_number}</span>
                        <span className={`admin-badge ${QUOTE_STATUS_BADGE[q.status] || 'admin-badge-draft'}`}>{QUOTE_STATUS_LABELS[q.status] || q.status}</span>
                        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{fmtDate(q.created_at)}</span>
                        <span style={{ flex: 1, textAlign: 'right', fontWeight: 600, fontSize: 13 }}>{fmtCHF(q.total_amount)}</span>
                        {q.pdf_url && (
                          <a href={q.pdf_url} target="_blank" rel="noreferrer" className="admin-btn admin-btn-secondary admin-btn-sm">PDF</a>
                        )}
                        {idx === 0 && (
                          <>
                            {q.status === 'entwurf' && (
                              <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={() => handleUpdateQuoteStatus(q.id, 'akzeptiert')}>Akzeptiert</button>
                            )}
                            <button
                              className="admin-btn admin-btn-secondary admin-btn-sm"
                              disabled={regeneratingQuoteId === q.id}
                              onClick={() => handleRegenerateQuote(q.id)}
                            >
                              {regeneratingQuoteId === q.id ? '…' : 'Neue Version'}
                            </button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Rechnungen ───────────────────────────────────────── */}
      {!isNew && (
        <div className="admin-table-wrap" style={{ padding: 24, marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div className="admin-section-title" style={{ margin: 0 }}>Rechnungen</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
                <input type="checkbox" checked={useAcceptedQuote} onChange={e => setUseAcceptedQuote(e.target.checked)} />
                Aus akzeptierter Offerte
              </label>
              <button
                type="button"
                className="admin-btn admin-btn-sm admin-btn-primary"
                disabled={generatingInvoice}
                onClick={handleGenerateInvoice}
              >
                {generatingInvoice ? 'Wird erstellt…' : '+ Rechnung generieren'}
              </button>
            </div>
          </div>
          {invoices.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>Noch keine Rechnungen.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {groupByParent(invoices).map(group => {
                const latest = group[0]
                return (
                  <div key={latest.parent_id ?? latest.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, background: 'var(--surface-2)' }}>
                    {group.map((inv, idx) => (
                      <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 4px', borderTop: idx > 0 ? '1px dashed var(--border)' : 'none' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, minWidth: 32, color: idx === 0 ? 'var(--primary)' : 'var(--muted)' }}>V{inv.version}</span>
                        <span style={{ fontFamily: 'monospace', fontSize: 12, minWidth: 150 }}>{inv.invoice_number}</span>
                        <span className={`admin-badge ${INVOICE_STATUS_BADGE[inv.status] || 'admin-badge-draft'}`}>{INVOICE_STATUS_LABELS[inv.status] || inv.status}</span>
                        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{fmtDate(inv.created_at)}</span>
                        <span style={{ flex: 1, textAlign: 'right', fontWeight: 600, fontSize: 13 }}>{fmtCHF(inv.total_amount)}</span>
                        {inv.pdf_url && (
                          <a href={inv.pdf_url} target="_blank" rel="noreferrer" className="admin-btn admin-btn-secondary admin-btn-sm">PDF</a>
                        )}
                        {idx === 0 && (inv.status === 'ausstehend' || inv.status === 'offen' || inv.status === 'gesendet') && (
                          <button className="admin-btn admin-btn-success admin-btn-sm" onClick={() => handleMarkInvoicePaid(inv.id)}>Bezahlt</button>
                        )}
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Bestellfreigabe / Visierung ──────────────────────── */}
      {!isNew && (
        <div className="admin-table-wrap" style={{ padding: 24, marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div className="admin-section-title" style={{ margin: 0 }}>Bestellfreigabe / Visierung</div>
            <button
              type="button"
              className="admin-btn admin-btn-sm admin-btn-primary"
              onClick={() => setShowApprovalForm(true)}
            >
              + Neue Bestellfreigabe
            </button>
          </div>
          {approvals.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>Noch keine Freigaben angefragt.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {approvals.map(a => {
                const isApprover = !!currentUserId && a.approver_user_id === currentUserId
                const isCreator = !!currentUserId && a.requested_by_user_id === currentUserId
                return (
                  <div key={a.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, background: 'var(--surface-2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{a.title}</span>
                      <span className={`admin-badge ${APPROVAL_STATUS_BADGE[a.status]}`}>{APPROVAL_STATUS_LABELS[a.status]}</span>
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>{fmtDate(a.created_at)}</span>
                      {a.file_url && (
                        <a href={a.file_url} target="_blank" rel="noreferrer" className="admin-btn admin-btn-secondary admin-btn-sm" style={{ marginLeft: 'auto' }}>
                          📎 {a.filename}
                        </a>
                      )}
                    </div>
                    <div style={{ marginTop: 6, fontSize: 12, color: 'var(--muted)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      <span>Eingereicht von <strong>{a.requested_by_name ?? '—'}</strong></span>
                      <span>Freigeber: <strong>{a.approver_name ?? '—'}</strong></span>
                      {a.decided_at && (
                        <span>Entschieden am {fmtDate(a.decided_at)}</span>
                      )}
                    </div>
                    {a.decision_note && (
                      <div style={{ marginTop: 6, fontSize: 12, fontStyle: 'italic', color: 'var(--muted)' }}>
                        Notiz: {a.decision_note}
                      </div>
                    )}
                    {a.status === 'pending' && (isApprover || isCreator) && (
                      <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                        {isApprover && (
                          <>
                            <button
                              className="admin-btn admin-btn-success admin-btn-sm"
                              disabled={decidingApprovalId === a.id}
                              onClick={() => handleDecideApproval(a.id, 'approve')}
                            >
                              {decidingApprovalId === a.id ? '…' : 'Freigeben'}
                            </button>
                            <button
                              className="admin-btn admin-btn-danger admin-btn-sm"
                              disabled={decidingApprovalId === a.id}
                              onClick={() => handleDecideApproval(a.id, 'reject')}
                            >
                              Ablehnen
                            </button>
                          </>
                        )}
                        {isCreator && !isApprover && (
                          <button
                            className="admin-btn admin-btn-secondary admin-btn-sm"
                            onClick={() => handleDeleteApproval(a.id)}
                          >
                            Löschen
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Dialog: Neue Bestellfreigabe ─────────────────────── */}
      {showApprovalForm && project && (
        <div className="admin-confirm-overlay">
          <div className="admin-confirm-box" style={{ maxWidth: 520 }}>
            <form onSubmit={handleCreateApproval}>
              <div className="admin-confirm-title">Neue Bestellfreigabe</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
                <div className="admin-form-group">
                  <label className="admin-form-label">Titel *</label>
                  <input
                    className="admin-form-input"
                    value={approvalTitle}
                    onChange={e => setApprovalTitle(e.target.value)}
                    placeholder="z.B. Materialbestellung Kabel"
                    required
                  />
                </div>
                <div className="admin-form-group">
                  <label className="admin-form-label">Freigeber *</label>
                  <select
                    className="admin-form-select"
                    value={approvalApproverUserId}
                    onChange={e => setApprovalApproverUserId(e.target.value)}
                    required
                  >
                    <option value="">— auswählen —</option>
                    {staff
                      .filter(s => !!s.authorized_user_id)
                      .map(s => (
                        <option key={s.id} value={s.authorized_user_id!}>{s.name}</option>
                      ))}
                  </select>
                </div>
                <div className="admin-form-group">
                  <label className="admin-form-label">Dokument (PDF oder Bild) *</label>
                  <input
                    ref={approvalFileInputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={e => setApprovalFile(e.target.files?.[0] ?? null)}
                    required
                  />
                </div>
              </div>
              <div className="admin-confirm-actions">
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary"
                  onClick={() => { setShowApprovalForm(false); setApprovalTitle(''); setApprovalApproverUserId(''); setApprovalFile(null) }}
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  className="admin-btn admin-btn-primary"
                  disabled={creatingApproval || !approvalTitle.trim() || !approvalApproverUserId || !approvalFile}
                >
                  {creatingApproval ? 'Sende…' : 'Freigabe anfragen'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Dialog: Neue Offerte ─────────────────────────────── */}
      {showQuoteForm && project && (
        <div className="admin-confirm-overlay">
          <div className="admin-confirm-box" style={{ maxWidth: 920, maxHeight: '90vh', overflow: 'auto' }}>
            <QuoteCreateForm
              lockedProjectName={project.name}
              onDone={() => { setShowQuoteForm(false); reloadQuotes() }}
              onCancel={() => setShowQuoteForm(false)}
            />
          </div>
        </div>
      )}

      {/* ── Kommentare ───────────────────────────────────────── */}
      {!isNew && (
        <div className="admin-table-wrap" style={{ padding: 24, marginTop: 20 }}>
          <div className="admin-section-title" style={{ marginBottom: 14 }}>Kommentare</div>
          {comments.length === 0 && (
            <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>Noch keine Kommentare.</div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
            {comments.map(c => (
              <div key={c.id} style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{c.author_name || 'Unbekannt'}</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>{formatDateTime(c.created_at)}</span>
                </div>
                <div style={{ fontSize: 13 }}>{c.text}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="admin-form-input"
              style={{ flex: 1 }}
              placeholder="Kommentar hinzufügen…"
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleAddComment() } }}
            />
            <button
              type="button"
              className="admin-btn admin-btn-primary"
              disabled={addingComment || !newComment.trim()}
              onClick={handleAddComment}
            >
              {addingComment ? '…' : 'Senden'}
            </button>
          </div>
        </div>
      )}

      {/* ── Dialoge ──────────────────────────────────────────── */}
      {confirmClose && (
        <div className="admin-confirm-overlay">
          <div className="admin-confirm-box">
            <div className="admin-confirm-title">Projekt abschliessen?</div>
            <div className="admin-confirm-text">
              «{project?.name}» wird für Mitarbeiter ausgeblendet. Berichte bleiben erhalten.
            </div>
            <div className="admin-confirm-actions">
              <button className="admin-btn admin-btn-secondary" onClick={() => setConfirmClose(false)}>Abbrechen</button>
              <button className="admin-btn admin-btn-danger" onClick={handleClose} disabled={settingStatus}>
                {settingStatus ? 'Schliessen…' : 'Ja, abschliessen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmReopen && (
        <div className="admin-confirm-overlay">
          <div className="admin-confirm-box">
            <div className="admin-confirm-title">Projekt wiedereröffnen?</div>
            <div className="admin-confirm-text">
              Grund für die Wiedereröffnung von «{project?.name}»:
            </div>
            <div style={{ margin: '12px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
                <input
                  type="radio"
                  name="reopenReason"
                  value="fehler"
                  checked={reopenReason === 'fehler'}
                  onChange={() => setReopenReason('fehler')}
                />
                Fehler beim Abschluss
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
                <input
                  type="radio"
                  name="reopenReason"
                  value="garantiefall"
                  checked={reopenReason === 'garantiefall'}
                  onChange={() => setReopenReason('garantiefall')}
                />
                Garantiefall <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 4 }}>(Reparatur, als Garantie markiert)</span>
              </label>
            </div>
            <div className="admin-confirm-actions">
              <button className="admin-btn admin-btn-secondary" onClick={() => setConfirmReopen(false)}>Abbrechen</button>
              <button className="admin-btn admin-btn-primary" onClick={handleReopen} disabled={reopening}>
                {reopening ? 'Wird geöffnet…' : 'Wiedereröffnen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="admin-toast-container">
          <div className="admin-toast success">{toast}</div>
        </div>
      )}
    </div>
  )
}
