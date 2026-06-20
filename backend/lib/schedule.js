import supabaseAdmin from './supabaseAdmin.js'
import { TransactionBlock } from '@mysten/sui.js/transactions'
import { addTransfer, agentAddress, signAndRun } from './txBuilder.js'
import { getToken } from './tokens.js'

const TICK_MS = 20000
const DEMO_INTERVAL_SECS = 20   // accelerated gap between payments (raise to real frequency for prod)

export async function createSchedule({ userAddress, recipient, recipientName, token, amount, frequency, occurrences }) {
  const occ = Number(occurrences) > 0 ? Number(occurrences) : 4
  const { data, error } = await supabaseAdmin.from('scheduled_payments').insert({
    user_address: userAddress, recipient, amount, token: String(token).toUpperCase(),
    schedule_type: 'recurring', frequency: frequency || 'weekly',
    occurrences: occ, occurrences_done: 0,
    next_run_at: new Date().toISOString(),   // first payment fires on the next tick
    status: 'active',
  }).select().single()
  if (error) throw new Error(`schedule insert failed: ${error.message}`)
  return { ...data, recipientName }
}

async function runOne(sc) {
  const token = getToken(sc.token); if (!token || !sc.recipient) return null
  const txb = new TransactionBlock()
  await addTransfer(txb, { sender: agentAddress(), recipient: sc.recipient, amount: Number(sc.amount), token })
  const r = await signAndRun(txb)
  if (r.effects?.status?.status !== 'success') { console.error('schedule run failed', sc.id, r.effects?.status); return null }
  const done = Number(sc.occurrences_done) + 1
  const finished = sc.occurrences && done >= Number(sc.occurrences)
  await supabaseAdmin.from('scheduled_payments').update({
    occurrences_done: done,
    next_run_at: finished ? sc.next_run_at : new Date(Date.now() + DEMO_INTERVAL_SECS * 1000).toISOString(),
    status: finished ? 'complete' : 'active',
  }).eq('id', sc.id)
  await supabaseAdmin.from('transactions').insert({
    user_address: sc.user_address, digest: r.digest, type: 'schedule',
    label: `Scheduled payment to ${sc.recipient}`, sub_label: `${sc.frequency} (${done}/${sc.occurrences})`,
    amount: Number(sc.amount), token: sc.token, direction: 'out', counterparty: sc.recipient,
  })
  return r.digest
}

let _ticking = false
export async function tickSchedules() {
  if (_ticking) return
  _ticking = true
  try {
    const { data } = await supabaseAdmin.from('scheduled_payments').select('*')
      .eq('status', 'active').lte('next_run_at', new Date().toISOString())
    for (const sc of data || []) { try { await runOne(sc) } catch (e) { console.error('sched tick', sc.id, e.message) } }
  } finally { _ticking = false }
}

let _runner = null
export function startScheduleRunner() {
  if (_runner) return
  _runner = setInterval(() => tickSchedules().catch(e => console.error('sched runner:', e.message)), TICK_MS)
  console.log(`✅ schedule runner started (every ${TICK_MS / 1000}s)`)
}
