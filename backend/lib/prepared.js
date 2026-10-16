// Short-lived store of transactions Velfi prepared for a user to sign.
// A prepared transaction is only valid for ~1 minute (Solana blockhash expiry),
// so memory is enough; a restart simply means "prepare again".
import crypto from 'node:crypto'
import { newAccountBudget } from './chain/lite.js'

const TTL_MS = 3 * 60 * 1000
const store = new Map()

export function remember({ userAddress, messageHash, after }) {
  const id = crypto.randomUUID()
  store.set(id, { userAddress, messageHash, after, at: Date.now() })
  return id
}

// One-shot: the entry is removed when taken, so the same approval can't run twice.
export function take(id, userAddress) {
  const e = store.get(id)
  if (!e) return null
  store.delete(id)
  if (e.userAddress !== userAddress) return null
  if (Date.now() - e.at > TTL_MS) return null
  return e
}

setInterval(() => {
  const now = Date.now()
  for (const [k, v] of store) if (now - v.at > TTL_MS) store.delete(k)
}, 60_000).unref()

// Simple per-user limit on fee-paid submissions, so nobody can drain the fee payer.
const hits = new Map()
export function allowSubmission(userAddress, perHour = Number(process.env.MAX_TX_PER_HOUR || 60)) {
  const now = Date.now()
  const recent = (hits.get(userAddress) || []).filter(t => now - t < 3_600_000)
  if (recent.length >= perHour) return false
  recent.push(now)
  hits.set(userAddress, recent)
  return true
}

// Velfi pays ~0.002 SOL rent whenever it opens a token account for a recipient.
// Count those per user and overall, per rolling day, so nobody can drain it.
const opened = new Map() // userAddress -> [timestamps]
const DAY = 86_400_000
function recent(list) { const now = Date.now(); return (list || []).filter(t => now - t < DAY) }
function globalCount() { let n = 0; for (const [k, v] of opened) { const r = recent(v); if (r.length) opened.set(k, r); else opened.delete(k); n += r.length } return n }
export function canOpenAccounts(userAddress, want) {
  return newAccountBudget({
    usedByUser: recent(opened.get(userAddress)).length, usedGlobal: globalCount(), want,
    perUser: Number(process.env.MAX_NEW_ACCOUNTS_PER_DAY || 10),
    global: Number(process.env.MAX_NEW_ACCOUNTS_GLOBAL_PER_DAY || 200),
  })
}
export function recordOpenedAccounts(userAddress, n) {
  if (!(n > 0)) return
  const list = recent(opened.get(userAddress))
  for (let i = 0; i < n; i++) list.push(Date.now())
  opened.set(userAddress, list)
}
