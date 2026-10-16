// Turns an approved proposal into concrete payment legs. Pure: no network.
// Every amount becomes exact base units here, every address is checked here,
// so nothing loosely typed ever reaches a transaction.
import { toBaseUnits } from './amounts.js'
import { isSolanaAddress } from './base58.js'

export const MAX_LEGS = 5 // keeps one transaction under Solana's size limit

// getToken(symbol) -> { symbol, mint, decimals } | null
export function legsFromProposal(pending, getToken) {
  const pay = pending?.payment || {}
  let raw
  if (Array.isArray(pending?.actions) && pending.actions.length) {
    raw = pending.actions.map(a => ({
      symbol: a.token || a.currency,
      amount: a.amount,
      resolved: a.recipient?.resolved || {},
      label: a.recipient?.name || null,
    }))
  } else if (pending?.intent === 'send' || pending?.intent === 'split') {
    const recips = pay.recipients || []
    raw = recips.map(r => ({
      symbol: pay.currency,
      amount: pending.intent === 'send' && recips.length === 1 ? (pay.token_amount ?? r.amount ?? pay.amount) : (r.amount ?? pay.token_amount ?? pay.amount),
      resolved: r.resolved || { address: r.address, email: r.email },
      label: r.name || r.resolved?.label || null,
    }))
  } else {
    throw new Error(`"${pending?.intent}" is not a direct payment.`)
  }
  if (!raw.length) throw new Error('No recipients to pay.')
  if (raw.length > MAX_LEGS) throw new Error(`I can pay up to ${MAX_LEGS} people in one go for now. Try splitting it into two payments.`)

  return raw.map(l => {
    const token = getToken(String(l.symbol || '').toUpperCase())
    if (!token) throw new Error(`I don't recognize ${l.symbol || 'that token'} yet.`)
    const amountUnits = toBaseUnits(roundTo(l.amount, token.decimals), token.decimals)
    if (amountUnits <= 0n) throw new Error('Amount must be greater than zero.')
    const address = l.resolved?.address || null
    const email = l.resolved?.email || null
    if (address) {
      if (!isSolanaAddress(address)) throw new Error(`${l.label || address} is not a valid Solana address.`)
      return { kind: 'transfer', to: address, token, amountUnits, label: l.label || address }
    }
    if (email) return { kind: 'invite', email: String(email).toLowerCase(), token, amountUnits, label: l.label || email }
    throw new Error('One of the recipients is missing an address.')
  })
}

// Amounts converted from USD can carry long float tails (12.345678901234);
// cut them to the token's precision before exact conversion.
function roundTo(amount, decimals) {
  const n = Number(amount)
  if (typeof amount === 'string' && /^\d*\.?\d*$/.test(amount)) {
    const [w, f = ''] = amount.split('.')
    return f.length > decimals ? `${w}.${f.slice(0, decimals)}` : amount
  }
  if (!Number.isFinite(n) || n <= 0) throw new Error(`"${amount}" is not a valid amount`)
  return n.toFixed(decimals)
}

// Totals per token symbol, for balance checks.
export function totalsBySymbol(legs) {
  const t = {}
  for (const l of legs) t[l.token.symbol] = (t[l.token.symbol] || 0n) + l.amountUnits
  return t
}

// Unique-enough u64 id for a user's flow PDA (ms timestamp + random suffix).
export function newFlowId(now = Date.now(), rand = Math.floor(Math.random() * 1000)) {
  return BigInt(now) * 1000n + BigInt(rand)
}

// Recurring schedule -> mandate parameters.
const FREQ_SECS = { hourly: 3600, daily: 86_400, weekly: 604_800, biweekly: 1_209_600, monthly: 2_592_000 }
export function scheduleToMandate({ amountUnits, frequency, occurrences }) {
  const every = FREQ_SECS[String(frequency || '').toLowerCase()]
  if (!every) throw new Error(`I can schedule hourly, daily, weekly, biweekly or monthly payments, not "${frequency}".`)
  const count = Number(occurrences) > 0 ? Math.min(Number(occurrences), 120) : 4
  return {
    intervalSecs: every,
    count,
    maxPerTx: amountUnits,
    totalBudget: amountUnits * BigInt(count),
    // enough time for every payment, plus a day of slack for a late run
    durationSecs: every * (count - 1) + 86_400,
  }
}
