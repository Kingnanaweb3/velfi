import express from 'express'
import jwt from 'jsonwebtoken'
import { PrivyClient } from '@privy-io/server-auth'
import supabase from '../lib/supabaseAdmin.js'
import { isSolanaAddress } from '../lib/chain/base58.js'
import { claimInvitesFor } from '../lib/invites.js'
import dotenv from 'dotenv'
dotenv.config()

const router = express.Router()
let _privy
const privy = () => (_privy ||= new PrivyClient(process.env.PRIVY_APP_ID, process.env.PRIVY_APP_SECRET))

const session = (user) => jwt.sign(
  { address: user.wallet_address, username: user.username || null, email: user.email || null, sub: user.privy_id },
  process.env.JWT_SECRET, { expiresIn: '7d' })

// POST /auth/privy  { accessToken }
// The app signs in with Google through Privy, which gives the user an embedded
// Solana wallet. We verify the Privy token, read the wallet from Privy (never
// trusting an address sent by the client), and issue a Velfi session.
router.post('/privy', async (req, res) => {
  try {
    const { accessToken } = req.body || {}
    if (!accessToken) return res.status(400).json({ error: 'accessToken required' })
    const claims = await privy().verifyAuthToken(accessToken)
    const pu = await privy().getUser(claims.userId)
    const wallet = (pu.linkedAccounts || []).find(a => a.type === 'wallet' && a.chainType === 'solana' && a.walletClientType === 'privy')
    if (!wallet || !isSolanaAddress(wallet.address))
      return res.status(409).json({ error: 'Your Velfi wallet is still being created. Try again in a moment.' })
    const email = (pu.google?.email || pu.email?.address || '').toLowerCase() || null
    const avatar = null

    const { data: existing } = await supabase.from('users').select('*').eq('privy_id', claims.userId).maybeSingle()
    let user = existing
    if (!user) {
      const { data, error } = await supabase.from('users')
        .insert({ privy_id: claims.userId, wallet_address: wallet.address, email, avatar_url: avatar, username: null })
        .select().single()
      if (error) throw error
      user = data
    } else if (user.wallet_address !== wallet.address) {
      const { data } = await supabase.from('users').update({ wallet_address: wallet.address }).eq('id', user.id).select().single()
      user = data
    }

    // Anything sent to this email before they joined lands now.
    claimInvitesFor(email, wallet.address).catch(e => console.error('invite claim:', e.message))

    res.json({ token: session(user), user, isNew: !existing || !user.username, address: wallet.address })
  } catch (err) {
    console.error('privy auth error:', err)
    res.status(401).json({ error: 'Sign-in could not be verified. Please try again.' })
  }
})

// POST /auth/register — pick a .vel username (only for your own account)
router.post('/register', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '')
    if (!token) return res.status(401).json({ error: 'Sign in first' })
    const me = jwt.verify(token, process.env.JWT_SECRET)
    const username = String(req.body?.username || '').toLowerCase()
    if (!/^[a-z0-9_]{3,20}$/.test(username))
      return res.status(400).json({ error: 'Username must be 3-20 chars, lowercase, numbers, underscores only' })

    const { data: taken } = await supabase.from('users').select('id').eq('username', username).maybeSingle()
    if (taken) return res.status(409).json({ error: 'Username already taken' })

    const { data, error } = await supabase.from('users').update({ username }).eq('wallet_address', me.address).select().single()
    if (error) throw error
    res.json({ user: data, token: session(data) })
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
    const { data, error } = await supabase.from('users').select('*').eq('wallet_address', decoded.address).single()
    if (error || !data) return res.status(404).json({ error: 'User not found' })
    res.json({ user: data })
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
})

export default router
