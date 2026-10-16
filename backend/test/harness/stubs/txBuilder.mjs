// Fake builder that still runs the REAL planning (legs, amounts, addresses).
import { legsFromProposal, scheduleToMandate } from '../../../lib/chain/plan.js'
import { getToken } from '../../../lib/tokens.js'
import { PROGRAM_ENABLED } from './solana.mjs'
// Tests set this to say how many recipients have no token account yet.
export const fakeBuild = { newAccounts: 0 }
export async function buildPayment(pending) {
  const legs = legsFromProposal(pending, getToken)
  const lite = !PROGRAM_ENABLED
  return { instructions: legs.map(l => ({ kind: l.kind, to: l.to || l.email, units: l.amountUnits })),
    invites: legs.filter(l => l.kind === 'invite').map(l => ({ email: l.email, escrow: lite ? 'CLAIM_WALLET' : 'ESCROW_PDA', mode: lite ? 'wallet' : 'program',
      token: l.token.symbol, mint: l.token.mint, amount_units: String(l.amountUnits), claim_key_sealed: 'SEALED' })),
    legs, newAccounts: fakeBuild.newAccounts }
}
export async function buildSetAllowance(a) { return [{ kind: a.allowanceUnits === 0n ? 'revoke' : 'approve', ...a }] }
export async function buildDelegatedPayment(a) { return { ixs: [{ kind: 'delegated_transfer', ...a }], newAccounts: 0 } }
export async function buildSweepInvite(a) { return { ixs: [{ kind: 'sweep', ...a }], units: 0n } }
export async function buildStartStream(a) { return { instructions: [{ kind: 'start_stream', ...a }], flow: 'STREAM_PDA', id: 1n } }
export async function buildCreateScheduleMandate(a) { return { instructions: [{ kind: 'create_mandate', ...a }], mandate: 'MANDATE_PDA', id: 1n, plan: scheduleToMandate(a) } }
export async function buildExecuteMandate(a) { return [{ kind: 'execute_mandate', ...a }] }
export async function buildClaimStream(a) { return [{ kind: 'claim_stream', ...a }] }
export async function buildStopStream(a) { return [{ kind: 'stop_stream', ...a }] }
export async function buildRevokeMandate(a) { return [{ kind: 'revoke_mandate', ...a }] }
export async function buildClaimEscrow(a) { return [{ kind: 'claim_escrow', ...a }] }
export const agentAddress = () => 'AGENT'
export const feePayerAddress = () => 'FEEPAYER'
