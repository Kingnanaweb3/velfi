import jwt from 'jsonwebtoken'
import dotenv from 'dotenv'
dotenv.config()

export function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'No token provided' })

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    // Sessions from the Solana version carry a Solana address. Send those people
    // back through sign in so they get their BNB Chain wallet.
    if (!/^0x[0-9a-fA-F]{40}$/.test(String(decoded.address || '')))
      return res.status(401).json({ error: 'Please sign in again.', reauth: true })
    req.user = decoded
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid token' })
  }
}
