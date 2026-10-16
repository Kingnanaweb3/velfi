// Builds the Solana instructions for every Velfi action. Users sign these with
// their own wallet; Velfi only pays the network fee.
//
// Two modes (see solana.js): "lite" uses only Solana's built-in programs and is
// what mainnet v1 runs; "program" uses Velfi's own on-chain program.
import { Keypair } from '@solana/web3.js'
import {
  programId, flowAddress, ata, tokenProgramFor, toIx, transferIxs, allowanceIxs, sweepClaimWalletIxs,
  feePayer, agent, pk, PROGRAM_ENABLED, ASSOCIATED_TOKEN_PROGRAM_ID, SystemProgram,
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
// Returns { instructions, invites, legs, newAccounts }; invites must be saved
// after it lands. newAccounts counts token accounts Velfi pays rent for.
export async function buildPayment(pending, userAddress) {
  const legs = legsFromProposal(pending, getToken)
  const instructions = []
  const invites = []
  let newAccounts = 0
  for (const leg of legs) {
    if (leg.kind === 'transfer') {
      const t = await transferIxs({ from: userAddress, to: leg.to, token: leg.token, amountUnits: leg.amountUnits })
      instructions.push(...t.ixs); newAccounts += t.newAccounts
      continue
    }
    if (process.env.EMAIL_INVITES === 'off')
      throw new Error(`Sending to an email isn't switched on yet. Ask ${leg.email} to sign up for Velfi, then send to their .vel name.`)
    requireSpl(leg.token, 'Sending to an email')
    if (!PROGRAM_ENABLED) {
      // Lite: the money goes to a fresh one-off claim wallet whose key Velfi keeps
      // sealed. It is moved to the person's wallet when they sign up, or back to
      // the sender after 7 days.
      const claim = Keypair.generate()
      const t = await transferIxs({ from: userAddress, to: claim.publicKey.toBase58(), token: leg.token, amountUnits: leg.amountUnits })
      instructions.push(...t.ixs); newAccounts += t.newAccounts
      invites.push({ email: leg.email, escrow: claim.publicKey.toBase58(), mode: 'wallet', token: leg.token.symbol, mint: leg.token.mint,
        amount_units: leg.amountUnits.toString(), claim_key_sealed: seal(claim.secretKey) })
      continue
    }
    // Program: lock the funds in a claim-link escrow they can claim on sign-up.
    const claim = Keypair.generate()
    const f = await flowAccounts('escrow', userAddress, leg.token)
    instructions.push(toIx(buildIx(programId(), 'create_escrow', {
      sender: userAddress, payer: feePayerAddress(), mint: leg.token.mint, senderToken: f.ownerToken,
      escrow: f.flow, vault: f.vault, tokenProgram: f.tp.toBase58(), associatedTokenProgram: atp(), systemProgram: sys(),
    }, { id: f.id, amount: leg.amountUnits, claimAuthority: claim.publicKey.toBase58(), window: 7 * 86_400 })))
    invites.push({ email: leg.email, escrow: f.flow, mode: 'program', token: leg.token.symbol, mint: leg.token.mint,
      amount_units: leg.amountUnits.toString(), claim_key_sealed: seal(claim.secretKey) })
  }
  return { instructions, invites, legs, newAccounts }
}

// ── lite schedules (an allowance, no program) ──────────────────────────────
// The user lets Velfi's agent spend up to `allowanceUnits` of this token from
// their wallet. That total cap is enforced by Solana itself. Who gets paid, how
// much each time and when are enforced by Velfi's server.
export async function buildSetAllowance({ userAddress, token, allowanceUnits }) {
  requireSpl(token, 'Scheduling')
  return allowanceIxs({ owner: userAddress, token, amountUnits: allowanceUnits })
}

// One scheduled payment, sent by the agent as the approved delegate.
export async function buildDelegatedPayment({ owner, recipient, token, amountUnits }) {
  return transferIxs({ from: owner, to: recipient, token, amountUnits, authority: agentAddress() })
}

// Move an email invite out of its claim wallet (to the new user, or back).
export async function buildSweepInvite({ claimWallet, to, token }) {
  return sweepClaimWalletIxs({ claimWallet, to, token })
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
