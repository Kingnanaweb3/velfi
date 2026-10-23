// Prints a fresh wallet: an address and its private key (64 hex characters).
// Run:  node scripts/new-wallet.mjs
// Paste the key into .env or Railway. Keep it secret: anyone with it controls the wallet.
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
const key = generatePrivateKey()
console.log(`address: ${privateKeyToAccount(key).address}`)
console.log(`key:     ${key}`)
