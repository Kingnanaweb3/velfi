// Base58 (Bitcoin alphabet), the encoding Solana uses for addresses and signatures.
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const MAP = Object.fromEntries([...ALPHABET].map((c, i) => [c, BigInt(i)]))

export function encode(bytes) {
  const b = Uint8Array.from(bytes)
  let n = 0n
  for (const x of b) n = n * 256n + BigInt(x)
  let s = ''
  while (n > 0n) { s = ALPHABET[Number(n % 58n)] + s; n /= 58n }
  for (const x of b) { if (x === 0) s = '1' + s; else break }
  return s
}

export function decode(str) {
  if (typeof str !== 'string' || !str.length) throw new Error('empty base58 string')
  let n = 0n
  for (const c of str) {
    const v = MAP[c]
    if (v === undefined) throw new Error(`invalid base58 character "${c}"`)
    n = n * 58n + v
  }
  const out = []
  while (n > 0n) { out.unshift(Number(n % 256n)); n /= 256n }
  for (const c of str) { if (c === '1') out.unshift(0); else break }
  return Uint8Array.from(out)
}

// A Solana address is any base58 string that decodes to exactly 32 bytes.
export function isSolanaAddress(s) {
  if (typeof s !== 'string' || s.length < 32 || s.length > 44) return false
  try { return decode(s).length === 32 } catch { return false }
}
