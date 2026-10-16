// Money sent to an email waits until that person signs up.
//  - Lite mode ("wallet"): it sits in a one-off claim wallet whose key Velfi keeps
//    sealed (AES-GCM, ESCROW_SECRET). On sign-up Velfi moves it to their new wallet.
//    If nobody claims it within 7 days, Velfi sends it back to the sender.
//  - Program mode ("program"): it sits in an on-chain escrow; same timing.
import supabaseAdmin from './supabaseAdmin.js'
import { Keypair } from '@solana/web3.js'
import { open } from './chain/secretBox.js'
import { inviteDue } from './chain/lite.js'
import { buildClaimEscrow, buildSweepInvite } from './txBuilder.js'
import { sendAsServer, explorerTx } from './solana.js'
import { getTokenByMint } from './tokens.js'

export async function saveInvites({ fromAddress, invites, signature }) {
  if (!invites?.length) return
  const { error } = await supabaseAdmin.from('escrow_invites').insert(invites.map(i => ({
    from_address: fromAddress, to_email: String(i.email).toLowerCase(), escrow_address: i.escrow, mode: i.mode || 'program',
    token: i.token, mint: i.mint, amount_units: i.amount_units, claim_key_sealed: i.claim_key_sealed,
    status: 'pending', tx_hash: signature, expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  })))
  // The money has already moved, so this must not be lost silently.
  if (error) console.error('INVITE SAVE FAILED, recover manually:', error.message, JSON.stringify(invites.map(i => ({ email: i.email, wallet: i.escrow }))))
}

// Mark the row first (only one runner wins), then move the money.
async function lock(inv, status) {
  const { data } = await supabaseAdmin.from('escrow_invites').update({ status })
    .eq('id', inv.id).eq('status', 'pending').select()
  return !!data?.length
}

async function moveOut(inv, to) {
  const claimKey = Keypair.fromSecretKey(open(inv.claim_key_sealed))
  if (inv.mode === 'wallet') {
    const { ixs } = await buildSweepInvite({ claimWallet: inv.escrow_address, to, token: getTokenByMint(inv.mint) })
    return sendAsServer(ixs, [claimKey])
  }
  const ixs = await buildClaimEscrow({ escrow: inv.escrow_address, mint: inv.mint, claimer: to, claimAuthority: claimKey.publicKey.toBase58() })
  return sendAsServer(ixs, [claimKey])
}

export async function claimInvitesFor(email, walletAddress) {
  if (!email || process.env.PAUSE_PAYMENTS === 'on') return []
  const { data } = await supabaseAdmin.from('escrow_invites').select('*')
    .eq('to_email', String(email).toLowerCase()).eq('status', 'pending')
  const claimed = []
  for (const inv of data || []) {
    if (new Date(inv.expires_at) < new Date()) continue
    if (!(await lock(inv, 'claiming'))) continue
    try {
      const sig = await moveOut(inv, walletAddress)
      await supabaseAdmin.from('escrow_invites').update({ status: 'claimed', claimed_by: walletAddress, claim_tx: sig }).eq('id', inv.id)
      await supabaseAdmin.from('notifications').insert({ user_address: walletAddress, type: 'payment_received',
        title: 'You received money', body: 'A payment that was waiting for you has arrived.', action_url: explorerTx(sig) })
      claimed.push(sig)
    } catch (e) {
      // Put it back so the next sign-in (or the refund runner) can try again.
      await supabaseAdmin.from('escrow_invites').update({ status: 'pending' }).eq('id', inv.id)
      console.error('invite claim failed', inv.id, e.message)
    }
  }
  return claimed
}

// Lite mode: unclaimed invites go back to the sender after 7 days.
export async function refundExpiredInvites() {
  if (process.env.PAUSE_PAYMENTS === 'on') return []
  const { data } = await supabaseAdmin.from('escrow_invites').select('*')
    .eq('status', 'pending').eq('mode', 'wallet').lte('expires_at', new Date().toISOString())
  const refunded = []
  for (const inv of data || []) {
    if (!inviteDue(inv)) continue
    if (!(await lock(inv, 'refunding'))) continue
    try {
      const sig = await moveOut(inv, inv.from_address)
      await supabaseAdmin.from('escrow_invites').update({ status: 'refunded', claim_tx: sig }).eq('id', inv.id)
      await supabaseAdmin.from('notifications').insert({ user_address: inv.from_address, type: 'invite_refunded',
        title: 'Your invite payment came back', body: `${inv.to_email} didn't sign up within 7 days, so the money is back in your wallet.`, action_url: explorerTx(sig) })
      refunded.push(sig)
    } catch (e) {
      await supabaseAdmin.from('escrow_invites').update({ status: 'pending' }).eq('id', inv.id)
      console.error('invite refund failed', inv.id, e.message)
    }
  }
  return refunded
}

let _runner = null
export function startInviteRunner(everyMs = 10 * 60_000) {
  if (_runner) return
  _runner = setInterval(() => refundExpiredInvites().catch(e => console.error('invite runner:', e.message)), everyMs)
  console.log('✅ invite refund runner started')
}
