// Start-up checks. On mainnet a missing or weak setting stops the server instead
// of failing later with real money in flight. Pure: tested directly.
export function startupProblems(env) {
  const fatal = [], warn = []
  const mainnet = (env.BNB_NETWORK || 'testnet') === 'mainnet'
  const need = ['VELFI_GAS_KEY', 'JWT_SECRET', 'ESCROW_SECRET', 'PRIVY_APP_ID', 'PRIVY_APP_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']
  for (const k of need) if (!env[k]) (mainnet ? fatal : warn).push(`${k} is not set`)
  if (env.BNB_NETWORK && !['mainnet', 'testnet'].includes(env.BNB_NETWORK)) fatal.push('BNB_NETWORK must be mainnet or testnet')
  if (!mainnet) {
    if (!env.USDC_TOKEN && !env.USDT_TOKEN) warn.push('No USDC_TOKEN or USDT_TOKEN set: on testnet Velfi can only move BNB')
    return { fatal, warn }
  }

  if (!env.BNB_RPC_URL) warn.push('BNB_RPC_URL is not set: using the public BNB Chain endpoint. A private one (NodeReal, QuickNode, Ankr) is more reliable.')
  if (env.BNB_CHAIN_ID && Number(env.BNB_CHAIN_ID) !== 56) fatal.push('BNB_CHAIN_ID must be 56 (or unset) on mainnet')
  if (env.JWT_SECRET && env.JWT_SECRET.length < 32) fatal.push('JWT_SECRET must be at least 32 random characters')
  if (env.ESCROW_SECRET && env.ESCROW_SECRET.length < 32) fatal.push('ESCROW_SECRET must be at least 32 random characters')
  if (env.USDC_TOKEN || env.USDT_TOKEN) fatal.push('USDC_TOKEN / USDT_TOKEN are testnet settings. Remove them on mainnet.')
  if (Number(env.SCHEDULE_DEMO_SECS || 0) > 0) fatal.push('SCHEDULE_DEMO_SECS is a testnet demo setting. Remove it on mainnet.')
  if (env.GAS_PRICE_GWEI) warn.push('GAS_PRICE_GWEI is set: Velfi will not follow the network fee')
  if (!env.APP_ORIGINS) fatal.push('APP_ORIGINS must list the app\'s https origins (CORS)')
  else if (/localhost|ngrok|http:\/\//.test(env.APP_ORIGINS)) warn.push('APP_ORIGINS includes a local or http origin')
  if (!env.VELFI_AGENT_KEY) warn.push('VELFI_AGENT_KEY not set: the gas wallet key also sends scheduled payments. A separate key is safer.')
  else if (env.VELFI_AGENT_KEY === env.VELFI_GAS_KEY) warn.push('VELFI_AGENT_KEY is the same as the gas wallet key')
  return { fatal, warn }
}
