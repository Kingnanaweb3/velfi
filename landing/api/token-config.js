// GET  /api/token-config  -> { status: 'pending' | 'unverified' | 'live', address?, symbol?, reason? }
// POST /api/token-config  (header x-admin-key) body { address } sets it, { address: null } clears it.
//
// The address lives in Upstash Redis, so it changes in seconds with no redeploy.
// Every response is no-store: a cached answer would make a swap silently do nothing.
// The site never trusts the stored value blindly: before showing an address it
// checks on-chain that it is a real token with the expected symbol (VELFI).
import crypto from 'node:crypto'
import { isSolanaAddress, inspectMint, judge } from './_lib/mint.js'

const URL = process.env.UPSTASH_REDIS_REST_URL
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN
const ADMIN_KEY = process.env.ADMIN_KEY
const RPC = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'
const EXPECT = process.env.EXPECTED_SYMBOL || 'VELFI'
const FALLBACK = process.env.VELFI_CA || null
const KEY = 'velfi:ca'
// Test mode: rehearse the live path with a real, existing token (mainnet USDC),
// shown with a TEST badge. Only this one mint is accepted as a test, so a leaked
// key can't use test mode to show anything else.
const TEST_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const TEST_SYMBOL = 'USDC'

const NO_STORE = {
  'content-type': 'application/json',
  'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
  'cdn-cache-control': 'no-store',
  'vercel-cdn-cache-control': 'no-store',
}

async function redis(cmd) {
  if (!URL || !TOKEN) return null
  const r = await fetch(URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify(cmd),
    cache: 'no-store',
  })
  if (!r.ok) throw new Error(`Redis answered ${r.status}`)
  return (await r.json())?.result ?? null
}

// One on-chain check per address per warm instance per 30s, so polling visitors
// don't hammer the RPC. A swap to a new address is checked at once.
const checked = new Map()
async function verify(address, expect = EXPECT) {
  const ck = `${expect}:${address}`
  const hit = checked.get(ck)
  if (hit && Date.now() - hit.at < 30_000) return hit.result
  let result
  try {
    const m = await inspectMint(RPC, address)
    result = { ...judge(m, expect), symbol: m.symbol || null }
  } catch (e) {
    result = { verified: false, reason: `Couldn't reach Solana to check it (${e.message}).`, transient: true }
  }
  if (!result.transient) checked.set(ck, { at: Date.now(), result })
  return result
}

function send(res, status, body) {
  for (const [k, v] of Object.entries(NO_STORE)) res.setHeader(k, v)
  res.status(status).send(JSON.stringify(body))
}

function sameKey(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''))
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y)
}

export default async function handler(req, res) {
  if (req.method === 'GET' || req.method === 'HEAD') {
    let stored = null
    try { stored = await redis(['GET', KEY]) } catch { /* fall back below */ }
    const test = stored === `test:${TEST_MINT}`
    let address = test ? TEST_MINT : stored
    if (!isSolanaAddress(address)) address = isSolanaAddress(FALLBACK) ? FALLBACK : null
    if (!address) return send(res, 200, { status: 'pending', ts: Date.now() })
    const v = await verify(address, test ? TEST_SYMBOL : EXPECT)
    if (!v.verified) return send(res, 200, { status: 'unverified', reason: v.reason, test, ts: Date.now() })
    return send(res, 200, { status: 'live', address, symbol: v.symbol, test, ts: Date.now() })
  }

  if (req.method === 'POST') {
    if (!ADMIN_KEY || !sameKey(req.headers['x-admin-key'], ADMIN_KEY)) return send(res, 401, { error: 'unauthorized' })
    let body = req.body
    if (typeof body === 'string') { try { body = JSON.parse(body) } catch { return send(res, 400, { error: 'bad json' }) } }
    const address = body?.address
    try {
      if (address === null) { await redis(['DEL', KEY]); checked.clear(); return send(res, 200, { cleared: true }) }
      if (body?.test === true) {
        await redis(['SET', KEY, `test:${TEST_MINT}`])
        const v = await verify(TEST_MINT, TEST_SYMBOL)
        return send(res, 200, { address: TEST_MINT, ok: true, test: true, status: v.verified ? 'live' : 'unverified', reason: v.reason || null, symbol: v.symbol || null })
      }
      if (!isSolanaAddress(address)) return send(res, 400, { error: 'not a Solana address' })
      await redis(['SET', KEY, address])
      checked.delete(address)
      const v = await verify(address)
      return send(res, 200, { address, ok: true, status: v.verified ? 'live' : 'unverified', reason: v.reason || null, symbol: v.symbol || null })
    } catch (e) {
      return send(res, 500, { error: e.message })
    }
  }

  res.setHeader('allow', 'GET, HEAD, POST')
  return send(res, 405, { error: 'method not allowed' })
}
