import express from 'express'
import supabase from '../lib/supabaseAdmin.js'
import { isSolanaAddress } from '../lib/chain/base58.js'

const router = express.Router()
const PUBLIC = 'username, wallet_address, avatar_url, created_at'

// GET /users/resolve/:input - resolve a .vel name, Solana address or email
// (declared before /:username so "resolve" is never read as a username)
router.get('/resolve/:input', async (req, res) => {
  try {
    const original = req.params.input.trim()
    const input = original.toLowerCase()

    if (input.endsWith('.vel')) {
      const { data } = await supabase.from('users').select(PUBLIC).eq('username', input.replace(/\.vel$/, '')).maybeSingle()
      if (!data?.wallet_address) return res.status(404).json({ error: 'Username not found' })
      return res.json({ address: data.wallet_address, user: data })
    }

    // Solana addresses are case-sensitive: use the original text.
    if (isSolanaAddress(original)) {
      const { data } = await supabase.from('users').select(PUBLIC).eq('wallet_address', original).maybeSingle()
      return res.json({ address: original, user: data || null })
    }

    if (input.includes('@')) {
      const { data } = await supabase.from('users').select(PUBLIC).eq('email', input).maybeSingle()
      if (!data) return res.json({ address: null, needsInvite: true, email: input })
      return res.json({ address: data.wallet_address, user: data })
    }

    res.status(400).json({ error: 'Use a .vel name, a Solana address or an email' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /users/:username - public profile
router.get('/:username', async (req, res) => {
  try {
    const { data, error } = await supabase.from('users').select(PUBLIC).eq('username', req.params.username.toLowerCase()).single()
    if (error || !data) return res.status(404).json({ error: 'User not found' })
    res.json({ user: data })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
