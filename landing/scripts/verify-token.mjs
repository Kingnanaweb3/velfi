// Check the address stored for the site, straight from the chain, before you
// announce it. Exits with an error unless it is a real token with the symbol VELFI.
//   node scripts/verify-token.mjs            check what's stored
//   node scripts/verify-token.mjs <address>  check any address
import { readFileSync } from 'node:fs'
import { inspectMint, judge } from '../api/_lib/mint.js'

const env = Object.fromEntries(readFileSync(new URL('../.env.swap', import.meta.url), 'utf8')
  .split('\n').filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]))
const expect = env.EXPECTED_SYMBOL || 'VELFI'

let address = process.argv[2]
if (!address) {
  const r = await fetch(env.UPSTASH_REDIS_REST_URL, { method: 'POST', headers: { authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}` }, body: JSON.stringify(['GET', 'velfi:ca']) })
  address = (await r.json())?.result
  if (!address) { console.log('Nothing is set. The site shows "Coming soon".'); process.exit(1) }
}

const m = await inspectMint(env.SOLANA_RPC_URL, address)
const v = judge(m, expect)
console.log(`Address   ${address}`)
if (m.ok) {
  console.log(`Token     ${m.name || '?'} (${m.symbol || '?'}) · ${m.program} · ${m.decimals} decimals`)
  console.log(`Supply    ${(Number(m.supply) / 10 ** m.decimals).toLocaleString('en-US')}`)
  console.log(`Mint auth ${m.mintAuthority || 'none (no more can be minted)'}`)
  console.log(`Freeze    ${m.freezeAuthority || 'none'}`)
}
console.log(v.verified ? `✓ OK: this is ${expect}` : `✗ NOT OK: ${v.reason}`)
process.exit(v.verified ? 0 : 1)
