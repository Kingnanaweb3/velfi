// Token swaps through Jupiter's public API (mainnet only; Jupiter has no devnet).
// Jupiter returns a transaction for the user to sign; Velfi never touches the funds.
import { getToken, IS_MAINNET } from './tokens.js'
import { toBaseUnits, fromBaseUnits } from './chain/amounts.js'

const API = process.env.JUPITER_API || 'https://lite-api.jup.ag/swap/v1'
const WSOL = 'So11111111111111111111111111111111111111112'
const mintFor = (t) => (t.mint === 'native' ? WSOL : t.mint)

function tokensFor(fromSym, toSym) {
  const from = getToken(fromSym), to = getToken(toSym)
  if (!from || !to) throw new Error(`I can swap between ${['SOL', 'USDC', 'USDT', 'JUP'].join(', ')} for now.`)
  if (from === to) throw new Error('Pick two different tokens to swap.')
  return { from, to }
}

export async function quoteSwap({ fromToken, toToken, amount, slippageBps = 50 }) {
  if (!IS_MAINNET) throw new Error('Swaps run on Solana mainnet through Jupiter. On devnet I can send, split, stream and schedule.')
  const { from, to } = tokensFor(fromToken, toToken)
  const units = toBaseUnits(Number(amount).toFixed(from.decimals), from.decimals)
  const url = `${API}/quote?inputMint=${mintFor(from)}&outputMint=${mintFor(to)}&amount=${units}&slippageBps=${slippageBps}`
  const r = await fetch(url)
  if (!r.ok) throw new Error(`Couldn't get a swap price right now (${r.status}).`)
  const quote = await r.json()
  return { quote, expectedOut: Number(fromBaseUnits(quote.outAmount, to.decimals)) }
}

// Returns a base64 versioned transaction for the user to sign and send.
export async function buildSwapTx({ quote, userAddress }) {
  const r = await fetch(`${API}/swap`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ quoteResponse: quote, userPublicKey: userAddress, wrapAndUnwrapSol: true, dynamicComputeUnitLimit: true }),
  })
  if (!r.ok) throw new Error(`Couldn't build the swap (${r.status}).`)
  const { swapTransaction } = await r.json()
  return swapTransaction
}
