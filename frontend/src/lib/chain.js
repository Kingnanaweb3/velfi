// Solana settings for the app, from Vite env (see .env.example).
export const CLUSTER = import.meta.env.VITE_SOLANA_CLUSTER || 'devnet'
export const RPC_URL = import.meta.env.VITE_SOLANA_RPC_URL || (CLUSTER === 'mainnet-beta' ? 'https://api.mainnet-beta.solana.com' : `https://api.${CLUSTER}.solana.com`)
const q = CLUSTER === 'mainnet-beta' ? '' : `?cluster=${CLUSTER}`
export const explorerTx = (sig) => `https://solscan.io/tx/${sig}${q}`
export const explorerAddress = (a) => `https://solscan.io/account/${a}${q}`
export const EXPLORER_NAME = 'Solscan'

export function b64ToBytes(b64) {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
export function bytesToB64(bytes) {
  let bin = ''
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000))
  return btoa(bin)
}
