// Velfi recognized-token registry for BNB Chain (BSC).
// This list is what Velfi can name, price and move.
//
// SECURITY: token addresses must come from the issuer's official sources. A wrong
// address is a wrong token. On start the server reads each token's decimals from
// the chain and refuses to run on mainnet if one doesn't match (see bnb.js checkTokens).
// Testnet has no official USDC or USDT, so set USDC_TOKEN / USDT_TOKEN to test tokens.
//
// `mint` and `coinType` hold the token contract address (the names are kept so the
// database columns and older code stay the same).

const NETWORK = process.env.BNB_NETWORK || 'testnet'
const MAINNET = NETWORK === 'mainnet'

// Native BNB has no contract; it is sent as the transaction value.
export const NATIVE = 'native'
export const NATIVE_SOL = NATIVE // old name, same meaning

const ADDRESSES = {
  mainnet: {
    USDT: '0x55d398326f99059fF775485246999027B3197955', // Tether USD (BSC-USD), 18 decimals
    USDC: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', // Binance-Peg USD Coin, 18 decimals
  },
  testnet: {},
}

function entry(symbol, name, mint, decimals, priceId) {
  return mint ? { symbol, name, mint, coinType: mint, decimals, priceId } : null
}

const a = ADDRESSES[NETWORK] || ADDRESSES.testnet
// On BSC, USDT and USDC both use 18 decimals (not 6 like on Solana or Ethereum).
const TEST_DECIMALS = Number(process.env.TEST_TOKEN_DECIMALS || 18)
export const TOKENS = Object.fromEntries(Object.entries({
  BNB: entry('BNB', 'BNB', NATIVE, 18, 'binancecoin'),
  USDT: entry('USDT', 'Tether USD', MAINNET ? a.USDT : process.env.USDT_TOKEN, MAINNET ? 18 : TEST_DECIMALS, 'tether'),
  USDC: entry('USDC', 'USD Coin', MAINNET ? a.USDC : process.env.USDC_TOKEN, MAINNET ? 18 : TEST_DECIMALS, 'usd-coin'),
}).filter(([, v]) => v))

export const TOKEN_LIST = Object.values(TOKENS)
export const IS_MAINNET = MAINNET

export function getToken(symbol) {
  return TOKENS[String(symbol).toUpperCase()] || null
}

// Contract addresses are compared without case (checksummed or not, same token).
export function getTokenByMint(mint) {
  const m = String(mint || '').toLowerCase()
  return TOKEN_LIST.find(t => t.mint.toLowerCase() === m) || null
}
// old name, same meaning
export const getTokenByCoinType = getTokenByMint

export function isRecognized(mint) {
  return !!getTokenByMint(mint)
}

export function isNative(token) {
  return token?.mint === NATIVE
}
