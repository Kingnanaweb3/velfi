import express from 'express'
import jwt from 'jsonwebtoken'
import { PrivyClient } from '@privy-io/server-auth'
import supabase from '../lib/supabaseAdmin.js'
import { isEvmAddress, norm } from '../lib/chain/evm.js'
import { claimInvitesFor } from '../lib/invites.js'
import dotenv from 'dotenv'
dotenv.config()

const router = express.Router()
let _privy
const privy = () => (_privy ||= new PrivyClient(process.env.PRIVY_APP_ID, process.env.PRIVY_APP_SECRET))

// On BNB Chain a user's address lives in users.evm_address. The Solana version's
// wallet_address column is left untouched, so switching back keeps working and
// .vel names carry over. Responses show the BNB address as wallet_address.
const view = (u) => (u ? { ...u, wallet_address: u.evm_address || null } : u)
const session = (user) => jwt.sign(
  { address: user.evm_address, username: user.username || null, email: user.email || null, sub: user.privy_id },
  process.env.JWT_SECRET, { expiresIn: '7d' })

// POST /auth/privy  { accessToken }
// The app signs in with Google through Privy, which gives the user an embedded
// EVM wallet. We verify the Privy token, read the wallet from Privy (never
// trusting an address sent by the client), and issue a Velfi session.
router.post('/privy', async (req, res) => {
  try {
    const { accessToken } = req.body || {}
    if (!accessToken) return res.status(400).json({ error: 'accessToken required' })
    const claims = await privy().verifyAuthToken(accessToken)
    const pu = await privy().getUser(claims.userId)
    const wallet = (pu.linkedAccounts || []).find(a => a.type === 'wallet' && a.chainType === 'ethereum' && a.walletClientType === 'privy')
    if (!wallet || !isEvmAddress(wallet.address))
      return res.status(409).json({ error: 'Your Velfi wallet is still being created. Try again in a moment.' })
    const address = norm(wallet.address)
    const email = (pu.google?.email || pu.email?.address || '').toLowerCase() || null
    const avatar = null

    let { data: existing } = await supabase.from('users').select('*').eq('privy_id', claims.userId).maybeSingle()

    // Someone with an older Velfi account (and .vel name) under the same Google
    // email: carry that account over instead of creating a second one. Only
    // Google's verified email is used.
    const googleEmail = (pu.google?.email || '').toLowerCase()
    if (!existing && googleEmail) {
      const { data: old } = await supabase.from('users').select('*').eq('email', googleEmail)
      const match = (old || []).filter(u => !u.evm_address).sort((a, b) => (b.username ? 1 : 0) - (a.username ? 1 : 0))[0]
      if (match) {
        const patch = match.privy_id ? { evm_address: address } : { privy_id: claims.userId, evm_address: address }
        const { data, error } = await supabase.from('users').update(patch).eq('id', match.id).select().single()
        if (error) throw error
        existing = data
      }
    }

    let user = existing
    if (!user) {
      const { data, error } = await supabase.from('users')
        .insert({ privy_id: claims.userId, evm_address: address, email, avatar_url: avatar, username: null })
        .select().single()
      if (error) throw error
      user = data
    } else if (user.evm_address !== address) {
      const { data } = await supabase.from('users').update({ evm_address: address }).eq('id', user.id).select().single()
      user = data
    }

    // Anything sent to this email before they joined lands now.
    claimInvitesFor(email, address).catch(e => console.error('invite claim:', e.message))

    res.json({ token: session(user), user: view(user), isNew: !existing || !user.username, address })
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

    const { data, error } = await supabase.from('users').update({ username }).eq('evm_address', me.address).select().single()
    if (error) throw error
    res.json({ user: view(data), token: session(data) })
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
    const { data, error } = await supabase.from('users').select('*').eq('evm_address', decoded.address).single()
    if (error || !data) return res.status(404).json({ error: 'User not found' })
    res.json({ user: view(data) })
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
})

export default router
