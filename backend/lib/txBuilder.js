// Builds the Solana instructions for every Velfi action. Users sign these with
// their own wallet; Velfi only pays the network fee.
import { Keypair } from '@solana/web3.js'
import {
  programId, flowAddress, ata, tokenProgramFor, toIx, transferIxs, feePayer, agent, pk,
  ASSOCIATED_TOKEN_PROGRAM_ID, SystemProgram,
} from './solana.js'
import { buildIx } from './chain/velfiProgram.js'
import { legsFromProposal, newFlowId, scheduleToMandate } from './chain/plan.js'
import { seal } from './chain/secretBox.js'
import { getToken } from './tokens.js'

const sys = () => SystemProgram.programId.toBase58()
const atp = () => ASSOCIATED_TOKEN_PROGRAM_ID.toBase58()

export const feePayerAddress = () => feePayer().publicKey.toBase58()
export const agentAddress = () => agent().publicKey.toBase58()

function requireSpl(token, what) {
  if (token.mint === 'native') throw new Error(`${what} works with USDC and other tokens for now, not SOL. Try the same with USDC.`)
}

async function flowAccounts(kind, owner, token) {
  const id = newFlowId()
  const tp = await tokenProgramFor(token.mint)
  const flow = flowAddress(kind, owner, id)
  return { id, tp, flow: flow.toBase58(), vault: ata(token.mint, flow, tp).toBase58(), ownerToken: ata(token.mint, owner, tp).toBase58() }
}

// ── one-off payments (send, split, multi-token, email invites) ─────────────
// Returns { instructions, invites } where invites must be saved after it lands.
export async function buildPayment(pending, userAddress) {
  const legs = legsFromProposal(pending, getToken)
  const instructions = []
  const invites = []
  for (const leg of legs) {
    if (leg.kind === 'transfer') {
      instructions.push(...await transferIxs({ from: userAddress, to: leg.to, token: leg.token, amountUnits: leg.amountUnits }))
      continue
    }
    // Email recipient: lock the funds in a claim-link escrow they can claim on sign-up.
    requireSpl(leg.token, 'Sending to an email')
    const claim = Keypair.generate()
    const f = await flowAccounts('escrow', userAddress, leg.token)
    instructions.push(toIx(buildIx(programId(), 'create_escrow', {
      sender: userAddress, payer: feePayerAddress(), mint: leg.token.mint, senderToken: f.ownerToken,
      escrow: f.flow, vault: f.vault, tokenProgram: f.tp.toBase58(), associatedTokenProgram: atp(), systemProgram: sys(),
    }, { id: f.id, amount: leg.amountUnits, claimAuthority: claim.publicKey.toBase58(), window: 7 * 86_400 })))
    invites.push({ email: leg.email, escrow: f.flow, token: leg.token.symbol, mint: leg.token.mint,
      amount_units: leg.amountUnits.toString(), claim_key_sealed: seal(claim.secretKey) })
  }
  return { instructions, invites, legs }
}

// ── streams ────────────────────────────────────────────────────────────────
export async function buildStartStream({ userAddress, recipient, token, amountUnits, durationSecs }) {
  requireSpl(token, 'Streaming')
  const f = await flowAccounts('stream', userAddress, token)
  const ix = toIx(buildIx(programId(), 'start_stream', {
    sender: userAddress, payer: feePayerAddress(), mint: token.mint, senderToken: f.ownerToken,
    stream: f.flow, vault: f.vault, tokenProgram: f.tp.toBase58(), associatedTokenProgram: atp(), systemProgram: sys(),
  }, { id: f.id, recipient, amount: amountUnits, duration: durationSecs }))
  return { instructions: [ix], flow: f.flow, id: f.id }
}

export async function buildClaimStream({ recipient, stream, mint }) {
  const tp = await tokenProgramFor(mint)
  return [toIx(buildIx(programId(), 'claim_stream', {
    recipient, payer: feePayerAddress(), stream, mint, vault: ata(mint, stream, tp).toBase58(),
    recipientToken: ata(mint, recipient, tp).toBase58(), rentPayer: feePayerAddress(),
    tokenProgram: tp.toBase58(), associatedTokenProgram: atp(), systemProgram: sys(),
  }))]
}

export async function buildStopStream({ sender, recipient, stream, mint }) {
  const tp = await tokenProgramFor(mint)
  return [toIx(buildIx(programId(), 'stop_stream', {
    sender, payer: feePayerAddress(), stream, mint, vault: ata(mint, stream, tp).toBase58(),
    recipient, recipientToken: ata(mint, recipient, tp).toBase58(), senderToken: ata(mint, sender, tp).toBase58(),
    rentPayer: feePayerAddress(), tokenProgram: tp.toBase58(), associatedTokenProgram: atp(), systemProgram: sys(),
  }))]
}

// ── schedules (Autopilot inside an on-chain mandate) ──────────────────────
// The user locks exactly count × amount in a mandate that can only pay this one
// recipient, at most `amount` per payment, until it expires. Velfi's agent then
// triggers each payment on time; it can never send more, or anywhere else.
export async function buildCreateScheduleMandate({ userAddress, recipient, token, amountUnits, frequency, occurrences }) {
  requireSpl(token, 'Scheduling')
  const plan = scheduleToMandate({ amountUnits, frequency, occurrences })
  const f = await flowAccounts('mandate', userAddress, token)
  const ix = toIx(buildIx(programId(), 'create_mandate', {
    owner: userAddress, payer: feePayerAddress(), mint: token.mint, ownerToken: f.ownerToken,
    mandate: f.flow, vault: f.vault, tokenProgram: f.tp.toBase58(), associatedTokenProgram: atp(), systemProgram: sys(),
  }, { id: f.id, agent: agentAddress(), recipients: [recipient], maxPerTx: plan.maxPerTx, totalBudget: plan.totalBudget, duration: plan.durationSecs }))
  return { instructions: [ix], mandate: f.flow, id: f.id, plan }
}

export async function buildExecuteMandate({ mandate, recipient, mint, amountUnits }) {
  const tp = await tokenProgramFor(mint)
  return [toIx(buildIx(programId(), 'execute_mandate', {
    caller: agentAddress(), payer: feePayerAddress(), mandate, mint, vault: ata(mint, mandate, tp).toBase58(),
    recipient, recipientToken: ata(mint, recipient, tp).toBase58(),
    tokenProgram: tp.toBase58(), associatedTokenProgram: atp(), systemProgram: sys(),
  }, { amount: amountUnits }))]
}

export async function buildRevokeMandate({ owner, mandate, mint }) {
  const tp = await tokenProgramFor(mint)
  return [toIx(buildIx(programId(), 'revoke_mandate', {
    owner, mandate, mint, vault: ata(mint, mandate, tp).toBase58(), ownerToken: ata(mint, owner, tp).toBase58(),
    rentPayer: feePayerAddress(), tokenProgram: tp.toBase58(),
  }))]
}

// ── email invites ──────────────────────────────────────────────────────────
export async function buildClaimEscrow({ escrow, mint, claimer, claimAuthority }) {
  const tp = await tokenProgramFor(mint)
  return [toIx(buildIx(programId(), 'claim_escrow', {
    claimAuthority, payer: feePayerAddress(), escrow, mint, vault: ata(mint, escrow, tp).toBase58(),
    claimer, claimerToken: ata(mint, claimer, tp).toBase58(), rentPayer: feePayerAddress(),
    tokenProgram: tp.toBase58(), associatedTokenProgram: atp(), systemProgram: sys(),
  }))]
}

export { pk }
