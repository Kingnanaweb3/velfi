import { TransactionBlock } from '@mysten/sui.js/transactions'
import { provider, getDeployerKeypair } from './sui.js'

const PKG = process.env.VELFI_PACKAGE_ID
const CLOCK = '0x6'
const SUI = '0x2::sui::SUI'

export function agentAddress() {
  return getDeployerKeypair().getPublicKey().toSuiAddress()
}

// native SUI send
export function buildSend(recipient, amountMist) {
  const txb = new TransactionBlock()
  const [coin] = txb.splitCoins(txb.gas, [txb.pure(amountMist)])
  txb.transferObjects([coin], txb.pure(recipient))
  return txb
}

// native SUI split to many: [{ address, amountMist }]
export function buildSplit(recipients) {
  const txb = new TransactionBlock()
  const coins = txb.splitCoins(txb.gas, recipients.map(r => txb.pure(r.amountMist)))
  recipients.forEach((r, i) => txb.transferObjects([coins[i]], txb.pure(r.address)))
  return txb
}

// guardrail: create a SUI-funded mandate
export function buildCreateMandate({ budgetMist, recipients, maxPerTxMist, agent, durationMs, coinType = SUI }) {
  const txb = new TransactionBlock()
  const [budget] = txb.splitCoins(txb.gas, [txb.pure(budgetMist)])
  txb.moveCall({
    target: `${PKG}::guardrail::create_mandate`,
    typeArguments: [coinType],
    arguments: [
      budget,
      txb.pure(recipients, 'vector<address>'),
      txb.pure(maxPerTxMist, 'u64'),
      txb.pure(agent, 'address'),
      txb.pure(durationMs, 'u64'),
      txb.object(CLOCK),
    ],
  })
  return txb
}

// guardrail: bounded release within a mandate
export function buildExecuteMandate({ mandateId, amountMist, recipient, coinType = SUI }) {
  const txb = new TransactionBlock()
  txb.moveCall({
    target: `${PKG}::guardrail::execute`,
    typeArguments: [coinType],
    arguments: [
      txb.object(mandateId),
      txb.pure(amountMist, 'u64'),
      txb.pure(recipient, 'address'),
      txb.object(CLOCK),
    ],
  })
  return txb
}

// Agent-wallet transactions are serialized through one queue so two payouts never
// grab the same coin/gas object at once (Sui locks it -> "already locked by a
// different transaction"). Each tx waits for local execution, so the next one builds
// against settled, up-to-date object versions.
let _walletChain = Promise.resolve()
function withWalletLock(fn) {
  const result = _walletChain.then(() => fn())
  _walletChain = result.then(() => {}, () => {})   // keep the queue alive on error
  return result
}

// agent signs + executes (autopilot path) — serialized, waits for settlement
export async function signAndRun(txb) {
  return withWalletLock(() => provider.signAndExecuteTransactionBlock({
    signer: getDeployerKeypair(),
    transactionBlock: txb,
    options: { showEffects: true, showObjectChanges: true },
    requestType: 'WaitForLocalExecution',
  }))
}

// serialize for user signing (assisted path)
export async function buildBytes(txb, sender) {
  txb.setSender(sender)
  return Buffer.from(await txb.build({ client: provider })).toString('base64')
}

// Composable token transfer — adds ONE transfer onto a shared txb.
// SUI splits from gas; any other coin is gathered, merged, split. amount is
// HUMAN units, scaled by token.decimals here. Hard-refuses unverified coin types.
export async function addTransfer(txb, { sender, recipient, amount, token }) {
  if (!token?.coinType || token.coinType.startsWith('TODO'))
    throw new Error(`${token?.symbol || 'That token'} isn't wired for execution yet — its coin type isn't verified.`)

  const scaled = Math.round(Number(amount) * 10 ** token.decimals)
  if (!(scaled > 0)) throw new Error('Amount must be greater than zero.')

  if (token.coinType === SUI) {
    const [coin] = txb.splitCoins(txb.gas, [txb.pure(scaled)])
    txb.transferObjects([coin], txb.pure(recipient))
    return txb
  }

  const { data: coins } = await provider.getCoins({ owner: sender, coinType: token.coinType })
  if (!coins.length) throw new Error(`No ${token.symbol} balance to send.`)
  const total = coins.reduce((s, c) => s + BigInt(c.balance), 0n)
  if (total < BigInt(scaled)) throw new Error(`Not enough ${token.symbol} to cover ${amount}.`)

  const primary = txb.object(coins[0].coinObjectId)
  if (coins.length > 1)
    txb.mergeCoins(primary, coins.slice(1).map(c => txb.object(c.coinObjectId)))
  const [part] = txb.splitCoins(primary, [txb.pure(scaled)])
  txb.transferObjects([part], txb.pure(recipient))
  return txb
}

// Multi-recipient transfer of ONE token in a single PTB. Merges the coin once,
// splits every leg from it at once (fixes per-leg re-merge of a spent coin).
export async function addMultiTransfer(txb, { sender, legs, token }) {
  if (!token?.coinType || token.coinType.startsWith('TODO'))
    throw new Error(`${token?.symbol || 'That token'} isn't wired for execution yet.`)
  const scaledLegs = legs.map(l => {
    const scaled = Math.round(Number(l.amount) * 10 ** token.decimals)
    if (!(scaled > 0)) throw new Error('Amount must be greater than zero.')
    return { recipient: l.recipient, scaled }
  })
  if (token.coinType === SUI) {
    const parts = txb.splitCoins(txb.gas, scaledLegs.map(l => txb.pure(l.scaled)))
    scaledLegs.forEach((l, i) => txb.transferObjects([parts[i]], txb.pure(l.recipient)))
    return txb
  }
  const { data: coins } = await provider.getCoins({ owner: sender, coinType: token.coinType })
  if (!coins.length) throw new Error(`No ${token.symbol} balance to send.`)
  const total = coins.reduce((s, c) => s + BigInt(c.balance), 0n)
  const need = scaledLegs.reduce((s, l) => s + BigInt(l.scaled), 0n)
  if (total < need) throw new Error(`Not enough ${token.symbol} to cover the split.`)
  const primary = txb.object(coins[0].coinObjectId)
  if (coins.length > 1)
    txb.mergeCoins(primary, coins.slice(1).map(c => txb.object(c.coinObjectId)))
  const parts = txb.splitCoins(primary, scaledLegs.map(l => txb.pure(l.scaled)))
  scaledLegs.forEach((l, i) => txb.transferObjects([parts[i]], txb.pure(l.recipient)))
  return txb
}
