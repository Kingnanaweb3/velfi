import express from 'express'
import supabase from '../lib/supabase.js'
import { getSuiBalance } from '../lib/sui.js'
import { getAllBalances } from '../lib/balances.js'
import { requireAuth } from '../middleware/auth.js'

const router = express.Router()

router.get('/stats', requireAuth, async (req, res) => {
  try {
    const address = req.user.address
    const balance = await getSuiBalance(address)

    const { data: streams } = await supabase
      .from('streams')
      .select('total_amount, amount_streamed, status')
      .eq('user_address', address)

    const { data: scheduled } = await supabase
      .from('scheduled_payments')
      .select('amount, status')
      .eq('user_address', address)

    res.json({
      address,
      balance_sui: balance,
      active_streams: streams?.filter(s => s.status === 'active').length || 0,
      active_scheduled: scheduled?.filter(s => s.status === 'active').length || 0,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/notifications', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_address', req.user.address)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) throw error
    res.json({ notifications: data })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/balances', requireAuth, async (req, res) => {
  try {
    const tokens = await getAllBalances(req.user.address)
    const total_usd = tokens.reduce((s, t) => s + (t.usd || 0), 0)
    res.json({ address: req.user.address, total_usd, tokens })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
