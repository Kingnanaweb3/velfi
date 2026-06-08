import { SuiClient, getFullnodeUrl } from '@mysten/sui.js/client'
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519'
import dotenv from 'dotenv'
dotenv.config()

export const provider = new SuiClient({ url: getFullnodeUrl('testnet') })

export function getDeployerKeypair() {
  const privateKeyB64 = process.env.DEPLOYER_PRIVATE_KEY
  if (!privateKeyB64) throw new Error('DEPLOYER_PRIVATE_KEY not set')
  const raw = Buffer.from(privateKeyB64, 'base64')
  const keyBytes = raw.length === 33 ? raw.slice(1) : raw
  return Ed25519Keypair.fromSecretKey(keyBytes)
}

export async function getSuiBalance(address) {
  try {
    const balance = await provider.getBalance({
      owner: address,
      coinType: '0x2::sui::SUI'
    })
    return Number(balance.totalBalance) / 1_000_000_000
  } catch {
    return 0
  }
}
