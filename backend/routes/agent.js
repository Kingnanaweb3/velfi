import express from 'express'
import supabase from '../lib/supabase.js'
import { provider } from '../lib/sui.js'
import { requireAuth } from '../middleware/auth.js'

const router = express.Router()

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY

async function callQwen(messages) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://vel.fi',
      'X-Title': 'Vel.fi'
    },
    body: JSON.stringify({
      model: 'qwen/qwen-2.5-72b-instruct',
      messages,
      response_format: { type: 'json_object' }
    })
  })
  const data = await res.json()
  return data.choices[0].message.content
}

async function resolveRecipient(input) {
  const clean = input.toLowerCase().trim()

  if (clean.endsWith('.vel')) {
    const username = clean.replace('.vel', '')
    const { data } = await supabase
      .from('users')
      .select('sui_address, username')
      .eq('username', username)
      .single()
    return data ? { address: data.sui_address, label: input } : null
  }

  if (clean.startsWith('0x')) return { address: clean, label: clean }

  if (clean.includes('@')) return { address: null, email: clean, label: clean, needsInvite: true }

  // try as plain username
  const { data } = await supabase
    .from('users')
    .select('sui_address, username')
    .eq('username', clean)
    .single()
  return data ? { address: data.sui_address, label: clean } : null
}

// POST /agent/message
router.post('/message', requireAuth, async (req, res) => {
  try {
    const { message } = req.body
    if (!message) return res.status(400).json({ error: 'message required' })

    const userAddress = req.user.address

    // Load conversation history
    const { data: convo } = await supabase
      .from('agent_conversations')
      .select('*')
      .eq('user_address', userAddress)
      .single()

    const history = convo?.messages || []

    const systemPrompt = `You are Velfi, an AI payment assistant on Sui blockchain.
Extract payment intent from user messages and return ONLY valid JSON.

Return this structure:
{
  "intent": "send|split|stream|schedule|recurring|invest|request|query",
  "params": {
    "recipient": "username, .vel name, 0x address, or email",
    "recipients": ["for split — array of recipients"],
    "amount": 10.5,
    "amounts": [for split — array of amounts],
    "token": "SUI",
    "duration_ms": 604800000,
    "frequency": "daily|weekly|monthly",
    "message": "optional note",
    "protocol": "for invest — scallop|cetus",
    "percentage": 50
  },
  "confirmation": "Human readable summary of what will happen",
  "missing": ["list any missing required info"]
}`

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-10),
      { role: 'user', content: message }
    ]

    const raw = await callQwen(messages)
    const parsed = JSON.parse(raw)

    // Resolve recipient address
    if (parsed.params?.recipient) {
      const resolved = await resolveRecipient(parsed.params.recipient)
      if (resolved) parsed.params.resolved = resolved
    }

    // Save pending tx
    const pendingTx = {
      id: crypto.randomUUID(),
      intent: parsed.intent,
      params: parsed.params,
      confirmation: parsed.confirmation,
      status: 'pending'
    }

    // Update conversation history
    const newHistory = [
      ...history,
      { role: 'user', content: message },
      { role: 'assistant', content: raw }
    ]

    await supabase
      .from('agent_conversations')
      .upsert({
        user_address: userAddress,
        messages: newHistory,
        last_intent: parsed.intent,
        pending_tx: pendingTx,
        updated_at: new Date()
      })

    res.json({
      intent: parsed.intent,
      confirmation: parsed.confirmation,
      params: parsed.params,
      missing: parsed.missing || [],
      pendingTxId: pendingTx.id
    })
  } catch (err) {
    console.error('agent error:', err)
    res.status(500).json({ error: err.message })
  }
})

// POST /agent/approve/:id
router.post('/approve/:id', requireAuth, async (req, res) => {
  try {
    const { txBytes, signature } = req.body
    if (!txBytes || !signature) {
      return res.status(400).json({ error: 'txBytes and signature required' })
    }

    const result = await provider.executeTransactionBlock({
      transactionBlock: txBytes,
      signature,
      options: { showEffects: true }
    })

    // Clear pending tx
    await supabase
      .from('agent_conversations')
      .update({ pending_tx: null })
      .eq('user_address', req.user.address)

    // Save notification
    await supabase
      .from('notifications')
      .insert({
        user_address: req.user.address,
        type: 'payment_sent',
        title: 'Payment sent',
        body: `Transaction confirmed on Sui`,
        action_url: `https://suiscan.xyz/testnet/tx/${result.digest}`
      })

    res.json({ success: true, digest: result.digest })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /agent/cancel/:id
router.post('/cancel/:id', requireAuth, async (req, res) => {
  try {
    await supabase
      .from('agent_conversations')
      .update({ pending_tx: null })
      .eq('user_address', req.user.address)

    res.json({ success: true, message: 'Transaction cancelled' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
