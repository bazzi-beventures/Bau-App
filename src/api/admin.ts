import { apiFetch } from './client'
import { AdminScreen } from '../admin/useAdminNav'

// ─── Dashboard ─────────────────────────────────────────────

export interface AdminDashboard {
  pending_corrections: number
  pending_absences: number
  open_invoices: number
  open_sessions: number
  draft_quotes: number
}

export async function getAdminDashboard(): Promise<AdminDashboard> {
  return apiFetch('/pwa/admin/dashboard') as Promise<AdminDashboard>
}

// ─── Staff ─────────────────────────────────────────────────

export interface StaffMember {
  id: string
  name: string
  kuerzel: string | null
  funktion: string | null
  hourly_rate: number | null
  monthly_salary: number | null
  authorized_user_id: string | null
  email: string | null
  role: string | null
  is_active: boolean
}

export async function getAdminStaff(): Promise<StaffMember[]> {
  return apiFetch('/pwa/admin/staff') as Promise<StaffMember[]>
}

export async function upsertStaff(data: Partial<StaffMember> & { id?: string }): Promise<StaffMember> {
  const method = data.id ? 'PATCH' : 'POST'
  const url = data.id ? `/pwa/admin/staff/${data.id}` : '/pwa/admin/staff'
  return apiFetch(url, { method, body: JSON.stringify(data) }) as Promise<StaffMember>
}

export async function generateStaffPin(staffId: string): Promise<{ pin: string; expires_at: string }> {
  return apiFetch(`/pwa/admin/staff/${staffId}/generate-pin`, { method: 'POST' }) as Promise<{ pin: string; expires_at: string }>
}

// ─── Password Auth ─────────────────────────────────────────

export async function loginWithPassword(tenantSlug: string, email: string, password: string): Promise<void> {
  await apiFetch('/pwa/auth/login-password', {
    method: 'POST',
    body: JSON.stringify({ tenant_slug: tenantSlug, email, password }),
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

// ─── Corrections ───────────────────────────────────────────

export interface Correction {
  id: string
  staff_name: string
  date: string
  requested_clock_in: string | null
  requested_clock_out: string | null
  current_clock_in: string | null
  current_clock_out: string | null
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
  const resp = await fetch(`/pwa/admin/invoices/${id}/pdf`, { credentials: 'include' })
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
