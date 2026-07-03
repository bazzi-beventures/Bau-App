import { apiFetch } from './client'

export interface DraftMaterial {
  name: string
  quantity?: string | null
}

export interface ProjectDraftPayload {
  customer_name: string
  customer_phone?: string | null
  customer_email?: string | null
  customer_address?: string | null
  title: string
  description?: string | null
  object_address?: string | null
  materials: DraftMaterial[]
  notes?: string | null
}

export interface ProjectDraft extends ProjectDraftPayload {
  id: string
  tenant_id: string
  created_by_staff_id: string | null
  created_by_name: string | null
  status: 'open' | 'converted' | 'rejected'
  converted_to_project_id: string | null
  decision_note: string | null
  decided_at: string | null
  created_at: string
  updated_at: string
}

export async function createProjectDraft(payload: ProjectDraftPayload): Promise<ProjectDraft> {
  return apiFetch('/pwa/project-drafts', {
    method: 'POST',
    body: JSON.stringify(payload),
    // Entwurf hat eine Offline-Queue: im Funkloch lieber nach 15s abbrechen
    // und queuen, als minutenlang im Spinner zu hängen.
    timeoutMs: 15_000,
  }) as Promise<ProjectDraft>
}

export async function getAdminProjectDrafts(
  status: 'open' | 'converted' | 'rejected' | 'all' = 'open',
): Promise<ProjectDraft[]> {
  return apiFetch(`/pwa/admin/project-drafts?status=${status}`) as Promise<ProjectDraft[]>
}

export interface ConvertDraftPayload {
  project_name: string
  customer_id?: string | null
  object_address?: string | null
  // Baustellenkontakt — wird serverseitig als is_site_contact-Eintrag in
  // projects.kontakte gespeichert (siehe Migration 20260516d).
  site_contact_name?: string | null
  site_contact_phone?: string | null
  art_der_arbeit?: 'Neumontage' | 'Wiedermontage' | 'Umbau' | 'Reparatur' | 'Wartung' | 'Demontage' | null
  projektleiter_id?: string | null
  bemerkung?: string | null
  start_date?: string | null
  end_date?: string | null
}

export async function convertProjectDraft(
  draftId: string,
  payload: ConvertDraftPayload,
): Promise<{ status: string; project_id: string | null; project_name: string }> {
  return apiFetch(`/pwa/admin/project-drafts/${draftId}/convert`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }) as Promise<{ status: string; project_id: string | null; project_name: string }>
}

export async function rejectProjectDraft(draftId: string, note?: string | null): Promise<void> {
  await apiFetch(`/pwa/admin/project-drafts/${draftId}/reject`, {
    method: 'POST',
    body: JSON.stringify({ note: note ?? null }),
  })
}
