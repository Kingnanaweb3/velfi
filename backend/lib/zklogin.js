import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { computeZkLoginAddress, genAddressSeed, getZkLoginSignature } = require('@mysten/zklogin')
const { jwtToAddress } = require('@mysten/zklogin')
import supabase from './supabase.js'
import crypto from 'crypto'
import dotenv from 'dotenv'
dotenv.config()

const MASTER_SEED = process.env.MASTER_SEED || 'velfi_master_seed_change_in_prod'

// Derive a deterministic salt for a user from their Google sub
export function deriveUserSalt(sub) {
  const hmac = crypto.createHmac('sha256', MASTER_SEED)
  hmac.update(sub)
  const hash = hmac.digest('hex')
  // Salt must be < 2^128, use first 32 hex chars = 16 bytes
  return BigInt('0x' + hash.slice(0, 32)).toString()
}

// Get or create salt for a user
export async function getUserSalt(sub) {
  // Check if salt exists in Supabase
  const { data } = await supabase
    .from('users')
    .select('salt')
    .eq('google_sub', sub)
    .single()

  if (data?.salt) return data.salt

  // Derive and store new salt
  const salt = deriveUserSalt(sub)
  return salt
}

// Compute Sui address from JWT and salt
export function computeSuiAddress(jwt, salt) {
  return jwtToAddress(jwt, salt)
}

export { getZkLoginSignature }
