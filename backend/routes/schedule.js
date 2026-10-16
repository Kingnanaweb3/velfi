import express from 'express'
import supabase from '../lib/supabaseAdmin.js'
import { requireAuth } from '../middleware/auth.js'
import { buildRevokeMandate, buildSetAllowance } from '../lib/txBuilder.js'
import { allowanceFor } from '../lib/chain/lite.js'
import { getTokenByMint } from '../lib/tokens.js'
import { prepareForUser } from '../lib/solana.js'
import { remember } from '../lib/prepared.js'

const router = express.Router()

// Schedules are created through the agent (/agent/prepare + /agent/approve).

// GET /schedule/list
router.get('/list', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('scheduled_payments').select('*')
      .eq('user_address', req.user.address).order('created_at', { ascending: false })
    if (error) throw error
    res.json({ schedules: data || [] })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /schedule/:id/cancel
//  - lite: lower Velfi's allowance to what your OTHER active schedules in this
//    token still need (or remove it entirely). Nothing was locked, so nothing to return.
//  - program: revoke the mandate; everything left comes back to you.
router.post('/:id/cancel', requireAuth, async (req, res) => {
  try {
    const { data: sc } = await supabase.from('scheduled_payments').select('*').eq('id', req.params.id).single()
    if (!sc) return res.status(404).json({ error: 'Schedule not found' })
    if (sc.user_address !== req.user.address) return res.status(403).json({ error: 'Not your schedule' })
    if (['cancelled', 'complete'].includes(sc.status)) return res.status(400).json({ error: 'That schedule is already finished.' })
    if (sc.mode === 'delegate') {
      // Stop it right away so no further payment runs, then ask the wallet to lower the allowance.
      await supabase.from('scheduled_payments').update({ status: 'cancelled' }).eq('id', sc.id)
      const { data: mine } = await supabase.from('scheduled_payments').select('*').eq('user_address', req.user.address)
      const token = getTokenByMint(sc.mint)
      const allowanceUnits = allowanceFor(mine, sc.mint, { exceptId: sc.id })
      const prep = await prepareForUser(await buildSetAllowance({ userAddress: req.user.address, token, allowanceUnits }))
      const prepId = remember({ userAddress: req.user.address, messageHash: prep.messageHash,
        after: { type: 'schedule_cancel', scheduleId: sc.id, mode: 'delegate', removed: allowanceUnits === 0n } })
      return res.json({ prepId, tx: prep.tx, note: 'Cancelled. Sign once more to remove Velfi\'s permission from your wallet.' })
    }
    if (!sc.mandate_address) {
      await supabase.from('scheduled_payments').update({ status: 'cancelled' }).eq('id', sc.id)
      return res.json({ success: true, message: 'Cancelled.' })
    }
    const prep = await prepareForUser(await buildRevokeMandate({ owner: req.user.address, mandate: sc.mandate_address, mint: sc.mint }))
    const prepId = remember({ userAddress: req.user.address, messageHash: prep.messageHash, after: { type: 'schedule_cancel', scheduleId: sc.id } })
    res.json({ prepId, tx: prep.tx })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

export default router
