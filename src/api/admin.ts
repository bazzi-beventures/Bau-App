import { apiFetch } from './client'
import { SK } from './storageKeys'
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
}

export interface PendingApproval {
  id: string
  title: string
  filename: string
  file_url: string | null
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
  project_name: string
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

export async function upsertStaff(data: Partial<StaffMember> & { id?: string }): Promise<StaffMember> {
  const method = data.id ? 'PATCH' : 'POST'
  const url = data.id ? `/pwa/admin/staff/${data.id}` : '/pwa/admin/staff'
  return apiFetch(url, { method, body: JSON.stringify(data) }) as Promise<StaffMember>
}

export async function deleteStaff(staffId: string): Promise<void> {
  await apiFetch(`/pwa/admin/staff/${staffId}`, { method: 'DELETE' })
}

// ─── Password Auth ─────────────────────────────────────────

export async function loginWithPassword(username: string, password: string): Promise<{ tenant_slug: string }> {
  const result = await apiFetch('/pwa/auth/login-password', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  }) as { tenant_slug: string; token?: string }
  if (result.token) {
    const { saveToken } = await import('./client')
    saveToken(result.token)
  }
  return result
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
  customer_name: string | null
  customer_email: string | null
  customer_address: string | null
  is_closed: boolean
  created_at: string
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

export async function getInvoicePdf(id: string): Promise<Blob> {
  const token = localStorage.getItem(SK.TOKEN)
  const resp = await fetch(`/pwa/admin/invoices/${id}/pdf`, {
    credentials: 'include',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
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
