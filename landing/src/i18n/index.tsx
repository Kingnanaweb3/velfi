// Languages for velfi.xyz: English (/), Simplified Chinese (/zh) and Korean (/ko).
// The path decides first, then the visitor's saved choice, then the browser language.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, Fragment } from 'react'
import type { ReactNode } from 'react'
import { en } from './en'
import type { Key, Dict } from './en'
import { zh } from './zh'
import { ko } from './ko'

export type Lang = 'en' | 'zh' | 'ko'
export const LANGS: { code: Lang; label: string; html: string }[] = [
  { code: 'en', label: 'EN', html: 'en' },
  { code: 'zh', label: '中文', html: 'zh-CN' },
  { code: 'ko', label: '한국어', html: 'ko' },
]
const DICTS: Record<Lang, Dict> = { en, zh, ko }
const SAVE = 'velfi_lang'

// Chinese and Korean webfonts, loaded only when that language is on.
const FONT_URL: Partial<Record<Lang, string>> = {
  zh: 'https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;600;700&display=swap',
  ko: 'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap',
}

function fromPath(): Lang | null {
  const p = window.location.pathname.replace(/\/+$/, '')
  if (p === '/zh') return 'zh'
  if (p === '/ko') return 'ko'
  return null
}
function saved(): Lang | null {
  try { const v = localStorage.getItem(SAVE); return v === 'en' || v === 'zh' || v === 'ko' ? v : null } catch { return null }
}
function fromBrowser(): Lang {
  const list = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language]) || []
  for (const l of list) {
    const s = String(l).toLowerCase()
    if (s.startsWith('zh')) return 'zh'
    if (s.startsWith('ko')) return 'ko'
    if (s.startsWith('en')) return 'en'
  }
  return 'en'
}
export function initialLang(): Lang {
  return fromPath() ?? saved() ?? fromBrowser()
}
const pathFor = (l: Lang) => (l === 'en' ? '/' : `/${l}`)

function applyToDocument(l: Lang) {
  const d = DICTS[l]
  document.documentElement.lang = LANGS.find(x => x.code === l)!.html
  document.title = d.metaTitle
  document.querySelector('meta[name="description"]')?.setAttribute('content', d.metaDesc)
  const url = FONT_URL[l]
  if (url && !document.querySelector(`link[data-font="${l}"]`)) {
    const link = document.createElement('link')
    link.rel = 'stylesheet'; link.href = url; link.dataset.font = l
    document.head.appendChild(link)
  }
}

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (k: Key) => string }
const LangContext = createContext<Ctx | null>(null)

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang)

  // Keep the address bar in step (so a shared link opens in the same language),
  // without adding a history entry on first load.
  useEffect(() => {
    applyToDocument(lang)
    const want = pathFor(lang)
    const cur = window.location.pathname.replace(/\/+$/, '') || '/'
    if (cur === '/' || cur === '/zh' || cur === '/ko') {
      if (cur !== want) window.history.replaceState(null, '', want + window.location.search + window.location.hash)
    }
  }, [lang])

  useEffect(() => {
    const onPop = () => { const p = fromPath(); setLangState(p ?? 'en') }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const setLang = useCallback((l: Lang) => {
    try { localStorage.setItem(SAVE, l) } catch { /* private mode */ }
    setLangState(l)
  }, [])

  const value = useMemo<Ctx>(() => ({ lang, setLang, t: (k: Key) => DICTS[lang][k] ?? en[k] }), [lang, setLang])
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>
}

export function useLang() {
  const c = useContext(LangContext)
  if (!c) throw new Error('useLang outside LangProvider')
  return c
}

// Fill "{name}" placeholders in a string with React nodes (links and the like).
export function rich(text: string, parts: Record<string, ReactNode>): ReactNode {
  const out: ReactNode[] = []
  text.split(/(\{\w+\})/).forEach((seg, i) => {
    const m = seg.match(/^\{(\w+)\}$/)
    out.push(<Fragment key={i}>{m && m[1] in parts ? parts[m[1]] : seg}</Fragment>)
  })
  return out
}
