// The user's own Solana wallet (Privy embedded wallet created at Google sign-in).
// Everything Privy-specific lives here, so a Privy upgrade only touches this file.
import { useCallback } from 'react'
import { useSolanaWallets } from '@privy-io/react-auth/solana'
import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js'
import { b64ToBytes, bytesToB64 } from '../lib/chain.js'

// Privy versions return a signature as bytes, base64, or { signature }.
function sigBytes(out) {
  const s = out && typeof out === 'object' && !(out instanceof Uint8Array) && 'signature' in out ? out.signature : out
  if (s instanceof Uint8Array) return s
  if (Array.isArray(s)) return Uint8Array.from(s)
  if (typeof s === 'string') return b64ToBytes(s)
  throw new Error('The wallet returned no signature.')
}

export function useVelfiWallet() {
  const { wallets, ready } = useSolanaWallets()
  const wallet = wallets.find(w => w.walletClientType === 'privy') || wallets[0] || null

  // Sign a transaction Velfi prepared (base64). Velfi already signed as fee payer.
  // This is Privy's recommended way for a transaction someone else pays for: the
  // wallet signs the exact message bytes, and that signature is added next to
  // Velfi's. Velfi's server then checks the result matches what it prepared.
  const sign = useCallback(async (b64, { versioned = false } = {}) => {
    if (!wallet) throw new Error('Your wallet is still loading. Try again in a second.')
    const bytes = b64ToBytes(b64)
    const me = new PublicKey(wallet.address)
    const tx = versioned ? VersionedTransaction.deserialize(bytes) : Transaction.from(bytes)
    const message = versioned ? tx.message.serialize() : tx.serializeMessage()

    if (typeof wallet.signMessage === 'function') {
      let out
      try { out = await wallet.signMessage(message) }
      catch (e) {
        // Some Privy versions want the message as base64 in an object.
        if (/reject|denied|cancel|closed/i.test(String(e?.message))) throw e
        out = await wallet.signMessage({ message: bytesToB64(message) })
      }
      const sig = sigBytes(out)
      if (sig.length !== 64) throw new Error(`The wallet returned a ${sig.length}-byte signature.`)
      tx.addSignature(me, sig)
      if (!versioned && !tx.verifySignatures(false)) throw new Error('The wallet signature did not check out.')
      return bytesToB64(tx.serialize(versioned ? undefined : { requireAllSignatures: false, verifySignatures: false }))
    }

    // Older wallets: let the wallet sign the whole transaction.
    const signed = await wallet.signTransaction(tx)
    return bytesToB64(versioned ? signed.serialize() : signed.serialize({ requireAllSignatures: false, verifySignatures: false }))
  }, [wallet])

  return { ready, address: wallet?.address || null, sign }
}
