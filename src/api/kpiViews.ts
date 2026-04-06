import { apiFetch } from './client'

interface KpiViewResponse<T> {
  view: string
  rows: T[]
  count: number
}

export async function fetchKpiView<T>(
  viewName: string,
  filters?: Record<string, string>,
): Promise<T[]> {
  const params = new URLSearchParams(filters)
  const qs = params.toString()
  const url = `/pwa/kpi-views/${viewName}${qs ? '?' + qs : ''}`
  const res = (await apiFetch(url)) as KpiViewResponse<T>
  return res.rows
}
