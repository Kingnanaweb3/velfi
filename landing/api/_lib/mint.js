// Checks that a Solana address really is the $VELFI token, straight from the chain.
// Used by the site's /api/token-config (before showing an address to anyone) and by
// scripts/verify-token.mjs (before you announce it). No packages: plain JSON-RPC.

const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/
export const isSolanaAddress = (a) => typeof a === 'string' && B58.test(a)

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

// What the chain says about this address. Never throws for a bad address: it
// returns { ok: false, reason } so callers can show UNVERIFIED.
export async function inspectMint(rpcUrl, address) {
  if (!isSolanaAddress(address)) return { ok: false, reason: 'Not a Solana address.' }
  const info = await rpc(rpcUrl, 'getAccountInfo', [address, { encoding: 'jsonParsed', commitment: 'confirmed' }])
  const v = info?.value
  if (!v) return { ok: false, reason: 'Nothing exists at this address on Solana.' }
  const d = v.data
  if (!d || typeof d !== 'object' || !['spl-token', 'spl-token-2022'].includes(d.program) || d.parsed?.type !== 'mint')
    return { ok: false, reason: 'This address is not a token.' }
  const m = d.parsed.info
  let symbol = null, name = null
  const ext = (m.extensions || []).find(e => e.extension === 'tokenMetadata')
  if (ext?.state) { symbol = ext.state.symbol || null; name = ext.state.name || null }
  if (!symbol) {
    // Classic tokens keep name/symbol in Metaplex metadata; Helius reads it for us.
    try {
      const a = await rpc(rpcUrl, 'getAsset', { id: address })
      symbol = a?.content?.metadata?.symbol || null
      name = a?.content?.metadata?.name || null
    } catch { /* not a Helius RPC: symbol stays unknown */ }
  }
  return {
    ok: true, program: d.program, decimals: m.decimals, supply: m.supply,
    mintAuthority: m.mintAuthority ?? null, freezeAuthority: m.freezeAuthority ?? null,
    symbol: symbol ? String(symbol).trim() : null, name: name ? String(name).trim() : null,
  }
}

// Does it match what we expect? Unknown symbol counts as a failure.
export function judge(m, expectSymbol) {
  if (!m.ok) return { verified: false, reason: m.reason }
  if (!m.symbol) return { verified: false, reason: "Couldn't read the token's symbol (is SOLANA_RPC_URL a Helius URL?)." }
  if (expectSymbol && m.symbol.replace(/^\$/, '').toUpperCase() !== expectSymbol.replace(/^\$/, '').toUpperCase())
    return { verified: false, reason: `Symbol on-chain is ${m.symbol}, not ${expectSymbol}.` }
  return { verified: true, reason: null }
}
