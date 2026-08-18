// Dokument-Massensicherung (Modul `document_backup`, nur Management).
// Teil des api/admin/-Barrels (Charge H1): eine Datei je Domäne, gebündelt in
// index.ts — bestehende `from '../api/admin'`-Importe bleiben damit gültig.

import { apiFetch } from '../client'

export type DocumentBackupStatus = 'pending' | 'running' | 'ready' | 'failed' | 'cancelled'

export interface DocumentBackupPart {
  filename: string | null
  document_count: number
  total_bytes: number
  download_url: string
}

export interface DocumentBackupJob {
  id: number
  status: DocumentBackupStatus
  document_count: number
  total_bytes: number
  filename: string | null
  error: string | null
  created_at: string
  ready_at: string | null
  expires_at: string | null
  expired: boolean
  cancel_requested: boolean
  // Ein Backup kann auf mehrere Teil-ZIPs aufgeteilt sein (Storage-Upload-Limit).
  // `parts` ist maßgeblich; `download_url` bleibt für Einzel-Teil-Backups gesetzt.
  parts: DocumentBackupPart[]
  download_url: string | null
}

// Vorab-Übersicht für den Bestätigungs-Dialog (startet noch nichts).
export interface DocumentBackupPreview {
  document_count: number
  invoices: number
  quotes: number
  reports: number
  max_per_month: number         // 0 = unbegrenzt
  used_this_month: number
  remaining_this_month: number | null  // null = unbegrenzt
  limit_reached: boolean
  active: boolean
}

export async function getDocumentBackupPreview(): Promise<DocumentBackupPreview> {
  return apiFetch<DocumentBackupPreview>('/pwa/admin/document-backup/preview')
}

export async function startDocumentBackup(): Promise<DocumentBackupJob> {
  return apiFetch<DocumentBackupJob>('/pwa/admin/document-backup', { method: 'POST' })
}

export async function getLatestDocumentBackup(): Promise<DocumentBackupJob | null> {
  const res = await apiFetch('/pwa/admin/document-backup/latest') as { job: DocumentBackupJob | null }
  return res.job
}

export async function getDocumentBackup(id: number): Promise<DocumentBackupJob> {
  return apiFetch<DocumentBackupJob>(`/pwa/admin/document-backup/${id}`)
}

export async function cancelDocumentBackup(id: number): Promise<DocumentBackupJob> {
  return apiFetch<DocumentBackupJob>(`/pwa/admin/document-backup/${id}/cancel`, { method: 'POST' })
}
