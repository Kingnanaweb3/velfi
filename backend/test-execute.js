import { TransactionBlock } from '@mysten/sui.js/transactions'
import { provider, getDeployerKeypair } from './lib/sui.js'

const kp = getDeployerKeypair()
const me = kp.getPublicKey().toSuiAddress()
console.log('Agent address:', me)

const txb = new TransactionBlock()
const [coin] = txb.splitCoins(txb.gas, [txb.pure(2_000_000)]) // 0.002 SUI
txb.transferObjects([coin], txb.pure(me))

const res = await provider.signAndExecuteTransactionBlock({
  signer: kp,
  transactionBlock: txb,
  options: { showEffects: true },
})
console.log('Status  :', res.effects?.status?.status)
console.log('Digest  :', res.digest)
console.log('Explorer: https://suiscan.xyz/testnet/tx/' + res.digest)
