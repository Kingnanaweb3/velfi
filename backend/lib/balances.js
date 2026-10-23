// Reads a user's BNB Chain balances, labels them against the token registry, and
// values them in USD. Deterministic, no AI. Same API as the Solana version.
import { rawBalances } from './bnb.js'
import { getTokenByMint, TOKEN_LIST } from './tokens.js'
import { getPrices } from './pricing.js'

// Returns: [{ symbol, name, mint, coinType, decimals, human, usd, recognized }]
export async function getAllBalances(address) {
  let raw = []
  try {
    raw = await rawBalances(address, TOKEN_LIST)
  } catch (e) {
    throw new Error(`balance read failed: ${e.message}`)
  }
  const prices = await getPrices().catch(() => ({}))
  const out = []
  for (const b of raw) {
    const known = getTokenByMint(b.mint)
    const decimals = known?.decimals ?? b.decimals
    const human = Number(b.units) / 10 ** decimals
    if (human <= 0) continue
    const price = known?.priceId ? (prices[known.priceId] ?? null) : null
    out.push({
      symbol: known?.symbol ?? `${b.mint.slice(0, 4)}…${b.mint.slice(-4)}`,
      name: known?.name ?? 'Unknown token',
      mint: b.mint,
      coinType: b.mint,
      decimals,
      human,
      usd: price != null ? human * price : null,
      recognized: !!known,
    })
  }
  out.sort((a, b) => (a.recognized !== b.recognized ? (a.recognized ? -1 : 1) : (b.usd ?? 0) - (a.usd ?? 0)))
  return out
}

export async function totalUsd(address) {
  const bals = await getAllBalances(address)
  return bals.reduce((sum, b) => sum + (b.usd ?? 0), 0)
}

export async function balanceOf(address, symbol) {
  const bals = await getAllBalances(address)
  const match = bals.find(b => b.symbol.toUpperCase() === String(symbol).toUpperCase())
  return match ? match.human : 0
}

export function formatBalances(bals) {
  if (!bals.length) return 'nothing yet'
  return bals
    .map(b => {
      const usd = b.usd != null ? ` ($${b.usd.toFixed(2)})` : ''
      const amt = b.human >= 1 ? b.human.toFixed(2) : b.human.toPrecision(3)
      return `${amt} ${b.symbol}${usd}`
    })
    .join(', ')
}
