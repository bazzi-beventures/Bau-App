import { useEffect, useRef, useState } from 'react'
import { apiFetch, apiFormFetch } from '../../api/client'
import { getMe } from '../../api/auth'
import { isFeatureEnabled } from '../../api/modules'
import { AddressAutocomplete } from '../components/AddressAutocomplete'
import { Kontakt, Eigentuemer, Project, DisposalDetails, projectBillingAddress, projectCustomerName } from './ProjectsScreen'
import { Customer } from './CustomersScreen'
import { CustomerCombobox } from './CustomerCombobox'
import { QuoteCreateForm, QuoteEditForm, QuoteDetail, hasQuoteDraft } from './QuotesScreen'
import { WORK_TYPES } from '../../api/workTypes'
import { ProjectStatus, PROJECT_STATUS_LABELS, PROJECT_STATUS_BADGE } from '../constants/statuses'
import { fmtDate } from '../utils/format'
import { useVisibilityPolling } from '../../hooks/useVisibilityPolling'
import { ConfirmDialog } from '../components/ConfirmDialog'
import {
  DocumentsTab, SupplierDocumentsTab, QuotesTab, ReportsTab, InvoicesTab, ApprovalsTab, TasksTab,
  ProjectFile, ProjectFileCategory, ProjectQuote, ProjectReport, ProjectInvoice, ProjectApproval, ProjectTask,
  formatDateTime,
} from './projectDetail/tabs'

// Kommentare sind nach 10 Minuten gesperrt (kein Bearbeiten/Löschen mehr) —
// muss zur Backend-Sperre in db/project_comments.py (COMMENT_LOCK_SECONDS) passen.
const COMMENT_LOCK_MS = 10 * 60 * 1000

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
  updated_at?: string | null
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
  // Wurde die Objektadresse manuell bearbeitet? Dann beim Kundenwechsel NICHT überschreiben.
  // Eine nur automatisch (aus dem Kundenstamm) befüllte Adresse wird hingegen neu geseedet,
  // damit ein Kundenwechsel auch die Distanz (Offerten-Fahrspesen) neu berechnen lässt.
  const [objectAddressTouched, setObjectAddressTouched] = useState(!!project?.object_address)
  // Mehrfachauswahl: ein Projekt kann mehrere Leistungsarten tragen (z.B. Neumontage + Reparatur)
  const [artDerArbeit, setArtDerArbeit] = useState<string[]>(project?.art_der_arbeit ?? [])
  const toggleArt = (value: string) =>
    setArtDerArbeit(prev => prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value])
  const hasEntsorgungsart = artDerArbeit.includes('Demontage') || artDerArbeit.includes('Wiedermontage')
  const [bemerkung, setBemerkung] = useState(project?.bemerkung ?? '')
  const [geruestfach, setGeruestfach] = useState(project?.geruestfach?.toString() ?? '')
  const [showGeruestfach, setShowGeruestfach] = useState(false)
  const [projektleiterId, setProjektleiterId] = useState(project?.projektleiter_id ?? '')
  const [monteurIds, setMonteurIds] = useState<string[]>(project?.monteur_ids ?? [])
  // Einsatzplanung (Termin) – dieselben Felder wie im Kalender (ProjectScheduleScreen)
  const [startDate, setStartDate] = useState(project?.start_date?.slice(0, 10) ?? '')
  const [endDate, setEndDate] = useState(project?.end_date?.slice(0, 10) ?? '')
  const [startTime, setStartTime] = useState(project?.start_time?.slice(0, 5) ?? '')
  const [endTime, setEndTime] = useState(project?.end_time?.slice(0, 5) ?? '')
  const [kontakte, setKontakte] = useState<Kontakt[]>(project?.kontakte ?? [])
  // Eigentümer des Objekts — eigene Rolle, kein Kontakt. Kann pro Projekt ein Dritter sein.
  const EMPTY_EIGENTUEMER: Eigentuemer = { name: '', adresse: '', telefon: '', email: '' }
  const [eigentuemer, setEigentuemer] = useState<Eigentuemer>(project?.eigentuemer ?? EMPTY_EIGENTUEMER)
  const updateEigentuemer = (field: keyof Eigentuemer, value: string) =>
    setEigentuemer(prev => ({ ...prev, [field]: value }))
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
  const [uploadCategory, setUploadCategory] = useState<ProjectFileCategory | null>(null)
  const [confirmDeleteFileId, setConfirmDeleteFileId] = useState<string | null>(null)
  const [deletingFile, setDeletingFile] = useState(false)

  // Kommentare
  const [comments, setComments] = useState<ProjectComment[]>([])
  const [newComment, setNewComment] = useState('')
  const [addingComment, setAddingComment] = useState(false)
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editingCommentText, setEditingCommentText] = useState('')
  const [savingCommentEdit, setSavingCommentEdit] = useState(false)
  const [confirmDeleteCommentId, setConfirmDeleteCommentId] = useState<string | null>(null)
  const [deletingComment, setDeletingComment] = useState(false)
  // Tickt im Minutentakt, damit die 10-Min-Sperre der Kommentare ohne Reload greift.
  const [now, setNow] = useState(() => Date.now())

  // Offerten & Rechnungen
  const [quotes, setQuotes] = useState<ProjectQuote[]>([])
  const [invoices, setInvoices] = useState<ProjectInvoice[]>([])
  const [reports, setReports] = useState<ProjectReport[]>([])
  const [showQuoteForm, setShowQuoteForm] = useState(false)
  // Lokaler, noch nicht abgeschickter Offert-Entwurf für dieses Projekt vorhanden?
  // Steuert den «Entwurf fortsetzen»-Button. resumeQuoteDraft = Form gezielt zum
  // Fortsetzen geöffnet (übernimmt den Entwurf automatisch statt nur per Banner).
  const [quoteDraftExists, setQuoteDraftExists] = useState(() => hasQuoteDraft(project?.name ?? ''))
  const [resumeQuoteDraft, setResumeQuoteDraft] = useState(false)
  const [editQuote, setEditQuote] = useState<QuoteDetail | null>(null)
  const [generatingInvoice, setGeneratingInvoice] = useState(false)
  const [regeneratingQuoteId, setRegeneratingQuoteId] = useState<number | null>(null)
  const [useAcceptedQuote, setUseAcceptedQuote] = useState(false)
  const [sendQuote, setSendQuote] = useState<ProjectQuote | null>(null)
  const [sendEmail, setSendEmail] = useState('')
  const [sendingQuote, setSendingQuote] = useState(false)

  // Aufgaben (Checkliste)
  const [tasks, setTasks] = useState<ProjectTask[]>([])

  // Tab-Auswahl
  type ProjectTab = 'details' | 'documents' | 'supplier' | 'quotes' | 'reports' | 'invoices' | 'approvals' | 'tasks' | 'status'
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
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
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
    getMe().then(me => {
      setCurrentUserId(me.authorized_user_id)
      setShowGeruestfach(isFeatureEnabled(me, 'geruestfach'))
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!project) return
    apiFetch(`/pwa/admin/projects/${project.id}/files`).then(d => setFiles(d as ProjectFile[])).catch(() => {})
    reloadComments()
    reloadQuotes()
    reloadInvoices()
    reloadReports()
    reloadApprovals()
    reloadTasks()
  }, [project?.id])

  // Kommentare + Aufgaben bei jeder Rückkehr in die App (visibilitychange),
  // beim Online-Werden und alle 30 s neu laden — so sieht der Projektleiter neue
  // Einträge von Mitarbeitern ohne manuellen Reload. Die übrigen Projektdaten
  // (Dateien, Offerten, Rechnungen …) laden bewusst nur beim Öffnen/Projektwechsel.
  useVisibilityPolling(() => {
    reloadComments()
    reloadTasks()
  }, 30_000)

  async function reloadComments() {
    if (!project) return
    try {
      const d = await apiFetch(`/pwa/admin/projects/${project.id}/comments`) as ProjectComment[]
      setComments(d)
    } catch { /* ignore */ }
  }

  async function reloadTasks() {
    if (!project) return
    try {
      const d = await apiFetch(`/pwa/admin/projects/${project.id}/tasks`) as ProjectTask[]
      setTasks(d)
    } catch { /* ignore */ }
  }

  async function handleAddTask(text: string) {
    if (!project) return
    try {
      await apiFetch(`/pwa/admin/projects/${project.id}/tasks`, {
        method: 'POST',
        body: JSON.stringify({ text }),
      })
      await reloadTasks()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Fehler beim Anlegen')
    }
  }

  async function handleEditTask(taskId: string, text: string) {
    if (!project) return
    try {
      await apiFetch(`/pwa/admin/projects/${project.id}/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify({ text }),
      })
      await reloadTasks()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Fehler beim Speichern')
    }
  }

  async function handleDeleteTask(taskId: string) {
    if (!project) return
    if (!window.confirm('Aufgabe wirklich löschen?')) return
    try {
      await apiFetch(`/pwa/admin/projects/${project.id}/tasks/${taskId}`, { method: 'DELETE' })
      setTasks(prev => prev.filter(t => t.id !== taskId))
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Fehler beim Löschen')
    }
  }

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

  async function reloadReports() {
    if (!project) return
    try {
      const d = await apiFetch(`/pwa/admin/projects/${project.id}/reports`) as ProjectReport[]
      setReports(d)
    } catch { /* ignore */ }
  }

  async function handleEditQuote(quoteId: number) {
    // Detail (alle Positionen) frisch laden — die ProjectQuote-Liste trägt nur
    // die Kopfdaten, das Bearbeiten-Formular braucht die vollständige Offerte.
    try {
      const detail = await apiFetch(`/pwa/admin/quotes/${quoteId}`) as QuoteDetail
      setEditQuote(detail)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Fehler beim Laden der Offerte')
    }
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
    // Workaround: Solange die Mitarbeiter-PWA nicht ausgerollt ist, fehlen
    // unterschriebene Rapporte. In diesem Fall wird zwingend aus der Offerte
    // gerechnet — das Backend setzt dann automatisch created_without_report.
    const hasSigned = reports.some(r => r.signature_timestamp)
    const useQuote = useAcceptedQuote || !hasSigned
    setGeneratingInvoice(true)
    try {
      await apiFetch('/pwa/admin/invoices/generate', {
        method: 'POST',
        body: JSON.stringify({ project_name: project.name, use_quote: useQuote }),
      })
      showToast('Rechnung erstellt')
      await reloadInvoices()
      await reloadReports()
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

  function handleOpenSendQuote(q: ProjectQuote) {
    setSendEmail(q.customer_email || '')
    setSendQuote(q)
  }

  async function handleSendQuote() {
    if (!sendQuote || !sendEmail) return
    setSendingQuote(true)
    try {
      await apiFetch('/pwa/admin/quotes/send', {
        method: 'POST',
        body: JSON.stringify({ quote_id: sendQuote.id, recipient_email: sendEmail }),
      })
      showToast(`Offerte an ${sendEmail} gesendet`)
      setSendQuote(null)
      await reloadQuotes()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Versand fehlgeschlagen')
    } finally {
      setSendingQuote(false)
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

  async function handleSendInvoice(invoiceId: number, recipientEmail: string): Promise<boolean> {
    try {
      await apiFetch('/pwa/admin/invoices/send', {
        method: 'POST',
        body: JSON.stringify({ invoice_id: invoiceId, recipient_email: recipientEmail }),
      })
      showToast(`Rechnung an ${recipientEmail} gesendet`)
      await reloadInvoices()
      return true
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Versand fehlgeschlagen')
      return false
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
    if (!objectAddressTouched) setObjectAddress(c.object_address || c.billing_address || c.address || '')
    // Baustellenkontakt aus Kundenstamm seeden, falls noch keiner markiert ist
    // und der Kunde einen Standardkontakt hat.
    if ((c.local_contact_name || c.local_contact_phone) && !kontakte.some(k => k.is_site_contact)) {
      setKontakte(prev => [...prev, {
        name: c.local_contact_name ?? '',
        kommentar: 'Baustellenkontakt',
        telefon: c.local_contact_phone ?? '',
        email: '',
        is_site_contact: true,
      }])
    }
  }

  const selectedCustomer = customers.find(c => c.id === customerId) ?? null
  const billingRecipient = selectedCustomer
    ? (selectedCustomer.billing_name || selectedCustomer.name)
    : (project ? projectCustomerName(project) : '')
  const billingAddress = selectedCustomer
    ? (selectedCustomer.billing_address || selectedCustomer.address || '')
    : (project ? projectBillingAddress(project) : '')

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
  // Baustellenkontakt-Flag: mutually exclusive — Setzen entfernt das Flag bei
  // allen anderen, erneutes Klicken hebt es auf.
  function toggleSiteContact(i: number) {
    setKontakte(prev => {
      const wasSet = !!prev[i]?.is_site_contact
      return prev.map((k, idx) => ({
        ...k,
        is_site_contact: idx === i ? !wasSet : false,
      }))
    })
  }

  function toggleMonteur(id: string) {
    setMonteurIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    if (startDate && endDate && endDate < startDate) {
      setError('Enddatum muss nach Startdatum liegen.'); return
    }
    if (startTime && endTime && startDate === endDate && endTime < startTime) {
      setError('Endzeit muss nach Startzeit liegen.'); return
    }
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
          art_der_arbeit: artDerArbeit,
          bemerkung: bemerkung || null,
          geruestfach: geruestfach.trim() ? parseInt(geruestfach, 10) : null,
          projektleiter_id: projektleiterId || null,
          monteur_ids: monteurIds,
          start_date: startDate || null,
          end_date: endDate || null,
          start_time: startTime || null,
          end_time: endTime || null,
          kontakte,
          // Immer mitschicken (auch leer), damit ein geleertes Feld auch persistiert
          // wird — das Backend filtert null-Werte weg (kein Clear möglich).
          eigentuemer,
          disposal_details: hasEntsorgungsart && !disposalEmpty(disposal) ? disposal : null,
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
          body: JSON.stringify({ name: project.name, art_der_arbeit: Array.from(new Set([...artDerArbeit, 'Reparatur'])), is_warranty: true }),
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

  // Lädt direkt in die gegebene Kategorie hoch — aufgerufen aus dem Drag-&-Drop-Feld
  // bzw. dem Hochladen-Button der jeweiligen Sektion. uploadCategory dient hier nur
  // noch als "Wird hochgeladen…"-Markierung für die richtige Sektion.
  async function uploadFilesToCategory(category: ProjectFileCategory, filesToUpload: File[]) {
    if (!project || !filesToUpload.length) return
    setUploading(true)
    setUploadCategory(category)
    try {
      // Backend nimmt eine Datei pro Request → sequentiell hochladen
      for (const file of filesToUpload) {
        const form = new FormData()
        form.append('file', file)
        form.append('category', category)
        await apiFormFetch(`/pwa/admin/projects/${project.id}/files`, form)
      }
      const updated = await apiFetch(`/pwa/admin/projects/${project.id}/files`) as ProjectFile[]
      setFiles(updated)
      showToast(filesToUpload.length > 1 ? `${filesToUpload.length} Dateien hochgeladen` : 'Datei hochgeladen')
    } catch {
      setError('Fehler beim Hochladen')
    } finally {
      setUploading(false)
      setUploadCategory(null)
    }
  }

  async function handleDeleteFile() {
    if (!project || !confirmDeleteFileId) return
    setDeletingFile(true)
    try {
      await apiFetch(`/pwa/admin/projects/${project.id}/files/${confirmDeleteFileId}`, { method: 'DELETE' })
      setFiles(prev => prev.filter(f => f.id !== confirmDeleteFileId))
      setConfirmDeleteFileId(null)
    } catch {
      setError('Fehler beim Löschen')
    } finally {
      setDeletingFile(false)
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
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Fehler beim Speichern des Kommentars')
    } finally {
      setAddingComment(false)
    }
  }

  // Kommentar älter als 10 Min → gesperrt (Bearbeiten/Löschen ausgeblendet,
  // Backend lehnt es zusätzlich ab). now als State, damit die Sperre live greift.
  function commentLocked(c: ProjectComment): boolean {
    return now - new Date(c.created_at).getTime() > COMMENT_LOCK_MS
  }

  function startEditComment(c: ProjectComment) {
    setEditingCommentId(c.id)
    setEditingCommentText(c.text)
  }

  function cancelEditComment() {
    setEditingCommentId(null)
    setEditingCommentText('')
  }

  async function handleSaveEditComment() {
    if (!project || !editingCommentId || !editingCommentText.trim()) return
    setSavingCommentEdit(true)
    try {
      await apiFetch(`/pwa/admin/projects/${project.id}/comments/${editingCommentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ text: editingCommentText.trim() }),
      })
      const updated = await apiFetch(`/pwa/admin/projects/${project.id}/comments`) as ProjectComment[]
      setComments(updated)
      cancelEditComment()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Fehler beim Aktualisieren des Kommentars')
    } finally {
      setSavingCommentEdit(false)
    }
  }

  async function handleDeleteComment() {
    if (!project || !confirmDeleteCommentId) return
    setDeletingComment(true)
    try {
      await apiFetch(`/pwa/admin/projects/${project.id}/comments/${confirmDeleteCommentId}`, {
        method: 'DELETE',
      })
      setComments(prev => prev.filter(c => c.id !== confirmDeleteCommentId))
      setConfirmDeleteCommentId(null)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Fehler beim Löschen des Kommentars')
      setConfirmDeleteCommentId(null)
    } finally {
      setDeletingComment(false)
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
            {isNew ? 'Projektnummer wird nach dem Speichern automatisch vergeben' : (
              <>
                {project?.project_id_text && (
                  <span style={{ fontSize: 12, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                    Projekt-Nr. {project.project_id_text}
                  </span>
                )}
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
          <button type="button" className={`kpi-admin-tab ${activeTab === 'tasks' ? 'active' : ''}`} onClick={() => setActiveTab('tasks')}>Aufgaben</button>
          <button type="button" className={`kpi-admin-tab ${activeTab === 'documents' ? 'active' : ''}`} onClick={() => setActiveTab('documents')}>Dokumente</button>
          <button type="button" className={`kpi-admin-tab ${activeTab === 'supplier' ? 'active' : ''}`} onClick={() => setActiveTab('supplier')}>Lieferantendokumente</button>
          <button type="button" className={`kpi-admin-tab ${activeTab === 'quotes' ? 'active' : ''}`} onClick={() => setActiveTab('quotes')}>Offerten</button>
          <button type="button" className={`kpi-admin-tab ${activeTab === 'reports' ? 'active' : ''}`} onClick={() => setActiveTab('reports')}>Rapporte</button>
          <button type="button" className={`kpi-admin-tab ${activeTab === 'invoices' ? 'active' : ''}`} onClick={() => setActiveTab('invoices')}>Rechnungen</button>
          <button type="button" className={`kpi-admin-tab ${activeTab === 'approvals' ? 'active' : ''}`} onClick={() => setActiveTab('approvals')}>Visierung</button>
          <button type="button" className={`kpi-admin-tab ${activeTab === 'status' ? 'active' : ''}`} onClick={() => setActiveTab('status')}>Status</button>
        </div>
      )}

      {/* ── Inhalt: aktiver Tab links, Kommentare immer rechts ──── */}
      <div className={isNew ? undefined : 'project-detail-body'}>
      <div className="project-detail-main">

      {(isNew || activeTab === 'details') && (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 20, alignItems: 'start' }}>
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
                <label className="admin-form-label">Art der Arbeit <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(Mehrfachauswahl)</span></label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                  {WORK_TYPES.map(t => {
                    const active = artDerArbeit.includes(t.value)
                    return (
                      <label key={t.value} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, padding: '4px 10px', borderRadius: 6, background: active ? 'var(--primary)' : 'var(--surface-2)', color: active ? '#fff' : 'var(--text)', border: '1px solid', borderColor: active ? 'var(--primary)' : 'var(--border)' }}>
                        <input type="checkbox" style={{ display: 'none' }} checked={active} onChange={() => toggleArt(t.value)} />
                        {t.label}
                      </label>
                    )
                  })}
                </div>
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
              {showGeruestfach && (
                <div className="admin-form-group">
                  <label className="admin-form-label">Gerüstfach (Lagerort)</label>
                  <input
                    className="admin-form-input"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={geruestfach}
                    onChange={e => setGeruestfach(e.target.value)}
                    placeholder="z. B. 12"
                  />
                </div>
              )}
            </div>
          </div>

          {/* ── Kunde & Adressen ──────────────────────────────── */}
          <div className="admin-table-wrap" style={{ padding: 24, overflow: 'visible' }}>
            <div className="admin-section-title">Kunde & Adressen</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="admin-form-group">
                <label className="admin-form-label">Kunde (Rechnungsempfänger)</label>
                <CustomerCombobox
                  customers={customers}
                  value={customerId}
                  onChange={handleSelectCustomer}
                />
                {customerId && (
                  <div style={{ marginTop: 6, padding: '8px 12px', background: 'var(--bg-subtle, #f5f5f5)', borderRadius: 6, fontSize: 13, color: 'var(--muted)' }}>
                    <strong>Rechnung an:</strong> {billingRecipient || '—'}{billingAddress ? `, ${billingAddress}` : ''}
                  </div>
                )}
              </div>

              <div className="admin-form-group">
                <label className="admin-form-label">Objektadresse (Baustelle)</label>
                <AddressAutocomplete className="admin-form-input" value={objectAddress} onChange={v => { setObjectAddress(v); setObjectAddressTouched(true) }} />
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  Wird beim Auswählen des Kunden als Vorschlag übernommen und kann pro Projekt überschrieben werden.
                </div>
              </div>

            </div>
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
            {kontakte.length > 0 && (
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
                Stern markiert den <strong>Baustellenkontakt</strong> — diese Person sieht der Monteur ganz oben und sie wird auf Offerte/Rechnung gedruckt.
              </div>
            )}
            {kontakte.map((k, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: 'auto 2fr 1fr 1fr 2fr auto', gap: 10, marginBottom: 10, alignItems: 'end' }}>
                <button
                  type="button"
                  onClick={() => toggleSiteContact(i)}
                  title={k.is_site_contact ? 'Baustellenkontakt — klicken zum Aufheben' : 'Als Baustellenkontakt markieren'}
                  style={{
                    width: 36, height: 36, marginBottom: 1,
                    borderRadius: 8, cursor: 'pointer',
                    border: '1px solid', borderColor: k.is_site_contact ? 'var(--primary)' : 'var(--border)',
                    background: k.is_site_contact ? 'var(--primary)' : 'transparent',
                    color: k.is_site_contact ? '#fff' : 'var(--muted)',
                    fontSize: 18, lineHeight: 1, padding: 0,
                  }}
                >
                  {k.is_site_contact ? '★' : '☆'}
                </button>
                <div className="admin-form-group" style={{ margin: 0 }}>
                  <label className="admin-form-label">Name</label>
                  {/* autoComplete mit unbekanntem Token: verhindert, dass Chrome/Edge das leere
                      Feld ungefragt mit dem Browser-Profilnamen (z.B. "Luca Bazzi") befüllt. */}
                  <input className="admin-form-input" autoComplete="new-kontakt-name" value={k.name} onChange={e => updateKontakt(i, 'name', e.target.value)} />
                </div>
                <div className="admin-form-group" style={{ margin: 0 }}>
                  <label className="admin-form-label">Kommentar</label>
                  <input className="admin-form-input" autoComplete="new-kontakt-kommentar" value={k.kommentar} onChange={e => updateKontakt(i, 'kommentar', e.target.value)} placeholder="z.B. Hausabwart" />
                </div>
                <div className="admin-form-group" style={{ margin: 0 }}>
                  <label className="admin-form-label">Telefon</label>
                  <input className="admin-form-input" autoComplete="new-kontakt-telefon" value={k.telefon} onChange={e => updateKontakt(i, 'telefon', e.target.value)} />
                </div>
                <div className="admin-form-group" style={{ margin: 0 }}>
                  <label className="admin-form-label">E-Mail</label>
                  <input className="admin-form-input" autoComplete="new-kontakt-email" type="email" value={k.email} onChange={e => updateKontakt(i, 'email', e.target.value)} />
                </div>
                <button type="button" className="admin-btn admin-btn-sm admin-btn-danger" style={{ marginBottom: 1 }} onClick={() => removeKontakt(i)}>
                  ✕
                </button>
              </div>
            ))}
          </div>

          {/* ── Eigentümer ────────────────────────────────────── */}
          <div className="admin-table-wrap" style={{ padding: 24 }}>
            <div className="admin-section-title">Eigentümer</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>
              Optional: Eigentümer des Objekts — eine <strong>eigene Rolle</strong>, unabhängig von
              Auftraggeber, Rechnungsempfänger und Baustellenkontakt. Wird auf Offerte und Rechnung gedruckt.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr', gap: 14 }}>
              <div className="admin-form-group" style={{ margin: 0 }}>
                <label className="admin-form-label">Name</label>
                <input className="admin-form-input" autoComplete="new-eigentuemer-name" value={eigentuemer.name} onChange={e => updateEigentuemer('name', e.target.value)} placeholder="z.B. Erika Muster / Eigentümergemeinschaft" />
              </div>
              <div className="admin-form-group" style={{ margin: 0 }}>
                <label className="admin-form-label">Adresse</label>
                <input className="admin-form-input" autoComplete="new-eigentuemer-adresse" value={eigentuemer.adresse} onChange={e => updateEigentuemer('adresse', e.target.value)} placeholder="Strasse Nr, PLZ Ort" />
              </div>
              <div className="admin-form-group" style={{ margin: 0 }}>
                <label className="admin-form-label">Telefon</label>
                <input className="admin-form-input" autoComplete="new-eigentuemer-telefon" value={eigentuemer.telefon} onChange={e => updateEigentuemer('telefon', e.target.value)} />
              </div>
              <div className="admin-form-group" style={{ margin: 0 }}>
                <label className="admin-form-label">E-Mail</label>
                <input className="admin-form-input" autoComplete="new-eigentuemer-email" type="email" value={eigentuemer.email} onChange={e => updateEigentuemer('email', e.target.value)} />
              </div>
            </div>
          </div>

          {/* ── Entsorgung (bei Demontage / Wiedermontage) ────── */}
          {hasEntsorgungsart && (
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

          {/* ── Einsatzplanung (Zuständigkeiten + Termin) ─────── */}
          <div className="admin-table-wrap" style={{ padding: 24 }}>
            <div className="admin-section-title">Einsatzplanung</div>
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

              {/* ── Termin (wie im Einsatz-Kalender) ───────────── */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 2 }}>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
                  Termin festlegen, damit das Projekt im Einsatz-Kalender erscheint. Leer lassen = kein Termin.
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div className="admin-form-group" style={{ margin: 0 }}>
                    <label className="admin-form-label">Start (Datum)</label>
                    <input className="admin-form-input" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                  </div>
                  <div className="admin-form-group" style={{ margin: 0 }}>
                    <label className="admin-form-label">Ende (Datum)</label>
                    <input className="admin-form-input" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                  </div>
                  <div className="admin-form-group" style={{ margin: 0 }}>
                    <label className="admin-form-label">Startzeit</label>
                    <input className="admin-form-input" type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
                  </div>
                  <div className="admin-form-group" style={{ margin: 0 }}>
                    <label className="admin-form-label">Endzeit</label>
                    <input className="admin-form-input" type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
                  </div>
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
      </div>
      )}

      {/* ── Dateien ──────────────────────────────────────────── */}
      {!isNew && activeTab === 'documents' && (
        <DocumentsTab
          files={files}
          uploading={uploading}
          uploadingCategory={uploadCategory}
          onUpload={uploadFilesToCategory}
          onDelete={setConfirmDeleteFileId}
        />
      )}

      {!isNew && activeTab === 'supplier' && (
        <SupplierDocumentsTab
          files={files}
          uploading={uploading}
          uploadingCategory={uploadCategory}
          onUpload={uploadFilesToCategory}
          onDelete={setConfirmDeleteFileId}
        />
      )}

      {!isNew && activeTab === 'quotes' && (
        <QuotesTab
          quotes={quotes}
          invoices={invoices}
          regeneratingQuoteId={regeneratingQuoteId}
          hasLocalDraft={quoteDraftExists}
          onShowCreateForm={() => { setResumeQuoteDraft(false); setShowQuoteForm(true) }}
          onResumeDraft={() => { setResumeQuoteDraft(true); setShowQuoteForm(true) }}
          onUpdateStatus={handleUpdateQuoteStatus}
          onRegenerate={handleRegenerateQuote}
          onSend={handleOpenSendQuote}
          onEdit={handleEditQuote}
        />
      )}

      {!isNew && activeTab === 'reports' && (
        <ReportsTab reports={reports} />
      )}

      {!isNew && activeTab === 'invoices' && (
        <InvoicesTab
          invoices={invoices}
          useAcceptedQuote={useAcceptedQuote}
          generatingInvoice={generatingInvoice}
          defaultEmail={selectedCustomer?.email ?? project?.customer?.email ?? ''}
          hasSignedReport={reports.some(r => r.signature_timestamp)}
          onUseAcceptedQuoteChange={setUseAcceptedQuote}
          onGenerateInvoice={handleGenerateInvoice}
          onMarkPaid={handleMarkInvoicePaid}
          onSendInvoice={handleSendInvoice}
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

      {!isNew && activeTab === 'tasks' && (
        <TasksTab
          tasks={tasks}
          onAdd={handleAddTask}
          onEdit={handleEditTask}
          onDelete={handleDeleteTask}
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
              autoRestoreDraft={resumeQuoteDraft}
              onDone={() => { setShowQuoteForm(false); setResumeQuoteDraft(false); setQuoteDraftExists(hasQuoteDraft(project.name)); reloadQuotes() }}
              onCancel={() => { setShowQuoteForm(false); setResumeQuoteDraft(false); setQuoteDraftExists(hasQuoteDraft(project.name)) }}
            />
          </div>
        </div>
      )}

      {/* ── Dialog: Offerte bearbeiten (nur Entwürfe) ────────── */}
      {/* Klick ausserhalb (auf das Overlay) verlässt die Maske ohne zu speichern.
          Das PDF entsteht erst beim Speichern — Verlassen erzeugt nichts. Wieder
          rein kommt man per Klick auf den Entwurf in der Liste. */}
      {editQuote && (
        <div className="admin-confirm-overlay" onClick={() => setEditQuote(null)}>
          <div className="admin-confirm-box" style={{ maxWidth: 920, maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
            <QuoteEditForm
              quote={editQuote}
              onDone={() => { setEditQuote(null); reloadQuotes() }}
              onCancel={() => setEditQuote(null)}
            />
          </div>
        </div>
      )}

      {/* ── Status (eigener Tab) ──────────────────────────────── */}
      {/* Nur noch die Status-Aktion (Abschliessen/Wiedereröffnen).
          Kommentare stehen tab-unabhängig in der rechten Seitenleiste. */}
      {!isNew && activeTab === 'status' && (
        <div className="admin-table-wrap" style={{ padding: 20, maxWidth: 360 }}>
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
      )}

      </div>{/* /project-detail-main */}

      {/* ── Kommentare: immer rechts, unabhängig vom aktiven Tab ── */}
      {!isNew && (
        <div className="admin-table-wrap project-detail-comments" style={{ padding: 24 }}>
          <div className="admin-section-title" style={{ marginBottom: 14 }}>Kommentare</div>
            {comments.length === 0 && (
              <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>Noch keine Kommentare.</div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
              {comments.map(c => {
                const isEditing = editingCommentId === c.id
                const locked = commentLocked(c)
                return (
                  <div key={c.id} style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                    {/* Schmale Seitenleiste (340px): Name + Datum zusammenhalten,
                        Aktionen als rechtsbündige Gruppe, die als Einheit in eine
                        zweite Zeile umbricht – statt den Namen zu zerquetschen. */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 8px', marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>{c.author_name || 'Unbekannt'}</span>
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                        {formatDateTime(c.created_at)}
                        {c.updated_at ? ' · bearbeitet' : ''}
                      </span>
                      {!isEditing && !locked && (
                        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <button
                            type="button"
                            className="admin-btn admin-btn-sm admin-btn-secondary"
                            onClick={() => startEditComment(c)}
                          >Bearbeiten</button>
                          <button
                            type="button"
                            className="admin-btn admin-btn-sm admin-btn-danger"
                            onClick={() => setConfirmDeleteCommentId(c.id)}
                          >Löschen</button>
                        </div>
                      )}
                      {!isEditing && locked && (
                        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)' }} title="Nach 10 Minuten gesperrt – fester Eintrag">🔒</span>
                      )}
                    </div>
                    {isEditing ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <textarea
                          className="admin-form-input"
                          rows={2}
                          value={editingCommentText}
                          onChange={e => setEditingCommentText(e.target.value)}
                          style={{ resize: 'vertical' }}
                        />
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            className="admin-btn admin-btn-sm admin-btn-secondary"
                            onClick={cancelEditComment}
                            disabled={savingCommentEdit}
                          >Abbrechen</button>
                          <button
                            type="button"
                            className="admin-btn admin-btn-sm admin-btn-primary"
                            onClick={handleSaveEditComment}
                            disabled={savingCommentEdit || !editingCommentText.trim()}
                          >{savingCommentEdit ? 'Speichern…' : 'Speichern'}</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{c.text}</div>
                    )}
                  </div>
                )
              })}
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
                {addingComment ? '…' : 'Speichern'}
              </button>
            </div>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 12 }}>
              Kommentare lassen sich 10 Minuten lang bearbeiten oder löschen – danach sind sie ein fester Eintrag.
            </p>
          </div>
      )}

      </div>{/* /project-detail-body */}

      {confirmDeleteFileId && (
        <ConfirmDialog
          title="Dokument löschen?"
          message={<>«{files.find(f => f.id === confirmDeleteFileId)?.filename ?? 'Diese Datei'}» wird dauerhaft entfernt.</>}
          confirmLabel="Ja, löschen"
          busyLabel="Löschen…"
          busy={deletingFile}
          variant="danger"
          onCancel={() => setConfirmDeleteFileId(null)}
          onConfirm={handleDeleteFile}
        />
      )}

      {confirmDeleteCommentId && (
        <ConfirmDialog
          title="Kommentar löschen?"
          message={<>Der Kommentar wird dauerhaft entfernt.</>}
          confirmLabel="Ja, löschen"
          busyLabel="Löschen…"
          busy={deletingComment}
          variant="danger"
          onCancel={() => setConfirmDeleteCommentId(null)}
          onConfirm={handleDeleteComment}
        />
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

      {sendQuote && (
        <div className="admin-confirm-overlay">
          <div className="admin-confirm-box" style={{ maxWidth: 440 }}>
            <div className="admin-confirm-title">Offerte senden</div>
            <div className="admin-confirm-text" style={{ marginBottom: 12 }}>
              {sendQuote.quote_number}<br />
              {sendQuote.status === 'gesendet' && (
                <span style={{ color: 'var(--muted)', fontSize: 12 }}>
                  Wurde bereits versendet — erneuter Versand erzeugt neue Annahme-/Ablehnen-Links.
                </span>
              )}
            </div>
            <div style={{ marginBottom: 12 }}>
              <label className="admin-form-label">Empfänger E-Mail</label>
              <input
                className="admin-form-input"
                type="email"
                value={sendEmail}
                onChange={e => setSendEmail(e.target.value)}
                placeholder="kunde@example.com"
              />
            </div>
            <div className="admin-confirm-actions">
              <button className="admin-btn admin-btn-secondary" onClick={() => setSendQuote(null)} disabled={sendingQuote}>Abbrechen</button>
              <button className="admin-btn admin-btn-primary" onClick={handleSendQuote} disabled={!sendEmail || sendingQuote}>
                {sendingQuote ? 'Wird gesendet…' : 'Offerte senden'}
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
