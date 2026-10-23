// BNB Chain (BSC): the connection, Velfi's server wallets, and the two ways a
// transaction is sent.
//  - prepareForUser: Velfi builds the transactions for the user's own wallet to
//    sign. Nothing moves without the user. BNB has no "fee payer" field like
//    Solana, so Velfi covers the network fee with a gas drop: right before
//    sending, if the user's wallet holds less BNB than the fee, Velfi's gas
//    wallet sends exactly the missing amount, then broadcasts what the user signed.
//  - sendAsServer: Velfi's own keys sign alone. Used only for Autopilot payments
//    the user pre-approved (an ERC-20 allowance) and for moving email-invite
//    money to its recipient or back. Those keys get their gas from the gas wallet.
import {
  createPublicClient, createWalletClient, http, defineChain, encodeFunctionData, erc20Abi,
  parseTransaction, recoverTransactionAddress, formatEther, parseGwei,
  bytesToHex, hexToBytes, toHex,
} from 'viem'
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import dotenv from 'dotenv'
import { isEvmAddress, norm, sameAddress } from './chain/evm.js'
dotenv.config()

// mainnet | testnet. BNB_CHAIN_ID is only for local test chains.
export const NETWORK = process.env.BNB_NETWORK || 'testnet'
export const IS_MAINNET = NETWORK === 'mainnet'
const DEFAULTS = {
  mainnet: { id: 56, name: 'BNB Smart Chain', rpc: 'https://bsc-dataseed.bnbchain.org', explorer: 'https://bscscan.com' },
  testnet: { id: 97, name: 'BNB Smart Chain Testnet', rpc: 'https://data-seed-prebsc-1-s1.bnbchain.org:8545', explorer: 'https://testnet.bscscan.com' },
}
const D = DEFAULTS[NETWORK] || DEFAULTS.testnet
export const CHAIN_ID = Number(process.env.BNB_CHAIN_ID || D.id)
export const RPC_URL = process.env.BNB_RPC_URL || D.rpc
export const EXPLORER = D.explorer
export const chain = defineChain({
  id: CHAIN_ID, name: D.name,
  nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
})
export const client = createPublicClient({ chain, transport: http(RPC_URL, { retryCount: 2 }) })
const wallet = createWalletClient({ chain, transport: http(RPC_URL, { retryCount: 2 }) })

// Kept for older code: the chain name shown in /health and /account.
export const CLUSTER = NETWORK
// BNB v1 is lite mode only: no custom contract, nothing to deploy.
export const PROGRAM_ENABLED = false
export const MODE = 'lite'

// ── addresses and keys ─────────────────────────────────────────────────────
export { isEvmAddress, norm, sameAddress }

// A private key as 64 hex characters, with or without 0x.
export function loadKey(envName) {
  const raw = String(process.env[envName] || '').trim()
  if (!raw) throw new Error(`${envName} not set`)
  const hex = raw.startsWith('0x') ? raw : `0x${raw}`
  if (!/^0x[0-9a-fA-F]{64}$/.test(hex)) throw new Error(`${envName} must be a 64-character hex private key`)
  return privateKeyToAccount(hex)
}
let _gas, _agent
// The gas wallet pays every network fee Velfi covers. Only it needs BNB.
export const feePayer = () => (_gas ||= loadKey('VELFI_GAS_KEY'))
// The Autopilot agent: the only address users approve to spend for schedules.
export const agent = () => (_agent ||= process.env.VELFI_AGENT_KEY ? loadKey('VELFI_AGENT_KEY') : feePayer())
export const feePayerAddress = () => feePayer().address
export const agentAddress = () => agent().address

// One-off claim wallets for email invites.
export function newClaimWallet() {
  const key = generatePrivateKey()
  return { address: privateKeyToAccount(key).address, secretKey: hexToBytes(key) }
}
export const claimAccount = (secretKey) => privateKeyToAccount(bytesToHex(secretKey))

export const explorerTx = (hash) => `${EXPLORER}/tx/${hash}`
export const explorerAddress = (a) => `${EXPLORER}/address/${a}`

// ── calls: what a transaction does ({ to, data, value }) ───────────────────
const NATIVE = 'native'
const call = (to, data = '0x', value = 0n) => ({ to: norm(to), data, value: BigInt(value) })

// A payment. `authority` is who sends it: the owner themselves, or Velfi's agent
// spending an allowance the owner approved (schedules). Returns { ixs, newAccounts }:
// BNB has no token accounts to open, so newAccounts is always 0.
export async function transferIxs({ from, to, token, amountUnits, authority = from }) {
  const units = BigInt(amountUnits)
  if (units <= 0n) throw new Error('Amount must be greater than zero.')
  if (token.mint === NATIVE) {
    if (!sameAddress(authority, from)) throw new Error('Scheduled payments work with USDC and USDT, not BNB.')
    return { ixs: [call(to, '0x', units)], newAccounts: 0 }
  }
  const data = sameAddress(authority, from)
    ? encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [norm(to), units] })
    : encodeFunctionData({ abi: erc20Abi, functionName: 'transferFrom', args: [norm(from), norm(to), units] })
  return { ixs: [call(token.mint, data)], newAccounts: 0 }
}

// Let Velfi's agent spend up to `amountUnits` of the user's token (schedules).
// One allowance per token, so callers pass the total for all of the user's
// active schedules in that token. 0 removes the permission.
export async function allowanceIxs({ owner, token, amountUnits }) {
  if (token.mint === NATIVE) throw new Error('Scheduling works with USDC and USDT, not BNB.')
  return [call(token.mint, encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [agentAddress(), BigInt(amountUnits)] }))]
}

export async function tokenUnits(tokenAddress, owner) {
  return client.readContract({ address: norm(tokenAddress), abi: erc20Abi, functionName: 'balanceOf', args: [norm(owner)] })
}
export async function allowanceOf(tokenAddress, owner, spender = agentAddress()) {
  return client.readContract({ address: norm(tokenAddress), abi: erc20Abi, functionName: 'allowance', args: [norm(owner), norm(spender)] })
}

// Move everything out of a claim wallet (email invite).
export async function sweepClaimWalletIxs({ claimWallet, to, token }) {
  const units = await tokenUnits(token.mint, claimWallet)
  const { ixs } = units > 0n ? await transferIxs({ from: claimWallet, to, token, amountUnits: units }) : { ixs: [] }
  return { ixs, units }
}

// ── fees ───────────────────────────────────────────────────────────────────
export async function gasPrice() {
  if (process.env.GAS_PRICE_GWEI) return parseGwei(String(process.env.GAS_PRICE_GWEI))
  const p = await client.getGasPrice()
  return (p * 11n) / 10n // 10% over the node's suggestion so it isn't skipped
}

async function estimate(from, c) {
  try {
    const g = await client.estimateGas({ account: norm(from), to: c.to, data: c.data, value: c.value })
    return (g * 12n) / 10n + 5_000n // headroom: an estimate is not a promise
  } catch (e) { throw readable(e) }
}

let _gasCache = { at: 0, wei: 0n }
export async function feePayerWei() {
  if (Date.now() - _gasCache.at > 60_000) _gasCache = { at: Date.now(), wei: await client.getBalance({ address: feePayer().address }) }
  return _gasCache.wei
}
export async function getNativeBalance(owner) {
  return Number(formatEther(await client.getBalance({ address: norm(owner) })))
}

// Send `wei` from the gas wallet to `to` and wait until it lands. Serialized
// with every other server send, so the gas wallet's nonces never collide.
async function sendFromGasWallet(to, wei) {
  const hash = await wallet.sendTransaction({ account: feePayer(), to: norm(to), value: wei, gasPrice: await gasPrice(), chain })
  await mustSucceed(hash)
  _gasCache.at = 0
  return hash
}

async function mustSucceed(hash) {
  const r = await client.waitForTransactionReceipt({ hash, timeout: 90_000 })
  if (r.status !== 'success') throw new Error(`Transaction failed on-chain (${hash}).`)
  return r
}

// ── the user signs ─────────────────────────────────────────────────────────
// Build the transactions for the user's wallet. Several calls become several
// transactions with consecutive nonces, all approved with one slide.
// Returns { tx: [...for the wallet], messageHash: what /approve checks against }.
export async function prepareForUser(calls, userAddress) {
  if (!userAddress) throw new Error('prepareForUser needs the user address')
  if (!calls?.length) throw new Error('Nothing to send.')
  const from = norm(userAddress)
  const [price, nonce] = await Promise.all([gasPrice(), client.getTransactionCount({ address: from, blockTag: 'pending' })])
  const txs = []
  for (let i = 0; i < calls.length; i++) {
    const c = calls[i]
    txs.push({ to: c.to, data: c.data, value: c.value, nonce: nonce + i, gas: await estimate(from, c), gasPrice: price, chainId: CHAIN_ID })
  }
  const fee = txs.reduce((s, t) => s + t.gas * t.gasPrice, 0n)
  const expected = { from, txs: txs.map(t => ({ ...t, value: t.value.toString(), gas: t.gas.toString(), gasPrice: t.gasPrice.toString() })) }
  return {
    tx: txs.map(t => ({ from, to: t.to, data: t.data, value: toHex(t.value), nonce: toHex(t.nonce), gas: toHex(t.gas), gasPrice: toHex(t.gasPrice), chainId: CHAIN_ID, type: 'legacy' })),
    messageHash: JSON.stringify(expected),
    feeWei: fee.toString(),
  }
}

// Check what the wallet signed is exactly what we prepared (same sender, target,
// data, amount, nonce and chain; fees no higher than allowed). Returns the parsed
// transactions with their cost.
export async function verifySigned(signed, expectedJson) {
  const expected = JSON.parse(expectedJson)
  const list = Array.isArray(signed) ? signed : [signed]
  if (list.length !== expected.txs.length) throw new Error('This transaction does not match what you approved.')
  const out = []
  for (let i = 0; i < list.length; i++) {
    const raw = String(list[i])
    if (!/^0x[0-9a-fA-F]+$/.test(raw)) throw new Error('This transaction does not match what you approved.')
    const e = expected.txs[i]
    let p, signer
    try { p = parseTransaction(raw); signer = await recoverTransactionAddress({ serializedTransaction: raw }) }
    catch { throw new Error('The transaction is missing a signature.') }
    // What it will actually pay per gas. On BNB Chain the base fee is 0, so for the
    // newer transaction type that is the smaller of maxFeePerGas and the priority fee.
    const fee = p.gasPrice ?? p.maxFeePerGas ?? 0n
    const pays = p.gasPrice ?? (p.maxPriorityFeePerGas < p.maxFeePerGas ? p.maxPriorityFeePerGas : p.maxFeePerGas) ?? 0n
    // Name exactly what differs (safe to show: no secrets), so a wallet quirk is easy to spot.
    const diff = []
    if (!sameAddress(signer, expected.from)) diff.push('signed by another wallet')
    if (!sameAddress(p.to, e.to)) diff.push('recipient')
    if (String(p.data || '0x').toLowerCase() !== String(e.data).toLowerCase()) diff.push('payment details')
    if ((p.value ?? 0n) !== BigInt(e.value)) diff.push('amount')
    if (Number(p.nonce) !== Number(e.nonce)) diff.push(`nonce ${p.nonce} (want ${e.nonce})`)
    if (Number(p.chainId) !== Number(e.chainId)) diff.push(`network ${p.chainId ?? 'none'} (want ${e.chainId})`)
    if (p.gas > BigInt(e.gas) * 2n) diff.push(`gas limit ${p.gas} (max ${BigInt(e.gas) * 2n})`)
    if (fee > BigInt(e.gasPrice) * 2n) diff.push(`gas price ${fee} wei (max ${BigInt(e.gasPrice) * 2n})`)
    // Too little gas and the network ignores it (a 0 fee is even routed to a sponsor check).
    if (pays * 10n < BigInt(e.gasPrice) * 9n) diff.push(`gas price too low: ${pays} wei (need ${BigInt(e.gasPrice)})`)
    if (diff.length) {
      console.error('signed tx mismatch:', diff.join(', '), `type ${p.type}`)
      throw new Error(`This transaction does not match what you approved (${diff.join(', ')}).`)
    }
    out.push({ raw, value: p.value ?? 0n, cost: p.gas * fee, nonce: Number(p.nonce) })
  }
  return { from: expected.from, txs: out }
}

// How much BNB the user is short of for these signed transactions (fees only;
// the value they send must already be theirs).
export async function gasShortfall(from, txs) {
  const balance = await client.getBalance({ address: from })
  const value = txs.reduce((s, t) => s + t.value, 0n)
  const need = value + txs.reduce((s, t) => s + t.cost, 0n)
  if (balance < value) throw new Error("There isn't enough in your wallet for this right now.")
  return balance >= need ? 0n : need - balance
}

// Send what the user signed. `allowDrop(wei)` decides whether Velfi may cover a
// fee shortfall (daily caps). Sends in nonce order and waits for each, so a later
// one never runs if an earlier one failed. Returns { hash, hashes, dropWei }.
export async function submitUserSigned(signed, expectedJson, { allowDrop = () => true } = {}) {
  const { from, txs } = await verifySigned(signed, expectedJson)
  const next = await client.getTransactionCount({ address: from, blockTag: 'pending' })
  if (next !== txs[0].nonce) throw new Error('This approval took too long and expired. Slide again and it will go through.')
  const short = await gasShortfall(from, txs)
  if (short > 0n) {
    if (!allowDrop(short)) throw new Error('Velfi has covered a lot of network fees for you today. Try again tomorrow. Nothing was sent.')
    await serverQueue(() => sendFromGasWallet(from, short))
  }
  const hashes = []
  try {
    for (const t of txs) {
      const hash = await client.sendRawTransaction({ serializedTransaction: t.raw })
      hashes.push(hash)
      await mustSucceed(hash)
    }
  } catch (e) {
    if (hashes.length > 1 || (hashes.length === 1 && txs.length > 1)) {
      const err = readable(e); err.message = `${err.message} ${hashes.length - 1} of ${txs.length} went through before this.`; throw err
    }
    throw readable(e)
  }
  return { hash: hashes[hashes.length - 1], hashes, dropWei: short }
}

// Turn common failures into sentences people understand.
export function readable(e) {
  const m = String(e?.shortMessage || e?.details || e?.message || e)
  if (/nonce too low|nonce has already been used|already known/i.test(m)) return new Error('This approval took too long and expired. Slide again and it will go through.')
  if (/insufficient funds|exceeds balance|transfer amount exceeds/i.test(m)) return new Error("There isn't enough in your wallet for this right now.")
  if (/allowance|insufficient-allowance/i.test(m)) return new Error("Velfi isn't allowed to spend that any more. The approval may have been removed.")
  return e instanceof Error ? e : new Error(m)
}

// ── Velfi signs (schedules, invites) ───────────────────────────────────────
// Every server send goes through one queue so nonces never race.
let _chain = Promise.resolve()
function serverQueue(run) {
  const result = _chain.then(run)
  _chain = result.then(() => {}, () => {})
  return result
}

// `signer` is a viem account: agent() or a claim wallet. It pays its own fee; if
// it holds too little BNB, the gas wallet tops it up first (the agent gets enough
// for many payments at once, a claim wallet exactly enough for this one).
export function sendAsServer(calls, signer = feePayer()) {
  return serverQueue(async () => {
    if (!calls?.length) throw new Error('Nothing to send.')
    const price = await gasPrice()
    const gases = []
    for (const c of calls) gases.push(await estimate(signer.address, c))
    const need = gases.reduce((s, g) => s + g * price, 0n) + calls.reduce((s, c) => s + c.value, 0n)
    if (!sameAddress(signer.address, feePayer().address)) {
      const have = await client.getBalance({ address: signer.address })
      if (have < need) {
        const isAgent = sameAddress(signer.address, agentAddress())
        await sendFromGasWallet(signer.address, isAgent ? need * 20n - have : need - have)
      }
    }
    let nonce = await client.getTransactionCount({ address: signer.address, blockTag: 'pending' })
    let last
    for (let i = 0; i < calls.length; i++) {
      const c = calls[i]
      try {
        last = await wallet.sendTransaction({ account: signer, to: c.to, data: c.data, value: c.value, gas: gases[i], gasPrice: price, nonce: nonce++, chain })
      } catch (e) { throw readable(e) }
      await mustSucceed(last)
    }
    return last
  })
}

// ── balances ───────────────────────────────────────────────────────────────
// BNB plus every token Velfi knows. EVM has no "list my tokens" call, so only
// recognized tokens are read.
export async function rawBalances(owner, tokens = []) {
  const o = norm(owner)
  const list = tokens.filter(t => t.mint !== NATIVE)
  const [wei, ...units] = await Promise.all([
    client.getBalance({ address: o }),
    ...list.map(t => tokenUnits(t.mint, o).catch(() => 0n)),
  ])
  return [{ mint: NATIVE, units: wei, decimals: 18 }, ...list.map((t, i) => ({ mint: t.mint, units: units[i], decimals: t.decimals }))]
}

// On start: check each token address really is that token (right decimals).
export async function checkTokens(tokens) {
  const bad = []
  for (const t of tokens.filter(x => x.mint !== NATIVE)) {
    try {
      const d = await client.readContract({ address: t.mint, abi: erc20Abi, functionName: 'decimals' })
      if (Number(d) !== t.decimals) bad.push(`${t.symbol} at ${t.mint} has ${d} decimals, expected ${t.decimals}`)
    } catch (e) { bad.push(`${t.symbol} at ${t.mint} could not be read: ${String(e.shortMessage || e.message).slice(0, 80)}`) }
  }
  return bad
}
