// Checks the JS client against the Rust program source so they can never drift,
// and round-trips every encoder. Run: node --test test/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import {
  IX_ACCOUNTS, IX_ARGS, STATE_FIELDS, encodeIxData, decodeIxData, accountMetas, buildIx,
  decodeState, encodeState, ixDiscriminator, accountDiscriminator, flowSeeds, vested,
} from '../lib/chain/velfiProgram.js'
import { encode as b58 } from '../lib/chain/base58.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.resolve(here, '../../solana/programs/velfi/src')
const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8')

// ── tiny Rust struct reader ──────────────────────────────────────────────
function structBody(src, name) {
  const re = new RegExp(`pub struct ${name}(<'info>)?\\s*\\{`)
  const m = re.exec(src)
  if (!m) return null
  let i = m.index + m[0].length, depth = 1, start = i
  while (depth > 0) { if (src[i] === '{') depth++; else if (src[i] === '}') depth--; i++ }
  return src.slice(start, i - 1)
}
function fields(body) {
  const out = []; let attrs = ''; let i = 0
  while (i < body.length) {
    if (/\s/.test(body[i])) { i++; continue }
    if (body.startsWith('///', i) || body.startsWith('//', i)) { i = body.indexOf('\n', i); if (i < 0) break; continue }
    if (body.startsWith('#[', i)) {
      let depth = 0, j = i + 1
      for (; j < body.length; j++) { if (body[j] === '[') depth++; else if (body[j] === ']') { depth--; if (depth === 0) break } }
      attrs += body.slice(i, j + 1); i = j + 1; continue
    }
    const line = body.slice(i).split('\n')[0].trim()
    const m = /^pub (\w+): (.+?),?$/.exec(line)
    if (m) { out.push({ name: m[1], type: m[2].replace(/,$/, ''), attrs }); attrs = '' }
    const nl = body.indexOf('\n', i); if (nl < 0) break; i = nl + 1
  }
  return out
}
const rustFiles = ['mandate.rs', 'escrow.rs', 'stream.rs', 'split.rs', 'safe_pay.rs', 'stage_pay.rs'].map(f => read(`instructions/${f}`)).join('\n')
const lib = read('lib.rs')
const programFns = [...lib.matchAll(/pub fn (\w+)\(ctx: Context<(\w+)>((?:, \w+: [^,)]+)*)\)/g)]
  .map(m => ({ name: m[1], struct: m[2], args: m[3].split(', ').filter(Boolean).map(a => a.split(': ')) }))

const typeMap = { u64: 'u64', i64: 'i64', u8: 'u8', bool: 'bool', Pubkey: 'pubkey', 'Vec<Pubkey>': 'vec<pubkey>', 'Vec<u64>': 'vec<u64>' }

test('the program exposes exactly the instructions the client knows', () => {
  assert.deepEqual(programFns.map(f => f.name).sort(), Object.keys(IX_ACCOUNTS).sort())
  assert.deepEqual(Object.keys(IX_ARGS).sort(), Object.keys(IX_ACCOUNTS).sort())
})

for (const f of programFns) {
  test(`${f.name}: accounts and args match the Rust source`, () => {
    const body = structBody(rustFiles, f.struct)
    assert.ok(body, `struct ${f.struct} not found`)
    const fs_ = fields(body)
    const expected = fs_.map(x => {
      const signer = x.type.startsWith('Signer<')
      const writable = /\b(mut|init|init_if_needed)\b/.test(x.attrs.replace(/#\[account\(([\s\S]*)\)\]/, '$1').split(/[,(]/).map(s => s.trim()).join(' '))
      return [x.name, (signer ? 's' : '') + (writable ? 'w' : '')]
    })
    assert.deepEqual(IX_ACCOUNTS[f.name], expected)
    assert.deepEqual(IX_ARGS[f.name], f.args.map(([n, t]) => [n, typeMap[t.trim()]]))
  })
}

for (const name of Object.keys(STATE_FIELDS)) {
  test(`${name}: layout matches state.rs`, () => {
    const body = structBody(read('state.rs'), name)
    assert.ok(body, `struct ${name} not found`)
    assert.deepEqual(STATE_FIELDS[name], fields(body).map(x => [x.name, typeMap[x.type]]))
  })
}

// ── encoding ─────────────────────────────────────────────────────────────
const key = (n) => b58(Buffer.alloc(32, n))

test('discriminators follow the Anchor convention', () => {
  const h = crypto.createHash('sha256').update('global:create_mandate').digest().subarray(0, 8)
  assert.deepEqual(ixDiscriminator('create_mandate'), h)
  assert.equal(accountDiscriminator('MandateState').length, 8)
})

test('create_mandate data round-trips with exact borsh layout', () => {
  const args = { id: 7, agent: key(2), recipients: [key(3), key(4)], maxPerTx: 100_000_000n, totalBudget: 500_000_000n, duration: 86_400 }
  const data = encodeIxData('create_mandate', args)
  assert.equal(data.length, 8 + 8 + 32 + (4 + 64) + 8 + 8 + 8)
  const back = decodeIxData('create_mandate', data)
  assert.equal(back.id, 7n)
  assert.equal(back.agent, key(2))
  assert.deepEqual(back.recipients, [key(3), key(4)])
  assert.equal(back.total_budget, 500_000_000n)
  assert.equal(back.duration, 86_400n)
})

test('negative durations encode as signed i64 (program then rejects them)', () => {
  const back = decodeIxData('start_stream', encodeIxData('start_stream', { id: 1, recipient: key(1), amount: 5, duration: -1 }))
  assert.equal(back.duration, -1n)
})

test('missing args and accounts are refused before anything is sent', () => {
  assert.throws(() => encodeIxData('execute_mandate', {}), /missing argument amount/)
  assert.throws(() => accountMetas('revoke_mandate', { owner: key(1) }), /missing account mandate/)
  assert.throws(() => encodeIxData('execute_mandate', { amount: -5 }), /out of range/)
})

test('account metas carry signer and writable flags in order', () => {
  const accts = Object.fromEntries(IX_ACCOUNTS.execute_mandate.map(([n], i) => [n, key(i + 1)]))
  const ix = buildIx(key(99), 'execute_mandate', accts, { amount: 10 })
  assert.equal(ix.keys[0].isSigner, true)   // caller
  assert.equal(ix.keys[1].isWritable, true) // payer
  assert.equal(ix.keys[5].isSigner, false)  // recipient
  assert.equal(ix.programId, key(99))
})

test('state accounts decode', () => {
  const v = { owner: key(1), agent: key(2), mint: key(3), rent_payer: key(4), id: 9n, bump: 254, recipients: [key(5)], max_per_tx: 1n, total_budget: 10n, spent: 3n, expires_at: 1_800_000_000n, active: true }
  const d = decodeState('MandateState', encodeState('MandateState', v))
  assert.equal(d.owner, key(1)); assert.equal(d.rentPayer, key(4)); assert.deepEqual(d.recipients, [key(5)])
  assert.equal(d.spent, 3n); assert.equal(d.active, true); assert.equal(d.bump, 254)
})

test('flow seeds are seed, owner, u64 id', () => {
  const s = flowSeeds('stream', key(1), 258)
  assert.equal(s[0].toString(), 'stream')
  assert.equal(s[1].length, 32)
  assert.deepEqual([...s[2]], [2, 1, 0, 0, 0, 0, 0, 0])
})

test('vesting mirror matches velfi-core', () => {
  assert.equal(vested(1000, 100, 200, 100), 0n)
  assert.equal(vested(1000, 100, 200, 125), 250n)
  assert.equal(vested(1000, 100, 200, 999), 1000n)
})
