// Replies in the person's language. The app sends x-velfi-lang (en | zh | ko).
// Velfi writes every reply in English first (templates, the parser, the assistant),
// then, for Chinese and Korean, this translates the text fields of each JSON
// response just before it is sent.
//
// Money safety: amounts, token symbols, .vel names, emails, addresses and links
// must come back exactly as written. Any translation that drops or changes one is
// thrown away and the English is sent instead. If the model is slow or down, the
// English goes out too: a reply is never blocked by translation.
import { callModel, MODELS } from './openrouter.js'

export const LANGS = { zh: 'Simplified Chinese', ko: 'Korean' }
export function langOf(req) {
  const l = String(req.headers['x-velfi-lang'] || '').toLowerCase()
  return LANGS[l] ? l : 'en'
}

// Things that must survive translation character for character.
const KEEP = /0x[0-9a-fA-F]{6,}|https?:\/\/\S+|[\w.+-]+@[\w-]+\.[\w.-]+|[a-z0-9]+\.vel\b|\$?\d[\d,]*(?:\.\d+)?%?|\$VELFI|\b(?:USDC|USDT|BNB|BscScan|PancakeSwap)\b/g
export function mustKeep(s) {
  return [...new Set(String(s).match(KEEP) || [])]
}
export function keepsEverything(src, out) {
  if (typeof out !== 'string' || !out.trim()) return false
  return mustKeep(src).every(k => out.includes(k))
}

const FIELDS = ['reply', 'summary', 'error', 'message', 'note', 'clarifying_question']
const cache = new Map()
const CACHE_MAX = 3000
const remember = (k, v) => { if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value); cache.set(k, v) }
const worthIt = (s) => typeof s === 'string' && /[A-Za-z]{2,}/.test(s.replace(KEEP, ''))

const SYS = (lang) => `You translate short messages from Velfi, a money app, into ${LANGS[lang]}.
Write natural, friendly ${LANGS[lang]} the way a good fintech app would. Keep the meaning exactly; do not add or drop information.
Copy these EXACTLY as written, character for character: every number and amount (keep commas, dots and $ signs), percentages, token symbols (USDC, USDT, BNB, $VELFI), names ending in .vel, email addresses, 0x addresses, links, and the words Velfi, BNB Chain, BscScan, PancakeSwap.
Keep line breaks, bullet points ("- " or "• ") and **bold** markers where they are.
Input is JSON {"items": [...]}. Output ONLY JSON {"items": [...]} with the translations in the same order.`

let callImpl = (model, messages, opts) => callModel(model, messages, opts)
export function _setCall(fn) { callImpl = fn } // tests

async function translateMany(texts, lang, timeoutMs = 8000) {
  const out = texts.map(s => cache.get(`${lang}\u0000${s}`))
  const todo = [...new Set(texts.filter((s, i) => out[i] === undefined))]
  if (todo.length) {
    let got = null, timer
    try {
      const raw = await Promise.race([
        callImpl(MODELS.assistant, [{ role: 'system', content: SYS(lang) }, { role: 'user', content: JSON.stringify({ items: todo }) }], { json: true, maxTokens: 1500 }),
        new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('translate timeout')), timeoutMs) }),
      ])
      clearTimeout(timer)
      const clean = String(raw).replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```json|```/gi, '').trim()
      got = JSON.parse(clean)?.items
    } catch (e) { clearTimeout(timer); console.warn("translate:", e.message) }
    todo.forEach((src, j) => {
      const tr = Array.isArray(got) ? got[j] : null
      if (keepsEverything(src, tr)) remember(`${lang}\u0000${src}`, tr)
    })
  }
  return texts.map(s => cache.get(`${lang}\u0000${s}`) ?? s)
}

// Translate the text fields of a response body (and notification titles/bodies).
export async function translateBody(body, lang) {
  if (lang === 'en' || !body || typeof body !== 'object') return body
  const slots = []
  for (const f of FIELDS) if (worthIt(body[f])) slots.push([body, f])
  if (Array.isArray(body.notifications)) for (const n of body.notifications) for (const f of ['title', 'body']) if (worthIt(n?.[f])) slots.push([n, f])
  if (!slots.length) return body
  const copy = structuredClone(body)
  // re-point slots at the copy
  const paths = slots.map(([o, f]) => [o === body ? null : body.notifications.indexOf(o), f])
  const texts = slots.map(([o, f]) => o[f])
  const done = await translateMany(texts, lang)
  paths.forEach(([ni, f], i) => {
    const target = ni === null ? copy : copy.notifications[ni]
    target[f] = done[i]
  })
  return copy
}

// Express middleware: translate JSON replies for zh/ko callers.
export function replyInTheirLanguage(req, res, next) {
  const lang = langOf(req)
  if (lang === 'en') return next()
  const send = res.json.bind(res)
  res.json = (body) => {
    translateBody(body, lang).then(send, () => send(body))
    return res
  }
  next()
}
