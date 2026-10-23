import express from 'express'
import supabase from '../lib/supabaseAdmin.js'
import { isEvmAddress, norm } from '../lib/chain/evm.js'

const router = express.Router()
const PUBLIC = 'username, evm_address, avatar_url, created_at'
// BNB addresses live in evm_address; show them as wallet_address like before.
const view = (u) => (u ? { username: u.username, wallet_address: u.evm_address || null, avatar_url: u.avatar_url, created_at: u.created_at } : u)

// GET /users/resolve/:input - resolve a .vel name, BNB Chain address or email
// (declared before /:username so "resolve" is never read as a username)
router.get('/resolve/:input', async (req, res) => {
  try {
    const original = req.params.input.trim()
    const input = original.toLowerCase()

    if (input.endsWith('.vel')) {
      const { data } = await supabase.from('users').select(PUBLIC).eq('username', input.replace(/\.vel$/, '')).maybeSingle()
      if (!data?.evm_address) return res.status(404).json({ error: 'Username not found' })
      return res.json({ address: data.evm_address, user: view(data) })
    }

    if (isEvmAddress(original)) {
      const address = norm(original)
      const { data } = await supabase.from('users').select(PUBLIC).eq('evm_address', address).maybeSingle()
      return res.json({ address, user: view(data) || null })
    }

    if (input.includes('@')) {
      const { data } = await supabase.from('users').select(PUBLIC).eq('email', input).maybeSingle()
      if (!data) return res.json({ address: null, needsInvite: true, email: input })
      return res.json({ address: data.evm_address || null, needsInvite: !data.evm_address, email: input, user: view(data) })
    }

    res.status(400).json({ error: 'Use a .vel name, a BNB Chain address (0x...) or an email' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /users/:username - public profile
router.get('/:username', async (req, res) => {
  try {
    const { data, error } = await supabase.from('users').select(PUBLIC).eq('username', req.params.username.toLowerCase()).single()
    if (error || !data) return res.status(404).json({ error: 'User not found' })
    res.json({ user: view(data) })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
