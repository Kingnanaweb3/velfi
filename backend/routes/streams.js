import express from 'express'
import supabase from '../lib/supabase.js'
import { provider } from '../lib/sui.js'
import { requireAuth } from '../middleware/auth.js'

const router = express.Router()

// POST /streams/create
router.post('/create', requireAuth, async (req, res) => {
  try {
    const { recipients, amount, durationMs, txBytes, signature } = req.body
    if (!recipients || !amount || !txBytes) {
      return res.status(400).json({ error: 'recipients, amount, txBytes required' })
    }

    const result = await provider.executeTransactionBlock({
      transactionBlock: txBytes,
      signature,
      options: { showEffects: true }
    })

    const startTime = new Date()
    const endTime = new Date(Date.now() + durationMs)
    const ratePerSec = amount / (durationMs / 1000)

    const { data, error } = await supabase
      .from('streams')
      .insert({
        user_address: req.user.address,
        recipients,
        token: 'SUI',
        rate_per_sec: ratePerSec,
        total_amount: amount,
        amount_streamed: 0,
        start_time: startTime,
        end_time: endTime,
        status: 'active',
        tx_hash: result.digest
      })
      .select()
      .single()

    if (error) throw error
    res.json({ success: true, stream: data, digest: result.digest })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /streams/active
router.get('/active', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('streams')
      .select('*')
      .eq('user_address', req.user.address)
      .eq('status', 'active')
      .order('created_at', { ascending: false })

    if (error) throw error
    res.json({ streams: data })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /streams/cancel/:id
router.post('/cancel/:id', requireAuth, async (req, res) => {
  try {
    const { txBytes, signature } = req.body

    const result = await provider.executeTransactionBlock({
      transactionBlock: txBytes,
      signature,
      options: { showEffects: true }
    })

    const { data, error } = await supabase
      .from('streams')
      .update({ status: 'cancelled' })
      .eq('id', req.params.id)
      .eq('user_address', req.user.address)
      .select()
      .single()

    if (error) throw error
    res.json({ success: true, stream: data, digest: result.digest })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
