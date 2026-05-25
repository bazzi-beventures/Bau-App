import { UserInfo } from './auth'

export type ModuleName =
  | 'timekeeping'
  | 'scheduling'
  | 'quotes'
  | 'invoicing'
  | 'inventory'
  | 'hr'
  | 'arg_compliance'
  | 'violation_emails'
  | 'kpis'
  | 'kpis_email'
  | 'ai'
  | 'help_bot'
  | 'clock_in_reminder'

export function hasModule(user: UserInfo | null, name: ModuleName): boolean {
  if (!user) return false
  return user.enabled_modules?.includes(name) ?? false
}
