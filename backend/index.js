const express = require('express')
const cors = require('cors')
const Anthropic = require('@anthropic-ai/sdk')
require('dotenv').config()

const app = express()
app.use(cors())
app.use(express.json())

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT = `You are Velfi AI, the smart payment assistant for Velfi.ai — a programmable payments app built on the Sui blockchain.

You help users send money, split bills, stream payments, and request funds. You are friendly, concise, and always guide users clearly.

When a user wants to perform a payment action, respond with a JSON object in this exact format:
{
  "message": "Your friendly response here",
  "action": "send" | "split" | "request" | "stream" | "balance" | "history" | "none",
  "params": {
    "to": "recipient.sui or 0x address",
    "amount": "0.01",
    "memo": "optional memo",
    "recipients": ["a.sui", "b.sui"],
    "days": 30
  }
}

Rules:
- Always include "message" and "action" fields
- "params" is optional, only include relevant fields
- If you need more info, set action to "none" and ask in message
- Keep messages short, warm and human
- Never mention Sui, blockchain, or crypto jargon to confused users
- If someone is new, guide them step by step
- You can answer questions about Velfi features

Velfi features:
- Send: send SUI to any .sui username or wallet address
- Request: generate a payment link to receive money
- Split: divide a payment between multiple people in one transaction
- Stream: send money continuously over time like a salary
- Activity: view recent transactions

Examples:
User: "send 0.01 to almond.sui for lunch"
Response: {"message": "Got it! Sending 0.01 SUI to almond.sui for lunch. Please confirm.", "action": "send", "params": {"to": "almond.sui", "amount": "0.01", "memo": "lunch"}}

User: "how do I get paid?"
Response: {"message": "Easy! Just share your payment link. Go to Request, enter an amount, and copy the link. Anyone can click it and pay you directly.", "action": "none"}

User: "split 0.09 three ways with kemi.sui and dave.sui"
Response: {"message": "Splitting 0.09 SUI three ways — 0.03 SUI each to you, kemi.sui, and dave.sui. Confirm?", "action": "split", "params": {"recipients": ["kemi.sui", "dave.sui"], "amount": "0.09", "perPerson": "0.03"}}
`

app.post('/ai/chat', async (req, res) => {
  const { messages } = req.body

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' })
  }

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content
      }))
    })

    const raw = response.content[0].text.trim()

    // Try to parse JSON response
    let parsed
    try {
      // Extract JSON if wrapped in markdown
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { message: raw, action: 'none' }
    } catch {
      parsed = { message: raw, action: 'none' }
    }

    res.json(parsed)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'AI error', message: 'Something went wrong. Try again.' })
  }
})

app.get('/health', (req, res) => res.json({ status: 'ok' }))

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`Velfi backend running on port ${PORT}`))

// Walrus receipt proxy — avoids browser CORS issues
app.post('/walrus/store', async (req, res) => {
  try {
    const data = JSON.stringify(req.body)
    const blob = Buffer.from(data)

    const response = await fetch('https://publisher.walrus-testnet.walrus.space/v1/blobs?epochs=3', {
      method: 'PUT',
      body: blob,
      headers: { 'Content-Type': 'application/octet-stream' }
    })

    if (!response.ok) {
      const text = await response.text()
      return res.status(500).json({ error: 'Walrus error', detail: text })
    }

    const result = await response.json()
    const blobId = result.newlyCreated?.blobObject?.blobId
      || result.alreadyCertified?.blobId
      || null

    res.json({ blobId })
  } catch (err) {
    console.error('Walrus proxy error:', err)
    res.status(500).json({ error: err.message })
  }
})
