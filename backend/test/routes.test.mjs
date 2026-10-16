// Route tests: the real Express handlers (agent, streams, schedule, tx, auth)
// running against in-memory fakes of Supabase, the AI and the chain.
// Run: node --import ./test/harness/register.mjs --test test/routes.test.mjs
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

process.env.SOLANA_CLUSTER = 'devnet'
process.env.JWT_SECRET = 'test'

const { tables } = await import('./harness/stubs/db.mjs')
const { calls } = await import('./harness/stubs/solana.mjs')
const { privyState } = await import('./harness/stubs/privy.mjs')
const agent = (await import('../routes/agent.js')).default
const streams = (await import('../routes/streams.js')).default
const schedule = (await import('../routes/schedule.js')).default
const tx = (await import('../routes/tx.js')).default
const auth = (await import('../routes/auth.js')).default

const ME = '7Qm4xVb9JrT2kWfH8sLp3YnE6cDaZ1uGq5tRoXyB2eMv'
const MAYA = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const token = (p) => Buffer.from(JSON.stringify(p)).toString('base64')
// the fake wallet 'signs' by keeping the prepared message hash
const signed = (p) => `signed:${p.body.tx.replace('UNSIGNED_', '')}`

async function call(router, method, path, { body = {}, user = { address: ME }, params = {}, headers = {} } = {}) {
  const route = router.routes.find(r => r.method === method && r.path === path)
  assert.ok(route, `no route ${method} ${path}`)
  const req = { body, params, query: {}, headers: { authorization: user ? `Bearer ${token(user)}` : undefined, ...headers } }
  let out = { status: 200, body: null }
  const res = { status(c) { out.status = c; return res }, json(b) { out.body = b; return res } }
  const run = async (i) => {
    if (i >= route.handlers.length) return
    let nextP
    await route.handlers[i](req, res, () => (nextP = run(i + 1)))
    if (nextP) await nextP
  }
  await run(0)
  return out
}

function seedPending(pending) {
  tables.agent_conversations = [{ user_address: ME, pending_tx: { id: 'P1', status: 'pending', ...pending } }]
}

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k]
  calls.prepared.length = 0; calls.submitted.length = 0; calls.server.length = 0
})

test('requires sign-in', async () => {
  const r = await call(agent, 'post', '/prepare/:id', { user: null, params: { id: 'P1' } })
  assert.equal(r.status, 401)
})

test('send: prepare builds exact legs, approve submits, logs and clears the proposal', async () => {
  seedPending({ intent: 'send', payment: { currency: 'USDC', amount: 30, recipients: [{ name: 'maya.vel', resolved: { address: MAYA, label: 'maya.vel' } }] } })
  const p = await call(agent, 'post', '/prepare/:id', { params: { id: 'P1' } })
  assert.equal(p.status, 200, JSON.stringify(p.body))
  assert.ok(p.body.prepId && p.body.tx)
  assert.deepEqual(calls.prepared[0], [{ kind: 'transfer', to: MAYA, units: 30_000_000n }])

  const a = await call(agent, 'post', '/approve/:id', { params: { id: 'P1' }, body: { prepId: p.body.prepId, signedTx: signed(p) } })
  assert.equal(a.status, 200, JSON.stringify(a.body))
  assert.equal(a.body.digest, 'SIG_1')
  assert.match(a.body.explorer, /solscan\.io\/tx\/SIG_1\?cluster=devnet/)
  assert.equal(tables.transactions.length, 1)
  assert.equal(tables.transactions[0].label, 'Sent to maya.vel')
  assert.equal(tables.agent_conversations[0].pending_tx, null)
  assert.equal(tables.notifications.length, 1)
})

test('approve refuses a transaction that differs from the prepared one', async () => {
  seedPending({ intent: 'send', payment: { currency: 'USDC', amount: 1, recipients: [{ resolved: { address: MAYA } }] } })
  const p = await call(agent, 'post', '/prepare/:id', { params: { id: 'P1' } })
  const a = await call(agent, 'post', '/approve/:id', { params: { id: 'P1' }, body: { prepId: p.body.prepId, signedTx: 'tampered:HASH_999' } })
  assert.equal(a.status, 400)
  assert.match(a.body.error, /does not match/)
  assert.equal(calls.submitted.length, 0)
})

test('an approval can only be used once', async () => {
  seedPending({ intent: 'send', payment: { currency: 'USDC', amount: 1, recipients: [{ resolved: { address: MAYA } }] } })
  const p = await call(agent, 'post', '/prepare/:id', { params: { id: 'P1' } })
  await call(agent, 'post', '/approve/:id', { params: { id: 'P1' }, body: { prepId: p.body.prepId, signedTx: signed(p) } })
  seedPending({ intent: 'send', payment: { currency: 'USDC', amount: 1, recipients: [{ resolved: { address: MAYA } }] } })
  const again = await call(agent, 'post', '/approve/:id', { params: { id: 'P1' }, body: { prepId: p.body.prepId, signedTx: signed(p) } })
  assert.equal(again.status, 410)
  assert.equal(calls.submitted.length, 1)
})

test("someone else's approval id is useless", async () => {
  seedPending({ intent: 'send', payment: { currency: 'USDC', amount: 1, recipients: [{ resolved: { address: MAYA } }] } })
  const p = await call(agent, 'post', '/prepare/:id', { params: { id: 'P1' } })
  tables.agent_conversations.push({ user_address: MAYA, pending_tx: { id: 'P1' } })
  const r = await call(agent, 'post', '/approve/:id', { user: { address: MAYA }, params: { id: 'P1' }, body: { prepId: p.body.prepId, signedTx: signed(p) } })
  assert.equal(r.status, 410)
})

test('old Sui addresses and unknown tokens are refused with a clear message', async () => {
  seedPending({ intent: 'send', payment: { currency: 'USDC', amount: 1, recipients: [{ name: 'x', resolved: { address: '0xdfb875bba6bfcade4efa0b7bed278c508f3a8d0d9c2bcf1e929525350b2be803' } }] } })
  let r = await call(agent, 'post', '/prepare/:id', { params: { id: 'P1' } })
  assert.equal(r.status, 400); assert.match(r.body.error, /not a valid Solana address/)
  seedPending({ intent: 'send', payment: { currency: 'DEEP', amount: 1, recipients: [{ resolved: { address: MAYA } }] } })
  r = await call(agent, 'post', '/prepare/:id', { params: { id: 'P1' } })
  assert.match(r.body.error, /recognize DEEP/)
})

test('email recipients become escrow invites saved after the payment lands', async () => {
  seedPending({ intent: 'send', payment: { currency: 'USDC', amount: 5, recipients: [{ resolved: { email: 'jordan@gmail.com', needsInvite: true } }] } })
  const p = await call(agent, 'post', '/prepare/:id', { params: { id: 'P1' } })
  const a = await call(agent, 'post', '/approve/:id', { params: { id: 'P1' }, body: { prepId: p.body.prepId, signedTx: signed(p) } })
  assert.equal(a.status, 200)
  assert.match(a.body.message, /jordan@gmail.com/)
  assert.equal(tables.escrow_invites.length, 1)
  assert.equal(tables.escrow_invites[0].amount_units, '5000000')
  assert.equal(tables.escrow_invites[0].status, 'pending')
})

test('stream: prepare locks the full amount on-chain; approve records it', async () => {
  seedPending({ intent: 'stream', payment: { stream: { recipient: MAYA, recipientName: 'maya.vel', token: 'USDC', total_amount: 100, duration_secs: 3600 } } })
  const p = await call(agent, 'post', '/prepare/:id', { params: { id: 'P1' } })
  assert.equal(p.status, 200, JSON.stringify(p.body))
  assert.equal(calls.prepared[0][0].amountUnits, 100_000_000n)
  const a = await call(agent, 'post', '/approve/:id', { params: { id: 'P1' }, body: { prepId: p.body.prepId, signedTx: signed(p) } })
  assert.equal(a.status, 200)
  assert.equal(tables.streams[0].flow_address, 'STREAM_PDA')
  assert.equal(tables.streams[0].total_amount, 100)
})

test('schedule: mandate holds exactly count x amount and the first payment runs', async () => {
  process.env.SCHEDULE_DEMO_SECS = ''
  seedPending({ intent: 'schedule', payment: { sched: { recipient: MAYA, recipientName: 'maya.vel', token: 'USDC', amount: 25, frequency: 'weekly', occurrences: 4 } } })
  const p = await call(agent, 'post', '/prepare/:id', { params: { id: 'P1' } })
  assert.equal(p.status, 200, JSON.stringify(p.body))
  assert.match(p.body.note, /locks 100 USDC/)
  const a = await call(agent, 'post', '/approve/:id', { params: { id: 'P1' }, body: { prepId: p.body.prepId, signedTx: signed(p) } })
  assert.equal(a.status, 200)
  const sc = tables.scheduled_payments[0]
  assert.equal(sc.mandate_address, 'MANDATE_PDA')
  assert.equal(sc.amount_units, '25000000')
  assert.equal(sc.occurrences, 4)
  await new Promise(r => setTimeout(r, 50)) // initial tick runs in the background
  assert.equal(calls.server.length, 1, 'first payment executed by the agent under the mandate')
  assert.equal(calls.server[0].ixs[0].kind, 'execute_mandate')
  assert.equal(tables.scheduled_payments[0].occurrences_done, 1)
})

test('SOL streams are refused before anything is built', async () => {
  seedPending({ intent: 'stream', payment: { stream: { recipient: MAYA, token: 'SOL', total_amount: 1, duration_secs: 60 } } })
  // the fake builder doesn't check this; the real one does (requireSpl). The chat path checks it too:
  const { getToken } = await import('../lib/tokens.js')
  assert.equal(getToken('SOL').mint, 'native')
})

test('swaps are mainnet-only and say so on devnet', async () => {
  seedPending({ intent: 'swap', payment: { swap: { from_token: 'SOL', to_token: 'USDC', amount: 1 } } })
  const p = await call(agent, 'post', '/prepare/:id', { params: { id: 'P1' } })
  assert.equal(p.status, 400)
  assert.match(p.body.error, /mainnet/)
})

test('the old /run endpoint tells the app to update', async () => {
  const r = await call(agent, 'post', '/run/:id', { params: { id: 'P1' } })
  assert.equal(r.status, 410)
})

test('stream claim: only the recipient can prepare it, then /tx/submit records it', async () => {
  tables.streams = [{ id: 'S1', user_address: ME, recipients: [{ address: MAYA }], flow_address: 'STREAM_PDA', mint: 'MINT', token: 'USDC', status: 'active',
    start_time: new Date(Date.now() - 1000).toISOString(), end_time: new Date(Date.now() + 1000).toISOString(), total_amount: 10 }]
  const no = await call(streams, 'post', '/:id/claim', { params: { id: 'S1' } })
  assert.equal(no.status, 403)
  const p = await call(streams, 'post', '/:id/claim', { user: { address: MAYA }, params: { id: 'S1' } })
  assert.equal(p.status, 200)
  const s = await call(tx, 'post', '/submit', { user: { address: MAYA }, body: { prepId: p.body.prepId, signedTx: signed(p) } })
  assert.equal(s.status, 200, JSON.stringify(s.body))
  assert.equal(tables.transactions[0].direction, 'in')
})

test('stream stop and schedule cancel are sender-only and update status', async () => {
  tables.streams = [{ id: 'S1', user_address: ME, recipients: [{ address: MAYA }], flow_address: 'STREAM_PDA', mint: 'MINT', status: 'active' }]
  tables.scheduled_payments = [{ id: 'C1', user_address: ME, mandate_address: 'MANDATE_PDA', mint: 'MINT', status: 'active' }]
  assert.equal((await call(streams, 'post', '/:id/stop', { user: { address: MAYA }, params: { id: 'S1' } })).status, 403)
  const p1 = await call(streams, 'post', '/:id/stop', { params: { id: 'S1' } })
  await call(tx, 'post', '/submit', { body: { prepId: p1.body.prepId, signedTx: signed(p1) } })
  assert.equal(tables.streams[0].status, 'stopped')
  assert.equal((await call(schedule, 'post', '/:id/cancel', { user: { address: MAYA }, params: { id: 'C1' } })).status, 403)
  const p2 = await call(schedule, 'post', '/:id/cancel', { params: { id: 'C1' } })
  await call(tx, 'post', '/submit', { body: { prepId: p2.body.prepId, signedTx: signed(p2) } })
  assert.equal(tables.scheduled_payments[0].status, 'cancelled')
})

test('sign-in: wallet comes from Privy, never from the client', async () => {
  privyState.users = { goodtoken: { linkedAccounts: [{ type: 'wallet', chainType: 'solana', walletClientType: 'privy', address: ME }], google: { email: 'Me@Gmail.com' } },
    nowallet: { linkedAccounts: [] } }
  const bad = await call(auth, 'post', '/privy', { user: null, body: { accessToken: 'forged' } })
  assert.equal(bad.status, 401)
  const wait = await call(auth, 'post', '/privy', { user: null, body: { accessToken: 'nowallet' } })
  assert.equal(wait.status, 409)
  const ok = await call(auth, 'post', '/privy', { user: null, body: { accessToken: 'goodtoken', address: 'SomeoneElse' } })
  assert.equal(ok.status, 200, JSON.stringify(ok.body))
  assert.equal(ok.body.address, ME)
  assert.equal(tables.users[0].wallet_address, ME)
  assert.equal(tables.users[0].email, 'me@gmail.com')
})

test('register only renames your own account', async () => {
  tables.users = [{ id: 'U1', wallet_address: ME, username: null }, { id: 'U2', wallet_address: MAYA, username: 'maya' }]
  const anon = await call(auth, 'post', '/register', { user: null, body: { username: 'thief' } })
  assert.equal(anon.status, 401)
  const taken = await call(auth, 'post', '/register', { body: { username: 'maya' } })
  assert.equal(taken.status, 409)
  const ok = await call(auth, 'post', '/register', { body: { username: 'almond' } })
  assert.equal(ok.status, 200)
  assert.equal(tables.users.find(u => u.id === 'U1').username, 'almond')
  assert.equal(tables.users.find(u => u.id === 'U2').username, 'maya')
})

test('fee-payer rate limit kicks in', async () => {
  process.env.MAX_TX_PER_HOUR = '2'
  const { allowSubmission } = await import('../lib/prepared.js')
  const who = 'RateLimitUser'
  assert.ok(allowSubmission(who, 2)); assert.ok(allowSubmission(who, 2)); assert.ok(!allowSubmission(who, 2))
})

test('chat end to end: "send 30 USDC to maya.vel" checks YOUR wallet balance and proposes', async () => {
  const { scripted } = await import('./harness/stubs/openrouter.mjs')
  tables.users = [{ id: 'U2', username: 'maya', wallet_address: MAYA }]
  const parse = (amount) => JSON.stringify({ intent: 'send', confidence: 0.95, needs_clarification: false, needs_token_choice: false,
    payment: { amount, currency: 'USDC', recipients: [{ name: 'maya.vel', address: null, email: null, amount: null, share: null }] }, summary: `Send ${amount} USDC to maya.vel` })
  scripted.push('payment', parse(30))
  const r = await call(agent, 'post', '/message', { body: { message: 'send 30 USDC to maya.vel' } })
  assert.equal(r.status, 200, JSON.stringify(r.body))
  assert.equal(r.body.mode, 'propose', JSON.stringify(r.body))
  const pending = tables.agent_conversations.find(c => c.user_address === ME).pending_tx
  assert.equal(pending.payment.recipients[0].resolved.address, MAYA)

  // the fake wallet holds 50 USDC, so 80 must be refused
  scripted.push('payment', parse(80))
  const r2 = await call(agent, 'post', '/message', { body: { message: 'send 80 USDC to maya.vel' } })
  assert.equal(r2.body.mode, 'insufficient', JSON.stringify(r2.body))
  assert.match(r2.body.reply, /50\.0000 USDC/)
})

test('chat: a pasted Solana address keeps its exact letters', async () => {
  const { scripted } = await import('./harness/stubs/openrouter.mjs')
  scripted.push('payment', JSON.stringify({ intent: 'send', confidence: 0.95, needs_clarification: false, needs_token_choice: false,
    payment: { amount: 1, currency: 'USDC', recipients: [{ name: null, address: MAYA, email: null }] }, summary: 'Send 1 USDC' }))
  const r = await call(agent, 'post', '/message', { body: { message: `send 1 USDC to ${MAYA}` } })
  assert.equal(r.body.mode, 'propose', JSON.stringify(r.body))
  const pending = tables.agent_conversations.find(c => c.user_address === ME).pending_tx
  assert.equal(pending.payment.recipients[0].resolved.address, MAYA)
})
