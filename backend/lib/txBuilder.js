// Builds the BNB Chain calls for every Velfi action. Users sign these with their
// own wallet; Velfi only covers the network fee.
//
// BNB v1 runs in "lite" mode: plain ERC-20 transfers and allowances, no custom
// contract. Streams and on-chain mandates (the Solana program) are not ported,
// so their builders say "coming soon".
import {
  transferIxs, allowanceIxs, sweepClaimWalletIxs, newClaimWallet, feePayerAddress, agentAddress,
} from './bnb.js'
import { legsFromProposal } from './chain/plan.js'
import { seal } from './chain/secretBox.js'
import { getToken } from './tokens.js'

export { feePayerAddress, agentAddress }

const SOON = 'Streaming payments are coming soon on BNB Chain.'

function requireToken(token, what) {
  if (token.mint === 'native') throw new Error(`${what} works with USDC and USDT for now, not BNB. Try the same with USDC.`)
}

// ── one-off payments (send, split, multi-token, email invites) ─────────────
// Returns { instructions, invites, legs, newAccounts }. `instructions` are calls
// ({ to, data, value }); each becomes its own transaction, approved together.
// Invites must be saved after they land.
export async function buildPayment(pending, userAddress) {
  const legs = legsFromProposal(pending, getToken)
  const instructions = []
  const invites = []
  for (const leg of legs) {
    if (leg.kind === 'transfer') {
      const t = await transferIxs({ from: userAddress, to: leg.to, token: leg.token, amountUnits: leg.amountUnits })
      instructions.push(...t.ixs)
      continue
    }
    if (process.env.EMAIL_INVITES === 'off')
      throw new Error(`Sending to an email isn't switched on yet. Ask ${leg.email} to sign up for Velfi, then send to their .vel name.`)
    requireToken(leg.token, 'Sending to an email')
    // The money goes to a fresh one-off claim wallet whose key Velfi keeps sealed.
    // It is moved to the person's wallet when they sign up, or back after 7 days.
    const claim = newClaimWallet()
    const t = await transferIxs({ from: userAddress, to: claim.address, token: leg.token, amountUnits: leg.amountUnits })
    instructions.push(...t.ixs)
    invites.push({ email: leg.email, escrow: claim.address, mode: 'wallet', token: leg.token.symbol, mint: leg.token.mint,
      amount_units: leg.amountUnits.toString(), claim_key_sealed: seal(claim.secretKey) })
  }
  return { instructions, invites, legs, newAccounts: 0 }
}

// ── schedules (an ERC-20 allowance) ────────────────────────────────────────
// The user lets Velfi's agent spend up to `allowanceUnits` of this token from
// their wallet. The token contract enforces that total; who gets paid, how much
// each time and when are enforced by Velfi's server.
export async function buildSetAllowance({ userAddress, token, allowanceUnits }) {
  requireToken(token, 'Scheduling')
  return allowanceIxs({ owner: userAddress, token, amountUnits: allowanceUnits })
}

// One scheduled payment, sent by the agent with transferFrom.
export async function buildDelegatedPayment({ owner, recipient, token, amountUnits }) {
  if (!token) throw new Error('This schedule uses a token Velfi does not support on BNB Chain.')
  return transferIxs({ from: owner, to: recipient, token, amountUnits, authority: agentAddress() })
}

// Move an email invite out of its claim wallet (to the new user, or back).
export async function buildSweepInvite({ claimWallet, to, token }) {
  if (!token) throw new Error('This invite uses a token Velfi does not support on BNB Chain.')
  return sweepClaimWalletIxs({ claimWallet, to, token })
}

// ── not on BNB yet (Solana program features) ───────────────────────────────
const soon = async () => { throw new Error(SOON) }
export const buildStartStream = soon
export const buildClaimStream = soon
export const buildStopStream = soon
export const buildCreateScheduleMandate = async () => { throw new Error('On BNB Chain, schedules use an allowance. Try again.') }
export const buildExecuteMandate = buildCreateScheduleMandate
export const buildRevokeMandate = buildCreateScheduleMandate
export const buildClaimEscrow = async () => { throw new Error('This invite was made on Solana and cannot be moved on BNB Chain.') }
