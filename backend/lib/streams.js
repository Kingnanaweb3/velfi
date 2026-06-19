import supabaseAdmin from './supabaseAdmin.js'
import { TransactionBlock } from '@mysten/sui.js/transactions'
import { addTransfer, agentAddress, signAndRun } from './txBuilder.js'
import { getToken } from './tokens.js'

const TICK_MS = 20000   // runner cadence (demo-accelerated; raise for production)
const MIN_TICK = 1e-4   // skip dust transfers below this

// Persist a stream. The runner handles all payments, including the first tick.
export async function startStream({ userAddress, recipient, recipientName, token, totalAmount, durationSecs }) {
  const now = new Date(), end = new Date(now.getTime() + durationSecs * 1000)
  const { data, error } = await supabaseAdmin.from('streams').insert({
    user_address: userAddress,
    recipients: [{ address: recipient, name: recipientName || null }],
    token: String(token).toUpperCase(),
    total_amount: totalAmount,
    rate_per_sec: Number(totalAmount) / durationSecs,
    amount_streamed: 0,
    start_time: now.toISOString(),
    end_time: end.toISOString(),
    status: 'active',
  }).select().single()
  if (error) throw new Error(`stream insert failed: ${error.message}`)
  return data
}

// Send one stream's accrued slice. Returns digest or null if nothing's due yet.
async function tickOne(s) {
  const token = getToken(s.token); if (!token) return null
  const recip = (s.recipients || [])[0] || {}; if (!recip.address) return null
  const elapsed = Math.max(0, (Date.now() - new Date(s.start_time).getTime()) / 1000)
  const finishing = Date.now() >= new Date(s.end_time).getTime()
  const due = Math.min(Number(s.total_amount), Number(s.rate_per_sec) * elapsed)
  let delta = finishing ? Number(s.total_amount) - Number(s.amount_streamed) : due - Number(s.amount_streamed)
  if (delta < MIN_TICK && !finishing) return null
  if (delta <= 0) { if (finishing) await supabaseAdmin.from('streams').update({ status: 'complete' }).eq('id', s.id); return null }

  const txb = new TransactionBlock()
  await addTransfer(txb, { sender: agentAddress(), recipient: recip.address, amount: delta, token })
  const r = await signAndRun(txb)
  if (r.effects?.status?.status !== 'success') { console.error('stream tick failed', s.id, r.effects?.status); return null }

  const streamed = Number(s.amount_streamed) + delta
  const done = streamed >= Number(s.total_amount) - 1e-9 || finishing
  await supabaseAdmin.from('streams').update({ amount_streamed: streamed, tx_hash: r.digest, status: done ? 'complete' : 'active' }).eq('id', s.id)
  await supabaseAdmin.from('transactions').insert({
    user_address: s.user_address, digest: r.digest, type: 'stream',
    label: `Streamed to ${recip.name || recip.address}`, sub_label: s.token,
    amount: delta, token: s.token, direction: 'out', counterparty: recip.name || recip.address,
  })
  return r.digest
}

export async function tickStreams() {
  const { data } = await supabaseAdmin.from('streams').select('*').eq('status', 'active')
  for (const s of data || []) { try { await tickOne(s) } catch (e) { console.error('tick error', s.id, e.message) } }
}

let _runner = null
export function startStreamRunner() {
  if (_runner) return
  _runner = setInterval(() => tickStreams().catch(e => console.error('runner:', e.message)), TICK_MS)
  console.log(`✅ stream runner started (every ${TICK_MS / 1000}s)`)
}
