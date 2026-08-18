// Rechnungen: Liste, Erzeugung, Versand und Status-Wechsel (Modul `invoicing`).
// Teil des api/admin/-Barrels (Charge H1): eine Datei je Domäne, gebündelt in
// index.ts — bestehende `from '../api/admin'`-Importe bleiben damit gültig.

import { apiFetch } from '../client'

// `id` ist eine Zahl (invoices.id ist bigint, siehe supabase_full_schema.sql).
// Die frühere Fassung dieses Typs — nie von einem Screen benutzt — führte hier
// `string` und ein halbes Dutzend Felder, die es nicht gibt; die gelebte Form
// stand stattdessen im InvoicesScreen. Wer den Typ ändert, ändert ihn hier.
export interface Invoice {
  id: number
  invoice_number: string
  project_name: string
  total_amount: number
  status: string
  created_at: string
  paid_at: string | null
  pdf_url: string | null
  storage_path?: string | null
  customer_email?: string | null
  projektleiter_id: string | null
  // Projektbezug: nach dem Bezahlen fragt die Übersicht, ob das Projekt
  // abgeschlossen werden soll — bei einem längst geschlossenen Projekt nicht.
  project_id: string | null
  project_status?: string | null
  project_is_closed?: boolean | null
}

export interface GenerateInvoiceInput {
  project_name: string
  project_id: string
  // true = aus der akzeptierten Offerte abrechnen statt aus den Rapporten.
  use_quote: boolean
  work_description: string
  remark: string
}

export interface GenerateInvoiceResult {
  invoice_number: string
  total_amount: number
  // Sammelrechnung: bei mehreren angenommenen Offerten eines Projekts deckt EINE
  // Rechnung alle noch unverrechneten ab — hier stehen deren Nummern.
  quote_numbers?: string[]
  // Hinweise, die den Erfolg nicht in Frage stellen (z.B. ein Rapport ohne Preis).
  warnings?: unknown
}

export async function listInvoices(status?: string): Promise<Invoice[]> {
  return apiFetch<Invoice[]>(`/pwa/admin/invoices${status ? `?status=${status}` : ''}`)
}

export async function generateInvoice(input: GenerateInvoiceInput): Promise<GenerateInvoiceResult> {
  return apiFetch<GenerateInvoiceResult>('/pwa/admin/invoices/generate', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/**
 * Vorschlag für den Leistungsbeschrieb der Rechnung (aus Rapporten/Offerte
 * zusammengesetzt). Nicht blockierend gedacht: schlägt der Aufruf fehl, entsteht
 * die Rechnung ohne den Block.
 */
export async function getInvoiceWorkDescription(projectName: string, projectId: string): Promise<string> {
  const res = await apiFetch<{ work_description: string }>(
    `/pwa/admin/invoices/work-description?project_name=${encodeURIComponent(projectName)}`
    + `&project_id=${encodeURIComponent(projectId)}`,
  )
  return res.work_description || ''
}

export async function sendInvoice(invoiceId: number, recipientEmail: string): Promise<void> {
  await apiFetch('/pwa/admin/invoices/send', {
    method: 'POST',
    body: JSON.stringify({ invoice_id: invoiceId, recipient_email: recipientEmail }),
  })
}

/** `paidAt` ist das Zahlungsdatum (ISO), nicht der Zeitpunkt des Klicks. */
export async function markInvoicePaid(id: number, paidAt: string): Promise<void> {
  await apiFetch(`/pwa/admin/invoices/${id}/mark-paid`, {
    method: 'POST',
    body: JSON.stringify({ paid_at: paidAt }),
  })
}

export async function unmarkInvoicePaid(id: number): Promise<void> {
  await apiFetch(`/pwa/admin/invoices/${id}/unmark-paid`, { method: 'POST' })
}

/** Postversand: die Rechnung gilt als gesendet, ohne dass eine Mail rausgeht. */
export async function markInvoiceSentByPost(id: number, sentDate: string): Promise<void> {
  await apiFetch(`/pwa/admin/invoices/${id}/mark-sent`, {
    method: 'POST',
    body: JSON.stringify({ sent_date: sentDate }),
  })
}

/** Archivieren macht die verrechneten Rapporte wieder verrechenbar. */
export async function archiveInvoice(id: number): Promise<void> {
  await apiFetch(`/pwa/admin/invoices/${id}/archive`, { method: 'POST' })
}
