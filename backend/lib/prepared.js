// Short-lived store of transactions Velfi prepared for a user to sign.
// A prepared transaction is only good for a few minutes (its nonce and fee go
// stale), so memory is enough; a restart simply means "prepare again".
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

// On Solana, Velfi paid rent to open token accounts. BNB has no token accounts,
// so this is always 0 there; kept so the shared route code stays the same.
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

// Gas drops: when a user's wallet holds too little BNB for the network fee, Velfi's
// gas wallet sends the missing amount. Capped per drop, per user per day and
// overall per day, so nobody can drain the gas wallet.
const drops = new Map() // userAddress -> [{ at, wei }]
const BNB = 10n ** 18n
const bnbToWei = (v, dflt) => { const n = Number(v ?? dflt); return BigInt(Math.round((Number.isFinite(n) ? n : dflt) * 1e9)) * (BNB / 1_000_000_000n) }
function recentDrops(list) { const now = Date.now(); return (list || []).filter(d => now - d.at < DAY) }
export function gasDropAllowed(userAddress, wei, env = process.env) {
  const perDrop = bnbToWei(env.MAX_GAS_DROP_BNB, 0.002)
  const perUser = Number(env.MAX_GAS_DROPS_PER_DAY || 20)
  const global = bnbToWei(env.MAX_GAS_DROP_BNB_PER_DAY, 0.2)
  if (BigInt(wei) > perDrop) return { ok: false, reason: 'size' }
  if (recentDrops(drops.get(userAddress)).length >= perUser) return { ok: false, reason: 'user' }
  let used = 0n
  for (const [k, v] of drops) { const r = recentDrops(v); if (r.length) drops.set(k, r); else drops.delete(k); for (const d of r) used += d.wei }
  if (used + BigInt(wei) > global) return { ok: false, reason: 'global' }
  return { ok: true }
}
export function recordGasDrop(userAddress, wei) {
  const list = recentDrops(drops.get(userAddress))
  list.push({ at: Date.now(), wei: BigInt(wei) })
  drops.set(userAddress, list)
}
// For submitUserSigned: approve and count a drop in one step.
export const gasDropFor = (userAddress) => (wei) => {
  if (!gasDropAllowed(userAddress, wei).ok) return false
  recordGasDrop(userAddress, wei)
  return true
}
