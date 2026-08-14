import { useEffect, useRef, useState } from 'react'
import { apiFetch, apiFormFetch, apiUrl } from '../../api/client'
import { getMe } from '../../api/auth'
import { getFeature, hasModule, isFeatureEnabled } from '../../api/modules'
import {
  createAppointment, deleteAppointment, getProjectAppointments, setProjectBeschaffung, updateAppointment,
} from '../../api/admin'
import {
  AppointmentDraft, apptToDraft, diffAppointments, draftPayload, normalizeDrafts, validateDrafts,
} from './projectAppointments'
import AppointmentsCard from './projectDetail/AppointmentsCard'
import { BeschaffungStep, beschaffungStep, daysSince, enabledBeschaffungSteps } from '../constants/beschaffungSteps'
import { AddressAutocomplete } from '../../shared/AddressAutocomplete'
import { Kontakt, Eigentuemer, Project, DisposalDetails, projectBillingAddress, projectCustomerName } from './ProjectsScreen'
import { Customer } from './CustomersScreen'
import { CustomerCombobox } from './CustomerCombobox'
import { QuoteCreateForm, QuoteEditForm, QuoteDetail, hasQuoteDraft } from './QuotesScreen'
import { invoiceWarningHint, sammelrechnungHint } from './InvoicesScreen'
import { ReportCreateForm } from './ReportCreateForm'
import { SendQuoteDialog } from './SendQuoteDialog'
import { SendThankyouDialog } from './SendThankyouDialog'
import { WORK_TYPES } from '../../api/workTypes'
import { ProjectStatus, PROJECT_STATUS_LABELS, PROJECT_STATUS_BADGE } from '../constants/statuses'
import { fmtDate } from '../utils/format'
import { useVisibilityPolling } from '../../hooks/useVisibilityPolling'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { UnsavedChangesDialog } from '../components/UnsavedChangesDialog'
import { useUnsavedChangesGuard } from '../unsavedChanges'
import {
  DocumentsTab, SupplierDocumentsTab, QuotesTab, ReportsTab, InvoicesTab, ApprovalsTab, TasksTab,
  ProjectFile, ProjectFileCategory, ProjectQuote, ProjectReport, ProjectInvoice, ProjectApproval, ProjectTask,
  formatDateTime,
} from './projectDetail/tabs'

// Kommentare sind nach 10 Minuten gesperrt (kein Bearbeiten/Löschen mehr) —
// muss zur Backend-Sperre in db/project_comments.py (COMMENT_LOCK_SECONDS) passen.
const COMMENT_LOCK_MS = 10 * 60 * 1000

// Ein Rapport taugt als Rechnungsbasis, wenn er vom Kunden unterschrieben ODER
// manuell vom Projektleiter erfasst wurde (source 'admin_manual' — per Design
// ohne Unterschrift, das Backend behandelt ihn trotzdem als verrechnungsreif).
// Steuert die use_quote-Heuristik und den „kein Rapport"-Warnhinweis, damit ein
// manuell erfasster Rapport tatsächlich aus dem Rapport (nicht der Offerte)
// verrechnet wird.
export function hasBillableReport(
  reports: Pick<ProjectReport, 'signature_timestamp' | 'source'>[],
): boolean {
  return reports.some(r => !!r.signature_timestamp || r.source === 'admin_manual')
}

const EMPTY_EIGENTUEMER: Eigentuemer = { name: '', adresse: '', telefon: '', email: '' }
const EMPTY_DISPOSAL: DisposalDetails = { material: '', menge: '', entsorger: '', nachweis_url: '', bemerkung: '' }

/**
 * Alle Felder der Projektmaske, die `handleSave` persistiert — und nur die.
 * Referenz für die „ungespeicherte Änderungen"-Abfrage beim Verlassen der Maske:
 * Der Ausgangsstand kommt aus `initialProjectForm(project)`, derselben Quelle wie
 * die useState-Initialwerte, damit beide nie auseinanderlaufen.
 */
export interface ProjectFormValues {
  name: string
  customerId: string
  objectName: string
  objectAddress: string
  billingDiffers: boolean
  billingName: string
  billingAddress: string
  artDerArbeit: string[]
  bemerkung: string
  geruestfach: string
  projektleiterId: string
  monteurIds: string[]
  /**
   * Termine des Projekts (project_appointments) als Entwürfe — mehrere je
   * Projekt, jeder mit eigenem Typ und optionalem eigenem Team. Sie liegen NICHT
   * auf der projects-Zeile: `initialProjectForm` startet deshalb leer, die
   * geladenen Termine ziehen den Ausgangsstand nach (siehe useEffect unten).
   * Die Legacy-Spalten start_date/end_date/start_time/end_time spiegelt der
   * Server aus dem Ersttermin — die Maske schreibt sie nicht mehr selbst.
   */
  appointments: AppointmentDraft[]
  kontakte: Kontakt[]
  eigentuemer: Eigentuemer
  disposal: DisposalDetails
  wartungInterval: string
  wartungLastAt: string
  wartungNextDueAt: string
}

export function initialProjectForm(project: Project | null): ProjectFormValues {
  return {
    name: project?.name ?? '',
    customerId: project?.customer_id ?? '',
    objectName: project?.object_name ?? '',
    objectAddress: project?.object_address ?? '',
    billingDiffers: !!(project?.billing_name || project?.billing_address),
    billingName: project?.billing_name ?? '',
    billingAddress: project?.billing_address ?? '',
    artDerArbeit: project?.art_der_arbeit ?? [],
    bemerkung: project?.bemerkung ?? '',
    geruestfach: project?.geruestfach?.toString() ?? '',
    projektleiterId: project?.projektleiter_id ?? '',
    monteurIds: project?.monteur_ids ?? [],
    appointments: [],
    kontakte: project?.kontakte ?? [],
    eigentuemer: project?.eigentuemer ?? EMPTY_EIGENTUEMER,
    disposal: project?.disposal_details ?? EMPTY_DISPOSAL,
    wartungInterval: project?.wartung_interval_months?.toString() ?? '',
    wartungLastAt: project?.wartung_last_at ?? '',
    wartungNextDueAt: project?.wartung_next_due_at ?? '',
  }
}

// Kanonische Form für den Vergleich: feste Feldreihenfolge, sortierte
// Mehrfachauswahlen und aufgefüllte Optionalfelder. Ohne das gälte die Maske
// schon als geändert, wenn ein Monteur ab- und wieder angewählt wird oder eine
// vom Server ohne `is_site_contact` gelieferte Zeile einmal angefasst wurde.
function normalizeForm(v: ProjectFormValues) {
  return {
    ...v,
    artDerArbeit: [...v.artDerArbeit].sort(),
    monteurIds: [...v.monteurIds].sort(),
    appointments: normalizeDrafts(v.appointments),
    kontakte: v.kontakte.map(k => ({
      name: k.name ?? '',
      kommentar: k.kommentar ?? '',
      telefon: k.telefon ?? '',
      email: k.email ?? '',
      is_site_contact: !!k.is_site_contact,
    })),
    eigentuemer: {
      name: v.eigentuemer?.name ?? '',
      adresse: v.eigentuemer?.adresse ?? '',
      telefon: v.eigentuemer?.telefon ?? '',
      email: v.eigentuemer?.email ?? '',
    },
    disposal: {
      material: v.disposal?.material ?? '',
      menge: v.disposal?.menge ?? '',
      entsorger: v.disposal?.entsorger ?? '',
      nachweis_url: v.disposal?.nachweis_url ?? '',
      bemerkung: v.disposal?.bemerkung ?? '',
    },
  }
}

export function isProjectFormDirty(baseline: ProjectFormValues, current: ProjectFormValues): boolean {
  return JSON.stringify(normalizeForm(baseline)) !== JSON.stringify(normalizeForm(current))
}

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
  /**
   * Nach dem Speichern. `saved` gesetzt = frisch angelegtes Projekt, in das der
   * Aufrufer direkt springen soll; null/undefined = zurück in die Übersicht.
   */
  onSaved: (saved?: Project | null) => void
}

export default function ProjectDetailScreen({ project, onClose, onSaved }: Props) {
  const isNew = !project

  // Ausgangsstand der Maske. Speist die useState-Initialwerte UND dient als
  // Referenz für die „ungespeicherte Änderungen"-Abfrage; nach jedem Speichern
  // wird er auf den neuen Stand nachgezogen.
  const [baseline, setBaseline] = useState<ProjectFormValues>(() => initialProjectForm(project))

  const [name, setName] = useState(baseline.name)
  const [customerId, setCustomerId] = useState(baseline.customerId)
  // Objekt-Name (z.B. "MFH Sonnhalde") getrennt von der reinen Objektadresse — Letztere
  // speist die Google-Maps-Distanz (Fahrspesen), darum darf der Name nicht mit rein.
  const [objectName, setObjectName] = useState(baseline.objectName)
  const [objectAddress, setObjectAddress] = useState(baseline.objectAddress)
  // Wurde die Objektadresse manuell bearbeitet? Dann beim Kundenwechsel NICHT überschreiben.
  // Eine nur automatisch (aus dem Kundenstamm) befüllte Adresse wird hingegen neu geseedet,
  // damit ein Kundenwechsel auch die Distanz (Offerten-Fahrspesen) neu berechnen lässt.
  const [objectAddressTouched, setObjectAddressTouched] = useState(!!project?.object_address)
  // Abweichende Rechnungsadresse NUR für dieses Projekt (analog Kundenstamm-Checkbox,
  // aber ohne Rückschreiben in den Kunden). Abwählen sendet '' — das Backend filtert
  // null im PATCH weg, ein leerer String leert den Override wirklich.
  const [billingDiffers, setBillingDiffers] = useState(baseline.billingDiffers)
  const [projBillingName, setProjBillingName] = useState(baseline.billingName)
  const [projBillingAddress, setProjBillingAddress] = useState(baseline.billingAddress)
  // Mehrfachauswahl: ein Projekt kann mehrere Leistungsarten tragen (z.B. Neumontage + Reparatur)
  const [artDerArbeit, setArtDerArbeit] = useState<string[]>(baseline.artDerArbeit)
  const toggleArt = (value: string) =>
    setArtDerArbeit(prev => prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value])
  const hasEntsorgungsart = artDerArbeit.includes('Demontage') || artDerArbeit.includes('Wiedermontage')
  const [bemerkung, setBemerkung] = useState(baseline.bemerkung)
  const [geruestfach, setGeruestfach] = useState(baseline.geruestfach)
  const [showGeruestfach, setShowGeruestfach] = useState(false)
  const [projektleiterId, setProjektleiterId] = useState(baseline.projektleiterId)
  const [monteurIds, setMonteurIds] = useState<string[]>(baseline.monteurIds)
  // Termine des Projekts (project_appointments) — mehrere je Projekt, gespeichert
  // erst beim Absenden der Maske (Diff gegen baseline.appointments in persist()).
  const [appointments, setAppointments] = useState<AppointmentDraft[]>(baseline.appointments)
  // Wurde die Terminliste im Formular angefasst? Dann darf das (asynchrone)
  // Nachladen vom Server die Eingaben nicht mehr überschreiben.
  const appointmentsTouched = useRef(false)
  // Termine gehören zum Modul «scheduling» (Endpunkte sind darauf gegated).
  // Ohne das Modul zeigt die Maske die Kachel nicht — geplant wird dann nirgends.
  const [schedulingEnabled, setSchedulingEnabled] = useState(false)
  const [kontakte, setKontakte] = useState<Kontakt[]>(baseline.kontakte)
  // Eigentümer des Objekts — eigene Rolle, kein Kontakt. Kann pro Projekt ein Dritter sein.
  const [eigentuemer, setEigentuemer] = useState<Eigentuemer>(baseline.eigentuemer)
  const updateEigentuemer = (field: keyof Eigentuemer, value: string) =>
    setEigentuemer(prev => ({ ...prev, [field]: value }))
  const [disposal, setDisposal] = useState<DisposalDetails>(baseline.disposal)
  const updateDisposal = (field: keyof DisposalDetails, value: string) => setDisposal(prev => ({ ...prev, [field]: value }))
  const disposalEmpty = (d: DisposalDetails) => !d.material && !d.menge && !d.entsorger && !d.nachweis_url && !d.bemerkung
  const [wartungInterval, setWartungInterval] = useState<string>(baseline.wartungInterval)
  const [wartungLastAt, setWartungLastAt] = useState<string>(baseline.wartungLastAt)
  const [wartungNextDueAt, setWartungNextDueAt] = useState<string>(baseline.wartungNextDueAt)
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
  // Dieselbe Aktion wie confirmClose, aber ausgelöst durch eine bezahlte Rechnung —
  // eigener State, damit der Dialog den Anlass benennt.
  const [confirmCloseAfterPaid, setConfirmCloseAfterPaid] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [confirmReactivate, setConfirmReactivate] = useState(false)
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
  // Popup zum manuellen Erfassen eines Rapports (analog showQuoteForm).
  const [showReportForm, setShowReportForm] = useState(false)
  // Gesetzt = dasselbe Popup im Bearbeiten-Modus für genau diesen Rapport.
  // Bewusst dieselbe Maske: die Korrektur muss dieselben Felder anbieten wie die
  // Erfassung (siehe ReportCreateForm).
  const [editReportId, setEditReportId] = useState<number | null>(null)
  // Lokaler, noch nicht abgeschickter Offert-Entwurf für dieses Projekt vorhanden?
  // Steuert den «Entwurf fortsetzen»-Button. resumeQuoteDraft = Form gezielt zum
  // Fortsetzen geöffnet (übernimmt den Entwurf automatisch statt nur per Banner).
  const [quoteDraftExists, setQuoteDraftExists] = useState(() => hasQuoteDraft(project?.name ?? ''))
  const [resumeQuoteDraft, setResumeQuoteDraft] = useState(false)
  const [editQuote, setEditQuote] = useState<QuoteDetail | null>(null)
  // Verhindert, dass eine im Textfeld begonnene Maus-Selektion, die auf dem Overlay
  // endet (mouseup ausserhalb der Box), die Bearbeiten-Maske schliesst. Nur schliessen,
  // wenn mousedown UND click auf dem Overlay selbst landen. Vgl. PdfExtractionReviewModal.
  const editQuoteMouseDownOnOverlay = useRef(false)
  const [generatingInvoice, setGeneratingInvoice] = useState(false)
  const [regeneratingQuoteId, setRegeneratingQuoteId] = useState<number | null>(null)
  // Feature offerte_dank_mail: „Dankeschön senden"-Knopf bei angenommenen Offerten.
  const [dankEnabled, setDankEnabled] = useState(false)
  // Feature offerte_absage_mail: „Absage senden"-Knopf bei abgelehnten Offerten.
  const [absageEnabled, setAbsageEnabled] = useState(false)
  // Feature beschaffungsstatus: Arbeitsschritt der Materialbeschaffung. Eigener State
  // statt direkt auf dem project-Prop, weil Dropdown UND Datei-Upload ihn ändern —
  // ein Prop-Reload würde beides erst nach dem Schliessen des Detailscreens zeigen.
  const [beschaffungSteps, setBeschaffungSteps] = useState<BeschaffungStep[]>([])
  const [beschaffung, setBeschaffung] = useState<string | null>(project?.workflow_status ?? null)
  const [beschaffungAt, setBeschaffungAt] = useState<string | null>(project?.workflow_status_at ?? null)
  const [beschaffungSource, setBeschaffungSource] = useState<string | null>(project?.workflow_status_source ?? null)
  const [savingBeschaffung, setSavingBeschaffung] = useState(false)
  // „Weitere Offerte" (mehrere Varianten pro Projekt) — Standard-Fähigkeit, kein Flag.
  const [addingVariantId, setAddingVariantId] = useState<number | null>(null)
  const [sendingRejectionId, setSendingRejectionId] = useState<number | null>(null)
  const [useAcceptedQuote, setUseAcceptedQuote] = useState(false)
  const [sendQuote, setSendQuote] = useState<ProjectQuote | null>(null)
  // Danke-Mail-Dialog (Feature offerte_dank_mail): fragt analog zum Offerten-Versand
  // zuerst die Empfänger-Adresse ab, vorbelegt mit der Kunden-E-Mail der Offerte.
  const [thankyouQuote, setThankyouQuote] = useState<ProjectQuote | null>(null)

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
  const isArchived = effectiveStatus === 'archiviert'

  // ── Ungespeicherte Änderungen ────────────────────────────────
  const currentForm: ProjectFormValues = {
    name,
    customerId,
    objectName,
    objectAddress,
    billingDiffers,
    billingName: projBillingName,
    billingAddress: projBillingAddress,
    artDerArbeit,
    bemerkung,
    geruestfach,
    projektleiterId,
    monteurIds,
    appointments,
    kontakte,
    eigentuemer,
    disposal,
    wartungInterval,
    wartungLastAt,
    wartungNextDueAt,
  }
  const isDirty = isProjectFormDirty(baseline, currentForm)
  // Abfrage offen, weil „Zurück"/„Abbrechen" bei ungespeicherten Änderungen gedrückt wurde.
  const [pendingLeave, setPendingLeave] = useState(false)

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
      setSchedulingEnabled(hasModule(me, 'scheduling'))
      setShowGeruestfach(isFeatureEnabled(me, 'geruestfach'))
      setDankEnabled(isFeatureEnabled(me, 'offerte_dank_mail'))
      setAbsageEnabled(isFeatureEnabled(me, 'offerte_absage_mail'))
      setBeschaffungSteps(
        isFeatureEnabled(me, 'beschaffungsstatus')
          ? enabledBeschaffungSteps(getFeature(me, 'beschaffungsstatus'))
          : [],
      )
    }).catch(() => {})
  }, [])

  // Termine nachladen und zum Ausgangsstand machen — sonst gälte die Maske
  // sofort als geändert. Fehler bleiben still: ohne Modul «scheduling»
  // antwortet der Endpunkt 403, die Kachel wird dann ohnehin nicht gezeigt.
  useEffect(() => {
    if (!project) return
    getProjectAppointments(project.id).then(rows => {
      if (appointmentsTouched.current) return
      const drafts = rows.map(apptToDraft)
      setAppointments(drafts)
      setBaseline(b => ({ ...b, appointments: drafts }))
    }).catch(() => {})
  }, [project?.id])

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

  // Rapport löschen — z.B. ein doppelt erfasster Rapport. Ohne das landen dessen
  // Stunden und Material zusätzlich auf der nächsten Rechnung (billable_report_ids
  // filtert nur bereits Verrechnetes, keine Dubletten). Abgerechnete Rapporte sperrt
  // der Server mit 409; die Meldung geht dann als Toast raus.
  async function handleDeleteReport(reportId: number) {
    if (!project) return
    try {
      const res = await apiFetch(`/pwa/admin/projects/${project.id}/reports/${reportId}`, {
        method: 'DELETE',
      }) as { stock_restored?: number; warnings?: string[] }
      await reloadReports()
      if (res?.warnings?.length) {
        showToast(`Rapport gelöscht — Lager-Rückbuchung unvollständig: ${res.warnings.join(', ')}`)
      } else {
        showToast(res?.stock_restored
          ? `Rapport gelöscht (${res.stock_restored} Materialposition${res.stock_restored === 1 ? '' : 'en'} ins Lager zurückgebucht)`
          : 'Rapport gelöscht')
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Rapport konnte nicht gelöscht werden')
      throw err
    }
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

  // „Weitere Offerte": kopiert die Offerte als neue Variante in dieselbe Gruppe. `kind`
  // legt beim ersten Mal die Art fest ('variante' = Kunde wählt eine, 'mehrfach' = Kunde
  // kann mehrere annehmen). Danach editiert der Anwender die kopierte Offerte.
  async function handleAddVariant(quoteId: number, kind: 'variante' | 'mehrfach') {
    setAddingVariantId(quoteId)
    try {
      await apiFetch(`/pwa/admin/quotes/${quoteId}/add-variant`, {
        method: 'POST', body: JSON.stringify({ variant_group_kind: kind }),
      })
      showToast('Weitere Offerte erstellt — jetzt anpassen')
      await reloadQuotes()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Fehler bei „Weitere Offerte"')
    } finally {
      setAddingVariantId(null)
    }
  }

  async function handleGenerateInvoice(remark: string): Promise<boolean> {
    if (!project) return false
    // Fehlt ein verrechenbarer Rapport (unterschrieben ODER manuell erfasst,
    // siehe hasBillableReport), wird zwingend aus der Offerte gerechnet — das
    // Backend setzt dann automatisch created_without_report.
    const useQuote = useAcceptedQuote || !hasBillableReport(reports)
    setGeneratingInvoice(true)
    try {
      const res = await apiFetch('/pwa/admin/invoices/generate', {
        method: 'POST',
        body: JSON.stringify({ project_name: project.name, project_id: project.id, use_quote: useQuote, remark }),
      }) as { quote_numbers?: string[]; warnings?: unknown } | null
      showToast(
        'Rechnung erstellt'
        + sammelrechnungHint(res?.quote_numbers)
        + invoiceWarningHint(res?.warnings),
      )
      await reloadInvoices()
      await reloadReports()
      return true
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Fehler beim Erstellen')
      return false
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

  async function handleSendRejection(quoteId: number) {
    setSendingRejectionId(quoteId)
    try {
      const res = await apiFetch(`/pwa/admin/quotes/${quoteId}/send-rejection`, { method: 'POST' }) as { message?: string }
      showToast(res.message || 'Absage-Mail gesendet')
      await reloadQuotes()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Absage-Mail fehlgeschlagen')
    } finally {
      setSendingRejectionId(null)
    }
  }

  // `paidDate` = Tag des Zahlungseingangs (ISO), nachtragbar statt automatisch
  // «heute». Danach die Anschlussfrage «Projekt abschliessen?» — die bezahlte
  // Rechnung ist meist der letzte Schritt eines Auftrags.
  async function handleMarkInvoicePaid(invoiceId: number, paidDate: string): Promise<boolean> {
    try {
      await apiFetch(`/pwa/admin/invoices/${invoiceId}/mark-paid`, {
        method: 'POST',
        body: JSON.stringify({ paid_at: paidDate }),
      })
      await reloadInvoices()
      // Frage statt Automatik: eine Teilrechnung schliesst das Projekt nicht.
      if (!isClosed && !isArchived) setConfirmCloseAfterPaid(true)
      return true
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Fehler')
      return false
    }
  }

  async function handleUnmarkInvoicePaid(invoiceId: number) {
    try {
      await apiFetch(`/pwa/admin/invoices/${invoiceId}/unmark-paid`, { method: 'POST' })
      showToast('Zahlung zurückgesetzt')
      await reloadInvoices()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Fehler')
    }
  }

  async function handleArchiveInvoice(invoiceId: number) {
    try {
      await apiFetch(`/pwa/admin/invoices/${invoiceId}/archive`, { method: 'POST' })
      showToast('Rechnung archiviert — Rapporte wieder verrechenbar')
      // Rapporte neu laden: der «Abgerechnet»-Status der gelösten Rapporte ändert sich.
      await Promise.all([reloadInvoices(), reloadReports()])
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

  // Postversand: derselbe Endpunkt wie in der Rechnungsübersicht (InvoicesScreen).
  // `sentDate` ist das Aufgabedatum bei der Post — daraus leitet das Backend das
  // Zahlungsziel ab, deshalb nachtragbar statt "jetzt".
  async function handleMarkInvoiceSentByPost(invoiceId: number, sentDate: string): Promise<boolean> {
    try {
      await apiFetch(`/pwa/admin/invoices/${invoiceId}/mark-sent`, {
        method: 'POST',
        body: JSON.stringify({ sent_date: sentDate }),
      })
      showToast('Rechnung als per Post versendet markiert')
      await reloadInvoices()
      return true
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Fehler')
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
  // Projekt-Override zuerst — dieselbe Vorrang-Kette wie das Backend
  // (resolve_billing_info): projects.billing_* vor customer.billing_* vor Stammdaten.
  const billingRecipient = (billingDiffers && projBillingName.trim())
    || (selectedCustomer
      ? (selectedCustomer.billing_name || selectedCustomer.name)
      : (project ? projectCustomerName(project) : ''))
  const billingAddress = (billingDiffers && projBillingAddress)
    || (selectedCustomer
      ? (selectedCustomer.billing_address || selectedCustomer.address || '')
      : (project ? projectBillingAddress(project) : ''))

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

  function handleAppointmentsChange(next: AppointmentDraft[]) {
    appointmentsTouched.current = true
    setAppointments(next)
  }

  /**
   * Schreibt die Terminliste: erst löschen, dann ändern, dann anlegen. Sequenziell,
   * weil jede Mutation serverseitig den Ersttermin-Spiegel auf projects nachzieht.
   * Wirft bei jedem fehlgeschlagenen Schritt — der Aufrufer lädt danach den
   * echten Serverstand nach, statt auf dem halben Formularstand weiterzurechnen.
   */
  async function syncAppointments(projectId: string, saved: AppointmentDraft[], current: AppointmentDraft[]) {
    const diff = diffAppointments(saved, current)
    for (const id of diff.removeIds) await deleteAppointment(id)
    for (const d of diff.update) await updateAppointment(d.id!, draftPayload(d))
    for (const d of diff.create) await createAppointment(projectId, draftPayload(d))
  }

  /**
   * Speichert die Maske und liefert bei einem NEU angelegten Projekt die frisch
   * erzeugte Zeile zurück (sonst null). `false` = fehlgeschlagen; der Aufrufer
   * lässt die Maske dann offen, damit die Fehlermeldung sichtbar bleibt.
   *
   * Bewusst ohne Navigation: submit, die „ungespeicherte Änderungen"-Abfrage und
   * der Navigations-Guard brauchen jeweils ein anderes Verhalten danach.
   */
  async function persist(): Promise<Project | null | false> {
    // Die Fehlermeldung steht im Detail-Formular — wer aus einem anderen Tab
    // heraus speichert (Abfrage beim Verlassen), würde sie sonst nie sehen.
    const fail = (message: string) => { setError(message); setActiveTab('details'); return false as const }

    if (!name.trim()) return fail('Projektname ist erforderlich.')
    const apptError = validateDrafts(appointments)
    if (apptError) return fail(apptError)
    setError('')
    setSaving(true)
    try {
      const method = isNew ? 'POST' : 'PATCH'
      const url = isNew ? '/pwa/admin/projects' : `/pwa/admin/projects/${project!.id}`
      const res = await apiFetch(url, {
        method,
        body: JSON.stringify({
          name: name.trim(),
          customer_id: customerId || null,
          object_name: objectName.trim() || null,
          object_address: objectAddress || null,
          // '' statt null, damit ein entfernter Override auch persistiert wird
          // (das Backend filtert null-Werte weg — kein Clear möglich).
          billing_name: billingDiffers ? projBillingName.trim() : '',
          billing_address: billingDiffers ? projBillingAddress : '',
          art_der_arbeit: artDerArbeit,
          bemerkung: bemerkung || null,
          geruestfach: geruestfach.trim() ? parseInt(geruestfach, 10) : null,
          projektleiter_id: projektleiterId || null,
          monteur_ids: monteurIds,
          // Terminfelder (start_date/end_date/start_time/end_time) sendet die
          // Maske bewusst NICHT mehr: Termine laufen über die appointment-
          // Endpunkte, der Server spiegelt daraus den Ersttermin auf projects.
          // Beides zu schreiben würde den Ersttermin doppelt bewegen.
          kontakte,
          // Immer mitschicken (auch leer), damit ein geleertes Feld auch persistiert
          // wird — das Backend filtert null-Werte weg (kein Clear möglich).
          eigentuemer,
          disposal_details: hasEntsorgungsart && !disposalEmpty(disposal) ? disposal : null,
          wartung_interval_months: wartungInterval ? parseInt(wartungInterval, 10) : null,
          wartung_last_at: wartungLastAt || null,
          wartung_next_due_at: wartungNextDueAt || null,
        }),
      }) as { project?: Project | null } | null   // POST liefert die neu angelegte Zeile mit

      // Termine (eigene Tabelle, eigene Endpunkte) nachziehen. Erst jetzt, weil
      // ein neu angelegtes Projekt vorher keine id hat, an der Termine hängen.
      const created = isNew ? (res?.project ?? null) : null
      const targetId = created?.id ?? project?.id ?? null
      let apptSyncError = ''
      let savedAppointments = appointments
      if (targetId && schedulingEnabled) {
        try {
          await syncAppointments(targetId, baseline.appointments, appointments)
        } catch (err: unknown) {
          apptSyncError = err instanceof Error && err.message
            ? `Projektdaten gespeichert — Termine nicht vollständig: ${err.message}`
            : 'Projektdaten gespeichert, aber die Termine konnten nicht übernommen werden.'
        }
        // Serverstand nachladen: nach einem Teilfehler ist er die einzige
        // verlässliche Grundlage für den nächsten Diff.
        const rows = await getProjectAppointments(targetId).catch(() => null)
        if (rows) {
          savedAppointments = rows.map(apptToDraft)
          setAppointments(savedAppointments)
          appointmentsTouched.current = false
        }
      } else if (!targetId && appointments.length > 0) {
        // Projekt-POST ohne zurückgelieferte Zeile: es gibt keine id, an die sich
        // die Termine hängen liessen. Lieber melden als still verschlucken.
        apptSyncError = 'Projekt gespeichert, die Termine konnten aber nicht zugeordnet werden. Bitte im Projekt erneut erfassen.'
      }

      // Ab hier gilt der aktuelle Stand als gespeichert — sonst würde die
      // „ungespeicherte Änderungen"-Abfrage direkt nochmal zuschlagen.
      setBaseline({ ...currentForm, appointments: savedAppointments })
      if (apptSyncError) {
        setError(apptSyncError)
        setActiveTab('details')
        // Beim BESTEHENDEN Projekt offen bleiben, damit die Meldung sichtbar ist
        // und der Anwender es erneut versuchen kann. Beim frisch ANGELEGTEN
        // Projekt trotzdem durchreichen: 'false' liesse die Neu-Maske offen, und
        // der nächste Speicherversuch legte ein zweites Projekt an. Der Anwender
        // landet stattdessen im gespeicherten Projekt und sieht dort den echten
        // (nachgeladenen) Terminstand.
        if (!created) return false
      }
      return created
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fehler beim Speichern')
      return false
    } finally {
      setSaving(false)
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    const saved = await persist()
    if (saved === false) return
    // Neues Projekt → der Aufrufer springt direkt hinein statt in die Übersicht.
    onSaved(saved)
  }

  // Verlassen der Maske (Zurück/Abbrechen) — bei ungespeicherten Änderungen erst fragen.
  function requestClose() {
    if (isDirty) setPendingLeave(true)
    else onClose()
  }

  async function saveAndLeave() {
    const saved = await persist()
    if (saved === false) { setPendingLeave(false); return }
    setPendingLeave(false)
    // Gespeichert und trotzdem raus: zurück in die Übersicht (dort neu laden),
    // auch beim frisch angelegten Projekt — der Anwender wollte ja weg.
    onSaved(null)
  }

  // Navigation über Sidebar/MobileNav: die Maske speichert nur, das Wegnavigieren
  // übernimmt der Aufrufer (AdminApp).
  useUnsavedChangesGuard(
    () => isDirty,
    async () => (await persist()) !== false,
  )

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

  async function handleArchive() {
    if (!project) return
    setSettingStatus(true)
    try {
      await apiFetch(`/pwa/admin/projects/${encodeURIComponent(project.name)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'archiviert' }),
      })
      showToast('Projekt archiviert')
      setTimeout(onSaved, 1000)
    } catch {
      setError('Fehler beim Archivieren')
    } finally {
      setSettingStatus(false)
      setConfirmArchive(false)
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
      let advancedTo: string | null = null
      for (const file of filesToUpload) {
        const form = new FormData()
        form.append('file', file)
        form.append('category', category)
        const res = await apiFormFetch(`/pwa/admin/projects/${project.id}/files`, form) as
          { beschaffung_status?: string | null }
        // Der Server meldet, wenn der Upload den Beschaffungsstatus vorgerückt hat.
        // Die Vorwärts-Regel bleibt damit an EINER Stelle (services/project_workflow.py).
        if (res?.beschaffung_status) advancedTo = res.beschaffung_status
      }
      const updated = await apiFetch(`/pwa/admin/projects/${project.id}/files`) as ProjectFile[]
      setFiles(updated)
      if (advancedTo) {
        setBeschaffung(advancedTo)
        setBeschaffungAt(new Date().toISOString())
        setBeschaffungSource('auto')
      }
      showToast(
        advancedTo
          ? `Hochgeladen · Beschaffung: ${beschaffungStep(advancedTo)?.label ?? advancedTo}`
          : filesToUpload.length > 1 ? `${filesToUpload.length} Dateien hochgeladen` : 'Datei hochgeladen',
      )
    } catch {
      setError('Fehler beim Hochladen')
    } finally {
      setUploading(false)
      setUploadCategory(null)
    }
  }

  async function handleBeschaffungChange(next: string | null) {
    if (!project) return
    const previous = { status: beschaffung, at: beschaffungAt, source: beschaffungSource }
    // Optimistisch setzen: das Dropdown soll nicht auf den Roundtrip warten.
    setBeschaffung(next)
    setBeschaffungAt(new Date().toISOString())
    setBeschaffungSource('manual')
    setSavingBeschaffung(true)
    try {
      await setProjectBeschaffung(project.id, next)
    } catch (err) {
      // Zurückdrehen statt stehenlassen — ein Dropdown, das einen nicht gespeicherten
      // Wert zeigt, ist schlimmer als eines, das die Änderung sichtbar verwirft.
      setBeschaffung(previous.status)
      setBeschaffungAt(previous.at)
      setBeschaffungSource(previous.source)
      showToast(err instanceof Error ? err.message : 'Fehler beim Speichern des Beschaffungsstatus')
    } finally {
      setSavingBeschaffung(false)
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

  async function handleRenameFile(fileId: string, filename: string) {
    if (!project) return
    try {
      await apiFetch(`/pwa/admin/projects/${project.id}/files/${fileId}`, {
        method: 'PATCH',
        body: JSON.stringify({ filename }),
      })
      // Server-Antwort kann den Namen anpassen (Endung wird erhalten) → neu laden
      const updated = await apiFetch(`/pwa/admin/projects/${project.id}/files`) as ProjectFile[]
      setFiles(updated)
    } catch {
      setError('Fehler beim Umbenennen')
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
                {/* Beschaffungsschritt direkt neben dem Lebenszyklus-Status: die Frage
                    "wo stehe ich?" muss beim Öffnen beantwortet sein, nicht erst nach
                    einem Klick in den vierten Reiter. Gesetzt wird er dort, gezeigt hier. */}
                {!!beschaffungSteps.length && beschaffungStep(beschaffung) && (
                  <span
                    className={`admin-badge ${beschaffungStep(beschaffung)!.badge}`}
                    style={{ fontSize: 12 }}
                    title={
                      beschaffungSource === 'auto'
                        ? 'Automatisch beim Datei-Upload gesetzt — im Reiter Lieferantendokumente änderbar'
                        : 'Im Reiter Lieferantendokumente änderbar'
                    }
                  >
                    {beschaffungStep(beschaffung)!.label}
                    {(() => {
                      const d = daysSince(beschaffungAt)
                      return d !== null ? ` · seit ${d} Tag${d === 1 ? '' : 'en'}` : ''
                    })()}
                  </span>
                )}
                {project?.created_at && (
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                    Eröffnet am {fmtDate(project.created_at)}
                  </span>
                )}
              </>
            )}
          </div>
        </div>
        <button className="admin-btn admin-btn-secondary" onClick={requestClose}>← Zurück</button>
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
                <label className="admin-form-label" htmlFor="project-name">Projektname *</label>
                <input id="project-name" className="admin-form-input" value={name} onChange={e => setName(e.target.value)} required />
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
                <label className="admin-form-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={billingDiffers}
                    onChange={e => setBillingDiffers(e.target.checked)}
                  />
                  Abweichende Rechnungsadresse (nur dieses Projekt)
                </label>
                {billingDiffers && (
                  <>
                    <div className="admin-form-row" style={{ marginTop: 10 }}>
                      <div>
                        <label className="admin-form-label">Empfänger (Rechnung)</label>
                        <input
                          className="admin-form-input"
                          value={projBillingName}
                          onChange={e => setProjBillingName(e.target.value)}
                          placeholder={(selectedCustomer?.billing_name || selectedCustomer?.name) ?? 'z.B. Verwaltung AG'}
                        />
                      </div>
                      <div>
                        <label className="admin-form-label">Rechnungsadresse</label>
                        <AddressAutocomplete className="admin-form-input" value={projBillingAddress} onChange={setProjBillingAddress} />
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                      Gilt nur für Offerte/Rechnung dieses Projekts — der Kundenstamm bleibt unverändert.
                    </div>
                  </>
                )}
              </div>

              <div className="admin-form-group">
                <label className="admin-form-label">Objekt-Name (optional)</label>
                <input
                  className="admin-form-input"
                  value={objectName}
                  onChange={e => setObjectName(e.target.value)}
                  placeholder="z.B. MFH Sonnhalde oder Familie Muster"
                />
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  Bezeichnung des Objekts — erscheint auf Offerte/Rechnung. Getrennt von der Adresse.
                </div>
              </div>

              <div className="admin-form-group">
                <label className="admin-form-label">Objektadresse (Baustelle)</label>
                <AddressAutocomplete className="admin-form-input" value={objectAddress} onChange={v => { setObjectAddress(v); setObjectAddressTouched(true) }} />
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  Nur die reine Adresse — sie bestimmt die Fahrspesen (Distanz Firmensitz → Objekt).
                  Wird beim Auswählen des Kunden als Vorschlag übernommen und kann pro Projekt überschrieben werden.
                </div>
              </div>

            </div>
          </div>

          {/* ── Ansprechpersonen ──────────────────────────────── */}
          <div className="admin-table-wrap project-contacts" style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
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
              // Spaltentitel nur über der ersten Zeile — ab der zweiten wären
              // NAME/KOMMENTAR/TELEFON/E-MAIL reine Wiederholung und schieben die
              // Liste unnötig auseinander. Gestapelt (Handy) bleiben sie sichtbar,
              // dort steht jedes Feld für sich; die aria-labels bleiben immer.
              <div key={i} className={`project-pos-row${i > 0 ? ' project-pos-row-repeat' : ''}`}>
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
                  <input className="admin-form-input" aria-label="Name" autoComplete="new-kontakt-name" value={k.name} onChange={e => updateKontakt(i, 'name', e.target.value)} />
                </div>
                <div className="admin-form-group" style={{ margin: 0 }}>
                  <label className="admin-form-label">Kommentar</label>
                  <input className="admin-form-input" aria-label="Kommentar" autoComplete="new-kontakt-kommentar" value={k.kommentar} onChange={e => updateKontakt(i, 'kommentar', e.target.value)} placeholder="z.B. Hausabwart" />
                </div>
                <div className="admin-form-group" style={{ margin: 0 }}>
                  <label className="admin-form-label">Telefon</label>
                  <input className="admin-form-input" aria-label="Telefon" autoComplete="new-kontakt-telefon" value={k.telefon} onChange={e => updateKontakt(i, 'telefon', e.target.value)} />
                </div>
                <div className="admin-form-group" style={{ margin: 0 }}>
                  <label className="admin-form-label">E-Mail</label>
                  <input className="admin-form-input" aria-label="E-Mail" autoComplete="new-kontakt-email" type="email" value={k.email} onChange={e => updateKontakt(i, 'email', e.target.value)} />
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
            <div className="admin-form-row">
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
                <div className="admin-form-row">
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
            <div className="admin-form-row admin-form-row-3">
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

          {/* ── Einsatzplanung (Zuständigkeiten) ──────────────── */}
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

              {schedulingEnabled && (
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  Standard-Team für alle Termine — je Termin lässt sich unten davon abweichen.
                </div>
              )}
            </div>
          </div>

          {/* ── Termine (mehrere je Projekt, project_appointments) ─── */}
          {schedulingEnabled && (
            <AppointmentsCard
              appointments={appointments}
              onChange={handleAppointmentsChange}
              staff={staff}
              projectTeam={monteurIds}
            />
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" className="admin-btn admin-btn-secondary" onClick={requestClose}>Abbrechen</button>
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
          onRename={handleRenameFile}
        />
      )}

      {!isNew && activeTab === 'supplier' && (
        <SupplierDocumentsTab
          files={files}
          uploading={uploading}
          uploadingCategory={uploadCategory}
          onUpload={uploadFilesToCategory}
          onDelete={setConfirmDeleteFileId}
          onRename={handleRenameFile}
          beschaffungSteps={beschaffungSteps}
          beschaffungStatus={beschaffung}
          beschaffungStatusAt={beschaffungAt}
          beschaffungStatusSource={beschaffungSource}
          savingBeschaffung={savingBeschaffung}
          onBeschaffungChange={handleBeschaffungChange}
        />
      )}

      {!isNew && activeTab === 'quotes' && (
        <QuotesTab
          quotes={quotes}
          invoices={invoices}
          regeneratingQuoteId={regeneratingQuoteId}
          hasLocalDraft={quoteDraftExists}
          dankEnabled={dankEnabled}
          absageEnabled={absageEnabled}
          sendingRejectionId={sendingRejectionId}
          onShowCreateForm={() => { setResumeQuoteDraft(false); setShowQuoteForm(true) }}
          onResumeDraft={() => { setResumeQuoteDraft(true); setShowQuoteForm(true) }}
          onUpdateStatus={handleUpdateQuoteStatus}
          onRegenerate={handleRegenerateQuote}
          onSend={q => setSendQuote(q)}
          onSendThankyou={q => setThankyouQuote(q)}
          onSendRejection={handleSendRejection}
          onEdit={handleEditQuote}
          addingVariantId={addingVariantId}
          onAddVariant={handleAddVariant}
          files={files}
          uploading={uploading}
          uploadingCategory={uploadCategory}
          onUploadFile={uploadFilesToCategory}
          onDeleteFile={setConfirmDeleteFileId}
          onRenameFile={handleRenameFile}
        />
      )}

      {!isNew && activeTab === 'reports' && (
        <ReportsTab
          reports={reports}
          onShowCreateForm={() => setShowReportForm(true)}
          onDelete={handleDeleteReport}
          onEdit={setEditReportId}
          paperRapportUrl={project ? apiUrl(`/pwa/admin/projects/${project.id}/paper-rapport.pdf`) : undefined}
          files={files}
          uploading={uploading}
          uploadingCategory={uploadCategory}
          onUploadFile={uploadFilesToCategory}
          onDeleteFile={setConfirmDeleteFileId}
          onRenameFile={handleRenameFile}
        />
      )}

      {!isNew && activeTab === 'invoices' && (
        <InvoicesTab
          invoices={invoices}
          useAcceptedQuote={useAcceptedQuote}
          generatingInvoice={generatingInvoice}
          defaultEmail={selectedCustomer?.email ?? project?.customer?.email ?? ''}
          hasSignedReport={hasBillableReport(reports)}
          onUseAcceptedQuoteChange={setUseAcceptedQuote}
          onGenerateInvoice={handleGenerateInvoice}
          onMarkPaid={handleMarkInvoicePaid}
          onUnmarkPaid={handleUnmarkInvoicePaid}
          onArchive={handleArchiveInvoice}
          onSendInvoice={handleSendInvoice}
          onMarkSentByPost={handleMarkInvoiceSentByPost}
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
              lockedProjectId={project.id}
              autoRestoreDraft={resumeQuoteDraft}
              onDone={warning => { setShowQuoteForm(false); setResumeQuoteDraft(false); setQuoteDraftExists(hasQuoteDraft(project.name)); reloadQuotes(); if (warning) showToast(warning) }}
              onCancel={() => { setShowQuoteForm(false); setResumeQuoteDraft(false); setQuoteDraftExists(hasQuoteDraft(project.name)) }}
            />
          </div>
        </div>
      )}

      {/* ── Dialog: Rapport manuell erfassen / bearbeiten ─────── */}
      {(showReportForm || editReportId !== null) && project && (
        <div className="admin-confirm-overlay">
          {/* Gleiche Breite wie die Offerten-Maske: die Material-/Fixpreis-Zeilen
              haben bis zu fünf Felder pro Zeile — bei 640 px blieb je Feld so wenig
              Platz, dass Artikelnamen und Preise abgeschnitten wurden. */}
          <div className="admin-confirm-box" style={{ maxWidth: 920, maxHeight: '90vh', overflow: 'auto' }}>
            <ReportCreateForm
              // key: beim Wechsel Erfassen ↔ Bearbeiten (und zwischen zwei Rapporten)
              // muss React die Maske neu aufbauen, sonst bliebe der State der
              // vorherigen stehen.
              key={editReportId ?? 'new'}
              project={project}
              staff={staff}
              quotes={quotes}
              editReportId={editReportId ?? undefined}
              onDone={() => { setShowReportForm(false); setEditReportId(null); reloadReports() }}
              onCancel={() => { setShowReportForm(false); setEditReportId(null) }}
            />
          </div>
        </div>
      )}

      {/* ── Dialog: Offerte bearbeiten (nur Entwürfe) ────────── */}
      {/* Klick ausserhalb (auf das Overlay) verlässt die Maske ohne zu speichern.
          Das PDF entsteht erst beim Speichern — Verlassen erzeugt nichts. Wieder
          rein kommt man per Klick auf den Entwurf in der Liste. */}
      {editQuote && (
        <div
          className="admin-confirm-overlay"
          onMouseDown={e => { editQuoteMouseDownOnOverlay.current = e.target === e.currentTarget }}
          onClick={e => {
            if (e.target === e.currentTarget && editQuoteMouseDownOnOverlay.current) setEditQuote(null)
            editQuoteMouseDownOnOverlay.current = false
          }}
        >
          <div className="admin-confirm-box" style={{ maxWidth: 920, maxHeight: '90vh', overflow: 'auto' }}>
            <QuoteEditForm
              quote={editQuote}
              onDone={warning => { setEditQuote(null); reloadQuotes(); if (warning) showToast(warning) }}
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
            {!isClosed && !isArchived && (
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
            {!isArchived && (
              <button
                type="button"
                disabled={settingStatus}
                className="admin-btn admin-btn-secondary"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => setConfirmArchive(true)}
              >
                Archivieren
              </button>
            )}
            {isArchived && (
              <button
                type="button"
                disabled={reopening}
                className="admin-btn admin-btn-primary"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => setConfirmReactivate(true)}
              >
                Reaktivieren
              </button>
            )}
          </div>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 14 }}>
            {isArchived
              ? 'Archivierte Projekte sind aus Dashboard und Kennzahlen ausgeblendet – inkl. ihrer Offerten und Rechnungen. Reaktivieren macht das rückgängig.'
              : 'Abgeschlossene Projekte werden für Mitarbeiter ausgeblendet. Archivieren nimmt das Projekt zusätzlich aus Dashboard und Kennzahlen (reversibel).'}
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

      {confirmCloseAfterPaid && (
        <ConfirmDialog
          title="Projekt abschliessen?"
          message={<>Die Rechnung ist bezahlt. «{project?.name}» wird beim Abschliessen für Mitarbeiter ausgeblendet; Rapporte und Dokumente bleiben erhalten.</>}
          cancelLabel="Offen lassen"
          confirmLabel="Ja, abschliessen"
          busyLabel="Schliessen…"
          busy={settingStatus}
          onCancel={() => setConfirmCloseAfterPaid(false)}
          onConfirm={handleClose}
        />
      )}

      {confirmArchive && (
        <ConfirmDialog
          title="Projekt archivieren?"
          message={<>«{project?.name}» wird samt seinen Offerten und Rechnungen aus Dashboard und Kennzahlen genommen. Nichts wird gelöscht – Reaktivieren macht es rückgängig.</>}
          confirmLabel="Ja, archivieren"
          busyLabel="Archivieren…"
          busy={settingStatus}
          variant="danger"
          onCancel={() => setConfirmArchive(false)}
          onConfirm={handleArchive}
        />
      )}

      {confirmReactivate && (
        <ConfirmDialog
          title="Projekt reaktivieren?"
          message={<>«{project?.name}» wird wieder als offenes Projekt geführt und zählt wieder in Dashboard und Kennzahlen.</>}
          confirmLabel="Ja, reaktivieren"
          busyLabel="Reaktivieren…"
          busy={reopening}
          onCancel={() => setConfirmReactivate(false)}
          onConfirm={() => { setConfirmReactivate(false); handleReopen() }}
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
        <SendQuoteDialog
          quoteId={sendQuote.id}
          defaultEmail={sendQuote.customer_email || ''}
          header={
            <>
              {sendQuote.quote_number}
              {sendQuote.status === 'gesendet' && (
                <>
                  <br />
                  <span style={{ color: 'var(--muted)', fontSize: 12 }}>
                    Wurde bereits versendet — erneuter Versand erzeugt neue Annahme-/Ablehnen-Links.
                  </span>
                </>
              )}
            </>
          }
          onClose={() => setSendQuote(null)}
          onSent={async email => {
            showToast(`Offerte an ${email} gesendet`)
            setSendQuote(null)
            await reloadQuotes()
            if (!project) return
            // Direkt angehängte Dateien liegen jetzt als Projekt-Anhänge — Liste auffrischen.
            try {
              setFiles(await apiFetch(`/pwa/admin/projects/${project.id}/files`) as ProjectFile[])
            } catch { /* Datei-Liste ist nicht kritisch */ }
          }}
        />
      )}

      {thankyouQuote && (
        <SendThankyouDialog
          quoteId={thankyouQuote.id}
          defaultEmail={thankyouQuote.customer_email || ''}
          header={<>{thankyouQuote.quote_number}</>}
          onClose={() => setThankyouQuote(null)}
          onSent={async msg => {
            showToast(msg)
            setThankyouQuote(null)
            await reloadQuotes()
          }}
        />
      )}

      {pendingLeave && (
        <UnsavedChangesDialog
          saving={saving}
          message={
            isNew
              ? 'Das neue Projekt ist noch nicht angelegt. Jetzt speichern oder verwerfen?'
              : `Die Änderungen an «${project?.name}» sind noch nicht gespeichert.`
          }
          onSave={saveAndLeave}
          onDiscard={() => { setPendingLeave(false); onClose() }}
          onCancel={() => setPendingLeave(false)}
        />
      )}

      {toast && (
        <div className="admin-toast-container">
          <div className="admin-toast success">{toast}</div>
        </div>
      )}
    </div>
  )
}
