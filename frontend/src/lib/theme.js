// Light by default. People can pick Dark, or Auto to follow their phone.
const KEY = 'velfi_theme'
const media = () => window.matchMedia('(prefers-color-scheme: dark)')

export function getThemeChoice() {
  try { const v = localStorage.getItem(KEY); return v === 'dark' || v === 'system' ? v : 'light' } catch { return 'light' }
}

function apply(choice) {
  const dark = choice === 'dark' || (choice === 'system' && media().matches)
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0D0C12' : '#EEECF4')
}

export function setThemeChoice(choice) {
  try { localStorage.setItem(KEY, choice) } catch {}
  apply(choice)
}

export function initTheme() {
  apply(getThemeChoice())
  media().addEventListener?.('change', () => { if (getThemeChoice() === 'system') apply('system') })
}
