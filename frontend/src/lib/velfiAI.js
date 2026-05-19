const BACKEND_URL = 'http://localhost:3001'

export async function sendToVelfiAI(messages) {
  const res = await fetch(`${BACKEND_URL}/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages })
  })
  if (!res.ok) throw new Error('AI request failed')
  return res.json()
}
