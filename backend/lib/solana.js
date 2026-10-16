// Solana connection, Velfi's server keys, and the two ways a transaction is sent:
//  - prepareForUser: Velfi builds it, pays the fee (co-signs as fee payer), and
//    hands it to the user's wallet to sign. Nothing moves without the user.
//  - sendAsServer: Velfi's own keys sign alone. Used only for Autopilot payments
//    the user pre-approved (an allowance in lite mode, a mandate with the
//    program) and for moving email-invite money to its recipient or back.
import crypto from 'node:crypto'
import {
  Connection, Keypair, PublicKey, Transaction, TransactionInstruction, VersionedTransaction,
  SystemProgram, ComputeBudgetProgram, clusterApiUrl, LAMPORTS_PER_SOL,
} from '@solana/web3.js'
import {
  getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction, createApproveCheckedInstruction, createRevokeInstruction, createCloseAccountInstruction,
  TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import dotenv from 'dotenv'
import { decode as b58decode } from './chain/base58.js'
import { flowSeeds } from './chain/velfiProgram.js'
dotenv.config()

export const CLUSTER = process.env.SOLANA_CLUSTER || 'devnet'
export const connection = new Connection(process.env.SOLANA_RPC_URL || clusterApiUrl(CLUSTER), 'confirmed')
export { PublicKey, SystemProgram, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, LAMPORTS_PER_SOL }

// Lite mode (mainnet v1): no custom program. Velfi uses only Solana's built-in
// System and Token programs. Setting VELFI_PROGRAM_ID turns on the full program.
export const PROGRAM_ENABLED = !!process.env.VELFI_PROGRAM_ID
export const MODE = PROGRAM_ENABLED ? 'program' : 'lite'

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

// A brand-new Solana wallet must receive at least this much SOL to exist.
export const MIN_NEW_WALLET_LAMPORTS = 890_880n

// Payment instructions. The fee payer covers the recipient's token-account rent,
// and only when that account doesn't exist yet. Returns { ixs, newAccounts }.
// `authority` signs for the debit: the sender, or Velfi's agent acting as an
// approved delegate for a schedule.
export async function transferIxs({ from, to, token, amountUnits, authority = from }) {
  if (token.mint === 'native') {
    if (BigInt(amountUnits) < MIN_NEW_WALLET_LAMPORTS && (await connection.getBalance(pk(to))) === 0)
      throw new Error('That wallet is brand new, so the first SOL sent to it must be at least 0.001 SOL.')
    return { ixs: [SystemProgram.transfer({ fromPubkey: pk(from), toPubkey: pk(to), lamports: BigInt(amountUnits) })], newAccounts: 0 }
  }
  const tp = await tokenProgramFor(token.mint)
  const toAta = ata(token.mint, to, tp)
  const exists = !!(await connection.getAccountInfo(toAta))
  const ixs = []
  if (!exists) ixs.push(createAssociatedTokenAccountIdempotentInstruction(feePayer().publicKey, toAta, pk(to), pk(token.mint), tp, ASSOCIATED_TOKEN_PROGRAM_ID))
  ixs.push(createTransferCheckedInstruction(ata(token.mint, from, tp), pk(token.mint), toAta, pk(authority), BigInt(amountUnits), token.decimals, [], tp))
  return { ixs, newAccounts: exists ? 0 : 1 }
}

// Let Velfi's agent spend up to `amountUnits` of the user's token (schedules).
// A token account has one allowance at a time, so callers pass the total for all
// of the user's active schedules in that token. 0 removes the allowance.
export async function allowanceIxs({ owner, token, amountUnits }) {
  const tp = await tokenProgramFor(token.mint)
  const account = ata(token.mint, owner, tp)
  if (BigInt(amountUnits) === 0n) return [createRevokeInstruction(account, pk(owner), [], tp)]
  return [createApproveCheckedInstruction(account, pk(token.mint), agent().publicKey, pk(owner), BigInt(amountUnits), token.decimals, [], tp)]
}

// Move everything out of a claim wallet (email invite) and close its token
// account, returning that rent to Velfi's fee payer. Signed by the claim key.
export async function sweepClaimWalletIxs({ claimWallet, to, token }) {
  const tp = await tokenProgramFor(token.mint)
  const from = ata(token.mint, claimWallet, tp)
  const bal = await connection.getTokenAccountBalance(from).catch(() => null)
  const units = BigInt(bal?.value?.amount || 0)
  const { ixs } = units > 0n ? await transferIxs({ from: claimWallet, to, token, amountUnits: units }) : { ixs: [] }
  ixs.push(createCloseAccountInstruction(from, feePayer().publicKey, pk(claimWallet), [], tp))
  return { ixs, units }
}

// Velfi's fee payer must never run dry mid-launch: callers check this first.
let _fpCache = { at: 0, lamports: 0 }
export async function feePayerLamports() {
  if (Date.now() - _fpCache.at > 60_000) _fpCache = { at: Date.now(), lamports: await connection.getBalance(feePayer().publicKey) }
  return _fpCache.lamports
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
  try {
    const signature = await connection.sendRawTransaction(raw, { skipPreflight: false, maxRetries: 3 })
    await confirm(signature, tx.recentBlockhash)
    return signature
  } catch (e) { throw readable(e) }
}

// Turn common Solana failures into sentences people understand.
export function readable(e) {
  const m = String(e?.message || e)
  if (/blockhash not found|block height exceeded|expired/i.test(m)) return new Error('This approval took too long and expired. Slide again and it will go through.')
  if (/insufficient (funds|lamports)|0x1\b|custom program error: 0x1\b/i.test(m)) return new Error("There isn't enough in your wallet for this right now.")
  if (/owner does not match|0x4\b/i.test(m)) return new Error("Velfi isn't allowed to spend that any more. The approval may have been removed.")
  return e instanceof Error ? e : new Error(m)
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
  try {
    const signature = await connection.sendRawTransaction(raw, { maxRetries: 3 })
    await confirm(signature, vtx.message.recentBlockhash)
    return signature
  } catch (e) { throw readable(e) }
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
