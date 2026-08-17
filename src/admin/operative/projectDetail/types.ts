export type ProjectFileCategory =
  | 'fotos'
  | 'masse'
  | 'sonstiges'
  | 'angebot_lieferant'
  | 'bestellungen'
  | 'auftragsbestaetigung'
  | 'lieferschein'
  | 'anhang'
  | 'prospekt' // Altbestand: frühere Kategorie der Offerten-Anhänge, wird unter 'anhang' angezeigt
  | 'rapport'  // eingescanntes Papier-Blatt oder Rapport aus einem Fremdsystem (z.B. Sorba)
  | 'offerte'  // eingescannte/externe Offerte, die nicht im System erstellt wurde

export interface ProjectFile {
  id: string
  filename: string
  file_url: string | null
  storage_path?: string | null
  mime_type: string | null
  category: ProjectFileCategory | null
  created_at: string
}

export interface ProjectQuote {
  id: number
  parent_id: number | null
  version: number
  quote_number: string
  total_amount: number
  status: string
  created_at: string
  pdf_url: string | null
  xlsx_url: string | null
  storage_path?: string | null
  xlsx_storage_path?: string | null
  customer_email: string | null
  thankyou_sent_at?: string | null
  rejection_mail_sent_at?: string | null
  variant_group_id?: string | null
  variant_group_kind?: string | null
  variant_rank?: number | null
}

export interface ProjectInvoice {
  id: number
  parent_id: number | null
  version: number
  invoice_number: string
  total_amount: number
  status: string
  created_at: string
  paid_at: string | null
  pdf_url: string | null
  storage_path?: string | null
  created_without_report?: boolean
}

export interface ProjectReport {
  id: number
  report_date: string
  description: string | null
  created_by: string | null
  pdf_url: string | null
  storage_path?: string | null
  signature_timestamp: string | null
  invoice_id: number | null
  created_at: string
  // Herkunft des Rapports: 'chat' (Standard, Monteur-App) oder 'admin_manual'
  // (Projektleiter hat ihn im Projekt-Detail nacherfasst). Steuert das Badge.
  source?: string
  // Dieser Einsatz ist als Garantiefall erfasst (reports.is_warranty). Eigenes
  // Badge NEBEN dem Status: es ersetzt «Abgerechnet»/«Manuell» nicht, sondern
  // ergänzt sie — beim Verrechnen ist genau diese Kombination die interessante.
  is_warranty?: boolean | null
}

export interface ProjectTask {
  id: string
  text: string
  is_done: boolean
  done_at: string | null
  done_by_name: string | null
  created_by_name?: string | null
  created_at: string
}

export interface ProjectApproval {
  id: string
  title: string
  filename: string
  file_url: string | null
  storage_path?: string | null
  mime_type: string | null
  requested_by_user_id: string | null
  requested_by_name: string | null
  approver_user_id: string | null
  approver_name: string | null
  status: 'pending' | 'approved' | 'rejected'
  decided_at: string | null
  decision_note: string | null
  created_at: string
}

export const APPROVAL_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendent',
  approved: 'Freigegeben',
  rejected: 'Abgelehnt',
}

export const APPROVAL_STATUS_BADGE: Record<string, string> = {
  pending: 'admin-badge-open',
  approved: 'admin-badge-paid',
  rejected: 'admin-badge-closed',
}

export function groupByParent<T extends { id: number; parent_id: number | null; version: number }>(items: T[]): T[][] {
  const groups = new Map<number, T[]>()
  for (const item of items) {
    const key = item.parent_id ?? item.id
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(item)
  }
  const result = Array.from(groups.values())
  for (const g of result) g.sort((a, b) => b.version - a.version)
  result.sort((a, b) => {
    const aDate = (a[0] as unknown as { created_at: string }).created_at
    const bDate = (b[0] as unknown as { created_at: string }).created_at
    return new Date(bDate).getTime() - new Date(aDate).getTime()
  })
  return result
}
