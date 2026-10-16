// Solana connection, Velfi's server keys, and the two ways a transaction is sent:
//  - prepareForUser: Velfi builds it, pays the fee (co-signs as fee payer), and
//    hands it to the user's wallet to sign. Nothing moves without the user.
//  - sendAsServer: Velfi's agent key signs alone, used only for Autopilot
//    payments the user pre-approved through an on-chain mandate.
import crypto from 'node:crypto'
import {
  Connection, Keypair, PublicKey, Transaction, TransactionInstruction, VersionedTransaction,
  SystemProgram, ComputeBudgetProgram, clusterApiUrl, LAMPORTS_PER_SOL,
} from '@solana/web3.js'
import {
  getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import dotenv from 'dotenv'
import { decode as b58decode } from './chain/base58.js'
import { flowSeeds } from './chain/velfiProgram.js'
dotenv.config()

export const CLUSTER = process.env.SOLANA_CLUSTER || 'devnet'
export const connection = new Connection(process.env.SOLANA_RPC_URL || clusterApiUrl(CLUSTER), 'confirmed')
export { PublicKey, SystemProgram, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, LAMPORTS_PER_SOL }

export function programId() {
  if (!process.env.VELFI_PROGRAM_ID) throw new Error('VELFI_PROGRAM_ID not set')
  return new PublicKey(process.env.VELFI_PROGRAM_ID)
}

// Secret keys may be a JSON byte array (solana-keygen format) or base58.
export function loadKeypair(envName) {
  const raw = process.env[envName]
  if (!raw) throw new Error(`${envName} not set`)
  const bytes = raw.trim().startsWith('[') ? Uint8Array.from(JSON.parse(raw)) : b58decode(raw.trim())
  if (bytes.length !== 64) throw new Error(`${envName} must be a 64-byte secret key`)
  return Keypair.fromSecretKey(bytes)
}
let _feePayer, _agent
export const feePayer = () => (_feePayer ||= loadKeypair('VELFI_FEE_PAYER_KEY'))
// The Autopilot agent may be the same key as the fee payer, but keeping them apart is safer.
export const agent = () => (_agent ||= process.env.VELFI_AGENT_KEY ? loadKeypair('VELFI_AGENT_KEY') : feePayer())

export function explorerTx(sig) {
  return `https://solscan.io/tx/${sig}${CLUSTER === 'mainnet-beta' ? '' : `?cluster=${CLUSTER}`}`
}
export function explorerAddress(a) {
  return `https://solscan.io/account/${a}${CLUSTER === 'mainnet-beta' ? '' : `?cluster=${CLUSTER}`}`
}

export const pk = (a) => (a instanceof PublicKey ? a : new PublicKey(a))

export function flowAddress(kind, owner, id) {
  return PublicKey.findProgramAddressSync(flowSeeds(kind, String(owner), id), programId())[0]
}

// Which token program owns this mint (classic SPL or Token-2022). Cached.
const _tokenProgram = new Map()
export async function tokenProgramFor(mint) {
  const key = String(mint)
  if (!_tokenProgram.has(key)) {
    const info = await connection.getAccountInfo(pk(mint))
    if (!info) throw new Error(`Token mint ${key} not found on ${CLUSTER}`)
    _tokenProgram.set(key, info.owner.equals(TOKEN_2022_PROGRAM_ID) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID)
  }
  return _tokenProgram.get(key)
}

export function ata(mint, owner, tokenProgram = TOKEN_PROGRAM_ID) {
  return getAssociatedTokenAddressSync(pk(mint), pk(owner), true, tokenProgram, ASSOCIATED_TOKEN_PROGRAM_ID)
}

// Plain {programId, keys, data} from chain/velfiProgram.js -> web3 instruction.
export function toIx(plain) {
  return new TransactionInstruction({
    programId: pk(plain.programId),
    keys: plain.keys.map(k => ({ pubkey: pk(k.pubkey), isSigner: k.isSigner, isWritable: k.isWritable })),
    data: Buffer.from(plain.data),
  })
}

// Payment instructions. The fee payer covers the recipient's token-account rent.
export async function transferIxs({ from, to, token, amountUnits }) {
  if (token.mint === 'native') {
    return [SystemProgram.transfer({ fromPubkey: pk(from), toPubkey: pk(to), lamports: BigInt(amountUnits) })]
  }
  const tp = await tokenProgramFor(token.mint)
  const toAta = ata(token.mint, to, tp)
  return [
    createAssociatedTokenAccountIdempotentInstruction(feePayer().publicKey, toAta, pk(to), pk(token.mint), tp, ASSOCIATED_TOKEN_PROGRAM_ID),
    createTransferCheckedInstruction(ata(token.mint, from, tp), pk(token.mint), toAta, pk(from), BigInt(amountUnits), token.decimals, [], tp),
  ]
}

const priority = () => ComputeBudgetProgram.setComputeUnitPrice({ microLamports: Number(process.env.PRIORITY_MICROLAMPORTS || 1000) })
export const messageHash = (tx) => crypto.createHash('sha256').update(tx.serializeMessage()).digest('hex')

// Build a tx for the user's wallet to sign. Velfi signs first as fee payer, so the
// user cannot alter it without breaking that signature.
export async function prepareForUser(instructions, extraSigners = []) {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
  const tx = new Transaction({ feePayer: feePayer().publicKey, blockhash, lastValidBlockHeight })
  tx.add(priority(), ...instructions)
  tx.partialSign(feePayer(), ...extraSigners)
  return {
    tx: tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64'),
    messageHash: messageHash(tx),
    lastValidBlockHeight,
  }
}

// Accept the user's signed version only if it is byte-for-byte what we prepared.
export async function submitUserSigned(base64, expectedHash) {
  const raw = Buffer.from(String(base64), 'base64')
  const tx = Transaction.from(raw)
  if (messageHash(tx) !== expectedHash) throw new Error('This transaction does not match what you approved.')
  if (!tx.verifySignatures()) throw new Error('The transaction is missing a signature.')
  const signature = await connection.sendRawTransaction(raw, { skipPreflight: false, maxRetries: 3 })
  await confirm(signature, tx.recentBlockhash)
  return signature
}

// For Jupiter swaps: a versioned transaction the user signs (we don't co-sign).
export function versionedHash(base64) {
  const vtx = VersionedTransaction.deserialize(Buffer.from(String(base64), 'base64'))
  return crypto.createHash('sha256').update(vtx.message.serialize()).digest('hex')
}
export async function submitVersioned(base64, expectedHash) {
  const raw = Buffer.from(String(base64), 'base64')
  const vtx = VersionedTransaction.deserialize(raw)
  if (versionedHash(base64) !== expectedHash) throw new Error('This swap does not match what you approved.')
  const signature = await connection.sendRawTransaction(raw, { maxRetries: 3 })
  await confirm(signature, vtx.message.recentBlockhash)
  return signature
}

async function confirm(signature, blockhash) {
  const { lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
  const res = await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed')
  if (res.value.err) throw new Error(`Transaction failed on-chain: ${JSON.stringify(res.value.err)}`)
}

// Server-signed (Autopilot under a mandate, or claiming an invite). Serialized so
// two payouts from the same key never race each other.
let _chain = Promise.resolve()
export function sendAsServer(instructions, signers = []) {
  const run = async () => {
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
    const tx = new Transaction({ feePayer: feePayer().publicKey, blockhash, lastValidBlockHeight })
    tx.add(priority(), ...instructions)
    const uniq = [feePayer(), ...signers].filter((k, i, a) => a.findIndex(x => x.publicKey.equals(k.publicKey)) === i)
    tx.sign(...uniq)
    const signature = await connection.sendRawTransaction(tx.serialize(), { maxRetries: 3 })
    await confirm(signature, blockhash)
    return signature
  }
  const result = _chain.then(run)
  _chain = result.then(() => {}, () => {})
  return result
}

// Raw balances: SOL plus every token account (classic and Token-2022).
export async function rawBalances(owner) {
  const o = pk(owner)
  const [lamports, classic, t22] = await Promise.all([
    connection.getBalance(o),
    connection.getParsedTokenAccountsByOwner(o, { programId: TOKEN_PROGRAM_ID }),
    connection.getParsedTokenAccountsByOwner(o, { programId: TOKEN_2022_PROGRAM_ID }).catch(() => ({ value: [] })),
  ])
  const out = [{ mint: 'native', units: BigInt(lamports), decimals: 9 }]
  const byMint = new Map()
  for (const { account } of [...classic.value, ...t22.value]) {
    const info = account.data.parsed?.info
    if (!info) continue
    const prev = byMint.get(info.mint)
    const units = BigInt(info.tokenAmount.amount)
    byMint.set(info.mint, { mint: info.mint, units: (prev?.units || 0n) + units, decimals: info.tokenAmount.decimals })
  }
  return out.concat([...byMint.values()])
}

export async function getSolBalance(owner) {
  return (await connection.getBalance(pk(owner))) / LAMPORTS_PER_SOL
}
