import express from 'express'
import supabase from '../lib/supabaseAdmin.js'
import { requireAuth } from '../middleware/auth.js'
import { buildRevokeMandate } from '../lib/txBuilder.js'
import { prepareForUser } from '../lib/solana.js'
import { remember } from '../lib/prepared.js'

const router = express.Router()

// Schedules are created through the agent (/agent/prepare + /agent/approve),
// which locks the budget in an on-chain mandate first.

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

// POST /schedule/:id/cancel — revoke the mandate; everything left comes back to you
router.post('/:id/cancel', requireAuth, async (req, res) => {
  try {
    const { data: sc } = await supabase.from('scheduled_payments').select('*').eq('id', req.params.id).single()
    if (!sc) return res.status(404).json({ error: 'Schedule not found' })
    if (sc.user_address !== req.user.address) return res.status(403).json({ error: 'Not your schedule' })
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
