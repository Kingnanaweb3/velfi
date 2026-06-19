// Reads a user's on-chain token balances, labels them against the recognized-token
// registry, and values them in USD. DETERMINISTIC — no AI. This is how the agent
// "knows" what a user holds and whether they have enough.

import { provider } from './sui.js'
import { TOKENS, getTokenByCoinType } from './tokens.js'
import { getPrices } from './pricing.js'

// Get every coin balance the user holds, labeled + priced where recognized.
// Returns: [{ symbol, name, coinType, decimals, human, usd, recognized }]
export async function getAllBalances(address) {
  let raw = []
  try {
    raw = await provider.getAllBalances({ owner: address })
  } catch (e) {
    throw new Error(`balance read failed: ${e.message}`)
  }

  const prices = await getPrices().catch(() => ({}))
  const out = []

  for (const b of raw) {
    const known = getTokenByCoinType(b.coinType)
    const decimals = known?.decimals ?? 9
    const human = Number(b.totalBalance) / 10 ** decimals
    if (human <= 0) continue // skip dust/zero
    const price = known?.priceId ? (prices[known.priceId] ?? null) : null
    out.push({
      symbol: known?.symbol ?? b.coinType.split('::').pop(),
      name: known?.name ?? 'Unknown token',
      coinType: b.coinType,
      decimals,
      human,
      usd: price != null ? human * price : null,
      recognized: !!known,
    })
  }

  // Sort: recognized first, then by USD value desc
  out.sort((a, b) => {
    if (a.recognized !== b.recognized) return a.recognized ? -1 : 1
    return (b.usd ?? 0) - (a.usd ?? 0)
  })
  return out
}

// Total portfolio value in USD (recognized/priced tokens only).
export async function totalUsd(address) {
  const bals = await getAllBalances(address)
  return bals.reduce((sum, b) => sum + (b.usd ?? 0), 0)
}

// How much of a specific token does the user hold? Returns human amount (0 if none).
export async function balanceOf(address, symbol) {
  const bals = await getAllBalances(address)
  const match = bals.find(b => b.symbol.toUpperCase() === String(symbol).toUpperCase())
  return match ? match.human : 0
}

// Format balances into a short human string for the agent to show the user.
// e.g. "100 SUI ($75.00), 25 USDC ($25.00), 5 DEEP"
export function formatBalances(bals) {
  return bals
    .map(b => {
      const usd = b.usd != null ? ` ($${b.usd.toFixed(2)})` : ''
      const amt = b.human >= 1 ? b.human.toFixed(2) : b.human.toPrecision(3)
      return `${amt} ${b.symbol}${usd}`
    })
    .join(', ')
}
