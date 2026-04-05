import { apiFetch } from './client'

export interface UserInfo {
  authorized_user_id: string
  display_name: string
  staff_id: string | null
  staff_name: string
  tenant_id: string
  role: string
}

export async function lookupUser(tenantSlug: string, displayName: string): Promise<{ authorized_user_id: string; display_name: string }> {
  return apiFetch('/pwa/auth/lookup-user', {
    method: 'POST',
    body: JSON.stringify({ tenant_slug: tenantSlug, display_name: displayName }),
  }) as Promise<{ authorized_user_id: string; display_name: string }>
}

export async function validatePin(tenantSlug: string, authorizedUserId: string, pin: string): Promise<{ status: string; display_name: string }> {
  return apiFetch('/pwa/auth/validate-pin', {
    method: 'POST',
    body: JSON.stringify({ tenant_slug: tenantSlug, authorized_user_id: authorizedUserId, pin }),
  }) as Promise<{ status: string; display_name: string }>
}

export async function getMe(): Promise<UserInfo> {
  return apiFetch('/pwa/me') as Promise<UserInfo>
}

export async function logout(): Promise<void> {
  await apiFetch('/pwa/auth/logout', { method: 'POST' })
}

export interface TenantInfo {
  name: string
  brand_color: string
  brand_color_dark: string
  logo_url: string
}

export async function getTenantInfo(tenantSlug: string): Promise<TenantInfo> {
  return apiFetch(`/pwa/tenant-info?tenant_slug=${encodeURIComponent(tenantSlug)}`) as Promise<TenantInfo>
}
