import { SuiClient, getFullnodeUrl } from '@mysten/sui.js/client'
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519'
import { decodeSuiPrivateKey } from '@mysten/sui.js/cryptography'
import dotenv from 'dotenv'
dotenv.config()

export const provider = new SuiClient({ url: getFullnodeUrl('testnet') })

export function getDeployerKeypair() {
  const pk = process.env.DEPLOYER_PRIVATE_KEY
  if (!pk) throw new Error('DEPLOYER_PRIVATE_KEY not set')

  // Sui bech32: suiprivkey1...
  if (pk.startsWith('suiprivkey')) {
    const { secretKey } = decodeSuiPrivateKey(pk)
    return Ed25519Keypair.fromSecretKey(secretKey)
  }
  // hex, 32 bytes (optional 0x)
  const hex = pk.startsWith('0x') ? pk.slice(2) : pk
  if (/^[0-9a-fA-F]{64}$/.test(hex)) {
    return Ed25519Keypair.fromSecretKey(Buffer.from(hex, 'hex'))
  }
  // base64: 33 bytes (flag+key) or 32 raw
  const raw = Buffer.from(pk, 'base64')
  const keyBytes = raw.length === 33 ? raw.subarray(1) : raw
  if (keyBytes.length !== 32)
    throw new Error(`Unrecognized DEPLOYER_PRIVATE_KEY format (decoded ${keyBytes.length} bytes)`)
  return Ed25519Keypair.fromSecretKey(keyBytes)
}

export async function getSuiBalance(address) {
  try {
    const balance = await provider.getBalance({ owner: address, coinType: '0x2::sui::SUI' })
    return Number(balance.totalBalance) / 1_000_000_000
  } catch {
    return 0
  }
}
