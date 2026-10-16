import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dollarFigure, applyDollarFigure } from '../lib/dollars.js'

test('dollar figures are read from the message itself', () => {
  for (const [msg, want] of [
    ['Send 1$ sol to lazarus.vel', 1], ['send $1 of SOL to x.vel', 1], ['send $ 2.5 sol', 2.5],
    ['send 1 $ sol', 1], ['10 dollars in sol to amy.vel', 10], ['send 20 bucks of sol', 20],
    ['send 1,000 usd of sol', 1000], ['Send Send 1$ sol to lazarus.vel', 1],
  ]) assert.equal(dollarFigure(msg), want, msg)
  for (const msg of ['send 1 sol to x.vel', 'send 5 USDC to bob.vel', 'send 5 usdc', '$3 to amy and $7 to ben', 'hello'])
    assert.equal(dollarFigure(msg), null, msg)
})

test('"1$ sol" becomes dollars to convert, even when the AI read it as 1 SOL', () => {
  const p = applyDollarFigure({ intent: 'send', payment: { amount: 1, currency: 'SOL', amount_in_usd: false, recipients: [{ name: 'lazarus.vel' }] } }, 'Send 1$ sol to lazarus.vel')
  assert.equal(p.payment.amount, 1)
  assert.equal(p.payment.amount_in_usd, true)
  // a plain token amount is left alone
  const q = applyDollarFigure({ intent: 'send', payment: { amount: 1, currency: 'SOL', recipients: [{ name: 'a.vel' }] } }, 'send 1 sol to a.vel')
  assert.equal(q.payment.amount_in_usd, undefined)
  // an equal split worked out from a wrong figure is recomputed from the dollars
  const s = applyDollarFigure({ intent: 'split', payment: { amount: 4, currency: 'SOL', recipients: [{ name: 'a.vel', amount: 2 }, { name: 'b.vel', amount: 2 }] } }, 'split $10 of sol between a and b')
  assert.equal(s.payment.amount, 10)
  assert.deepEqual(s.payment.recipients.map(r => r.amount), [null, null])
  // swaps and multi-token sends are not touched
  const w = applyDollarFigure({ intent: 'swap', payment: { amount: 1, currency: 'SOL' } }, 'swap $1 of sol')
  assert.equal(w.payment.amount_in_usd, undefined)
})
