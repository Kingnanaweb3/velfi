// Velfi recognized-token registry for Solana.
// Users can hold any SPL token; this list is what Velfi can name, price and move.
//
// SECURITY: mint addresses must come from the issuer's official docs. A wrong
// mint is a wrong token. Devnet and mainnet mints differ, so they are chosen by
// SOLANA_CLUSTER. USDC_MINT in .env overrides the USDC mint (handy for a test mint).
//
// `coinType` is kept as an alias of the mint so older code that checks it still works.

const CLUSTER = process.env.SOLANA_CLUSTER || 'devnet'
const MAINNET = CLUSTER === 'mainnet-beta'

// Native SOL has no mint; it is moved with SystemProgram transfers.
export const NATIVE_SOL = 'native'

const MINTS = {
  'mainnet-beta': {
    USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // Circle USDC
    USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // Tether USDT
    JUP: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',  // Jupiter
  },
  devnet: {
    USDC: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU', // Circle devnet USDC (faucet.circle.com)
  },
}

function entry(symbol, name, mint, decimals, priceId) {
  return mint ? { symbol, name, mint, coinType: mint, decimals, priceId } : null
}

const m = MINTS[CLUSTER] || MINTS.devnet
export const TOKENS = Object.fromEntries(Object.entries({
  SOL: entry('SOL', 'Solana', NATIVE_SOL, 9, 'solana'),
  USDC: entry('USDC', 'USD Coin', process.env.USDC_MINT || m.USDC, 6, 'usd-coin'),
  USDT: entry('USDT', 'Tether USD', m.USDT, 6, 'tether'),
  JUP: entry('JUP', 'Jupiter', m.JUP, 6, 'jupiter-exchange-solana'),
}).filter(([, v]) => v))

export const TOKEN_LIST = Object.values(TOKENS)
export const IS_MAINNET = MAINNET

export function getToken(symbol) {
  return TOKENS[String(symbol).toUpperCase()] || null
}

export function getTokenByMint(mint) {
  return TOKEN_LIST.find(t => t.mint === mint) || null
}
// old name, same meaning
export const getTokenByCoinType = getTokenByMint

export function isRecognized(mint) {
  return !!getTokenByMint(mint)
}

export function isNative(token) {
  return token?.mint === NATIVE_SOL
}
