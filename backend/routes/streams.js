import express from 'express'
import supabase from '../lib/supabaseAdmin.js'
import { requireAuth } from '../middleware/auth.js'
import { buildClaimStream, buildStopStream } from '../lib/txBuilder.js'
import { prepareForUser } from '../lib/bnb.js'
import { remember } from '../lib/prepared.js'
import { streamProgress } from '../lib/streams.js'

const router = express.Router()

const view = (s) => ({ ...s, progress: streamProgress(s) })

// GET /streams/active — streams you are paying
router.get('/active', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('streams').select('*')
      .eq('user_address', req.user.address).eq('status', 'active').order('created_at', { ascending: false })
    if (error) throw error
    res.json({ streams: (data || []).map(view) })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /streams/incoming — streams paying you (claim these)
router.get('/incoming', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('streams').select('*')
      .contains('recipients', [{ address: req.user.address }]).eq('status', 'active')
    if (error) throw error
    res.json({ streams: (data || []).map(view) })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

async function load(id) {
  const { data } = await supabase.from('streams').select('*').eq('id', id).single()
  if (!data?.flow_address) throw Object.assign(new Error('Stream not found'), { status: 404 })
  return data
}

// POST /streams/:id/claim — recipient claims what has vested (Velfi pays the fee)
router.post('/:id/claim', requireAuth, async (req, res) => {
  try {
    const s = await load(req.params.id)
    const recipient = s.recipients?.[0]?.address
    if (recipient !== req.user.address) return res.status(403).json({ error: 'Only the recipient can claim this stream.' })
    const prep = await prepareForUser(await buildClaimStream({ recipient, stream: s.flow_address, mint: s.mint }), req.user.address)
    const prepId = remember({ userAddress: req.user.address, messageHash: prep.messageHash, after: { type: 'stream_claim', streamId: s.id, token: s.token } })
    res.json({ prepId, tx: prep.tx })
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

// POST /streams/:id/stop — sender stops: recipient keeps what vested, the rest comes back
router.post('/:id/stop', requireAuth, async (req, res) => {
  try {
    const s = await load(req.params.id)
    if (s.user_address !== req.user.address) return res.status(403).json({ error: 'Only the sender can stop this stream.' })
    const prep = await prepareForUser(await buildStopStream({ sender: req.user.address, recipient: s.recipients?.[0]?.address, stream: s.flow_address, mint: s.mint }), req.user.address)
    const prepId = remember({ userAddress: req.user.address, messageHash: prep.messageHash, after: { type: 'stream_stop', streamId: s.id } })
    res.json({ prepId, tx: prep.tx })
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

export default router
