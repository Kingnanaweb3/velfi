import express from 'express'
import { v4 as uuidv4 } from 'uuid'
import supabase from '../lib/supabase.js'
import { provider } from '../lib/sui.js'
import { requireAuth } from '../middleware/auth.js'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { TransactionBlock } = require('@mysten/sui.js/transactions')

const router = express.Router()

// POST /payments/send
router.post('/send', requireAuth, async (req, res) => {
  try {
    const { toAddress, amount, txBytes } = req.body
    if (!toAddress || !amount || !txBytes) {
      return res.status(400).json({ error: 'toAddress, amount, txBytes required' })
    }

    // Execute signed tx from frontend
    const result = await provider.executeTransactionBlock({
      transactionBlock: txBytes,
      signature: req.body.signature,
      options: { showEffects: true }
    })

    res.json({ success: true, digest: result.digest })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /payments/split
router.post('/split', requireAuth, async (req, res) => {
  try {
    const { recipients, amounts, txBytes, signature } = req.body
    if (!recipients || !amounts || !txBytes) {
      return res.status(400).json({ error: 'recipients, amounts, txBytes required' })
    }

    const result = await provider.executeTransactionBlock({
      transactionBlock: txBytes,
      signature,
      options: { showEffects: true }
    })

    res.json({ success: true, digest: result.digest })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

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
        token: token || 'SUI',
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
        token: token || 'SUI',
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

// GET /payments/history
router.get('/history', requireAuth, async (req, res) => {
  try {
    const address = req.user.address
    const txs = await provider.queryTransactionBlocks({
      filter: { FromAddress: address },
      options: { showEffects: true, showInput: true },
      limit: 20
    })
    res.json({ transactions: txs.data })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
