// Recurring payments.
//  - Lite mode ("delegate"): the user approved Velfi's agent to spend up to the
//    schedule's total budget from their wallet. Solana caps the total; this
//    runner enforces the recipient, the amount per payment and the timing, and
//    claims each payment in the database BEFORE sending so it can never pay twice.
//  - Program mode ("mandate"): the on-chain mandate enforces all of the above.
import supabaseAdmin from './supabaseAdmin.js'
import { buildExecuteMandate, buildDelegatedPayment } from './txBuilder.js'
import { sendAsServer, agent, explorerTx } from './solana.js'
import { getTokenByMint } from './tokens.js'
import { checkScheduledPayment } from './chain/lite.js'

const TICK_MS = 30_000
// Optional: speed schedules up for demos on devnet (e.g. 60 = one payment a minute).
const DEMO_SECS = Number(process.env.SCHEDULE_DEMO_SECS || 0)

export async function recordSchedule({ userAddress, recipient, recipientName, token, mint, amount, amountUnits, frequency, plan, mandate = null, mode = 'mandate', signature }) {
  const { data, error } = await supabaseAdmin.from('scheduled_payments').insert({
    user_address: userAddress, recipient, recipient_name: recipientName || null,
    amount, amount_units: String(amountUnits), token: String(token).toUpperCase(), mint,
    schedule_type: 'recurring', frequency, interval_secs: plan.intervalSecs,
    occurrences: plan.count, occurrences_done: 0,
    next_run_at: new Date().toISOString(),
    status: 'active', mandate_address: mandate, mode, tx_hash: signature,
  }).select().single()
  if (error) throw new Error(`schedule insert failed: ${error.message}`)
  return data
}

async function fail(sc, reason) {
  await supabaseAdmin.from('scheduled_payments').update({ status: 'failed' }).eq('id', sc.id)
  await supabaseAdmin.from('notifications').insert({ user_address: sc.user_address, type: 'schedule_failed',
    title: 'A scheduled payment did not go through',
    body: `${String(reason).slice(0, 160)} The schedule is paused. Cancel it in Flows to remove Velfi's permission.` })
}

async function runOne(sc) {
  const mode = sc.mode || (sc.mandate_address ? 'mandate' : null)
  if (!mode) return null // legacy Sui rows are skipped
  if (mode === 'delegate') {
    const why = checkScheduledPayment(sc)
    if (why) return null
  }

  // Claim this payment first (only succeeds if nobody else has), then send.
  // If sending then fails, the schedule is marked failed and never retried
  // blindly, so a payment can be missed but never doubled.
  const before = sc.occurrences_done
  const done = Number(before) + 1
  const finished = sc.occurrences && done >= Number(sc.occurrences)
  const gap = (DEMO_SECS || Number(sc.interval_secs)) * 1000
  const { data: claimed } = await supabaseAdmin.from('scheduled_payments').update({
    occurrences_done: done,
    next_run_at: finished ? sc.next_run_at : new Date(new Date(sc.next_run_at).getTime() + gap).toISOString(),
    status: finished ? 'complete' : 'active',
  }).eq('id', sc.id).eq('occurrences_done', before).eq('status', 'active').select()
  if (!claimed?.length) return null

  let signature
  try {
    const ixs = mode === 'delegate'
      ? (await buildDelegatedPayment({ owner: sc.user_address, recipient: sc.recipient, token: getTokenByMint(sc.mint), amountUnits: BigInt(sc.amount_units) })).ixs
      : await buildExecuteMandate({ mandate: sc.mandate_address, recipient: sc.recipient, mint: sc.mint, amountUnits: BigInt(sc.amount_units) })
    signature = await sendAsServer(ixs, [agent()])
  } catch (e) {
    // Not enough balance, permission removed, mandate expired: stop and tell the user.
    await supabaseAdmin.from('scheduled_payments').update({ occurrences_done: before }).eq('id', sc.id)
    await fail(sc, e.message)
    return null
  }
  await supabaseAdmin.from('transactions').insert({
    user_address: sc.user_address, digest: signature, type: 'schedule',
    label: `Scheduled payment to ${sc.recipient_name || sc.recipient}`, sub_label: `${sc.frequency} (${done}/${sc.occurrences})`,
    amount: Number(sc.amount), token: sc.token, direction: 'out', counterparty: sc.recipient_name || sc.recipient,
  })
  await supabaseAdmin.from('notifications').insert({ user_address: sc.user_address, type: 'payment_sent',
    title: 'Scheduled payment sent', body: `${sc.amount} ${sc.token} to ${sc.recipient_name || sc.recipient}`, action_url: explorerTx(signature) })
  return signature
}

let _ticking = false
export async function tickSchedules() {
  if (_ticking || process.env.PAUSE_PAYMENTS === 'on') return
  _ticking = true
  try {
    const { data } = await supabaseAdmin.from('scheduled_payments').select('*')
      .eq('status', 'active').lte('next_run_at', new Date().toISOString())
    for (const sc of data || []) { try { await runOne(sc) } catch (e) { console.error('schedule tick', sc.id, e.message) } }
  } finally { _ticking = false }
}

let _runner = null
export function startScheduleRunner() {
  if (_runner) return
  _runner = setInterval(() => tickSchedules().catch(e => console.error('schedule runner:', e.message)), TICK_MS)
  console.log(`✅ schedule runner started (every ${TICK_MS / 1000}s)`)
}
