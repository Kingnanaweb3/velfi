import { test } from 'node:test'
import assert from 'node:assert/strict'
import { legsFromProposal, totalsBySymbol, newFlowId, scheduleToMandate, MAX_LEGS } from '../lib/chain/plan.js'
import { seal, open } from '../lib/chain/secretBox.js'

// BNB Chain: USDC and BNB both use 18 decimals.
const TOKENS = { USDC: { symbol: 'USDC', mint: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', decimals: 18 }, BNB: { symbol: 'BNB', mint: 'native', decimals: 18 } }
const getToken = (s) => TOKENS[s] || null
const A = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const B = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'
const E18 = 10n ** 18n

test('lowercase addresses are accepted and checksummed', () => {
  const [l] = legsFromProposal({ intent: 'send', payment: { currency: 'USDC', amount: 1, recipients: [{ resolved: { address: A.toLowerCase() } }] } }, getToken)
  assert.equal(l.to, A)
})

test('a single send becomes one exact leg', () => {
  const legs = legsFromProposal({ intent: 'send', payment: { currency: 'usdc', amount: 30, recipients: [{ name: 'maya.vel', resolved: { address: A } }] } }, getToken)
  assert.equal(legs.length, 1)
  assert.equal(legs[0].amountUnits, 30n * E18)
  assert.equal(legs[0].to, A)
  assert.equal(legs[0].label, 'maya.vel')
})

test('token_amount from a USD conversion wins over the USD figure, and float tails are trimmed', () => {
  const legs = legsFromProposal({ intent: 'send', payment: { currency: 'BNB', amount: 20, token_amount: 0.1333333333333333, recipients: [{ resolved: { address: A } }] } }, getToken)
  assert.equal(legs[0].amountUnits, 133_333_333_333_000_000n) // float noise trimmed at 12 places
})

test('splits use per-person amounts', () => {
  const legs = legsFromProposal({ intent: 'split', payment: { currency: 'USDC', amount: 90, recipients: [
    { name: 'a', amount: 30, resolved: { address: A } }, { name: 'b', amount: 60, resolved: { address: B } }] } }, getToken)
  assert.deepEqual(legs.map(l => l.amountUnits), [30n * E18, 60n * E18])
  assert.deepEqual(totalsBySymbol(legs), { USDC: 90n * E18 })
})

test('multi-token actions keep their own token', () => {
  const legs = legsFromProposal({ intent: 'send', actions: [
    { token: 'BNB', amount: 0.01, recipient: { name: 'a', resolved: { address: A } } },
    { token: 'USDC', amount: '2', recipient: { name: 'b', resolved: { address: B } } }] }, getToken)
  assert.deepEqual(totalsBySymbol(legs), { BNB: 10n ** 16n, USDC: 2n * E18 })
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
  assert.throws(p({ currency: 'USDC', amount: 1, recipients: [{ resolved: { address: '0xdfb875bba6bfcade4efa0b7bed278c508f3a8d0d9c2bcf1e929525350b2be803' } }] }), /not a valid BNB Chain address/)
  assert.throws(p({ currency: 'USDC', amount: 1, recipients: [{ resolved: { address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' } }] }), /not a valid BNB Chain address/)
  assert.throws(p({ currency: 'USDC', amount: 1, recipients: [{ resolved: { address: '0x70997970c51812dc3A010C7d01b50e0d17dc79C8' } }] }), /not a valid BNB Chain address/) // bad checksum
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
