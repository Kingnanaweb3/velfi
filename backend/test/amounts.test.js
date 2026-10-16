import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toBaseUnits, fromBaseUnits } from '../lib/chain/amounts.js'
import { encode, decode, isSolanaAddress } from '../lib/chain/base58.js'

test('human amounts convert exactly, with no float drift', () => {
  assert.equal(toBaseUnits('0.1', 6), 100000n)
  assert.equal(toBaseUnits(0.1, 6), 100000n)
  assert.equal(toBaseUnits(0.29, 6), 290000n)          // 0.29 * 1e6 = 289999.99999999994 in floats
  assert.equal(toBaseUnits(1.005, 9), 1005000000n)
  assert.equal(toBaseUnits('30', 6), 30000000n)
  assert.equal(toBaseUnits('.5', 9), 500000000n)
  assert.equal(toBaseUnits(1e-7, 9), 100n)
  assert.equal(toBaseUnits('1.50', 1), 15n)            // trailing zeros beyond precision are fine
})

test('bad amounts are rejected', () => {
  for (const bad of ['', '.', 'abc', '-1', '1e5', '1.2.3', NaN, -2]) assert.throws(() => toBaseUnits(bad, 6))
  assert.throws(() => toBaseUnits('0.0000001', 6), /decimal places/)
})

test('base units format back to human', () => {
  assert.equal(fromBaseUnits(100000n, 6), '0.1')
  assert.equal(fromBaseUnits(30000000n, 6), '30')
  assert.equal(fromBaseUnits(1n, 9), '0.000000001')
  assert.equal(fromBaseUnits(0n, 6), '0')
})

test('base58 round-trips and validates Solana addresses', () => {
  const usdc = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
  assert.equal(decode(usdc).length, 32)
  assert.equal(encode(decode(usdc)), usdc)
  assert.equal(encode(new Uint8Array(32)), '11111111111111111111111111111111')
  assert.ok(isSolanaAddress(usdc))
  assert.ok(isSolanaAddress('11111111111111111111111111111111'))
  assert.ok(!isSolanaAddress('0x7b57e4d59a058e4798e0cdf40bc309cacccc86777f766b3397a03ef238a03e87'))
  assert.ok(!isSolanaAddress('alice.vel'))
  assert.ok(!isSolanaAddress('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1l')) // l is not base58
})
