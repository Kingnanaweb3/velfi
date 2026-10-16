// Exact conversion between human amounts ("12.5") and token base units (12500000n).
// No floating point: "0.1 USDC" must be exactly 100000 base units, never 99999.

export function toBaseUnits(human, decimals) {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) throw new Error('bad decimals')
  let s = typeof human === 'number' ? numberToPlain(human) : String(human ?? '').trim()
  if (!/^\d*\.?\d*$/.test(s) || s === '' || s === '.') throw new Error(`"${human}" is not a valid amount`)
  const [whole = '0', frac = ''] = s.split('.')
  if (frac.length > decimals && /[1-9]/.test(frac.slice(decimals)))
    throw new Error(`Too many decimal places (this token has ${decimals})`)
  const f = (frac + '0'.repeat(decimals)).slice(0, decimals)
  return BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt(f || '0')
}

export function fromBaseUnits(units, decimals) {
  const u = BigInt(units)
  const neg = u < 0n
  const a = neg ? -u : u
  const base = 10n ** BigInt(decimals)
  const whole = a / base
  let frac = (a % base).toString().padStart(decimals, '0').replace(/0+$/, '')
  return (neg ? '-' : '') + whole.toString() + (frac ? '.' + frac : '')
}

// JS numbers like 1e-7 or 0.1+0.2 are turned into their shortest exact-looking decimal.
function numberToPlain(n) {
  if (!Number.isFinite(n) || n < 0) throw new Error(`"${n}" is not a valid amount`)
  const s = String(n)
  if (!/e/i.test(s)) return s
  return n.toFixed(20).replace(/0+$/, '').replace(/\.$/, '')
}
