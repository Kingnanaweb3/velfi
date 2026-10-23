// The app's languages: English, Simplified Chinese, Korean.
// Order: ?lang= in the address (the landing page passes it), then the saved choice,
// then the browser language. t() reads the current language; changing it remounts
// the app (see LangProvider), so every screen redraws in the new language.
import { createContext, useContext, useEffect, useState, Fragment } from 'react'
import { en } from './en.js'
import { zh } from './zh.js'
import { ko } from './ko.js'

export const LANGS = [
  { code: 'en', label: 'EN', html: 'en', locale: 'en-US' },
  { code: 'zh', label: '中文', html: 'zh-CN', locale: 'zh-CN' },
  { code: 'ko', label: '한국어', html: 'ko', locale: 'ko-KR' },
]
const DICTS = { en, zh, ko }
const SAVE = 'velfi_lang'
const FONTS = {
  zh: 'https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;600&display=swap',
  ko: 'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600&display=swap',
}
const valid = (l) => (l === 'en' || l === 'zh' || l === 'ko' ? l : null)

function detect() {
  try {
    const q = valid(new URLSearchParams(window.location.search).get('lang'))
    if (q) { try { localStorage.setItem(SAVE, q) } catch {} return q }
  } catch {}
  try { const s = valid(localStorage.getItem(SAVE)); if (s) return s } catch {}
  for (const l of (navigator.languages?.length ? navigator.languages : [navigator.language || 'en'])) {
    const s = String(l).toLowerCase()
    if (s.startsWith('zh')) return 'zh'
    if (s.startsWith('ko')) return 'ko'
    if (s.startsWith('en')) return 'en'
  }
  return 'en'
}

let LANG = detect()
export const getLang = () => LANG
export const getLocale = () => LANGS.find(l => l.code === LANG).locale

// t('key') or t('key', { n: 3 }) -> text in the current language (English if a key is missing).
export function t(key, vars) {
  let s = DICTS[LANG][key] ?? en[key] ?? key
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v))
  return s
}

function apply(l) {
  document.documentElement.lang = LANGS.find(x => x.code === l).html
  if (FONTS[l] && !document.querySelector(`link[data-font="${l}"]`)) {
    const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = FONTS[l]; link.dataset.font = l
    document.head.appendChild(link)
  }
}
apply(LANG)

const Ctx = createContext({ lang: LANG, setLang: () => {} })
export function LangProvider({ children }) {
  const [lang, setLangState] = useState(LANG)
  useEffect(() => { apply(lang) }, [lang])
  const setLang = (l) => {
    if (!valid(l) || l === LANG) return
    LANG = l
    try { localStorage.setItem(SAVE, l) } catch {}
    setLangState(l)
  }
  return <Ctx.Provider value={{ lang, setLang }}><Fragment key={lang}>{children}</Fragment></Ctx.Provider>
}
export const useLang = () => useContext(Ctx)
