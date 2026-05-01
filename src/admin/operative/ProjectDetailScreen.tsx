import { useEffect, useRef, useState } from 'react'
import { apiFetch, apiFormFetch } from '../../api/client'
import { getMe } from '../../api/auth'
import { AddressAutocomplete } from '../components/AddressAutocomplete'
import { Kontakt, Project, Termin, DisposalDetails, projectBillingAddress, projectCustomerName } from './ProjectsScreen'
import { Customer } from './CustomersScreen'
import { QuoteCreateForm } from './QuotesScreen'
import { WORK_TYPES } from '../../api/workTypes'
import { ProjectStatus, PROJECT_STATUS_LABELS, PROJECT_STATUS_BADGE } from '../constants/statuses'
import { fmtDate } from '../utils/format'
import { ConfirmDialog } from '../components/ConfirmDialog'
import {
  DocumentsTab, QuotesTab, InvoicesTab, ApprovalsTab,
  ProjectFile, ProjectQuote, ProjectInvoice, ProjectApproval,
  formatDateTime,
} from './projectDetail/tabs'

interface StaffMember {
  id: string
  name: string
  projektleiter: boolean
  authorized_user_id: string | null
}

interface ProjectComment {
  id: string
  author_name: string | null
  text: string
  created_at: string
}

interface Props {
  project: Project | null
  onClose: () => void
  onSaved: () => void
}

export default function ProjectDetailScreen({ project, onClose, onSaved }: Props) {
  const isNew = !project

  const [name, setName] = useState(project?.name ?? '')
  const [customerId, setCustomerId] = useState(project?.customer_id ?? '')
  const [objectAddress, setObjectAddress] = useState(project?.object_address ?? '')
  const [localContactName, setLocalContactName] = useState(project?.local_contact_name ?? '')
  const [localContactPhone, setLocalContactPhone] = useState(project?.local_contact_phone ?? '')
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

  // Tab-Auswahl
  type ProjectTab = 'details' | 'documents' | 'quotes' | 'invoices' | 'approvals'
  const [activeTab, setActiveTab] = useState<ProjectTab>('details')

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
    document.querySelector('.admin-content')?.scrollTo({ top: 0 })
  }, [])

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
    if (!objectAddress) setObjectAddress(c.object_address || c.billing_address || c.address || '')
    if (!localContactName) setLocalContactName(c.local_contact_name ?? '')
    if (!localContactPhone) setLocalContactPhone(c.local_contact_phone ?? '')
  }

  const selectedCustomer = customers.find(c => c.id === customerId) ?? null
  const billingRecipient = selectedCustomer
    ? (selectedCustomer.billing_name || selectedCustomer.name)
    : (project ? projectCustomerName(project) : '')
  const billingAddress = selectedCustomer
    ? (selectedCustomer.billing_address || selectedCustomer.address || '')
    : (project ? projectBillingAddress(project) : '')

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
    setKontakte(prev => [...prev, { name: '', kommentar: '', telefon: '', email: '' }])
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
          object_address: objectAddress || null,
          local_contact_name: localContactName || null,
          local_contact_phone: localContactPhone || null,
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

      {/* ── Tab-Leiste ──────────────────────────────────────── */}
      {!isNew && (
        <div className="kpi-admin-tabs" style={{ marginBottom: 20 }}>
          <button type="button" className={`kpi-admin-tab ${activeTab === 'details' ? 'active' : ''}`} onClick={() => setActiveTab('details')}>Projekt Details</button>
          <button type="button" className={`kpi-admin-tab ${activeTab === 'documents' ? 'active' : ''}`} onClick={() => setActiveTab('documents')}>Dokumente</button>
          <button type="button" className={`kpi-admin-tab ${activeTab === 'quotes' ? 'active' : ''}`} onClick={() => setActiveTab('quotes')}>Offerten</button>
          <button type="button" className={`kpi-admin-tab ${activeTab === 'invoices' ? 'active' : ''}`} onClick={() => setActiveTab('invoices')}>Rechnungen</button>
          <button type="button" className={`kpi-admin-tab ${activeTab === 'approvals' ? 'active' : ''}`} onClick={() => setActiveTab('approvals')}>Visierung</button>
        </div>
      )}

      {(isNew || activeTab === 'details') && (
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

          {/* ── Kunde & Adressen ──────────────────────────────── */}
          <div className="admin-table-wrap" style={{ padding: 24, overflow: 'visible' }}>
            <div className="admin-section-title">Kunde & Adressen</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="admin-form-group">
                <label className="admin-form-label">Kunde (Rechnungsempfänger)</label>
                <select
                  className="admin-form-select"
                  value={customerId}
                  onChange={e => handleSelectCustomer(e.target.value)}
                >
                  <option value="">— kein Kunde zugeordnet —</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name}{c.billing_address ? ` · ${c.billing_address}` : c.address ? ` · ${c.address}` : ''}</option>
                  ))}
                </select>
                {customerId && (
                  <div style={{ marginTop: 6, padding: '8px 12px', background: 'var(--bg-subtle, #f5f5f5)', borderRadius: 6, fontSize: 13, color: 'var(--muted)' }}>
                    <strong>Rechnung an:</strong> {billingRecipient || '—'}{billingAddress ? `, ${billingAddress}` : ''}
                  </div>
                )}
              </div>

              <div className="admin-form-group">
                <label className="admin-form-label">Objektadresse (Baustelle)</label>
                <AddressAutocomplete className="admin-form-input" value={objectAddress} onChange={setObjectAddress} />
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  Wird beim Auswählen des Kunden als Vorschlag übernommen und kann pro Projekt überschrieben werden.
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div className="admin-form-group">
                  <label className="admin-form-label">Lokaler Kontakt — Name</label>
                  <input className="admin-form-input" value={localContactName} onChange={e => setLocalContactName(e.target.value)} placeholder="z.B. Hauswart" />
                </div>
                <div className="admin-form-group">
                  <label className="admin-form-label">Lokaler Kontakt — Telefon</label>
                  <input className="admin-form-input" value={localContactPhone} onChange={e => setLocalContactPhone(e.target.value)} />
                </div>
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
                  <label className="admin-form-label">Kommentar</label>
                  <input className="admin-form-input" value={k.kommentar} onChange={e => updateKontakt(i, 'kommentar', e.target.value)} placeholder="z.B. Hausabwart" />
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
      )}

      {/* ── Dateien ──────────────────────────────────────────── */}
      {!isNew && activeTab === 'documents' && (
        <DocumentsTab
          files={files}
          uploading={uploading}
          fileInputRef={fileInputRef}
          onUpload={handleUpload}
          onDelete={handleDeleteFile}
        />
      )}

      {!isNew && activeTab === 'quotes' && (
        <QuotesTab
          quotes={quotes}
          regeneratingQuoteId={regeneratingQuoteId}
          onShowCreateForm={() => setShowQuoteForm(true)}
          onUpdateStatus={handleUpdateQuoteStatus}
          onRegenerate={handleRegenerateQuote}
        />
      )}

      {!isNew && activeTab === 'invoices' && (
        <InvoicesTab
          invoices={invoices}
          useAcceptedQuote={useAcceptedQuote}
          generatingInvoice={generatingInvoice}
          onUseAcceptedQuoteChange={setUseAcceptedQuote}
          onGenerateInvoice={handleGenerateInvoice}
          onMarkPaid={handleMarkInvoicePaid}
        />
      )}

      {!isNew && activeTab === 'approvals' && (
        <ApprovalsTab
          approvals={approvals}
          currentUserId={currentUserId}
          decidingApprovalId={decidingApprovalId}
          onShowCreateForm={() => setShowApprovalForm(true)}
          onDecide={handleDecideApproval}
          onDelete={handleDeleteApproval}
        />
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
      {!isNew && activeTab === 'details' && (
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
        <ConfirmDialog
          title="Projekt abschliessen?"
          message={<>«{project?.name}» wird für Mitarbeiter ausgeblendet. Berichte bleiben erhalten.</>}
          confirmLabel="Ja, abschliessen"
          busyLabel="Schliessen…"
          busy={settingStatus}
          variant="danger"
          onCancel={() => setConfirmClose(false)}
          onConfirm={handleClose}
        />
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
