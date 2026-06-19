// Velfi pricing — off-chain USD price source for recognized tokens.
// DETERMINISTIC CODE. The AI never sets or guesses prices. This module is the
// single source of truth for "what is X worth in USD" and "how much token = $Y".
//
// Default source: CoinGecko simple price API (free, no key for low volume).
// Swap PRICE_URL / mapping later if you move to Pyth or a paid feed.

import { TOKENS, TOKEN_LIST, getToken } from './tokens.js'

const CACHE_MS = 60_000          // cache prices for 60s to avoid rate limits
let cache = { at: 0, prices: {} } // { priceId: usdNumber }

// Build the CoinGecko id list from recognized tokens (skip any without a priceId).
function coingeckoIds() {
  return [...new Set(TOKEN_LIST.map(t => t.priceId).filter(Boolean))]
}

// Fetch fresh USD prices for all recognized tokens. Returns { priceId: usd }.
async function fetchPrices() {
  const ids = coingeckoIds().join(',')
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`price fetch failed: ${res.status}`)
  const data = await res.json()
  // data shape: { sui: { usd: 0.95 }, 'usd-coin': { usd: 1 }, ... }
  const prices = {}
  for (const [id, obj] of Object.entries(data)) {
    if (obj && typeof obj.usd === 'number') prices[id] = obj.usd
  }
  return prices
}

// Get all prices, using cache when fresh.
export async function getPrices() {
  const now = Date.now()
  if (now - cache.at < CACHE_MS && Object.keys(cache.prices).length) {
    return cache.prices
  }
  const prices = await fetchPrices()
  cache = { at: now, prices }
  return prices
}

// USD price of a single token symbol. Returns number or null if unknown.
export async function getUsdPrice(symbol) {
  const token = getToken(symbol)
  if (!token || !token.priceId) return null
  const prices = await getPrices()
  return prices[token.priceId] ?? null
}

// Convert a raw on-chain balance (smallest unit, e.g. MIST) to a human amount.
export function toHuman(rawAmount, symbol) {
  const token = getToken(symbol)
  if (!token) return null
  return Number(rawAmount) / 10 ** token.decimals
}

// Convert a human token amount to raw smallest-unit (for building transactions).
export function toRaw(humanAmount, symbol) {
  const token = getToken(symbol)
  if (!token) return null
  return Math.round(Number(humanAmount) * 10 ** token.decimals)
}

// USD value of a human token amount. e.g. usdValue(12.5, 'SUI')
export async function usdValue(humanAmount, symbol) {
  const price = await getUsdPrice(symbol)
  if (price == null) return null
  return Number(humanAmount) * price
}

// "$50 in SUI" -> how many SUI. e.g. usdToToken(50, 'SUI')
// Returns null if the token has no price (can't convert safely).
export async function usdToToken(usdAmount, symbol) {
  const price = await getUsdPrice(symbol)
  if (price == null || price <= 0) return null
  return Number(usdAmount) / price
}

// Value an entire balance set in USD for the "total balance" display.
// Input: array of { symbol, human } (human = already-scaled amount).
// Returns { total, breakdown: [{ symbol, human, usd }] }.
// Unrecognized/unpriced tokens are included with usd=null so the UI can still list them.
export async function valuePortfolio(holdings) {
  const prices = await getPrices()
  let total = 0
  const breakdown = []
  for (const h of holdings) {
    const token = getToken(h.symbol)
    const price = token?.priceId ? (prices[token.priceId] ?? null) : null
    const usd = price != null ? Number(h.human) * price : null
    if (usd != null) total += usd
    breakdown.push({ symbol: h.symbol, human: Number(h.human), usd })
  }
  return { total, breakdown }
}
