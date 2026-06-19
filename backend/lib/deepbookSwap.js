import { Transaction } from '@mysten/sui/transactions'
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography'
import { DeepBookClient } from '@mysten/deepbook-v3'
import dotenv from 'dotenv'
dotenv.config()

const client = new SuiClient({ url: getFullnodeUrl('testnet') })

// Re-derive the agent keypair with the NEW SDK (swap path can't use the old one).
function keypair() {
  const pk = process.env.DEPLOYER_PRIVATE_KEY
  if (!pk) throw new Error('DEPLOYER_PRIVATE_KEY not set')
  if (pk.startsWith('suiprivkey')) return Ed25519Keypair.fromSecretKey(decodeSuiPrivateKey(pk).secretKey)
  const hex = pk.startsWith('0x') ? pk.slice(2) : pk
  if (/^[0-9a-fA-F]{64}$/.test(hex)) return Ed25519Keypair.fromSecretKey(Uint8Array.from(Buffer.from(hex, 'hex')))
  const raw = Buffer.from(pk, 'base64'); const kb = raw.length === 33 ? raw.subarray(1) : raw
  return Ed25519Keypair.fromSecretKey(Uint8Array.from(kb))
}
export function swapAddress() { return keypair().getPublicKey().toSuiAddress() }

// Liquid testnet routes only. SUI↔DEEP today; add mainnet SUI↔USDC by extending this map.
const ROUTES = {
  'SUI>DEEP': { poolKey: 'DEEP_SUI', dir: 'quoteForBase' },
  'DEEP>SUI': { poolKey: 'DEEP_SUI', dir: 'baseForQuote' },
}

export async function quoteSwap({ fromToken, toToken, amount }) {
  const key = `${String(fromToken).toUpperCase()}>${String(toToken).toUpperCase()}`
  const route = ROUTES[key]
  if (!route) throw new Error(`Swap ${fromToken}→${toToken} isn't available yet (liquid testnet pair: SUI↔DEEP).`)
  const db = new DeepBookClient({ address: swapAddress(), env: 'testnet', client, balanceManagers: {} })
  const r = route.dir === 'quoteForBase'
    ? await db.getBaseQuantityOut(route.poolKey, amount)
    : await db.getQuoteQuantityOut(route.poolKey, amount)
  const expectedOut = (route.dir === 'quoteForBase' ? r.baseOut : r.quoteOut) ?? 0
  return { route, expectedOut }
}

export async function runSwap({ fromToken, toToken, amount, slippage = 0.05 }) {
  const { route, expectedOut } = await quoteSwap({ fromToken, toToken, amount })
  const address = swapAddress()
  const db = new DeepBookClient({ address, env: 'testnet', client, balanceManagers: {} })
  const minOut = Math.max(0, expectedOut * (1 - slippage))

  const tx = new Transaction()
  tx.setSender(address)
  const swapFn = route.dir === 'quoteForBase'
    ? db.deepBook.swapExactQuoteForBase({ poolKey: route.poolKey, amount, deepAmount: 0, minOut })
    : db.deepBook.swapExactBaseForQuote({ poolKey: route.poolKey, amount, deepAmount: 0, minOut })
  const [base, quote, deep] = tx.add(swapFn)
  tx.transferObjects([base, quote, deep], address)

  const result = await client.signAndExecuteTransaction({
    signer: keypair(), transaction: tx, options: { showEffects: true, showBalanceChanges: true },
  })
  return { digest: result.digest, status: result.effects?.status?.status, expectedOut, minOut }
}
