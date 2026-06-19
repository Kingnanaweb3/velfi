// Velfi recognized-token registry.
// This is NOT a restriction on what users can send — users can transact any token
// they hold. This list is the set of tokens Velfi RECOGNIZES so it can price them,
// label them nicely, value balances in USD, and power invest/yield features.
//
// SECURITY: coinType values MUST be verified against each token's OFFICIAL source
// (protocol docs / Sui coin registry / SuiScan). A wrong coinType = wrong token.
// Placeholders marked TODO_VERIFY — fill from authoritative sources before use.
// decimals also marked for verification — a wrong value mis-scales amounts badly.

export const TOKENS = {
  SUI: {
    symbol: 'SUI', name: 'Sui',
    coinType: '0x2::sui::SUI',            // canonical, safe
    decimals: 9, priceId: 'sui',
  },

  // ---- Stablecoins ----
  USDC: {
    symbol: 'USDC', name: 'USD Coin',
    // TESTNET coinType — MUST be swapped for the mainnet USDC type before production.
    coinType: '0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC',
    decimals: 6, priceId: 'usd-coin',
  },
  USDSUI: {
    symbol: 'USDsui', name: 'USDsui (Bridge / Stripe)',
    coinType: 'TODO_VERIFY', decimals: 6, priceId: 'usdsui',   // VERIFY price source
  },
  SUIUSDE: {
    symbol: 'suiUSDe', name: 'Sui USDe (yield-bearing)',
    coinType: 'TODO_VERIFY', decimals: 6, priceId: 'ethena-usde', // VERIFY
  },

  // ---- Ecosystem tokens (for holding, investing, yields) ----
  DEEP: { symbol: 'DEEP', name: 'DeepBook',        coinType: '0x36dbef866a1d62bf7328989a10fb2f07d769f4ee587c0de4a0a256e57e0a58a8::deep::DEEP', decimals: 6, priceId: 'deepbook' },
  CETUS:{ symbol: 'CETUS',name: 'Cetus Protocol',  coinType: 'TODO_VERIFY', decimals: 9, priceId: 'cetus-protocol' },
  SCA:  { symbol: 'SCA',  name: 'Scallop',         coinType: 'TODO_VERIFY', decimals: 9, priceId: 'scallop' },
  NAVX: { symbol: 'NAVX', name: 'Navi Protocol',   coinType: 'TODO_VERIFY', decimals: 9, priceId: 'navi-protocol' },
  WAL:  { symbol: 'WAL',  name: 'Walrus',          coinType: 'TODO_VERIFY', decimals: 9, priceId: 'walrus' },
  BLUE: { symbol: 'BLUE', name: 'Bluefin',         coinType: 'TODO_VERIFY', decimals: 9, priceId: 'bluefin' },
  WETH: { symbol: 'wETH', name: 'Wrapped Ether',   coinType: 'TODO_VERIFY', decimals: 8, priceId: 'ethereum' },
  WBTC: { symbol: 'wBTC', name: 'Wrapped Bitcoin', coinType: 'TODO_VERIFY', decimals: 8, priceId: 'bitcoin' },
}

export const TOKEN_LIST = Object.values(TOKENS)

export function getToken(symbol) {
  return TOKENS[String(symbol).toUpperCase()] || null
}

// Look up a recognized token by its on-chain coinType (for labeling balances).
export function getTokenByCoinType(coinType) {
  return TOKEN_LIST.find(t => t.coinType === coinType) || null
}

// A user may hold tokens NOT in this list. Those still display (by raw coinType),
// just without a friendly name/price until added here.
export function isRecognized(coinType) {
  return !!getTokenByCoinType(coinType)
}
