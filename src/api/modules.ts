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
  | 'ai'

export function hasModule(user: UserInfo | null, name: ModuleName): boolean {
  if (!user) return false
  return user.enabled_modules?.includes(name) ?? false
}
