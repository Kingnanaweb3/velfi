// Replies in Chinese and Korean: amounts, names and addresses must survive, and
// anything that goes wrong falls back to the English reply.
import { test } from 'node:test'
import assert from 'node:assert/strict'
process.env.USEPOD_TOKEN = process.env.USEPOD_TOKEN || 'test'
const { translateBody, langOf, mustKeep, keepsEverything, _setCall } = await import('../lib/translate.js')

const fake = (map) => _setCall(async (_m, msgs) => {
  const items = JSON.parse(msgs[1].content).items
  return JSON.stringify({ items: items.map(s => map[s] ?? s) })
})

test('language comes from the x-velfi-lang header, default English', () => {
  assert.equal(langOf({ headers: { 'x-velfi-lang': 'zh' } }), 'zh')
  assert.equal(langOf({ headers: { 'x-velfi-lang': 'KO' } }), 'ko')
  assert.equal(langOf({ headers: { 'x-velfi-lang': 'fr' } }), 'en')
  assert.equal(langOf({ headers: {} }), 'en')
})

test('protected pieces are found', () => {
  const k = mustKeep('Send $1,250.50 USDC to jordan.vel and 0xAbCdEf0123456789 at a@b.co, 10% more')
  for (const x of ['$1,250.50', 'USDC', 'jordan.vel', '0xAbCdEf0123456789', 'a@b.co', '10%']) assert.ok(k.includes(x), x)
})

test('a good translation is used; English stays English', async () => {
  fake({ 'Send 5 USDC to alex.vel?': '要给 alex.vel 转 5 USDC 吗？' })
  const out = await translateBody({ mode: 'clarify', reply: 'Send 5 USDC to alex.vel?' }, 'zh')
  assert.equal(out.reply, '要给 alex.vel 转 5 USDC 吗？')
  assert.equal(out.mode, 'clarify')
  const en = await translateBody({ reply: 'Send 5 USDC to alex.vel?' }, 'en')
  assert.equal(en.reply, 'Send 5 USDC to alex.vel?')
})

test('a translation that changes an amount or name is thrown away', async () => {
  fake({ 'You hold 12.5 USDC and 0.02 BNB.': '你持有 12 USDC 和 0.02 BNB。', 'Pay bob.vel 3 USDT?': '要付给 bob 3 USDT 吗？' })
  const a = await translateBody({ reply: 'You hold 12.5 USDC and 0.02 BNB.' }, 'zh')
  assert.equal(a.reply, 'You hold 12.5 USDC and 0.02 BNB.')
  const b = await translateBody({ reply: 'Pay bob.vel 3 USDT?' }, 'ko')
  assert.equal(b.reply, 'Pay bob.vel 3 USDT?')
  assert.equal(keepsEverything('Pay bob.vel 3 USDT?', 'bob.vel에게 3 USDT 보낼까요?'), true)
})

test('model down or slow: English goes out', async () => {
  _setCall(async () => { throw new Error('503') })
  const a = await translateBody({ error: 'There isn’t enough in your wallet for this right now.' }, 'ko')
  assert.equal(a.error, 'There isn’t enough in your wallet for this right now.')
})

test('notifications are translated, the original body object is untouched', async () => {
  fake({ 'Payment received': '收到付款', 'You received 7 USDC from maya.vel': '你从 maya.vel 收到 7 USDC' })
  const body = { notifications: [{ id: 1, title: 'Payment received', body: 'You received 7 USDC from maya.vel', created_at: 'x' }] }
  const out = await translateBody(body, 'zh')
  assert.equal(out.notifications[0].title, '收到付款')
  assert.equal(out.notifications[0].body, '你从 maya.vel 收到 7 USDC')
  assert.equal(body.notifications[0].title, 'Payment received')
})

test('pure data (addresses, numbers) is not sent for translation', async () => {
  let called = false
  _setCall(async () => { called = true; return '{"items":[]}' })
  const out = await translateBody({ message: '0x4FCBe8F69c6F90F31fce1514C36746c5C33684c8', digest: '0xabc' }, 'zh')
  assert.equal(called, false)
  assert.equal(out.message, '0x4FCBe8F69c6F90F31fce1514C36746c5C33684c8')
})
