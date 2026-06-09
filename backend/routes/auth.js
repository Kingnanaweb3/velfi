import express from 'express'
import jwt from 'jsonwebtoken'
import { OAuth2Client } from 'google-auth-library'
import supabase from '../lib/supabase.js'
import { getUserSalt, computeSuiAddress } from '../lib/zklogin.js'
import dotenv from 'dotenv'
dotenv.config()

const router = express.Router()
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)

// POST /auth/zklogin
// Called after Google OAuth — verifies JWT, derives salt, computes Sui address
router.post('/zklogin', async (req, res) => {
  try {
    const { idToken } = req.body
    if (!idToken) return res.status(400).json({ error: 'idToken required' })

    // Verify Google token
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID
    })
    const payload = ticket.getPayload()
    const sub = payload.sub
    const email = payload.email
    const avatar = payload.picture
    const name = payload.given_name || payload.name

    // Get or derive salt
    const salt = await getUserSalt(sub)

    // Compute Sui address from JWT + salt
    const suiAddress = computeSuiAddress(idToken, salt)

    console.log('salt:', salt)
    console.log('suiAddress:', suiAddress)
    // Check if user exists
    const { data: existing } = await supabase
      .from('users')
      .select('*')
      .eq('sui_address', suiAddress)
      .single()

    if (existing) {
      // Update salt and sub if not set
      await supabase
        .from('users')
        .update({ google_sub: sub, salt, avatar_url: avatar })
        .eq('sui_address', suiAddress)

      const token = jwt.sign(
        { address: suiAddress, username: existing.username, email, sub },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      )
      return res.json({ token, user: existing, isNew: false, salt, suiAddress })
    }

    // New user — create record
    const { data: newUser, error } = await supabase
      .from('users')
      .insert({
        sui_address: suiAddress,
        email,
        avatar_url: avatar,
        google_sub: sub,
        salt,
        username: null
      })
      .select()
      .single()

    if (error) throw error

    const token = jwt.sign(
      { address: suiAddress, email, sub },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    )

    return res.json({ token, user: newUser, isNew: true, salt, suiAddress })
  } catch (err) {
    console.error('zklogin error:', err)
    res.status(500).json({ error: err.message })
  }
})

// POST /auth/register — pick .vel username
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
      .maybeSingle()

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

// POST /auth/prover — proxy to Mysten Labs prover
router.post('/prover', async (req, res) => {
  try {
    const { jwt: userJwt, extendedEphemeralPublicKey, maxEpoch, jwtRandomness, salt, keyClaimName } = req.body

    const response = await fetch('https://prover-dev.mystenlabs.com/v1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jwt: userJwt,
        extendedEphemeralPublicKey,
        maxEpoch,
        jwtRandomness,
        salt,
        keyClaimName: keyClaimName || 'sub'
      })
    })

    const data = await response.json()
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /auth/salt/:sub — get salt for a user
router.get('/salt/:sub', async (req, res) => {
  try {
    const salt = await getUserSalt(req.params.sub)
    res.json({ salt })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
