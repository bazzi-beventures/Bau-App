import { useState } from 'react'

export type AdminScreen =
  | 'dashboard'
  | 'my-time'
  | 'staff'
  | 'bulk-clockin'
  | 'absences'
  | 'corrections'
  | 'hr-reports'
  | 'vacation'
  | 'projects'
  | 'project-drafts'
  | 'project-schedule'
  | 'customers'
  | 'quotes'
  | 'invoices'
  | 'aftersales'
  | 'payment-reconciliation'
  | 'suppliers'
  | 'staff-roles'
  | 'materials'
  | 'pricing-rules'
  | 'quote-templates'
  | 'users'
  | 'kpis'
  | 'document-backup'
  | 'admin-tools'

export interface AdminNavState {
  screen: AdminScreen
  detailId: string | null
  resetTick: number
  nav: (screen: AdminScreen, detailId?: string) => void
  clearDetail: () => void
}

export function useAdminNav(): AdminNavState {
  const [screen, setScreen] = useState<AdminScreen>('dashboard')
  const [detailId, setDetailId] = useState<string | null>(null)
  const [resetTick, setResetTick] = useState(0)

  function nav(nextScreen: AdminScreen, nextDetailId?: string) {
    const nextDetail = nextDetailId ?? null
    if (nextScreen === screen && nextDetail === detailId) {
      setResetTick(t => t + 1)
    }
    setScreen(nextScreen)
    setDetailId(nextDetail)
  }

  function clearDetail() {
    setDetailId(null)
  }

  return { screen, detailId, resetTick, nav, clearDetail }
}
