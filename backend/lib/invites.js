// Money sent to an email waits in an on-chain escrow. When that person signs up,
// Velfi claims it into their new wallet with the invite's claim key. If they never
// sign up, the sender can take it back after 7 days.
import supabaseAdmin from './supabaseAdmin.js'
import { Keypair } from '@solana/web3.js'
import { open } from './chain/secretBox.js'
import { buildClaimEscrow } from './txBuilder.js'
import { sendAsServer, explorerTx } from './solana.js'

export async function saveInvites({ fromAddress, invites, signature }) {
  if (!invites?.length) return
  const { error } = await supabaseAdmin.from('escrow_invites').insert(invites.map(i => ({
    from_address: fromAddress, to_email: i.email, escrow_address: i.escrow, token: i.token, mint: i.mint,
    amount_units: i.amount_units, claim_key_sealed: i.claim_key_sealed, status: 'pending', tx_hash: signature,
    expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  })))
  if (error) console.error('invite save failed:', error.message)
}

export async function claimInvitesFor(email, walletAddress) {
  if (!email) return []
  const { data } = await supabaseAdmin.from('escrow_invites').select('*')
    .eq('to_email', String(email).toLowerCase()).eq('status', 'pending')
  const claimed = []
  for (const inv of data || []) {
    if (new Date(inv.expires_at) < new Date()) continue
    try {
      const claimKey = Keypair.fromSecretKey(open(inv.claim_key_sealed))
      const ixs = await buildClaimEscrow({ escrow: inv.escrow_address, mint: inv.mint, claimer: walletAddress, claimAuthority: claimKey.publicKey.toBase58() })
      const sig = await sendAsServer(ixs, [claimKey])
      await supabaseAdmin.from('escrow_invites').update({ status: 'claimed', claimed_by: walletAddress, claim_tx: sig }).eq('id', inv.id)
      await supabaseAdmin.from('notifications').insert({ user_address: walletAddress, type: 'payment_received',
        title: 'You received money', body: `A payment that was waiting for you has arrived.`, action_url: explorerTx(sig) })
      claimed.push(sig)
    } catch (e) {
      console.error('invite claim failed', inv.id, e.message)
    }
  }
  return claimed
}
