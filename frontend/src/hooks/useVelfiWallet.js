// The user's own Solana wallet (Privy embedded wallet created at Google sign-in).
// Everything Privy-specific lives here, so a Privy upgrade only touches this file.
import { useCallback } from 'react'
import { useSolanaWallets } from '@privy-io/react-auth/solana'
import { Transaction, VersionedTransaction } from '@solana/web3.js'
import { b64ToBytes, bytesToB64 } from '../lib/chain.js'

export function useVelfiWallet() {
  const { wallets, ready } = useSolanaWallets()
  const wallet = wallets.find(w => w.walletClientType === 'privy') || wallets[0] || null

  // Sign a transaction Velfi prepared (base64). Velfi already signed as fee payer.
  const sign = useCallback(async (b64, { versioned = false } = {}) => {
    if (!wallet) throw new Error('Your wallet is still loading. Try again in a second.')
    const bytes = b64ToBytes(b64)
    if (versioned) {
      const signed = await wallet.signTransaction(VersionedTransaction.deserialize(bytes))
      return bytesToB64(signed.serialize())
    }
    const signed = await wallet.signTransaction(Transaction.from(bytes))
    return bytesToB64(signed.serialize({ requireAllSignatures: true, verifySignatures: true }))
  }, [wallet])

  return { ready, address: wallet?.address || null, sign }
}
