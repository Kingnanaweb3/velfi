// Start-up checks. On mainnet a missing or weak setting stops the server instead
// of failing later with real money in flight. Pure: tested directly.
export function startupProblems(env) {
  const fatal = [], warn = []
  const mainnet = (env.SOLANA_CLUSTER || 'devnet') === 'mainnet-beta'
  const need = ['VELFI_FEE_PAYER_KEY', 'JWT_SECRET', 'ESCROW_SECRET', 'PRIVY_APP_ID', 'PRIVY_APP_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']
  for (const k of need) if (!env[k]) (mainnet ? fatal : warn).push(`${k} is not set`)
  if (!mainnet) return { fatal, warn }

  if (!env.SOLANA_RPC_URL || /api\.mainnet-beta\.solana\.com/.test(env.SOLANA_RPC_URL))
    fatal.push('SOLANA_RPC_URL must be a paid RPC (Helius, Triton, QuickNode...). The public endpoint rate-limits and drops transactions.')
  if (env.JWT_SECRET && env.JWT_SECRET.length < 32) fatal.push('JWT_SECRET must be at least 32 random characters')
  if (env.ESCROW_SECRET && env.ESCROW_SECRET.length < 32) fatal.push('ESCROW_SECRET must be at least 32 random characters')
  if (env.USDC_MINT && env.USDC_MINT !== 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v') fatal.push('USDC_MINT overrides mainnet USDC. Remove it.')
  if (Number(env.SCHEDULE_DEMO_SECS || 0) > 0) fatal.push('SCHEDULE_DEMO_SECS is a devnet demo setting. Remove it on mainnet.')
  if (!env.APP_ORIGINS) fatal.push('APP_ORIGINS must list the app\'s https origins (CORS)')
  else if (/localhost|ngrok|http:\/\//.test(env.APP_ORIGINS)) warn.push('APP_ORIGINS includes a local or http origin')
  if (!env.VELFI_AGENT_KEY) warn.push('VELFI_AGENT_KEY not set: the fee payer key also signs scheduled payments. A separate key is safer.')
  else if (env.VELFI_AGENT_KEY === env.VELFI_FEE_PAYER_KEY) warn.push('VELFI_AGENT_KEY is the same as the fee payer key')
  return { fatal, warn }
}
