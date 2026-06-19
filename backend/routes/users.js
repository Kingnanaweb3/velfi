import express from 'express'
import supabase from '../lib/supabaseAdmin.js'

const router = express.Router()

// GET /users/:username - get public profile
router.get('/:username', async (req, res) => {
  try {
    const { username } = req.params
    const { data, error } = await supabase
      .from('users')
      .select('username, sui_address, avatar_url, created_at')
      .eq('username', username)
      .single()

    if (error || !data) return res.status(404).json({ error: 'User not found' })
    res.json({ user: data })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /resolve/:input - resolve .vel / .sui / 0x address / email
router.get('/resolve/:input', async (req, res) => {
  try {
    const input = req.params.input.toLowerCase().trim()

    // .vel username
    if (input.endsWith('.vel')) {
      const username = input.replace('.vel', '')
      const { data } = await supabase
        .from('users')
        .select('sui_address, username, avatar_url')
        .eq('username', username)
        .single()
      if (!data) return res.status(404).json({ error: 'Username not found' })
      return res.json({ address: data.sui_address, user: data })
    }

    // 0x address — return as-is
    if (input.startsWith('0x')) {
      const { data } = await supabase
        .from('users')
        .select('sui_address, username, avatar_url')
        .eq('sui_address', input)
        .single()
      return res.json({ address: input, user: data || null })
    }

    // email
    if (input.includes('@')) {
      const { data } = await supabase
        .from('users')
        .select('sui_address, username, avatar_url')
        .eq('email', input)
        .single()
      if (!data) return res.json({ address: null, needsInvite: true, email: input })
      return res.json({ address: data.sui_address, user: data })
    }

    res.status(400).json({ error: 'Invalid input format' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
