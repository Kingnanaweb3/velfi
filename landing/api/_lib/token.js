// Checks that a BNB Chain address really is the $VELFI token, straight from the chain.
// Used by the site's /api/token-config (before showing an address to anyone) and by
// scripts/verify-token.mjs (before you announce it). No packages: plain JSON-RPC.

const HEX = /^0x[0-9a-fA-F]{40}$/
export const isEvmAddress = (a) => typeof a === 'string' && HEX.test(a)

async function rpc(url, method, params) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  if (!r.ok) throw new Error(`RPC ${method} answered ${r.status}`)
  const j = await r.json()
  if (j.error) throw new Error(`RPC ${method}: ${j.error.message || 'error'}`)
  return j.result
}

// ERC-20 read calls by selector: name(), symbol(), decimals(), totalSupply(), owner()
const SEL = { name: '0x06fdde03', symbol: '0x95d89b41', decimals: '0x313ce567', totalSupply: '0x18160ddd', owner: '0x8da5cb5b' }
const call = (url, to, data) => rpc(url, 'eth_call', [{ to, data }, 'latest'])

// An ABI-encoded string (or, for old tokens, a bytes32) as text.
export function decodeString(hex) {
  const h = String(hex || '').replace(/^0x/, '')
  if (!h) return null
  const bytes = (s) => Buffer.from(s, 'hex').toString('utf8').replace(/\u0000+$/, '').trim()
  if (h.length === 64) return bytes(h) || null
  const len = parseInt(h.slice(64, 128), 16)
  if (!Number.isFinite(len) || len > 256) return null
  return bytes(h.slice(128, 128 + len * 2)) || null
}
const uint = (hex) => (hex && hex !== '0x' ? BigInt(hex) : null)

// What the chain says about this address. Never throws for a bad address: it
// returns { ok: false, reason } so callers can show UNVERIFIED.
export async function inspectToken(rpcUrl, address) {
  if (!isEvmAddress(address)) return { ok: false, reason: 'Not a BNB Chain address.' }
  const code = await rpc(rpcUrl, 'eth_getCode', [address, 'latest'])
  if (!code || code === '0x') return { ok: false, reason: 'There is no contract at this address on BNB Chain.' }
  const [name, symbol, decimals, supply, owner] = await Promise.all(
    ['name', 'symbol', 'decimals', 'totalSupply', 'owner'].map(k => call(rpcUrl, address, SEL[k]).catch(() => null)))
  if (decimals === null || supply === null) return { ok: false, reason: 'This address is not a token.' }
  const o = owner && owner.length >= 66 ? `0x${owner.slice(-40)}` : null
  return {
    ok: true, program: 'BEP-20', decimals: Number(uint(decimals)), supply: String(uint(supply)),
    owner: o && !/^0x0{40}$/.test(o) ? o : null,
    symbol: decodeString(symbol), name: decodeString(name),
  }
}

// Does it match what we expect? Unknown symbol counts as a failure.
export function judge(m, expectSymbol) {
  if (!m.ok) return { verified: false, reason: m.reason }
  if (!m.symbol) return { verified: false, reason: "Couldn't read the token's symbol." }
  if (expectSymbol && m.symbol.replace(/^\$/, '').toUpperCase() !== expectSymbol.replace(/^\$/, '').toUpperCase())
    return { verified: false, reason: `Symbol on-chain is ${m.symbol}, not ${expectSymbol}.` }
  return { verified: true, reason: null }
}
