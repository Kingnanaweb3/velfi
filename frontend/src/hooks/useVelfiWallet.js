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

function limit(promise, ms, message) {
  let t
  return Promise.race([promise, new Promise((_, rej) => { t = setTimeout(() => rej(new Error(message)), ms) })]).finally(() => clearTimeout(t))
}

export function useVelfiWallet() {
  const { wallets, ready } = useSolanaWallets()
  // Only ever the Velfi (Privy embedded) wallet. Never fall back to a browser
  // extension like Phantom: it is a different address, and its pop-up can sit
  // hidden behind the window so the approval looks stuck.
  const wallet = wallets.find(w => w.walletClientType === 'privy') || null

  // Sign a transaction Velfi prepared (base64). Velfi already signed as fee payer.
  // This is Privy's recommended way for a transaction someone else pays for: the
  // wallet signs the exact message bytes, and that signature is added next to
  // Velfi's. Velfi's server then checks the result matches what it prepared.
  const sign = useCallback(async (b64, { versioned = false } = {}) => {
    if (!wallet || !ready) throw new Error('Your wallet is still loading. Try again in a second.')
    const bytes = b64ToBytes(b64)
    const me = new PublicKey(wallet.address)
    const tx = versioned ? VersionedTransaction.deserialize(bytes) : Transaction.from(bytes)
    const message = versioned ? tx.message.serialize() : tx.serializeMessage()

    // 1) Privy's documented route: the embedded wallet provider signs the message
    //    (base64 in, { signature: base64 } out). 2) The wallet's own signMessage.
    //    Each try has its own time limit, and the first real error is kept, so a
    //    second try that hangs can't hide why the first one failed.
    const tries = []
    if (typeof wallet.getProvider === 'function') tries.push(['provider', async () => {
      const provider = await wallet.getProvider()
      return provider.request({ method: 'signMessage', params: { message: bytesToB64(message) } })
    }])
    if (typeof wallet.signMessage === 'function') tries.push(['signMessage', () => wallet.signMessage(message)])

    let firstError = null
    for (const [name, run] of tries) {
      try {
        const sig = sigBytes(await limit(run(), 20_000, `${name} timed out`))
        if (sig.length !== 64) throw new Error(`${name} returned a ${sig.length}-byte signature`)
        tx.addSignature(me, sig)
        if (!versioned && !tx.verifySignatures(false)) throw new Error(`${name} signature did not check out`)
        return bytesToB64(tx.serialize(versioned ? undefined : { requireAllSignatures: false, verifySignatures: false }))
      } catch (e) {
        console.error(`Velfi sign (${name}) failed:`, e)
        if (/reject|denied|cancel|closed/i.test(String(e?.message))) throw e
        firstError ||= e
      }
    }
    if (typeof wallet.signTransaction !== 'function') throw firstError || new Error('This wallet cannot sign.')

    // Last resort: let the wallet sign the whole transaction.
    let signed
    try { signed = await limit(wallet.signTransaction(tx), 20_000, 'signTransaction timed out') }
    catch (e) { console.error('Velfi sign (signTransaction) failed:', e); throw firstError || e }
    return bytesToB64(versioned ? signed.serialize() : signed.serialize({ requireAllSignatures: false, verifySignatures: false }))
  }, [wallet, ready])

  return { ready, address: wallet?.address || null, sign }
}
