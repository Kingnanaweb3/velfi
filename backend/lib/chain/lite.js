// Pure rules for lite mode (no custom program). No network, no keys: tested directly.
//
// Schedules: the user approves Velfi's agent as a "delegate" on their token
// account. Solana allows one delegate amount per token account, so the amount
// approved must always equal what is still owed across ALL of the user's active
// schedules in that token. These helpers compute that number.

// What a schedule may still spend: amount × payments left.
export function remainingUnits(sc) {
  const each = BigInt(sc.amount_units || 0)
  const left = Math.max(0, Number(sc.occurrences || 0) - Number(sc.occurrences_done || 0))
  return each * BigInt(left)
}

// Total the agent must be allowed to spend for this owner and mint.
//  - schedules: the owner's rows (any status; only active delegate rows count)
//  - exceptId:  leave one schedule out (the one being cancelled)
//  - plus:      add a new schedule's full budget (the one being created)
export function allowanceFor(schedules, mint, { exceptId = null, plus = 0n } = {}) {
  let total = BigInt(plus)
  for (const sc of schedules || []) {
    if (sc.mode !== 'delegate' || sc.status !== 'active' || sc.mint !== mint) continue
    if (exceptId != null && String(sc.id) === String(exceptId)) continue
    total += remainingUnits(sc)
  }
  return total
}

// Before the agent sends a scheduled payment, re-check the rules the user agreed
// to. In lite mode these are enforced by Velfi's server (the on-chain allowance
// only caps the total), so every payment passes through this.
export function checkScheduledPayment(sc, now = Date.now()) {
  if (sc.mode !== 'delegate') return 'not a lite schedule'
  if (sc.status !== 'active') return 'not active'
  if (Number(sc.occurrences_done) >= Number(sc.occurrences)) return 'all payments already made'
  if (new Date(sc.next_run_at).getTime() > now) return 'not due yet'
  if (!(BigInt(sc.amount_units || 0) > 0n)) return 'no amount'
  if (!sc.recipient || !sc.mint) return 'missing recipient or token'
  return null
}

// Email invites in lite mode sit in a one-off "claim wallet" Velfi holds the key
// to. After this long, unclaimed money goes back to the sender automatically.
export const INVITE_WINDOW_MS = 7 * 86_400_000
export function inviteDue(inv, now = Date.now()) {
  return inv.status === 'pending' && inv.mode === 'wallet' && new Date(inv.expires_at).getTime() <= now
}

// Fee-payer protection: Velfi pays ~0.002 SOL rent each time it opens a token
// account for a recipient. Cap that per user and overall per day.
export function newAccountBudget({ usedByUser, usedGlobal, want, perUser, global }) {
  if (want <= 0) return { ok: true }
  if (usedByUser + want > perUser) return { ok: false, reason: 'user' }
  if (usedGlobal + want > global) return { ok: false, reason: 'global' }
  return { ok: true }
}
