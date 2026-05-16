import { apiFetch } from './client'

export type ServiceName = 'railway' | 'supabase' | 'mistral'
export type ServiceStatus = 'ok' | 'down' | 'slow'

export interface LatestCheck {
  checked_at: string
  status: ServiceStatus
  response_ms: number | null
  http_status: number | null
  error: string | null
}

export interface UptimeStats {
  checks: number
  ok: number
  uptime_pct: number
  avg_ms: number | null
}

export interface ServiceHealth {
  latest: LatestCheck | null
  uptime_24h: UptimeStats
  uptime_7d: UptimeStats
}

export interface HealthStatusResponse {
  services: Record<ServiceName, ServiceHealth>
}

export async function getHealthStatus(): Promise<HealthStatusResponse> {
  return apiFetch('/pwa/superadmin/health/status') as Promise<HealthStatusResponse>
}
