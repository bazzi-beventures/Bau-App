export type ProjectStatus = 'offen' | 'abgeschlossen'

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  offen: 'Offen',
  abgeschlossen: 'Abgeschlossen',
}

export const PROJECT_STATUS_BADGE: Record<ProjectStatus, string> = {
  offen: 'admin-badge-active',
  abgeschlossen: 'admin-badge-closed',
}

export const QUOTE_STATUS_LABELS: Record<string, string> = {
  entwurf: 'Entwurf',
  gesendet: 'Gesendet',
  akzeptiert: 'Akzeptiert',
  abgelehnt: 'Abgelehnt',
  absage: 'Absage',
  archiviert: 'Archiviert',
}

export const QUOTE_STATUS_BADGE: Record<string, string> = {
  entwurf: 'admin-badge-draft',
  gesendet: 'admin-badge-sent',
  akzeptiert: 'admin-badge-approved',
  abgelehnt: 'admin-badge-rejected',
  absage: 'admin-badge-rejected',
  archiviert: 'admin-badge-closed',
}

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  ausstehend: 'Ausstehend',
  offen: 'Offen',
  gesendet: 'Gesendet',
  bezahlt: 'Bezahlt',
  archiviert: 'Archiviert',
  inaktiv: 'Inaktiv',
}

export const INVOICE_STATUS_BADGE: Record<string, string> = {
  ausstehend: 'admin-badge-open',
  offen: 'admin-badge-open',
  gesendet: 'admin-badge-sent',
  bezahlt: 'admin-badge-paid',
  archiviert: 'admin-badge-closed',
  inaktiv: 'admin-badge-draft',
}
