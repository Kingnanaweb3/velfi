import { test } from 'node:test'
import assert from 'node:assert/strict'
import { legsFromProposal, totalsBySymbol, newFlowId, scheduleToMandate, MAX_LEGS } from '../lib/chain/plan.js'
import { seal, open } from '../lib/chain/secretBox.js'

const TOKENS = { USDC: { symbol: 'USDC', mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6 }, SOL: { symbol: 'SOL', mint: 'native', decimals: 9 } }
const getToken = (s) => TOKENS[s] || null
const A = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const B = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'

test('a single send becomes one exact leg', () => {
  const legs = legsFromProposal({ intent: 'send', payment: { currency: 'usdc', amount: 30, recipients: [{ name: 'maya.vel', resolved: { address: A } }] } }, getToken)
  assert.equal(legs.length, 1)
  assert.equal(legs[0].amountUnits, 30_000_000n)
  assert.equal(legs[0].to, A)
  assert.equal(legs[0].label, 'maya.vel')
})

test('token_amount from a USD conversion wins over the USD figure, and float tails are trimmed', () => {
  const legs = legsFromProposal({ intent: 'send', payment: { currency: 'SOL', amount: 20, token_amount: 0.1333333333333333, recipients: [{ resolved: { address: A } }] } }, getToken)
  assert.equal(legs[0].amountUnits, 133_333_333n)
})

test('splits use per-person amounts', () => {
  const legs = legsFromProposal({ intent: 'split', payment: { currency: 'USDC', amount: 90, recipients: [
    { name: 'a', amount: 30, resolved: { address: A } }, { name: 'b', amount: 60, resolved: { address: B } }] } }, getToken)
  assert.deepEqual(legs.map(l => l.amountUnits), [30_000_000n, 60_000_000n])
  assert.deepEqual(totalsBySymbol(legs), { USDC: 90_000_000n })
})

test('multi-token actions keep their own token', () => {
  const legs = legsFromProposal({ intent: 'send', actions: [
    { token: 'SOL', amount: 0.01, recipient: { name: 'a', resolved: { address: A } } },
    { token: 'USDC', amount: '2', recipient: { name: 'b', resolved: { address: B } } }] }, getToken)
  assert.deepEqual(totalsBySymbol(legs), { SOL: 10_000_000n, USDC: 2_000_000n })
})

test('emails become escrow invites', () => {
  const [l] = legsFromProposal({ intent: 'send', payment: { currency: 'USDC', amount: 5, recipients: [{ resolved: { email: 'Jordan@Gmail.com', needsInvite: true } }] } }, getToken)
  assert.equal(l.kind, 'invite')
  assert.equal(l.email, 'jordan@gmail.com')
})

test('bad input never reaches a transaction', () => {
  const p = (pay, intent = 'send') => () => legsFromProposal({ intent, payment: pay }, getToken)
  assert.throws(p({ currency: 'DOGE', amount: 1, recipients: [{ resolved: { address: A } }] }), /recognize/)
  assert.throws(p({ currency: 'USDC', amount: 0, recipients: [{ resolved: { address: A } }] }), /valid amount/)
  assert.throws(p({ currency: 'USDC', amount: 1, recipients: [{ resolved: { address: '0xdfb875bba6bfcade4efa0b7bed278c508f3a8d0d9c2bcf1e929525350b2be803' } }] }), /not a valid Solana address/)
  assert.throws(p({ currency: 'USDC', amount: 1, recipients: [] }), /No recipients/)
  assert.throws(p({ currency: 'USDC', amount: 1, recipients: [{ resolved: {} }] }), /missing an address/)
  assert.throws(p({ currency: 'USDC', amount: 1, recipients: Array(MAX_LEGS + 1).fill({ resolved: { address: A } }) }), /up to/)
  assert.throws(() => legsFromProposal({ intent: 'swap', payment: {} }, getToken), /not a direct payment/)
})

test('flow ids are unique u64 values', () => {
  assert.equal(newFlowId(1_760_000_000_000, 7), 1_760_000_000_000_007n)
  assert.ok(newFlowId() < 2n ** 64n)
})

test('a weekly x4 schedule becomes a tight mandate', () => {
  const m = scheduleToMandate({ amountUnits: 25_000_000n, frequency: 'weekly', occurrences: 4 })
  assert.equal(m.maxPerTx, 25_000_000n)
  assert.equal(m.totalBudget, 100_000_000n)
  assert.equal(m.durationSecs, 604_800 * 3 + 86_400)
  assert.throws(() => scheduleToMandate({ amountUnits: 1n, frequency: 'fortnightly-ish' }), /schedule/)
})

test('invite claim keys are sealed and reopened only with the right secret', () => {
  const secret = 'x'.repeat(40)
  const key = Uint8Array.from({ length: 64 }, (_, i) => i)
  const sealed = seal(key, secret)
  assert.notEqual(sealed, Buffer.from(key).toString('base64'))
  assert.deepEqual(open(sealed, secret), key)
  assert.throws(() => open(sealed, 'y'.repeat(40)))
  assert.throws(() => seal(key, 'short'), /ESCROW_SECRET/)
})
