import { apiFetch } from './client'

// Projekt-Aufgaben (Checkliste). Admin legt sie an, der Monteur hakt sie in der
// Mitarbeiter-PWA ab. Siehe ProjekteScreen für die Offline-Queue.
export interface ProjectTask {
  id: string
  text: string
  is_done: boolean
  done_at: string | null
  done_by_name: string | null
  created_by_name?: string | null
  created_at: string
}

// Hakt eine Aufgabe ab bzw. setzt sie zurück. Geteilt zwischen direktem Klick
// und dem Offline-Queue-Drain, damit die Call-Logik nur an einer Stelle lebt.
export async function toggleProjectTaskDone(
  projectId: string,
  taskId: string,
  isDone: boolean,
): Promise<void> {
  await apiFetch(`/pwa/projects/${projectId}/tasks/${taskId}/done`, {
    method: 'PATCH',
    body: JSON.stringify({ is_done: isDone }),
  })
}
