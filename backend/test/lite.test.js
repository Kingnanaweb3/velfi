// Lite mode rules (no custom program): allowance math, the server-side checks
// every scheduled payment passes, invite refunds, fee-payer caps, start-up checks.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { remainingUnits, allowanceFor, checkScheduledPayment, inviteDue, newAccountBudget } from '../lib/chain/lite.js'
import { startupProblems } from '../lib/config.js'

const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const OTHER = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'
const row = (o) => ({ id: '1', mode: 'delegate', status: 'active', mint: USDC, amount_units: '25000000', occurrences: 4, occurrences_done: 0, ...o })

test('remaining budget is amount x payments left, never negative', () => {
  assert.equal(remainingUnits(row()), 100_000_000n)
  assert.equal(remainingUnits(row({ occurrences_done: 3 })), 25_000_000n)
  assert.equal(remainingUnits(row({ occurrences_done: 4 })), 0n)
  assert.equal(remainingUnits(row({ occurrences_done: 9 })), 0n)
  assert.equal(remainingUnits(row({ amount_units: '18446744073709551615', occurrences: 2 })), 36893488147419103230n, 'no float rounding')
})

test('allowance covers every active lite schedule in that token, and nothing else', () => {
  const rows = [
    row({ id: 'a' }),                                         // 100
    row({ id: 'b', amount_units: '10000000', occurrences: 3, occurrences_done: 1 }), // 20
    row({ id: 'c', mint: OTHER }),                            // other token
    row({ id: 'd', status: 'cancelled' }),
    row({ id: 'e', status: 'failed' }),
    row({ id: 'f', status: 'complete' }),
    row({ id: 'g', mode: 'mandate' }),                        // program mode holds its own funds
  ]
  assert.equal(allowanceFor(rows, USDC), 120_000_000n)
  assert.equal(allowanceFor(rows, USDC, { plus: 50_000_000n }), 170_000_000n, 'creating adds the new budget')
  assert.equal(allowanceFor(rows, USDC, { exceptId: 'a' }), 20_000_000n, 'cancelling leaves the others covered')
  assert.equal(allowanceFor(rows.filter(r => r.id === 'a'), USDC, { exceptId: 'a' }), 0n, 'last one cancelled: revoke')
  assert.equal(allowanceFor([], USDC), 0n)
  assert.equal(allowanceFor(null, USDC, { plus: 5n }), 5n)
})

test('every scheduled payment is re-checked before the agent sends it', () => {
  const now = Date.parse('2026-10-16T12:00:00Z')
  const due = { next_run_at: '2026-10-16T11:59:00Z', recipient: 'R' }
  assert.equal(checkScheduledPayment(row(due), now), null)
  assert.match(checkScheduledPayment(row({ ...due, mode: 'mandate' }), now), /not a lite/)
  assert.match(checkScheduledPayment(row({ ...due, status: 'cancelled' }), now), /not active/)
  assert.match(checkScheduledPayment(row({ ...due, occurrences_done: 4 }), now), /already made/)
  assert.match(checkScheduledPayment(row({ ...due, next_run_at: '2026-10-16T12:01:00Z' }), now), /not due/)
  assert.match(checkScheduledPayment(row({ ...due, amount_units: '0' }), now), /no amount/)
  assert.match(checkScheduledPayment(row({ ...due, recipient: null }), now), /missing/)
})

test('invites are refunded only when pending, lite and past their 7 days', () => {
  const now = Date.parse('2026-10-16T12:00:00Z')
  const inv = { status: 'pending', mode: 'wallet', expires_at: '2026-10-16T11:00:00Z' }
  assert.ok(inviteDue(inv, now))
  assert.ok(!inviteDue({ ...inv, expires_at: '2026-10-16T13:00:00Z' }, now))
  assert.ok(!inviteDue({ ...inv, status: 'claimed' }, now))
  assert.ok(!inviteDue({ ...inv, status: 'claiming' }, now))
  assert.ok(!inviteDue({ ...inv, mode: 'program' }, now))
})

test('fee payer: new-account caps per user and overall', () => {
  const lim = { perUser: 10, global: 200 }
  assert.ok(newAccountBudget({ usedByUser: 0, usedGlobal: 0, want: 0, ...lim }).ok)
  assert.ok(newAccountBudget({ usedByUser: 9, usedGlobal: 0, want: 1, ...lim }).ok)
  assert.equal(newAccountBudget({ usedByUser: 9, usedGlobal: 0, want: 2, ...lim }).reason, 'user')
  assert.equal(newAccountBudget({ usedByUser: 0, usedGlobal: 200, want: 1, ...lim }).reason, 'global')
})

test('mainnet refuses to start with unsafe settings', () => {
  const good = {
    SOLANA_CLUSTER: 'mainnet-beta', SOLANA_RPC_URL: 'https://mainnet.helius-rpc.com/?api-key=x',
    VELFI_FEE_PAYER_KEY: '[1]', VELFI_AGENT_KEY: '[2]', JWT_SECRET: 'x'.repeat(48), ESCROW_SECRET: 'y'.repeat(64),
    PRIVY_APP_ID: 'a', PRIVY_APP_SECRET: 'b', SUPABASE_URL: 'u', SUPABASE_SERVICE_ROLE_KEY: 'k', APP_ORIGINS: 'https://app.velfi.xyz',
  }
  assert.deepEqual(startupProblems(good), { fatal: [], warn: [] })
  const f = (o) => startupProblems({ ...good, ...o }).fatal.join(' | ')
  assert.match(f({ SOLANA_RPC_URL: '' }), /paid RPC/)
  assert.match(f({ SOLANA_RPC_URL: 'https://api.mainnet-beta.solana.com' }), /paid RPC/)
  assert.match(f({ JWT_SECRET: 'short' }), /JWT_SECRET/)
  assert.match(f({ ESCROW_SECRET: '' }), /ESCROW_SECRET/)
  assert.match(f({ USDC_MINT: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU' }), /USDC_MINT/)
  assert.match(f({ SCHEDULE_DEMO_SECS: '60' }), /SCHEDULE_DEMO_SECS/)
  assert.match(f({ APP_ORIGINS: '' }), /APP_ORIGINS/)
  assert.match(f({ VELFI_FEE_PAYER_KEY: '' }), /VELFI_FEE_PAYER_KEY/)
  assert.match(startupProblems({ ...good, VELFI_AGENT_KEY: '' }).warn.join(), /VELFI_AGENT_KEY/)
  assert.match(startupProblems({ ...good, VELFI_AGENT_KEY: '[1]' }).warn.join(), /same as the fee payer/)
  // devnet only warns
  assert.equal(startupProblems({ SOLANA_CLUSTER: 'devnet' }).fatal.length, 0)
})
