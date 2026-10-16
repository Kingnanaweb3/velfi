import express from 'express'
import { v4 as uuidv4 } from 'uuid'
import supabase from '../lib/supabase.js'
import { requireAuth } from '../middleware/auth.js'

const router = express.Router()

// Sending and splitting now go through /agent/prepare + /agent/approve, where the
// user's own wallet signs. Sending to an email creates an on-chain escrow there.

// POST /payments/pending - send to email (store escrow record)
router.post('/pending', requireAuth, async (req, res) => {
  try {
    const { toEmail, amount, token, message } = req.body
    if (!toEmail || !amount) {
      return res.status(400).json({ error: 'toEmail and amount required' })
    }

    const claimToken = uuidv4()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

    const { data, error } = await supabase
      .from('pending_payments')
      .insert({
        from_address: req.user.address,
        from_username: req.user.username,
        to_email: toEmail,
        amount,
        token: token || 'USDC',
        claim_token: claimToken,
        message,
        expires_at: expiresAt
      })
      .select()
      .single()

    if (error) throw error

    res.json({ success: true, claimToken, payment: data })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /payments/claim/:token - claim pending payment
router.get('/claim/:token', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('pending_payments')
      .select('*')
      .eq('claim_token', req.params.token)
      .eq('status', 'pending')
      .single()

    if (error || !data) return res.status(404).json({ error: 'Payment not found or already claimed' })
    if (new Date(data.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Payment link expired' })
    }

    res.json({ payment: data })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /payments/request
router.post('/request', requireAuth, async (req, res) => {
  try {
    const { toAddress, toEmail, amount, token, message } = req.body
    if (!amount) return res.status(400).json({ error: 'amount required' })

    const { data, error } = await supabase
      .from('payment_requests')
      .insert({
        from_username: req.user.username,
        to_address: toAddress,
        to_email: toEmail,
        amount,
        token: token || 'USDC',
        message
      })
      .select()
      .single()

    if (error) throw error
    res.json({ success: true, request: data })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /payments/history - Velfi's record of this user's payments
router.get('/history', requireAuth, async (req, res) => {
  try {
    const { data } = await supabase.from('transactions').select('*')
      .eq('user_address', req.user.address).order('created_at', { ascending: false }).limit(20)
    res.json({ transactions: data || [] })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
