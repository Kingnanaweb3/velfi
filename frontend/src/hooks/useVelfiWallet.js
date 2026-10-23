// The user's own BNB Chain wallet (Privy embedded EVM wallet created at Google sign-in).
// Everything Privy-specific lives here, so a Privy upgrade only touches this file.
import { useCallback } from 'react'
import { useWallets, useSignTransaction } from '@privy-io/react-auth'
import { parseTransaction, recoverTransactionAddress } from 'viem'
import { CHAIN_ID } from '../lib/chain.js'

function limit(promise, ms, message) {
  let t
  return Promise.race([promise, new Promise((_, rej) => { t = setTimeout(() => rej(new Error(message)), ms) })]).finally(() => clearTimeout(t))
}

const sameAddr = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase()

// Privy versions return a signed transaction as a hex string or { signature }.
function signedHex(out) {
  const s = out && typeof out === 'object' && 'signature' in out ? out.signature : out
  if (typeof s === 'string' && /^0x[0-9a-fA-F]+$/.test(s)) return s
  throw new Error('The wallet returned no signed transaction.')
}

export function useVelfiWallet() {
  const { wallets, ready } = useWallets()
  const { signTransaction } = useSignTransaction()
  // Only ever the Velfi (Privy embedded) wallet. Never fall back to a browser
  // extension like MetaMask: it is a different address, and its pop-up can sit
  // hidden behind the window so the approval looks stuck.
  const wallet = wallets.find(w => w.walletClientType === 'privy') || null

  // Sign the transactions Velfi prepared (a list; one slide approves them all).
  // Velfi's server checks every signed one matches what it prepared, covers any
  // missing network fee, and only then sends them.
  const sign = useCallback(async (txs) => {
    if (!wallet || !ready) throw new Error('Your wallet is still loading. Try again in a second.')
    const list = Array.isArray(txs) ? txs : [txs]
    if (wallet.chainId !== `eip155:${CHAIN_ID}`) {
      try { await wallet.switchChain(CHAIN_ID) } catch (e) { console.warn('Velfi: switchChain', e) }
    }
    const out = []
    for (const t of list) {
      const req = { from: wallet.address, to: t.to, data: t.data, value: t.value, nonce: t.nonce, gasPrice: t.gasPrice, chainId: Number(t.chainId), type: 0 }

      // 1) Privy's hook (no pop-up: Velfi's own slide is the confirmation).
      // 2) The wallet's EIP-1193 provider. Each has its own time limit, and the
      //    first real error is kept, so a second try that hangs can't hide it.
      const tries = [
        ['signTransaction', () => signTransaction({ ...req, gasLimit: t.gas }, { address: wallet.address, uiOptions: { showWalletUIs: false } })],
        ['provider', async () => {
          const provider = await wallet.getEthereumProvider()
          return provider.request({ method: 'eth_signTransaction', params: [{ ...req, gas: t.gas, gasLimit: t.gas, chainId: `0x${Number(t.chainId).toString(16)}`, type: '0x0' }] })
        }],
      ]
      let signed = null, firstError = null
      for (const [name, run] of tries) {
        try {
          const hex = signedHex(await limit(run(), 25_000, `${name} timed out`))
          // Check it here too, so a wallet quirk shows up as a clear error.
          const p = parseTransaction(hex)
          if (!sameAddr(p.to, t.to) || Number(p.nonce) !== Number(t.nonce)) throw new Error(`${name} signed a different transaction`)
          if (!sameAddr(await recoverTransactionAddress({ serializedTransaction: hex }), wallet.address)) throw new Error(`${name} signed with a different wallet`)
          signed = hex
          break
        } catch (e) {
          console.error(`Velfi sign (${name}) failed:`, e)
          if (/reject|denied|cancel|closed/i.test(String(e?.message))) throw e
          firstError ||= e
        }
      }
      if (!signed) throw firstError || new Error('This wallet cannot sign.')
      out.push(signed)
    }
    return out
  }, [wallet, ready, signTransaction])

  return { ready, address: wallet?.address || null, sign }
}
