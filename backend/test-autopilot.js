import dotenv from 'dotenv'; dotenv.config()
import { agentAddress, buildCreateMandate, buildExecuteMandate, signAndRun } from './lib/txBuilder.js'

const me = agentAddress()
console.log('Agent:', me)

console.log('\n[1] Creating mandate (0.05 SUI budget, 0.02 max/tx, 1h)...')
const mk = await signAndRun(buildCreateMandate({
  budgetMist: 50_000_000, recipients: [me], maxPerTxMist: 20_000_000, agent: me, durationMs: 3_600_000,
}))
console.log('  status:', mk.effects?.status?.status, '| digest:', mk.digest)
const mandate = (mk.objectChanges || []).find(o => o.objectType?.includes('::guardrail::Mandate'))
if (!mandate) { console.error('  !! Mandate not found'); process.exit(1) }
const mandateId = mandate.objectId
console.log('  mandate id:', mandateId)

console.log('\n[2] Executing 0.01 SUI within the mandate...')
const ex = await signAndRun(buildExecuteMandate({ mandateId, amountMist: 10_000_000, recipient: me }))
console.log('  status:', ex.effects?.status?.status, '| digest:', ex.digest)
console.log('  explorer: https://suiscan.xyz/testnet/tx/' + ex.digest)

console.log('\n[3] Trying 0.04 SUI (over the 0.02 cap) — chain should reject...')
try {
  const bad = await signAndRun(buildExecuteMandate({ mandateId, amountMist: 40_000_000, recipient: me }))
  console.log('  status:', bad.effects?.status?.status, '(expected: failure)')
} catch (e) {
  console.log('  correctly rejected:', String(e.message).split('\n')[0])
}
