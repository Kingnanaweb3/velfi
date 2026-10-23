// BNB Chain settings for the app, from Vite env (see .env.example).
// testnet while testing, mainnet for launch (must match the backend's BNB_NETWORK).
import { bsc, bscTestnet } from 'viem/chains'

export const NETWORK = import.meta.env.VITE_BNB_NETWORK || 'testnet'
export const IS_MAINNET = NETWORK === 'mainnet'
export const CHAIN = IS_MAINNET ? bsc : bscTestnet
export const CHAIN_ID = CHAIN.id
// Kept for older code: the network name.
export const CLUSTER = NETWORK
const SCAN = IS_MAINNET ? 'https://bscscan.com' : 'https://testnet.bscscan.com'
export const explorerTx = (hash) => `${SCAN}/tx/${hash}`
export const explorerAddress = (a) => `${SCAN}/address/${a}`
export const EXPLORER_NAME = 'BscScan'
