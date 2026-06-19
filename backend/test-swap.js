import 'dotenv/config'
import { DeepBookClient } from '@mysten/deepbook-v3'
import { getFullnodeUrl, SuiClient } from '@mysten/sui/client'
import { Transaction } from '@mysten/sui/transactions'
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'

const { secretKey } = decodeSuiPrivateKey(process.env.DEPLOYER_PRIVATE_KEY)
const keypair = Ed25519Keypair.fromSecretKey(secretKey)
const address = keypair.getPublicKey().toSuiAddress()
const client = new SuiClient({ url: getFullnodeUrl('testnet') })
const db = new DeepBookClient({ address, env: 'testnet', client })

const AMOUNT = Number(process.argv[2] || 0.05)
const POOL = process.argv[3] || 'SUI_DBUSDC'

console.log('Agent address:', address)
console.log('DeepBookClient keys:', Object.keys(db))
console.log(`Trying: swap ${AMOUNT} SUI via pool ${POOL}\n`)

async function main() {
  const carrier = db.deepBook || db
  const fn = carrier.swapExactBaseForQuote?.bind(carrier)
  if (!fn) { console.error('swapExactBaseForQuote not found. carrier keys:', Object.keys(carrier)); return }
  const tx = new Transaction()
  try {
    const [baseOut, quoteOut, deepOut] = fn({ poolKey: POOL, amount: AMOUNT, deepAmount: 0, minOut: 0 })(tx)
    tx.transferObjects([baseOut, quoteOut, deepOut], address)
    const res = await client.signAndExecuteTransaction({
      signer: keypair, transaction: tx,
      options: { showEffects: true, showBalanceChanges: true },
    })
    console.log('STATUS :', res.effects?.status?.status)
    console.log('DIGEST :', res.digest)
    console.log('EXPLORER:', `https://suiscan.xyz/testnet/tx/${res.digest}`)
    console.log('BALANCE CHANGES:', JSON.stringify(res.balanceChanges, null, 2))
  } catch (e) {
    console.error('SWAP FAILED:', e.message)
  }
}
main()
