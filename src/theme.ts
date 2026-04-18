export type Theme = 'dark' | 'light'

export const THEME_STORAGE_KEY = 'admin-theme'

export function loadTheme(): Theme {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY)
    return v === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export function applyTheme(t: Theme): void {
  document.documentElement.setAttribute('data-theme', t)
  try { localStorage.setItem(THEME_STORAGE_KEY, t) } catch { /* ignore */ }
}

export function toggleTheme(current: Theme): Theme {
  return current === 'dark' ? 'light' : 'dark'
}
