// Short-lived store of transactions Velfi prepared for a user to sign.
// A prepared transaction is only valid for ~1 minute (Solana blockhash expiry),
// so memory is enough; a restart simply means "prepare again".
import crypto from 'node:crypto'

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
