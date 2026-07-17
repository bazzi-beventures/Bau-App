import { apiFetch } from './client'

export type ErrorLevel = 'warning' | 'error' | 'critical'

export interface ErrorLogRow {
  id: number
  occurred_at: string
  tenant_id: string | null
  tenant_name: string | null
  user_id: string | null
  level: ErrorLevel
  source: string
  error_type: string | null
  message: string
  traceback: string | null
  fingerprint: string | null
  context: Record<string, unknown>
}

export interface ErrorLogTenant {
  id: string
  name: string
}

export interface ErrorLogsResponse {
  rows: ErrorLogRow[]
  tenants: ErrorLogTenant[]
  capped: boolean  // true wenn das Fenster mehr als das Limit (500) hätte
}

export interface ErrorLogsParams {
  since?: string   // ISO-Zeitstempel (occurred_at >=)
  until?: string   // ISO-Zeitstempel (occurred_at <=)
  tenantId?: string
}

export async function getErrorLogs(params: ErrorLogsParams = {}): Promise<ErrorLogsResponse> {
  const q = new URLSearchParams()
  if (params.since) q.set('since', params.since)
  if (params.until) q.set('until', params.until)
  if (params.tenantId) q.set('tenant_id', params.tenantId)
  const qs = q.toString()
  return apiFetch(`/pwa/superadmin/error-logs${qs ? `?${qs}` : ''}`) as Promise<ErrorLogsResponse>
}
