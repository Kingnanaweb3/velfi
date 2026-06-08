import express from 'express'
import jwt from 'jsonwebtoken'
import { OAuth2Client } from 'google-auth-library'
import supabase from '../lib/supabase.js'
import dotenv from 'dotenv'
dotenv.config()

const router = express.Router()
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)

// POST /auth/zklogin
router.post('/zklogin', async (req, res) => {
  try {
    const { idToken, suiAddress } = req.body
    if (!idToken || !suiAddress) {
      return res.status(400).json({ error: 'idToken and suiAddress required' })
    }

    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID
    })
    const payload = ticket.getPayload()
    const email = payload.email
    const avatar = payload.picture

    const { data: existing } = await supabase
      .from('users')
      .select('*')
      .eq('sui_address', suiAddress)
      .single()

    if (existing) {
      const token = jwt.sign(
        { address: suiAddress, username: existing.username, email },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      )
      return res.json({ token, user: existing, isNew: false })
    }

    const { data: newUser, error } = await supabase
      .from('users')
      .insert({ sui_address: suiAddress, email, avatar_url: avatar })
      .select()
      .single()

    if (error) throw error

    const token = jwt.sign(
      { address: suiAddress, email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    )

    return res.json({ token, user: newUser, isNew: true })
  } catch (err) {
    console.error('zklogin error:', err)
    res.status(500).json({ error: err.message })
  }
})

// POST /auth/register - pick .vel username
router.post('/register', async (req, res) => {
  try {
    const { suiAddress, username } = req.body

    if (!/^[a-z0-9_]{3,20}$/.test(username)) {
      return res.status(400).json({ error: 'Username must be 3-20 chars, lowercase, numbers, underscores only' })
    }

    const { data: taken } = await supabase
      .from('users')
      .select('id')
      .eq('username', username)
      .single()

    if (taken) return res.status(409).json({ error: 'Username already taken' })

    const { data, error } = await supabase
      .from('users')
      .update({ username })
      .eq('sui_address', suiAddress)
      .select()
      .single()

    if (error) throw error
    res.json({ user: data })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /auth/me
router.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '')
    if (!token) return res.status(401).json({ error: 'No token' })

    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('sui_address', decoded.address)
      .single()

    if (error || !data) return res.status(404).json({ error: 'User not found' })
    res.json({ user: data })
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' })
  }
})

export default router
