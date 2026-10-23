// EVM address helpers. Pure: no network, tested directly.
import { getAddress, isAddress } from 'viem'

// A BNB Chain (EVM) address: 0x followed by 40 hex characters. Mixed-case
// addresses must have a valid checksum; all-lowercase or all-uppercase are fine.
export function isEvmAddress(s) {
  if (typeof s !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(s.trim())) return false
  const t = s.trim(), body = t.slice(2)
  if (body === body.toLowerCase() || body === body.toUpperCase()) return true
  return isAddress(t, { strict: true })
}

// One spelling everywhere (checksummed), so comparisons and database lookups match.
export const norm = (a) => getAddress(String(a).trim().toLowerCase())
export const sameAddress = (a, b) => !!a && !!b && String(a).toLowerCase() === String(b).toLowerCase()
