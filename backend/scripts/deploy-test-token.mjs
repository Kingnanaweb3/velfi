// TESTNET ONLY. Deploys a test USDC or USDT (18 decimals, like on BSC) with your
// gas wallet, and mints some to an address so you can try payments.
// Run from backend/:  node scripts/deploy-test-token.mjs USDC 0xYourAppWalletAddress 1000
// Then put the printed address in .env as USDC_TOKEN (or USDT_TOKEN).
import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { createPublicClient, createWalletClient, http, parseUnits, defineChain, isAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const [symbol = 'USDC', to, amount = '1000'] = process.argv.slice(2)
if ((process.env.BNB_NETWORK || 'testnet') === 'mainnet') { console.error('This is for testnet only. BNB_NETWORK is mainnet.'); process.exit(1) }
if (!to || !isAddress(to)) { console.error('Usage: node scripts/deploy-test-token.mjs USDC 0xYourWalletAddress 1000'); process.exit(1) }
const key = String(process.env.VELFI_GAS_KEY || '').trim()
if (!key) { console.error('Set VELFI_GAS_KEY in backend/.env first (and give that wallet some testnet BNB).'); process.exit(1) }

const id = Number(process.env.BNB_CHAIN_ID || 97)
const rpc = process.env.BNB_RPC_URL || 'https://data-seed-prebsc-1-s1.bnbchain.org:8545'
const chain = defineChain({ id, name: 'BSC testnet', nativeCurrency: { name: 'BNB', symbol: 'tBNB', decimals: 18 }, rpcUrls: { default: { http: [rpc] } } })
const account = privateKeyToAccount(key.startsWith('0x') ? key : `0x${key}`)
const pub = createPublicClient({ chain, transport: http(rpc) })
const wallet = createWalletClient({ account, chain, transport: http(rpc) })
const { abi, bytecode } = JSON.parse(readFileSync(new URL('../test/chain/MockToken.json', import.meta.url)))

console.log(`Deploying test ${symbol} from ${account.address} on chain ${id}...`)
const hash = await wallet.deployContract({ abi, bytecode, args: [`Test ${symbol}`, symbol.toUpperCase(), 18] })
const { contractAddress } = await pub.waitForTransactionReceipt({ hash })
const m = await wallet.writeContract({ address: contractAddress, abi, functionName: 'mint', args: [to, parseUnits(amount, 18)] })
await pub.waitForTransactionReceipt({ hash: m })
console.log(`\n${symbol.toUpperCase()}_TOKEN=${contractAddress}`)
console.log(`Minted ${amount} ${symbol.toUpperCase()} to ${to}`)
