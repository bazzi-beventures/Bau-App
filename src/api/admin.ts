import { apiFetch, apiFormFetch } from './client'
import { AdminScreen } from '../admin/useAdminNav'

// ─── Dashboard ─────────────────────────────────────────────

export interface AdminDashboard {
  pending_corrections: number
  pending_absences: number
  open_invoices: number
  open_sessions: number
  draft_quotes: number
  quotes_pending_reminder: number
  invoices_pending_action: number
  pending_approvals: number
  projects_overdue: number
  pending_drafts: number
  recently_accepted_quotes: number
}

export interface OverdueProject {
  id: string
  name: string
  customer_name: string | null
  start_date: string | null
  end_date: string | null
  start_time: string | null
  end_time: string | null
}

export async function getOverdueProjects(): Promise<OverdueProject[]> {
  return apiFetch('/pwa/admin/projects/overdue') as Promise<OverdueProject[]>
}

export interface PendingApproval {
  id: string
  title: string
  filename: string
  file_url: string | null
  storage_path?: string | null
  mime_type: string | null
  requested_by_name: string | null
  created_at: string
  project_id: string
  project_name: string | null
}

export async function getPendingApprovals(): Promise<PendingApproval[]> {
  return apiFetch('/pwa/admin/approvals/pending') as Promise<PendingApproval[]>
}

export async function approveApproval(id: string, note?: string): Promise<void> {
  await apiFetch(`/pwa/admin/approvals/${id}/approve`, {
    method: 'POST',
    body: JSON.stringify({ note: note ?? null }),
  })
}

export async function rejectApproval(id: string, note?: string): Promise<void> {
  await apiFetch(`/pwa/admin/approvals/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ note: note ?? null }),
  })
}

export interface PendingActionInvoice {
  id: number
  invoice_number: string
  project_id: string | null
  project_name: string
  project_id_text: string | null
  customer_name: string | null
  total_amount: number
  sent_at: string | null
  due_date: string | null
  zahlungserinnerung_sent_at: string | null
  mahnung_sent_at: string | null
}

export interface PendingReminderQuote {
  id: number
  quote_number: string
  customer_name: string
  customer_email: string
  project_name: string
  total_amount: number
  sent_at: string | null
}

export async function getAdminDashboard(): Promise<AdminDashboard> {
  return apiFetch('/pwa/admin/dashboard') as Promise<AdminDashboard>
}

export async function getPendingReminderQuotes(): Promise<PendingReminderQuote[]> {
  return apiFetch('/pwa/admin/quotes/pending-reminders') as Promise<PendingReminderQuote[]>
}

export async function sendQuoteReminder(quoteId: number): Promise<void> {
  await apiFetch(`/pwa/admin/quotes/${quoteId}/send-reminder`, { method: 'POST' })
}

export async function getPendingActionInvoices(): Promise<PendingActionInvoice[]> {
  return apiFetch('/pwa/admin/invoices/pending-action') as Promise<PendingActionInvoice[]>
}

export async function sendZahlungserinnerung(invoiceId: number): Promise<void> {
  await apiFetch(`/pwa/admin/invoices/${invoiceId}/send-zahlungserinnerung`, { method: 'POST' })
}

export async function sendMahnung(invoiceId: number): Promise<void> {
  await apiFetch(`/pwa/admin/invoices/${invoiceId}/send-mahnung`, { method: 'POST' })
}

// ─── Staff ─────────────────────────────────────────────────

export interface StaffMember {
  id: string
  name: string
  kuerzel: string | null
  funktion: string | null
  hourly_rate: number | null
  monthly_salary: number | null
  rapportpflicht: boolean
  projektleiter: boolean
  authorized_user_id: string | null
  email: string | null
  role: string | null
  username: string | null
  is_active: boolean
  vacation_days_per_year: number | null
  date_of_birth: string | null
  pensum: number | null
}

export interface StaffRole {
  name: string
  hourly_rate: number
}

export async function getAdminStaff(): Promise<StaffMember[]> {
  return apiFetch('/pwa/admin/staff') as Promise<StaffMember[]>
}

export async function getStaffRoles(): Promise<StaffRole[]> {
  return apiFetch('/pwa/admin/staff-roles') as Promise<StaffRole[]>
}

export async function upsertStaffRole(name: string, hourly_rate: number): Promise<{ status: string; message: string }> {
  return apiFetch('/pwa/admin/staff-roles', {
    method: 'PUT',
    body: JSON.stringify({ name, hourly_rate }),
  }) as Promise<{ status: string; message: string }>
}

export async function upsertStaff(data: Partial<StaffMember> & { id?: string }): Promise<StaffMember> {
  const method = data.id ? 'PATCH' : 'POST'
  const url = data.id ? `/pwa/admin/staff/${data.id}` : '/pwa/admin/staff'
  return apiFetch(url, { method, body: JSON.stringify(data) }) as Promise<StaffMember>
}

export async function deleteStaff(staffId: string): Promise<void> {
  await apiFetch(`/pwa/admin/staff/${staffId}`, { method: 'DELETE' })
}

// ─── Massen-Einstempeln ────────────────────────────────────

export type BulkClockInStatus = 'clocked_in' | 'already' | 'error'

export interface BulkClockInResult {
  results: { staff_id: string; staff_name: string; status: BulkClockInStatus }[]
  clocked_in: number
  already: number
  errors: number
  push_sent: number
}

export async function getClockStatus(date?: string): Promise<{ clocked_in_staff_ids: string[] }> {
  const q = date ? `?date=${encodeURIComponent(date)}` : ''
  return apiFetch(`/pwa/admin/staff/clock-status${q}`) as Promise<{ clocked_in_staff_ids: string[] }>
}

export async function bulkClockIn(
  staffIds: string[],
  time: string,
  opts: { date?: string; art_der_arbeit?: string } = {},
): Promise<BulkClockInResult> {
  return apiFetch('/pwa/admin/staff/bulk-clock-in', {
    method: 'POST',
    body: JSON.stringify({ staff_ids: staffIds, time, ...opts }),
  }) as Promise<BulkClockInResult>
}

// ─── Password Auth ─────────────────────────────────────────

export async function loginWithPassword(username: string, password: string): Promise<{ tenant_slug: string }> {
  return await apiFetch('/pwa/auth/login-password', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  }) as { tenant_slug: string }
}

export async function requestPasswordReset(email: string): Promise<void> {
  await apiFetch('/pwa/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

export async function setAdminPassword(currentPassword: string | null, newPassword: string): Promise<void> {
  await apiFetch('/pwa/admin/set-password', {
    method: 'POST',
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  })
}

// ─── Absences ──────────────────────────────────────────────

export interface Absence {
  id: string
  staff_name: string
  absence_type: string
  start_date: string
  end_date: string
  status: string
  note: string | null
}

export async function getAdminAbsences(status?: string): Promise<Absence[]> {
  const q = status ? `?status=${status}` : ''
  return apiFetch(`/pwa/admin/absences${q}`) as Promise<Absence[]>
}

export async function approveAbsence(id: string, note?: string): Promise<void> {
  await apiFetch(`/pwa/admin/absences/${id}/approve`, {
    method: 'POST',
    body: JSON.stringify({ note }),
  })
}

export async function rejectAbsence(id: string, note?: string): Promise<void> {
  await apiFetch(`/pwa/admin/absences/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ note }),
  })
}

export interface AbsenceAnalytics {
  year: number
  totals: { vacation: number; sick: number; military: number; other: number }
  by_month: { month: string; vacation: number; sick: number; military: number; other: number }[]
  by_staff: { name: string; vacation: number; sick: number; military: number; other: number; total: number }[]
}

export async function getAbsenceAnalytics(year?: number): Promise<AbsenceAnalytics> {
  const q = year ? `?year=${year}` : ''
  return apiFetch(`/pwa/admin/absences/analytics${q}`) as Promise<AbsenceAnalytics>
}

// ─── Corrections ───────────────────────────────────────────

export interface Correction {
  id: string
  staff_name: string
  session_date: string
  requested_clock_in: string | null
  requested_clock_out: string | null
  requested_break_minutes: number | null
  current_clock_in: string | null
  current_clock_out: string | null
  current_break_minutes: number | null
  reason: string | null
  status: string
}

export async function getAdminCorrections(status?: string): Promise<Correction[]> {
  const q = status ? `?status=${status}` : ''
  return apiFetch(`/pwa/admin/corrections${q}`) as Promise<Correction[]>
}

export async function approveCorrection(id: string): Promise<void> {
  await apiFetch(`/pwa/admin/corrections/${id}/approve`, { method: 'POST' })
}

export async function rejectCorrection(id: string): Promise<void> {
  await apiFetch(`/pwa/admin/corrections/${id}/reject`, { method: 'POST' })
}

// ─── Projects ──────────────────────────────────────────────

export interface Project {
  id: string
  name: string
  customer_id: string | null
  customer: {
    id: string
    name: string | null
    billing_name: string | null
    address: string | null
    billing_address: string | null
    object_address: string | null
    email: string | null
  } | null
  object_address: string | null
  is_closed: boolean
  created_at: string
  start_date: string | null
  end_date: string | null
  start_time: string | null
  end_time: string | null
}

export async function getAdminProjects(): Promise<Project[]> {
  return apiFetch('/pwa/admin/projects') as Promise<Project[]>
}

export async function upsertProject(data: Partial<Project> & { id?: string }): Promise<Project> {
  const method = data.id ? 'PATCH' : 'POST'
  const url = data.id ? `/pwa/admin/projects/${data.id}` : '/pwa/admin/projects'
  return apiFetch(url, { method, body: JSON.stringify(data) }) as Promise<Project>
}

export async function closeProject(id: string): Promise<void> {
  await apiFetch(`/pwa/admin/projects/${id}/close`, { method: 'POST' })
}

export async function updateProjectSchedule(
  id: string,
  start_date: string | null,
  end_date: string | null,
  start_time?: string | null,
  end_time?: string | null,
): Promise<void> {
  await apiFetch(`/pwa/admin/projects/${id}/schedule`, {
    method: 'PATCH',
    body: JSON.stringify({
      start_date,
      end_date,
      start_time: start_time ?? null,
      end_time: end_time ?? null,
    }),
  })
}

// ─── Invoices ──────────────────────────────────────────────

export interface Invoice {
  id: string
  invoice_number: string
  project_name: string
  customer_name: string | null
  total_amount: number
  status: string
  created_at: string
  sent_at: string | null
  paid_at: string | null
}

export async function getAdminInvoices(status?: string): Promise<Invoice[]> {
  const q = status ? `?status=${status}` : ''
  return apiFetch(`/pwa/admin/invoices${q}`) as Promise<Invoice[]>
}

export async function markInvoicePaid(id: string): Promise<void> {
  await apiFetch(`/pwa/admin/invoices/${id}/mark-paid`, { method: 'POST' })
}

// ─── Zahlungsabgleich (CAMT) ───────────────────────────────

export type ReconcileStatus = 'matched' | 'amount_mismatch' | 'already_paid' | 'unmatched'

export interface ReconcileResult {
  status: ReconcileStatus
  reference: string | null
  paid_amount: number
  currency: string | null
  value_date: string | null
  debtor_name: string | null
  invoice_id: number | null
  invoice_number: string | null
  project_name: string | null
  expected_amount: number | null
  amount_diff: number | null
}

export interface ReconcileSummary {
  total: number
  matched: number
  amount_mismatch: number
  already_paid: number
  unmatched: number
  applied: number
  dry_run: boolean
}

export interface ReconcileResponse {
  status: string
  summary: ReconcileSummary
  results: ReconcileResult[]
}

export async function reconcileCamt(file: File, dryRun: boolean): Promise<ReconcileResponse> {
  const form = new FormData()
  form.append('file', file)
  return apiFormFetch(
    `/pwa/admin/invoices/reconcile-camt?dry_run=${dryRun ? 'true' : 'false'}`,
    form,
  ) as Promise<ReconcileResponse>
}

export async function getInvoicePdf(id: string): Promise<Blob> {
  const resp = await fetch(`/pwa/admin/invoices/${id}/pdf`, {
    credentials: 'include',
  })
  if (!resp.ok) throw new Error('PDF-Download fehlgeschlagen')
  return resp.blob()
}

// ─── HR Timesheet ───────────────────────────────────────────

export interface WorkSession {
  id: string
  staff_name: string
  date: string
  clock_in: string
  clock_out: string | null
  break_minutes: number
  total_minutes: number | null
}

export interface LaborHourRow {
  staff_name: string
  project_name: string
  hours: number
  date: string
}

export async function getAdminHrTimesheet(dateFrom: string, dateTo: string): Promise<{ sessions: WorkSession[]; labor_hours: LaborHourRow[] }> {
  return apiFetch(`/pwa/admin/hr/timesheet?date_from=${dateFrom}&date_to=${dateTo}`) as Promise<{ sessions: WorkSession[]; labor_hours: LaborHourRow[] }>
}

// ─── Tenant Module Management ───────────────────────────────

export interface TenantModulesResponse {
  enabled_modules: string[]
  known_modules: string[]
  dependencies: Record<string, string[]>
}

export async function getTenantModules(): Promise<TenantModulesResponse> {
  return apiFetch('/pwa/admin/tenant/modules') as Promise<TenantModulesResponse>
}

export async function updateTenantModules(modules: string[]): Promise<{ enabled_modules: string[] }> {
  return apiFetch('/pwa/admin/tenant/modules', {
    method: 'PATCH',
    body: JSON.stringify({ enabled_modules: modules }),
  }) as Promise<{ enabled_modules: string[] }>
}

// ─── Tenant Fahrtkosten-Tabelle ─────────────────────────────

// Eine Zeile der Staffelung: [km-Schwelle, CHF]. null in der km-Schwelle = „und darüber"
// (nur im default_table vom Backend; eigene Tabellen brauchen keine null-Zeile).
export type TravelCostRow = [number | null, number]

export interface TenantTravelCostResponse {
  travel_cost_table: TravelCostRow[] | null  // null = Mandant nutzt System-Default
  default_table: TravelCostRow[]
}

export async function getTenantTravelCost(): Promise<TenantTravelCostResponse> {
  return apiFetch('/pwa/admin/tenant/travel-cost') as Promise<TenantTravelCostResponse>
}

export async function updateTenantTravelCost(
  table: TravelCostRow[] | null,
): Promise<{ travel_cost_table: TravelCostRow[] | null }> {
  return apiFetch('/pwa/admin/tenant/travel-cost', {
    method: 'PATCH',
    body: JSON.stringify({ travel_cost_table: table }),
  }) as Promise<{ travel_cost_table: TravelCostRow[] | null }>
}

// ─── Tenant Feature-Flags (Workflows) ───────────────────────

export type FeatureFieldType = 'bool' | 'number' | 'select' | 'number_list'

export interface FeatureFieldSchema {
  key: string
  label: string
  type: FeatureFieldType
  help?: string
  min?: number
  max?: number
  step?: number
  options?: { value: string; label: string }[]
}

export interface FeatureRegistryEntry {
  key: string
  label: string
  description: string
  category: string
  default: Record<string, unknown>
  schema: FeatureFieldSchema[]
}

export interface TenantFeaturesResponse {
  registry: FeatureRegistryEntry[]
  categories: string[]
  overrides: Record<string, Record<string, unknown>>
  effective: Record<string, Record<string, unknown>>
}

export async function getTenantFeatures(): Promise<TenantFeaturesResponse> {
  return apiFetch('/pwa/admin/tenant/features') as Promise<TenantFeaturesResponse>
}

export async function updateTenantFeature(
  featureKey: string,
  value: Record<string, unknown>,
): Promise<{ feature_key: string; effective: Record<string, unknown> }> {
  return apiFetch('/pwa/admin/tenant/features', {
    method: 'PATCH',
    body: JSON.stringify({ feature_key: featureKey, value }),
  }) as Promise<{ feature_key: string; effective: Record<string, unknown> }>
}

// ─── Häufig benutzte Ersatzteile (kuratierte Material-Liste) ─────────

export interface FrequentMaterial {
  id: string            // frequent_materials.id (für remove/reorder)
  sort_order: number
  material_id: string
  art_nr: string
  name: string
  unit: string
  category?: string | null
  is_active: boolean
  calc_vk: number
}

export async function getFrequentMaterials(): Promise<FrequentMaterial[]> {
  return apiFetch('/pwa/admin/frequent-materials') as Promise<FrequentMaterial[]>
}

export async function addFrequentMaterial(artNr: string): Promise<{ status: string }> {
  return apiFetch('/pwa/admin/frequent-materials', {
    method: 'POST',
    body: JSON.stringify({ art_nr: artNr }),
  }) as Promise<{ status: string }>
}

export async function removeFrequentMaterial(id: string): Promise<{ status: string }> {
  return apiFetch(`/pwa/admin/frequent-materials/${id}`, { method: 'DELETE' }) as Promise<{ status: string }>
}

export async function reorderFrequentMaterials(orderedIds: string[]): Promise<{ status: string }> {
  return apiFetch('/pwa/admin/frequent-materials/order', {
    method: 'PUT',
    body: JSON.stringify({ ordered_ids: orderedIds }),
  }) as Promise<{ status: string }>
}

// ─── Materialdatenbereinigung (superadmin-only) ─────────────────────
// Setzt Artikel auf Aktiv ↔ Löschvormerkung (is_active). NIE Hard-Delete —
// nur Soft-Flag, jederzeit reversibel.

export type MaterialSzenario =
  | 'RECENTLY_USED' | 'QUOTED_AND_BILLED' | 'STALE_USED' | 'RAPPORT_MATERIAL'
  | 'USED_PENDING' | 'QUOTE_ONLY_OLD' | 'QUOTE_ONLY_NEW' | 'NEVER_USED_OLD' | 'NEVER_USED_NEW'

export interface MaterialCleanupRow {
  art_nr: string
  name: string
  category: string | null
  supplier_id: string | null
  is_active: boolean
  created_at: string | null
  szenario: MaterialSzenario
  in_quote: boolean
  in_invoice: boolean
  last_usage_date: string | null
  age_days: number | null
  dq_no_supplier: boolean
  dq_no_price: boolean
}

export interface MaterialCleanupScan {
  counts: Partial<Record<MaterialSzenario, number>>
  total: number          // Artikel im gesamten Filter (Summe der counts)
  row_total: number      // Zeilen in der aktuellen Ansicht (nach szenario-Filter)
  rows: MaterialCleanupRow[]  // aktuelle Seite
  page: number
  page_size: number
  total_pages: number
  blocked: MaterialSzenario[]
}

export interface BulkMaterialStatusResult {
  updated: number
  skipped_blocked: number
}

export async function scanMaterialCleanup(
  p: {
    category?: string; supplier_id?: string; status?: string; szenario?: string
    page?: number; page_size?: number
  } = {},
): Promise<MaterialCleanupScan> {
  const params = new URLSearchParams()
  if (p.category) params.set('category', p.category)
  if (p.supplier_id) params.set('supplier_id', p.supplier_id)
  if (p.status) params.set('status', p.status)
  if (p.szenario) params.set('szenario', p.szenario)
  if (p.page) params.set('page', String(p.page))
  if (p.page_size) params.set('page_size', String(p.page_size))
  const qs = params.toString()
  return apiFetch(`/pwa/admin/material-cleanup/scan${qs ? `?${qs}` : ''}`) as Promise<MaterialCleanupScan>
}

export async function bulkSetMaterialStatus(
  artNrs: string[], isActive: boolean,
): Promise<BulkMaterialStatusResult> {
  return apiFetch('/pwa/admin/material-cleanup/bulk-status', {
    method: 'POST',
    body: JSON.stringify({ art_nrs: artNrs, is_active: isActive }),
  }) as Promise<BulkMaterialStatusResult>
}

// ─── Aftersales ────────────────────────────────────────────

export type AftersalesKind = 'feedback' | 'repair_check'
export type AftersalesStatus =
  | 'scheduled' | 'review' | 'sent' | 'answered' | 'cancelled' | 'failed'

export interface AftersalesPositionItem {
  description: string
  quantity?: number | string
  unit?: string
  unit_price?: number | string
  total_price?: number | string
}

export interface AftersalesSnapshot {
  invoice_number?: string
  total_amount?: number | string | null
  items?: AftersalesPositionItem[]
}

export interface AftersalesTask {
  id: number
  invoice_id: number | null
  project_name: string | null
  customer_name: string | null
  customer_email: string | null
  object_address: string | null
  kind: AftersalesKind
  status: AftersalesStatus
  review_start: string
  send_date: string
  season_year: number | null
  positions_snapshot: AftersalesSnapshot | null
  mail_subject: string | null
  mail_body: string | null
  mail_body_generated_at: string | null
  sent_at: string | null
  response_text: string | null
  responded_at: string | null
  created_at: string
}

export async function listAftersales(status?: AftersalesStatus): Promise<AftersalesTask[]> {
  const qs = status ? `?status=${status}` : ''
  const res = await apiFetch(`/pwa/admin/aftersales${qs}`) as { tasks: AftersalesTask[] }
  return res.tasks
}

export async function getAftersales(id: number): Promise<AftersalesTask> {
  return apiFetch(`/pwa/admin/aftersales/${id}`) as Promise<AftersalesTask>
}

export async function updateAftersales(
  id: number,
  fields: { send_date?: string; mail_subject?: string; mail_body?: string },
): Promise<void> {
  await apiFetch(`/pwa/admin/aftersales/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(fields),
  })
}

export async function regenerateAftersalesBody(
  id: number,
): Promise<{ subject: string; body: string }> {
  return apiFetch(`/pwa/admin/aftersales/${id}/regenerate`, { method: 'POST' }) as Promise<{ subject: string; body: string }>
}

export async function sendAftersalesNow(id: number): Promise<void> {
  await apiFetch(`/pwa/admin/aftersales/${id}/send`, { method: 'POST' })
}

export async function cancelAftersales(id: number): Promise<void> {
  await apiFetch(`/pwa/admin/aftersales/${id}/cancel`, { method: 'POST' })
}
