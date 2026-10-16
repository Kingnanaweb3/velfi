// Encrypts invite claim keys at rest (AES-256-GCM). The key comes from
// ESCROW_SECRET in .env; without it, invites to emails are disabled.
import crypto from 'node:crypto'

function key(secret = process.env.ESCROW_SECRET) {
  if (!secret || secret.length < 32) throw new Error('ESCROW_SECRET must be set (32+ characters) to send to emails.')
  return crypto.createHash('sha256').update(secret).digest()
}

export function seal(bytes, secret) {
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv('aes-256-gcm', key(secret), iv)
  const ct = Buffer.concat([c.update(Buffer.from(bytes)), c.final()])
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64')
}

export function open(sealed, secret) {
  const buf = Buffer.from(String(sealed), 'base64')
  const d = crypto.createDecipheriv('aes-256-gcm', key(secret), buf.subarray(0, 12))
  d.setAuthTag(buf.subarray(12, 28))
  return new Uint8Array(Buffer.concat([d.update(buf.subarray(28)), d.final()]))
}
