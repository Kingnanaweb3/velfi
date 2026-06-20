// Velfi pricing — off-chain USD price source for recognized tokens.
// DETERMINISTIC CODE. The AI never sets or guesses prices.
//
// Strategy: stale-while-revalidate. We ALWAYS return cached prices instantly and
// refresh in the background, so a slow or rate-limited (429) price API never blocks
// the request or collapses the balance to $0. Cache is seeded with safe fallbacks
// and warmed on startup, then continuously topped up with live prices.
import { TOKENS, TOKEN_LIST, getToken } from './tokens.js'

const CACHE_MS = 60_000            // consider cache "fresh" for 60s
// Last-resort values so a cold start with a failing API never shows $0.
// Stablecoins are exact; others are rough and get overwritten by the live fetch.
const FALLBACK = { 'sui': 3, 'usd-coin': 1, 'usdc': 1, 'tether': 1, 'deepbook': 0.05 }

let cache = { at: 0, prices: { ...FALLBACK } }   // never empty
let inflight = null

function coingeckoIds() {
  return [...new Set(TOKEN_LIST.map(t => t.priceId).filter(Boolean))]
}

// One live fetch. Throws on failure (handled by the background refresher).
async function fetchPrices() {
  const ids = coingeckoIds().join(',')
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`
  const res = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'velfi/1.0' } })
  if (!res.ok) throw new Error(`price fetch failed: ${res.status}`)
  const data = await res.json()
  const prices = {}
  for (const [id, obj] of Object.entries(data)) {
    if (obj && typeof obj.usd === 'number') prices[id] = obj.usd
  }
  return prices
}

// Fire-and-forget refresh. Updates cache on success, keeps last-good on failure.
function refreshInBackground() {
  if (inflight) return inflight
  inflight = fetchPrices()
    .then(prices => {
      if (Object.keys(prices).length) cache = { at: Date.now(), prices: { ...cache.prices, ...prices } }
      return cache.prices
    })
    .catch(() => cache.prices)            // 429 / network error -> keep last good
    .finally(() => { inflight = null })
  return inflight
}

// ALWAYS returns immediately (cache or fallback). Refreshes in the background if stale.
export async function getPrices() {
  if (Date.now() - cache.at >= CACHE_MS) refreshInBackground()  // do not await
  return cache.prices
}

export async function getUsdPrice(symbol) {
  const token = getToken(symbol)
  if (!token || !token.priceId) return null
  const prices = await getPrices()
  return prices[token.priceId] ?? FALLBACK[token.priceId] ?? null
}

export function toHuman(rawAmount, symbol) {
  const token = getToken(symbol)
  if (!token) return null
  return Number(rawAmount) / 10 ** token.decimals
}

export function toRaw(humanAmount, symbol) {
  const token = getToken(symbol)
  if (!token) return null
  return Math.round(Number(humanAmount) * 10 ** token.decimals)
}

export async function usdValue(humanAmount, symbol) {
  const price = await getUsdPrice(symbol)
  if (price == null) return null
  return Number(humanAmount) * price
}

export async function usdToToken(usdAmount, symbol) {
  const price = await getUsdPrice(symbol)
  if (price == null || price <= 0) return null
  return Number(usdAmount) / price
}

export async function valuePortfolio(holdings) {
  const prices = await getPrices()
  let total = 0
  const breakdown = []
  for (const h of holdings) {
    const token = getToken(h.symbol)
    const price = token?.priceId ? (prices[token.priceId] ?? FALLBACK[token.priceId] ?? null) : null
    const usd = price != null ? Number(h.human) * price : null
    if (usd != null) total += usd
    breakdown.push({ symbol: h.symbol, human: Number(h.human), usd })
  }
  return { total, breakdown }
}

// Warm the cache on startup so the very first request already has live prices.
refreshInBackground()
