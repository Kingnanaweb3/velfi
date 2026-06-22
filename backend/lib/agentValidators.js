// Deterministic validators. NEVER an LLM. These gate every parsed payment
// before it can become a pending transaction.

export const CONFIDENCE_FLOOR = 0.6

const INTENTS = ['send', 'split', 'stream', 'schedule', 'escrow', 'automate', 'swap', 'unknown']

export function validateSchema(p) {
  const errors = []
  if (!p || typeof p !== 'object') return { ok: false, errors: ['not an object'] }
  if (!INTENTS.includes(p.intent)) errors.push('invalid intent')
  if (typeof p.confidence !== 'number' || p.confidence < 0 || p.confidence > 1)
    errors.push('invalid confidence')
  return { ok: errors.length === 0, errors }
}

export function validateAmount(amount) {
  if (amount == null) return { ok: false, error: 'no amount' }
  const n = Number(amount)
  if (!Number.isFinite(n)) return { ok: false, error: 'amount not a number' }
  if (n <= 0) return { ok: false, error: 'amount must be positive' }
  if (n > 1_000_000_000) return { ok: false, error: 'amount too large' }
  return { ok: true, value: n }
}

// Splits can be share-based (percentages summing to 100) OR amount-based
// (each recipient has an explicit amount — a batch send). Handles both.
export function validateSplit(recipients) {
  if (!Array.isArray(recipients) || recipients.length < 2)
    return { ok: false, error: 'needs 2+ recipients' }

  // "X takes 40%, Y takes the rest": some shares set, others null and no amounts.
  // Fill the blanks with the leftover so they sum to 100 before checking.
  if (recipients.some(r => r.share != null) && !recipients.some(r => r.amount != null)) {
    const namedSum = recipients.reduce((s, r) => s + (r.share != null ? Number(r.share) : 0), 0)
    const missing = recipients.filter(r => r.share == null)
    if (missing.length && namedSum < 100) {
      const each = (100 - namedSum) / missing.length
      missing.forEach(r => { r.share = each })
    }
  }

  const haveAmounts = recipients.every(r => r.amount != null)
  const haveShares = recipients.every(r => r.share != null)

  if (haveAmounts) {
    // batch send: each amount must be valid; no sum constraint
    for (const r of recipients) {
      const a = validateAmount(r.amount)
      if (!a.ok) return { ok: false, error: `bad amount for a recipient: ${a.error}` }
    }
    const total = recipients.reduce((s, r) => s + Number(r.amount), 0)
    return { ok: true, mode: 'amounts', total }
  }

  if (haveShares) {
    let sum = recipients.reduce((s, r) => s + Number(r.share || 0), 0)
    // model sometimes returns fractions (0.5/0.5) instead of percentages: rescale to 100
    if (sum > 0 && sum <= 1.0001 && recipients.every(r => Number(r.share) <= 1)) {
      recipients.forEach(r => { r.share = Number(r.share) * 100 })
      sum = recipients.reduce((s, r) => s + Number(r.share || 0), 0)
    }
    if (Math.abs(sum - 100) > 0.01)
      return { ok: false, error: `shares sum to ${sum}, must be 100` }
    return { ok: true, mode: 'shares' }
  }

  return { ok: false, error: 'recipients need either all shares or all amounts' }
}

export function isSelfSend(resolved, user) {
  if (!resolved) return false
  if (resolved.address && user.address && resolved.address === user.address) return true
  if (resolved.label && user.username && resolved.label.replace('.vel','') === user.username) return true
  return false
}

export function needsClarification(p) {
  if (p.needs_clarification === true) return true
  if (typeof p.confidence === 'number' && p.confidence < CONFIDENCE_FLOOR) return true
  return false
}

export function parsesAgree(a, b) {
  if (!a || !b) return false
  if (a.intent !== b.intent) return false
  const amtA = a.payment?.amount ?? a.params?.amount
  const amtB = b.payment?.amount ?? b.params?.amount
  if (Number(amtA) !== Number(amtB)) return false
  return true
}

// NEW: does the user hold enough of the chosen token to cover the amount?
// held + needed are human amounts (already scaled). Returns {ok, shortfall}.
export function hasEnough(held, needed) {
  const h = Number(held), n = Number(needed)
  if (!Number.isFinite(h) || !Number.isFinite(n)) return { ok: false, shortfall: null }
  if (h >= n) return { ok: true, shortfall: 0 }
  return { ok: false, shortfall: n - h }
}


// Force every recipient name to canonical .vel form. Addresses + emails pass through.
export function normalizeVel(name) {
  if (name == null) return null
  let s = String(name).trim().toLowerCase()
  if (!s) return null
  if (s.startsWith('0x') || s.includes('@')) return s
  if (!s.endsWith('.vel')) s = s + '.vel'
  return s
}

// If a split has names + a total but no per-person amounts/shares, divide evenly.
export function normalizeSplit(pay) {
  const rs = (pay && pay.recipients) || []
  if (rs.length < 2) return
  const haveAmt = rs.every(r => r.amount != null)
  const haveShare = rs.every(r => r.share != null)
  if (haveAmt || haveShare) return
  // Don't clobber a partial split (e.g. "X takes 40%, Y takes the rest").
  if (rs.some(r => r.share != null || r.amount != null)) return
  const total = Number(pay.amount)
  if (Number.isFinite(total) && total > 0) {
    const each = total / rs.length
    rs.forEach(r => { r.amount = each; r.share = null })
  }
}

// Validate an explicit multi-token actions[] array.
export function validateActions(actions) {
  if (!Array.isArray(actions) || actions.length === 0) return { ok: false, error: 'no actions' }
  for (const a of actions) {
    if (!a || !a.token) return { ok: false, error: 'an action is missing its token' }
    const amt = validateAmount(a.amount)
    if (!amt.ok) return { ok: false, error: `bad amount in an action: ${amt.error}` }
    const rc = a.recipient || {}
    if (!rc.name && !rc.address && !rc.email) return { ok: false, error: 'an action is missing its recipient' }
  }
  return { ok: true }
}
