// Streams live on-chain in the Velfi program: the user's tokens vest to the
// recipient second by second, and the recipient claims whenever they like.
// Supabase only keeps a record for the app's lists.
import supabaseAdmin from './supabaseAdmin.js'
import { vested } from './chain/velfiProgram.js'
import { fromBaseUnits } from './chain/amounts.js'

export async function recordStream({ userAddress, recipient, recipientName, token, mint, decimals, totalUnits, durationSecs, flow, signature }) {
  const now = new Date(), end = new Date(now.getTime() + durationSecs * 1000)
  const total = Number(fromBaseUnits(totalUnits, decimals))
  const { data, error } = await supabaseAdmin.from('streams').insert({
    user_address: userAddress,
    recipients: [{ address: recipient, name: recipientName || null }],
    token: String(token).toUpperCase(),
    total_amount: total,
    rate_per_sec: total / durationSecs,
    amount_streamed: 0,
    start_time: now.toISOString(),
    end_time: end.toISOString(),
    status: 'active',
    tx_hash: signature,
    flow_address: flow,
    mint,
  }).select().single()
  if (error) throw new Error(`stream insert failed: ${error.message}`)
  return data
}

// How far along a stream is, from its times (the chain is the source of truth for claims).
export function streamProgress(s, nowMs = Date.now()) {
  const total = Number(s.total_amount) || 0
  const start = Math.floor(new Date(s.start_time).getTime() / 1000)
  const end = Math.floor(new Date(s.end_time).getTime() / 1000)
  const scale = 1e6
  const v = Number(vested(BigInt(Math.round(total * scale)), start, end, Math.floor(nowMs / 1000))) / scale
  return { total, vested: v, pct: total > 0 ? Math.min(100, Math.round((v / total) * 100)) : 0, finished: nowMs / 1000 >= end }
}

export async function markStream(id, fields) {
  await supabaseAdmin.from('streams').update(fields).eq('id', id)
}
