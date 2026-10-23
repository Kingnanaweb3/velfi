// End-to-end on a real local EVM chain: the real routes, bnb.js and txBuilder,
// with fake Supabase, Privy and AI. Every payment is really signed (the way the
// app's wallet signs), checked, gas-dropped and mined.
//
// Needs a local chain (chain id 31337, base fee 0), e.g. from the repo root:
//   npx hardhat node   (or: anvil --base-fee 0)
// then:  npm run test:chain
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createPublicClient, createWalletClient, http, parseEther, parseUnits, erc20Abi, defineChain } from 'viem'
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'

const RPC = process.env.TEST_RPC_URL || 'http://127.0.0.1:8545'
const FUNDER = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80') // well-known local dev key
const chain = defineChain({ id: 31337, name: 'local', nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } })
const pub = createPublicClient({ chain, transport: http(RPC) })
const funderWallet = createWalletClient({ account: FUNDER, chain, transport: http(RPC) })

// fresh wallets every run
const fresh = () => privateKeyToAccount(generatePrivateKey())
const GAS = generatePrivateKey(), AGENT = generatePrivateKey()
const ME = fresh(), MAYA = fresh(), BOB = fresh(), NEWBIE = fresh()

const mock = JSON.parse(readFileSync(new URL('./MockToken.json', import.meta.url)))
async function deployToken(sym) {
  const hash = await funderWallet.deployContract({ abi: mock.abi, bytecode: mock.bytecode, args: [sym, sym, 18] })
  return (await pub.waitForTransactionReceipt({ hash })).contractAddress
}
const send = async (to, value) => pub.waitForTransactionReceipt({ hash: await funderWallet.sendTransaction({ to, value }) })
const mint = async (token, to, n) => pub.waitForTransactionReceipt({ hash: await funderWallet.writeContract({ address: token, abi: mock.abi, functionName: 'mint', args: [to, parseUnits(String(n), 18)] }) })
const bal = (token, who) => pub.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [who] })
const allowance = (token, owner, spender) => pub.readContract({ address: token, abi: erc20Abi, functionName: 'allowance', args: [owner, spender] })
const bnb = (who) => pub.getBalance({ address: who })

let USDC, USDT, M
before(async () => {
  USDC = await deployToken('USDC'); USDT = await deployToken('USDT')
  Object.assign(process.env, {
    BNB_NETWORK: 'testnet', BNB_CHAIN_ID: '31337', BNB_RPC_URL: RPC,
    VELFI_GAS_KEY: GAS, VELFI_AGENT_KEY: AGENT, USDC_TOKEN: USDC, USDT_TOKEN: USDT,
    JWT_SECRET: 'test', ESCROW_SECRET: 'z'.repeat(64), MAX_GAS_DROPS_PER_DAY: '50', SCHEDULE_DEMO_SECS: '',
  })
  await send(privateKeyToAccount(GAS).address, parseEther('1'))
  await mint(USDC, ME.address, 100)
  await mint(USDT, ME.address, 50)
  const db = await import('../harness/stubs/db.mjs')
  M = {
    db, tables: db.tables,
    privy: (await import('../harness/stubs/privy.mjs')).privyState,
    agent: (await import('../../routes/agent.js')).default,
    schedule: (await import('../../routes/schedule.js')).default,
    tx: (await import('../../routes/tx.js')).default,
    auth: (await import('../../routes/auth.js')).default,
    users: (await import('../../routes/users.js')).default,
    account: (await import('../../routes/account.js')).default,
    sched: await import('../../lib/schedule.js'),
    invites: await import('../../lib/invites.js'),
    bnbjs: await import('../../lib/bnb.js'),
    tokens: await import('../../lib/tokens.js'),
  }
})

const token = (p) => Buffer.from(JSON.stringify(p)).toString('base64')
async function call(router, method, path, { body = {}, user = { address: ME.address }, params = {} } = {}) {
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
// What the app does: the wallet signs each prepared transaction exactly as given.
const signAll = (account, txs) => Promise.all(txs.map(t => account.signTransaction({
  type: 'legacy', to: t.to, data: t.data, value: BigInt(t.value), nonce: Number(t.nonce), gas: BigInt(t.gas), gasPrice: BigInt(t.gasPrice), chainId: t.chainId,
})))
const seedPending = (pending, who = ME.address) => { M.tables.agent_conversations = [{ user_address: who, pending_tx: { id: 'P1', status: 'pending', ...pending } }] }
const sendTo = (address, amount, currency = 'USDC', name = 'maya.vel') => ({ intent: 'send', payment: { currency, amount, recipients: [{ name, resolved: { address } }] } })
async function slide(account = ME) {
  const p = await call(M.agent, 'post', '/prepare/:id', { params: { id: 'P1' }, user: { address: account.address } })
  assert.equal(p.status, 200, JSON.stringify(p.body))
  const signedTx = await signAll(account, p.body.tx)
  return { p, a: await call(M.agent, 'post', '/approve/:id', { params: { id: 'P1' }, user: { address: account.address }, body: { prepId: p.body.prepId, signedTx } }) }
}

test('a user with zero BNB sends USDC: Velfi drops exactly the gas, the payment lands', async () => {
  assert.equal(await bnb(ME.address), 0n)
  seedPending(sendTo(MAYA.address, 30))
  const gasBefore = await bnb(privateKeyToAccount(GAS).address)
  const { p, a } = await slide()
  assert.equal(p.body.tx.length, 1)
  assert.equal(a.status, 200, JSON.stringify(a.body))
  assert.match(a.body.digest, /^0x[0-9a-f]{64}$/)
  assert.match(a.body.explorer, /bscscan\.com\/tx\/0x/)
  assert.equal(await bal(USDC, MAYA.address), parseUnits('30', 18))
  assert.equal(await bal(USDC, ME.address), parseUnits('70', 18))
  const spent = gasBefore - (await bnb(privateKeyToAccount(GAS).address))
  assert.ok(spent > 0n && spent < parseEther('0.001'), `gas wallet spent ${spent}`)
  const logged = M.tables.transactions.at(-1)
  assert.equal(logged.digest, a.body.digest)
  assert.equal(logged.amount, 30)
  assert.equal(M.tables.notifications.at(-1).body, 'Confirmed on BNB Chain')
})

test('a split is several transactions approved with one slide, consecutive nonces', async () => {
  M.tables.agent_conversations = []
  seedPending({ intent: 'split', payment: { currency: 'USDC', amount: 15, recipients: [
    { name: 'maya.vel', amount: 10, resolved: { address: MAYA.address } }, { name: 'bob.vel', amount: 5, resolved: { address: BOB.address } }] } })
  const { p, a } = await slide()
  assert.equal(p.body.tx.length, 2)
  assert.equal(Number(p.body.tx[1].nonce), Number(p.body.tx[0].nonce) + 1)
  assert.equal(a.status, 200, JSON.stringify(a.body))
  assert.equal(await bal(USDC, MAYA.address), parseUnits('40', 18))
  assert.equal(await bal(USDC, BOB.address), parseUnits('5', 18))
  const legs = M.tables.transactions.slice(-2)
  assert.notEqual(legs[0].digest, legs[1].digest, 'each leg has its own hash')
})

test('multi-token: BNB value comes from the user, Velfi only covers the gas', async () => {
  await send(ME.address, parseEther('0.01'))
  const before = await bnb(BOB.address)
  seedPending({ intent: 'send', actions: [
    { token: 'BNB', amount: 0.01, recipient: { name: 'bob.vel', resolved: { address: BOB.address } } },
    { token: 'USDT', amount: 2, recipient: { name: 'maya.vel', resolved: { address: MAYA.address } } }] })
  const { a } = await slide()
  assert.equal(a.status, 200, JSON.stringify(a.body))
  assert.equal((await bnb(BOB.address)) - before, parseEther('0.01'))
  assert.equal(await bal(USDT, MAYA.address), parseUnits('2', 18))
})

test('a tampered or re-signed transaction is refused and nothing moves', async () => {
  seedPending(sendTo(MAYA.address, 1))
  const p = await call(M.agent, 'post', '/prepare/:id', { params: { id: 'P1' } })
  const t = p.body.tx[0]
  // same everything, but signed by someone else
  const wrongSigner = await signAll(BOB, p.body.tx)
  let a = await call(M.agent, 'post', '/approve/:id', { params: { id: 'P1' }, body: { prepId: p.body.prepId, signedTx: wrongSigner } })
  assert.equal(a.status, 400); assert.match(a.body.error, /does not match/)
  // prepId is one-shot, so prepare again, then change the recipient
  const p2 = await call(M.agent, 'post', '/prepare/:id', { params: { id: 'P1' } })
  const evil = await ME.signTransaction({ type: 'legacy', to: t.to, data: p2.body.tx[0].data.replace(MAYA.address.slice(2).toLowerCase(), BOB.address.slice(2).toLowerCase()),
    value: 0n, nonce: Number(t.nonce), gas: BigInt(t.gas), gasPrice: BigInt(t.gasPrice), chainId: t.chainId })
  a = await call(M.agent, 'post', '/approve/:id', { params: { id: 'P1' }, body: { prepId: p2.body.prepId, signedTx: [evil] } })
  assert.equal(a.status, 400); assert.match(a.body.error, /does not match/)
  assert.equal(await bal(USDC, MAYA.address), parseUnits('40', 18), 'nothing moved')
})

test('an approval whose nonce went stale says expired', async () => {
  seedPending(sendTo(MAYA.address, 1))
  const p = await call(M.agent, 'post', '/prepare/:id', { params: { id: 'P1' } })
  const signedTx = await signAll(ME, p.body.tx)
  await send(ME.address, parseEther('0.001'))
  // the user does something else first (uses that nonce)
  const w = createWalletClient({ account: ME, chain, transport: http(RPC) })
  await pub.waitForTransactionReceipt({ hash: await w.sendTransaction({ to: ME.address, value: 0n, gasPrice: BigInt(p.body.tx[0].gasPrice) }) })
  const a = await call(M.agent, 'post', '/approve/:id', { params: { id: 'P1' }, body: { prepId: p.body.prepId, signedTx } })
  assert.equal(a.status, 400); assert.match(a.body.error, /expired/)
})

test('schedule: one allowance for count x amount; the agent pays on time and gets its gas from the gas wallet', async () => {
  const agentAddr = privateKeyToAccount(AGENT).address
  seedPending({ intent: 'schedule', payment: { sched: { recipient: BOB.address, recipientName: 'bob.vel', token: 'USDC', amount: 5, frequency: 'weekly', occurrences: 4 } } })
  const p = await call(M.agent, 'post', '/prepare/:id', { params: { id: 'P1' } })
  assert.equal(p.status, 200, JSON.stringify(p.body))
  assert.match(p.body.note, /stays in your wallet/)
  const a = await call(M.agent, 'post', '/approve/:id', { params: { id: 'P1' }, body: { prepId: p.body.prepId, signedTx: await signAll(ME, p.body.tx) } })
  assert.equal(a.status, 200, JSON.stringify(a.body))
  const sc = M.tables.scheduled_payments.at(-1)
  assert.equal(sc.chain, 'bnb'); assert.equal(sc.mode, 'delegate'); assert.equal(sc.amount_units, parseUnits('5', 18).toString())
  // the first payment runs right away (approve kicks the runner)
  // (the runner claims the payment in the database first, then sends: wait for it to land)
  const paid = () => (M.tables.transactions || []).some(t => t.type === 'schedule')
  for (let i = 0; i < 150 && !paid(); i++) await new Promise(r => setTimeout(r, 100))
  assert.equal(Number(sc.occurrences_done), 1)
  assert.equal(await bal(USDC, BOB.address), parseUnits('10', 18))
  assert.equal(await allowance(USDC, ME.address, agentAddr), parseUnits('15', 18), 'allowance shrinks with each payment')
  assert.ok((await bnb(agentAddr)) > 0n, 'agent was topped up')
  // a second payment when due
  sc.next_run_at = new Date(Date.now() - 1000).toISOString()
  await M.sched.tickSchedules()
  assert.equal(Number(sc.occurrences_done), 2)
  assert.equal(await bal(USDC, BOB.address), parseUnits('15', 18))
})

test('cancel a schedule: the allowance goes to 0 with one more signature', async () => {
  const sc = M.tables.scheduled_payments.at(-1)
  const c = await call(M.schedule, 'post', '/:id/cancel', { params: { id: sc.id } })
  assert.equal(c.status, 200, JSON.stringify(c.body))
  assert.equal(sc.status, 'cancelled')
  const s = await call(M.tx, 'post', '/submit', { body: { prepId: c.body.prepId, signedTx: await signAll(ME, c.body.tx) } })
  assert.equal(s.status, 200, JSON.stringify(s.body))
  assert.match(s.body.message, /no longer has permission/)
  assert.equal(await allowance(USDC, ME.address, privateKeyToAccount(AGENT).address), 0n)
})

test('Solana rows in the shared tables are never touched', async () => {
  M.tables.scheduled_payments.push({ id: 'SOL1', chain: 'solana', user_address: '7Qm4xVb9JrT2kWfH8sLp3YnE6cDaZ1uGq5tRoXyB2eMv', mode: 'delegate', status: 'active',
    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', amount_units: '1000000', occurrences: 3, occurrences_done: 0, recipient: 'x', next_run_at: new Date(0).toISOString() })
  await M.sched.tickSchedules()
  const row = M.tables.scheduled_payments.find(r => r.id === 'SOL1')
  assert.equal(row.status, 'active'); assert.equal(row.occurrences_done, 0)
})

test('send to an email: money waits in a claim wallet, lands on sign-up (existing .vel user keeps the name)', async () => {
  // jordan already has a Solana-era account with a .vel name, same Privy user
  M.tables.users = [{ id: 'U1', privy_id: 'privy-jordan', username: 'jordan', email: 'jordan@gmail.com', wallet_address: 'SoLanaAddr111111111111111111111111111111111' }]
  seedPending({ intent: 'send', payment: { currency: 'USDC', amount: 7, recipients: [{ resolved: { email: 'jordan@gmail.com', needsInvite: true } }] } })
  const { a } = await slide()
  assert.equal(a.status, 200, JSON.stringify(a.body))
  const inv = M.tables.escrow_invites.at(-1)
  assert.equal(inv.chain, 'bnb'); assert.equal(inv.mode, 'wallet')
  assert.equal(await bal(USDC, inv.escrow_address), parseUnits('7', 18))
  // jordan signs in on BNB: Privy gives an ethereum wallet
  M.privy.users['privy-jordan'] = { linkedAccounts: [{ type: 'wallet', chainType: 'ethereum', walletClientType: 'privy', address: NEWBIE.address.toLowerCase() }], google: { email: 'jordan@gmail.com' } }
  const s = await call(M.auth, 'post', '/privy', { body: { accessToken: 'privy-jordan' }, user: null })
  assert.equal(s.status, 200, JSON.stringify(s.body))
  assert.equal(s.body.address, NEWBIE.address, 'checksummed')
  assert.equal(s.body.user.wallet_address, NEWBIE.address)
  assert.equal(s.body.user.username, 'jordan')
  const u = M.tables.users[0]
  assert.equal(u.evm_address, NEWBIE.address); assert.equal(u.wallet_address, 'SoLanaAddr111111111111111111111111111111111', 'Solana address untouched')
  for (let i = 0; i < 100 && inv.status !== 'claimed'; i++) await new Promise(r => setTimeout(r, 100))
  assert.equal(inv.status, 'claimed')
  assert.equal(await bal(USDC, NEWBIE.address), parseUnits('7', 18))
  // and jordan.vel now resolves to the BNB address
  const r = await call(M.users, 'get', '/resolve/:input', { params: { input: 'jordan.vel' } })
  assert.equal(r.body.address, NEWBIE.address)
})

test('an unclaimed invite goes back to the sender after 7 days', async () => {
  seedPending({ intent: 'send', payment: { currency: 'USDT', amount: 3, recipients: [{ resolved: { email: 'nobody@example.com', needsInvite: true } }] } })
  const before = await bal(USDT, ME.address)
  const { a } = await slide()
  assert.equal(a.status, 200, JSON.stringify(a.body))
  const inv = M.tables.escrow_invites.at(-1)
  inv.expires_at = new Date(Date.now() - 1000).toISOString()
  const out = await M.invites.refundExpiredInvites()
  assert.equal(out.length, 1); assert.equal(inv.status, 'refunded')
  assert.equal(await bal(USDT, ME.address), before)
})

test('balances read BNB and the known tokens', async () => {
  const b = await call(M.account, 'get', '/balances')
  assert.equal(b.status, 200, JSON.stringify(b.body))
  const syms = b.body.tokens.map(t => t.symbol)
  assert.ok(syms.includes('USDC') && syms.includes('USDT') && syms.includes('BNB'), syms.join())
})

test('the gas wallet cap stops drops once a user hits the daily limit', async () => {
  process.env.MAX_GAS_DROPS_PER_DAY = '0'
  const empty = fresh()
  await mint(USDC, empty.address, 5)
  seedPending(sendTo(MAYA.address, 1), empty.address)
  const { a } = await slide(empty)
  assert.equal(a.status, 400); assert.match(a.body.error, /network fees/)
  assert.equal(await bal(USDC, empty.address), parseUnits('5', 18), 'nothing sent')
  process.env.MAX_GAS_DROPS_PER_DAY = '50'
})

test('token check on start: right decimals pass, a wrong address is caught', async () => {
  assert.deepEqual(await M.bnbjs.checkTokens(M.tokens.TOKEN_LIST), [])
  const bad = await M.bnbjs.checkTokens([{ symbol: 'USDC', mint: MAYA.address, decimals: 18 }])
  assert.equal(bad.length, 1)
})

test('swaps and streams say coming soon', async () => {
  seedPending({ intent: 'swap', payment: { swap: { from_token: 'BNB', to_token: 'USDC', amount: 1 } } })
  const p = await call(M.agent, 'post', '/prepare/:id', { params: { id: 'P1' } })
  assert.equal(p.status, 400); assert.match(p.body.error, /coming soon/)
})
