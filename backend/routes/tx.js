// POST /tx/submit { prepId, signedTx } — sends a transaction the user signed for a
// flow action (claim or stop a stream, cancel a schedule) and records the result.
import express from 'express'
import supabase from '../lib/supabaseAdmin.js'
import { requireAuth } from '../middleware/auth.js'
import { submitUserSigned, explorerTx } from '../lib/solana.js'
import { take, allowSubmission } from '../lib/prepared.js'
import { markStream } from '../lib/streams.js'

const router = express.Router()

const AFTER = {
  async stream_claim(user, a, sig) {
    await supabase.from('transactions').insert({ user_address: user.address, digest: sig, type: 'stream',
      label: 'Claimed from a stream', sub_label: a.token, token: a.token, direction: 'in' })
    return 'Claimed.'
  },
  async stream_stop(user, a, sig) {
    await markStream(a.streamId, { status: 'stopped', tx_hash: sig })
    return 'Stream stopped. What had vested went to them, the rest came back to you.'
  },
  async schedule_cancel(user, a, sig) {
    await supabase.from('scheduled_payments').update({ status: 'cancelled', tx_hash: sig }).eq('id', a.scheduleId)
    return 'Schedule cancelled. The rest of the budget is back in your wallet.'
  },
}

router.post('/submit', requireAuth, async (req, res) => {
  try {
    const { prepId, signedTx } = req.body || {}
    if (!prepId || !signedTx) return res.status(400).json({ error: 'prepId and signedTx required' })
    if (!allowSubmission(req.user.address)) return res.status(429).json({ error: 'Too many requests. Try again in a bit.' })
    const prep = take(prepId, req.user.address)
    if (!prep || !AFTER[prep.after?.type]) return res.status(410).json({ error: 'That expired. Try again and I\'ll prepare a fresh one.' })
    const signature = await submitUserSigned(signedTx, prep.messageHash)
    const message = await AFTER[prep.after.type](req.user, prep.after, signature)
    res.json({ success: true, digest: signature, explorer: explorerTx(signature), message })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

export default router
