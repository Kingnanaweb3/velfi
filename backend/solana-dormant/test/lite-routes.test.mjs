// Lite mode (mainnet v1, no custom program) through the real routes and runners,
// with fake Supabase, AI and chain. Run with the harness loader (see package.json).
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

process.env.SOLANA_CLUSTER = 'devnet'
process.env.JWT_SECRET = 'test'
process.env.ESCROW_SECRET = 'z'.repeat(64)
process.env.SCHEDULE_DEMO_SECS = ''

const { tables } = await import('./harness/stubs/db.mjs')
const { calls, fake, setProgramEnabled } = await import('./harness/stubs/solana.mjs')
const { fakeBuild } = await import('./harness/stubs/txBuilder.mjs')
setProgramEnabled(false)
const agent = (await import('../routes/agent.js')).default
const schedule = (await import('../routes/schedule.js')).default
const tx = (await import('../routes/tx.js')).default
const { tickSchedules } = await import('../lib/schedule.js')
const { claimInvitesFor, refundExpiredInvites } = await import('../lib/invites.js')
const { seal } = await import('../lib/chain/secretBox.js')
const { getToken } = await import('../lib/tokens.js')

const ME = '7Qm4xVb9JrT2kWfH8sLp3YnE6cDaZ1uGq5tRoXyB2eMv'
const MAYA = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const NEWBIE = '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin'
const USDC = getToken('USDC').mint
const token = (p) => Buffer.from(JSON.stringify(p)).toString('base64')
const signed = (p) => `signed:${p.body.tx.replace('UNSIGNED_', '')}`
const settle = () => new Promise(r => setTimeout(r, 30))

async function call(router, method, path, { body = {}, user = { address: ME }, params = {} } = {}) {
  const route = router.routes.find(r => r.method === method && r.path === path)
  assert.ok(route, `no route ${method} ${path}`)
  const req = { body, params, query: {}, headers: { authorization: user ? `Bearer ${token(user)}` : undefined } }
  const out = { status: 200, body: null }
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
const seedPending = (pending, who = ME) => { tables.agent_conversations = [{ user_address: who, pending_tx: { id: 'P1', status: 'pending', ...pending } }] }
const schedRow = (o) => ({ id: 'X', user_address: ME, recipient: MAYA, recipient_name: 'maya.vel', mode: 'delegate', status: 'active', mint: USDC, token: 'USDC',
  amount: 10, amount_units: '10000000', frequency: 'weekly', interval_secs: 604800, occurrences: 3, occurrences_done: 1,
  next_run_at: new Date(Date.now() + 86_400_000).toISOString(), ...o })

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k]
  calls.prepared.length = 0; calls.submitted.length = 0; calls.server.length = 0
  fake.feePayerLamports = 2_000_000_000; fake.serverFail = null; fakeBuild.newAccounts = 0
})

// ── schedules ──────────────────────────────────────────────────────────────
test('lite schedule: one approval for exactly count x amount, no program, money stays in the wallet', async () => {
  seedPending({ intent: 'schedule', payment: { sched: { recipient: MAYA, recipientName: 'maya.vel', token: 'USDC', amount: 25, frequency: 'weekly', occurrences: 4 } } })
  const p = await call(agent, 'post', '/prepare/:id', { params: { id: 'P1' } })
  assert.equal(p.status, 200, JSON.stringify(p.body))
  const ix = calls.prepared[0][0]
  assert.equal(ix.kind, 'approve')
  assert.equal(ix.allowanceUnits, 100_000_000n)
  assert.equal(ix.userAddress, ME)
  assert.match(p.body.note, /stays in your wallet/)
  assert.doesNotMatch(p.body.note, /locks|on-chain mandate/)

  const a = await call(agent, 'post', '/approve/:id', { params: { id: 'P1' }, body: { prepId: p.body.prepId, signedTx: signed(p) } })
  assert.equal(a.status, 200, JSON.stringify(a.body))
  const sc = tables.scheduled_payments[0]
  assert.equal(sc.mode, 'delegate')
  assert.equal(sc.mandate_address, null)
  assert.equal(sc.amount_units, '25000000')
  await settle()
  assert.equal(calls.server.length, 1, 'first payment sent right away')
  const pay = calls.server[0].ixs[0]
  assert.equal(pay.kind, 'delegated_transfer')
  assert.equal(pay.owner, ME)
  assert.equal(pay.recipient, MAYA)
  assert.equal(pay.amountUnits, 25_000_000n)
  assert.equal(pay.token.mint, USDC)
  assert.equal(calls.server[0].signers[0].publicKey.toBase58(), 'AGENT')
  assert.equal(sc.occurrences_done, 1)
  assert.ok(new Date(sc.next_run_at) > new Date(Date.now() + 6 * 86_400_000), 'next one is a week out')
})

test('lite schedule: a second schedule in the same token raises the allowance to cover both', async () => {
  tables.scheduled_payments = [schedRow({ id: 'OLD' })] // 2 payments of 10 left = 20
  seedPending({ intent: 'schedule', payment: { sched: { recipient: MAYA, recipientName: 'maya.vel', token: 'USDC', amount: 5, frequency: 'daily', occurrences: 2 } } })
  const p = await call(agent, 'post', '/prepare/:id', { params: { id: 'P1' } })
  assert.equal(calls.prepared[0][0].allowanceUnits, 30_000_000n)
})

test('runner: never pays twice, never pays early, never pays a cancelled schedule', async () => {
  tables.scheduled_payments = [schedRow({ id: 'D', next_run_at: new Date(Date.now() - 1000).toISOString() })]
  await Promise.all([tickSchedules(), tickSchedules()])
  await tickSchedules()
  assert.equal(calls.server.length, 1)
  assert.equal(tables.scheduled_payments[0].occurrences_done, 2)

  tables.scheduled_payments = [schedRow({ id: 'E', next_run_at: new Date(Date.now() + 60_000).toISOString() }),
    schedRow({ id: 'F', status: 'cancelled', next_run_at: new Date(Date.now() - 1000).toISOString() })]
  calls.server.length = 0
  await tickSchedules()
  assert.equal(calls.server.length, 0)
})

test('runner: the last payment completes the schedule', async () => {
  tables.scheduled_payments = [schedRow({ id: 'L', occurrences_done: 2, next_run_at: new Date(Date.now() - 1000).toISOString() })]
  await tickSchedules()
  assert.equal(tables.scheduled_payments[0].status, 'complete')
  assert.equal(tables.scheduled_payments[0].occurrences_done, 3)
  calls.server.length = 0
  await tickSchedules()
  assert.equal(calls.server.length, 0)
})

test('runner: a failed payment pauses the schedule, keeps the count right and tells the user', async () => {
  tables.scheduled_payments = [schedRow({ id: 'Z', next_run_at: new Date(Date.now() - 1000).toISOString() })]
  fake.serverFail = "There isn't enough in your wallet for this right now."
  await tickSchedules()
  const sc = tables.scheduled_payments[0]
  assert.equal(sc.status, 'failed')
  assert.equal(sc.occurrences_done, 1, 'not counted as paid')
  assert.match(tables.notifications[0].body, /enough in your wallet/)
  assert.match(tables.notifications[0].body, /Cancel it in Flows/)
  fake.serverFail = null
  await tickSchedules()
  assert.equal(calls.server.length, 0, 'failed schedules are not retried blindly')
})

test('lite cancel: stops at once, lowers the allowance to what the others need, revokes when none are left', async () => {
  tables.scheduled_payments = [schedRow({ id: 'A' }), schedRow({ id: 'B', amount_units: '5000000', occurrences: 4, occurrences_done: 0 })]
  assert.equal((await call(schedule, 'post', '/:id/cancel', { user: { address: MAYA }, params: { id: 'A' } })).status, 403)

  const c1 = await call(schedule, 'post', '/:id/cancel', { params: { id: 'A' } })
  assert.equal(c1.status, 200, JSON.stringify(c1.body))
  assert.equal(tables.scheduled_payments[0].status, 'cancelled', 'stopped before the wallet even signs')
  assert.equal(calls.prepared[0][0].kind, 'approve')
  assert.equal(calls.prepared[0][0].allowanceUnits, 20_000_000n, 'B still needs 4 x 5')
  const s1 = await call(tx, 'post', '/submit', { body: { prepId: c1.body.prepId, signedTx: signed(c1) } })
  assert.match(s1.body.message, /other active schedules/)

  const c2 = await call(schedule, 'post', '/:id/cancel', { params: { id: 'B' } })
  assert.equal(calls.prepared[1][0].kind, 'revoke')
  const s2 = await call(tx, 'post', '/submit', { body: { prepId: c2.body.prepId, signedTx: signed(c2) } })
  assert.match(s2.body.message, /no longer has permission/)

  assert.equal((await call(schedule, 'post', '/:id/cancel', { params: { id: 'B' } })).status, 400, 'already finished')
})

test('a paused (failed) schedule can still be cancelled to remove the permission', async () => {
  tables.scheduled_payments = [schedRow({ id: 'P', status: 'failed' })]
  const c = await call(schedule, 'post', '/:id/cancel', { params: { id: 'P' } })
  assert.equal(c.status, 200)
  assert.equal(calls.prepared[0][0].kind, 'revoke')
})

// ── streams ────────────────────────────────────────────────────────────────
test('lite: streams are "coming soon" and nothing is built', async () => {
  seedPending({ intent: 'stream', payment: { stream: { recipient: MAYA, token: 'USDC', total_amount: 10, duration_secs: 600 } } })
  const p = await call(agent, 'post', '/prepare/:id', { params: { id: 'P1' } })
  assert.equal(p.status, 400)
  assert.match(p.body.error, /coming soon/)
  assert.equal(calls.prepared.length, 0)
})

// ── email invites ──────────────────────────────────────────────────────────
test('lite invite: money goes to a claim wallet, lands on sign-up exactly once', async () => {
  seedPending({ intent: 'send', payment: { currency: 'USDC', amount: 5, recipients: [{ resolved: { email: 'jordan@gmail.com', needsInvite: true } }] } })
  const p = await call(agent, 'post', '/prepare/:id', { params: { id: 'P1' } })
  const a = await call(agent, 'post', '/approve/:id', { params: { id: 'P1' }, body: { prepId: p.body.prepId, signedTx: signed(p) } })
  assert.equal(a.status, 200, JSON.stringify(a.body))
  const inv = tables.escrow_invites[0]
  assert.equal(inv.mode, 'wallet')
  assert.equal(inv.escrow_address, 'CLAIM_WALLET')

  // the stub builder can't make a real key, so seal one the way txBuilder does
  inv.claim_key_sealed = seal(new Uint8Array(64).fill(7))
  const sigs = await claimInvitesFor('Jordan@Gmail.com', NEWBIE)
  assert.equal(sigs.length, 1)
  const sweep = calls.server[0]
  assert.equal(sweep.ixs[0].kind, 'sweep')
  assert.equal(sweep.ixs[0].claimWallet, 'CLAIM_WALLET')
  assert.equal(sweep.ixs[0].to, NEWBIE)
  assert.equal(sweep.signers[0].publicKey.toBase58(), 'CLAIMKEY_07070707', 'signed with the unsealed claim key')
  assert.equal(inv.status, 'claimed')
  assert.equal(inv.claimed_by, NEWBIE)
  assert.equal((await claimInvitesFor('jordan@gmail.com', NEWBIE)).length, 0, 'second sign-in claims nothing')
})

test('lite invite: unclaimed after 7 days goes back to the sender; fresh ones wait', async () => {
  const sealed = seal(new Uint8Array(64).fill(9))
  const past = new Date(Date.now() - 1000).toISOString(), future = new Date(Date.now() + 86_400_000).toISOString()
  tables.escrow_invites = [
    { id: 'old', from_address: ME, to_email: 'a@x.com', escrow_address: 'CW1', mode: 'wallet', mint: USDC, status: 'pending', expires_at: past, claim_key_sealed: sealed },
    { id: 'new', from_address: ME, to_email: 'b@x.com', escrow_address: 'CW2', mode: 'wallet', mint: USDC, status: 'pending', expires_at: future, claim_key_sealed: sealed },
    { id: 'done', from_address: ME, to_email: 'c@x.com', escrow_address: 'CW3', mode: 'wallet', mint: USDC, status: 'claimed', expires_at: past, claim_key_sealed: sealed },
  ]
  const sigs = await refundExpiredInvites()
  assert.equal(sigs.length, 1)
  assert.equal(calls.server[0].ixs[0].claimWallet, 'CW1')
  assert.equal(calls.server[0].ixs[0].to, ME)
  assert.deepEqual(tables.escrow_invites.map(i => i.status), ['refunded', 'pending', 'claimed'])
  assert.match(tables.notifications[0].body, /back in your wallet/)
  assert.equal((await claimInvitesFor('a@x.com', NEWBIE)).length, 0, 'a refunded invite cannot be claimed')
})

test('lite invite: if moving the money fails, the invite stays claimable', async () => {
  tables.escrow_invites = [{ id: 'i', from_address: ME, to_email: 'd@x.com', escrow_address: 'CW', mode: 'wallet', mint: USDC, status: 'pending',
    expires_at: new Date(Date.now() + 86_400_000).toISOString(), claim_key_sealed: seal(new Uint8Array(64).fill(1)) }]
  fake.serverFail = 'rpc down'
  assert.equal((await claimInvitesFor('d@x.com', NEWBIE)).length, 0)
  assert.equal(tables.escrow_invites[0].status, 'pending')
  fake.serverFail = null
  assert.equal((await claimInvitesFor('d@x.com', NEWBIE)).length, 1)
})

// ── fee payer protection ───────────────────────────────────────────────────
test('fee payer low: new payments pause with a clear message and nothing is built', async () => {
  fake.feePayerLamports = 10_000_000 // 0.01 SOL
  seedPending({ intent: 'send', payment: { currency: 'USDC', amount: 1, recipients: [{ resolved: { address: MAYA } }] } })
  const p = await call(agent, 'post', '/prepare/:id', { params: { id: 'P1' } })
  assert.equal(p.status, 503)
  assert.match(p.body.error, /Nothing was sent/)
  assert.equal(calls.prepared.length, 0)
})

test('daily cap on new token accounts Velfi pays rent for', async () => {
  process.env.MAX_NEW_ACCOUNTS_PER_DAY = '3'
  const who = { address: 'CapUser1111111111111111111111111111111111111' }
  fakeBuild.newAccounts = 2
  for (let i = 0; i < 1; i++) {
    seedPending({ intent: 'send', payment: { currency: 'USDC', amount: 1, recipients: [{ resolved: { address: MAYA } }] } }, who.address)
    const p = await call(agent, 'post', '/prepare/:id', { params: { id: 'P1' }, user: who })
    assert.equal(p.status, 200)
    const a = await call(agent, 'post', '/approve/:id', { params: { id: 'P1' }, user: who, body: { prepId: p.body.prepId, signedTx: signed(p) } })
    assert.equal(a.status, 200)
  }
  seedPending({ intent: 'send', payment: { currency: 'USDC', amount: 1, recipients: [{ resolved: { address: MAYA } }] } }, who.address)
  const p = await call(agent, 'post', '/prepare/:id', { params: { id: 'P1' }, user: who })
  assert.equal(p.status, 429)
  assert.match(p.body.error, /daily limit/)
  fakeBuild.newAccounts = 0 // sending to people who already hold the token is never capped
  const ok = await call(agent, 'post', '/prepare/:id', { params: { id: 'P1' }, user: who })
  assert.equal(ok.status, 200)
  delete process.env.MAX_NEW_ACCOUNTS_PER_DAY
})

test('kill switch: PAUSE_PAYMENTS=on stops new payments, schedules and invite moves', async () => {
  process.env.PAUSE_PAYMENTS = 'on'
  try {
    seedPending({ intent: 'send', payment: { currency: 'USDC', amount: 1, recipients: [{ resolved: { address: MAYA } }] } })
    const p = await call(agent, 'post', '/prepare/:id', { params: { id: 'P1' } })
    assert.equal(p.status, 503)
    assert.match(p.body.error, /paused/)
    const s = await call(tx, 'post', '/submit', { body: { prepId: 'x', signedTx: 'y' } })
    assert.equal(s.status, 503)
    tables.scheduled_payments = [schedRow({ id: 'K', next_run_at: new Date(Date.now() - 1000).toISOString() })]
    await tickSchedules()
    tables.escrow_invites = [{ id: 'k', from_address: ME, to_email: 'k@x.com', escrow_address: 'CW', mode: 'wallet', mint: USDC, status: 'pending',
      expires_at: new Date(Date.now() - 1000).toISOString(), claim_key_sealed: seal(new Uint8Array(64).fill(3)) }]
    assert.deepEqual(await refundExpiredInvites(), [])
    assert.deepEqual(await claimInvitesFor('k@x.com', NEWBIE), [])
    assert.equal(calls.prepared.length + calls.server.length, 0)
  } finally { delete process.env.PAUSE_PAYMENTS }
  await tickSchedules()
  assert.equal(calls.server.length, 1, 'resumes when switched off')
})

test('a single schedule approval is capped (MAX_SCHEDULE_TOTAL)', async () => {
  process.env.MAX_SCHEDULE_TOTAL = '100'
  try {
    seedPending({ intent: 'schedule', payment: { sched: { recipient: MAYA, recipientName: 'maya.vel', token: 'USDC', amount: 30, frequency: 'weekly', occurrences: 4 } } })
    const p = await call(agent, 'post', '/prepare/:id', { params: { id: 'P1' } })
    assert.equal(p.status, 400)
    assert.match(p.body.error, /up to 100 USDC/)
    assert.equal(calls.prepared.length, 0)
    seedPending({ intent: 'schedule', payment: { sched: { recipient: MAYA, recipientName: 'maya.vel', token: 'USDC', amount: 25, frequency: 'weekly', occurrences: 4 } } })
    assert.equal((await call(agent, 'post', '/prepare/:id', { params: { id: 'P1' } })).status, 200, 'exactly at the cap is fine')
  } finally { delete process.env.MAX_SCHEDULE_TOTAL }
})
