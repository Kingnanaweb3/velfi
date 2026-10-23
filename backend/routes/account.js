import express from 'express'
import supabase from '../lib/supabaseAdmin.js'
import { getNativeBalance, explorerAddress, CLUSTER } from '../lib/bnb.js'
import { getAllBalances } from '../lib/balances.js'
import { requireAuth } from '../middleware/auth.js'

const router = express.Router()

router.get('/stats', requireAuth, async (req, res) => {
  try {
    const address = req.user.address
    const [balance, { data: streams }, { data: scheduled }] = await Promise.all([
      getNativeBalance(address),
      supabase.from('streams').select('status').eq('user_address', address),
      supabase.from('scheduled_payments').select('status').eq('user_address', address),
    ])
    res.json({
      address,
      cluster: CLUSTER,
      explorer: explorerAddress(address),
      balance_bnb: balance,
      balance_sol: balance, // old name, same value (BNB)
      active_streams: streams?.filter(s => s.status === 'active').length || 0,
      active_scheduled: scheduled?.filter(s => s.status === 'active').length || 0,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/notifications', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('notifications').select('*')
      .eq('user_address', req.user.address).order('created_at', { ascending: false }).limit(50)
    if (error) throw error
    res.json({ notifications: data })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// The user's own wallet (non-custodial), not a shared agent wallet.
router.get('/balances', requireAuth, async (req, res) => {
  try {
    const address = req.user.address
    const tokens = await getAllBalances(address)
    const total_usd = tokens.reduce((s, t) => s + (t.usd || 0), 0)
    res.json({ address, cluster: CLUSTER, total_usd, tokens })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
