import { useState } from 'react'

export type AdminScreen =
  | 'dashboard'
  | 'staff'
  | 'absences'
  | 'corrections'
  | 'hr-reports'
  | 'projects'
  | 'customers'
  | 'quotes'
  | 'invoices'
  | 'project-overview'
  | 'suppliers'
  | 'materials'
  | 'pricing-rules'
  | 'users'
  | 'import'
  | 'kpis'

export interface AdminNavState {
  screen: AdminScreen
  detailId: string | null
  nav: (screen: AdminScreen, detailId?: string) => void
  clearDetail: () => void
}

export function useAdminNav(): AdminNavState {
  const [screen, setScreen] = useState<AdminScreen>('dashboard')
  const [detailId, setDetailId] = useState<string | null>(null)

  function nav(nextScreen: AdminScreen, nextDetailId?: string) {
    setScreen(nextScreen)
    setDetailId(nextDetailId ?? null)
  }

  function clearDetail() {
    setDetailId(null)
  }

  return { screen, detailId, nav, clearDetail }
}
