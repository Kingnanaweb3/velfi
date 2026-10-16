// Fake chain: records what the routes ask for.
export const calls = { prepared: [], submitted: [], server: [] }
let n = 0
export const CLUSTER = 'devnet'
export const explorerTx = (s) => `https://solscan.io/tx/${s}?cluster=devnet`
export const explorerAddress = (a) => `https://solscan.io/account/${a}?cluster=devnet`
export async function prepareForUser(instructions) {
  n++; calls.prepared.push(instructions)
  return { tx: `UNSIGNED_HASH_${n}`, messageHash: `HASH_${n}` }
}
export async function submitUserSigned(base64, expectedHash) {
  // the fake "signed" tx carries the hash it was built from
  if (!String(base64).endsWith(expectedHash)) throw new Error('This transaction does not match what you approved.')
  calls.submitted.push(base64); return `SIG_${calls.submitted.length}`
}
export const versionedHash = (b) => `VHASH_${b}`
export async function submitVersioned(b, h) { if (versionedHash(b) !== h) throw new Error('This swap does not match what you approved.'); return 'SWAPSIG' }
export async function sendAsServer(ixs, signers) { calls.server.push({ ixs, signers }); return `SERVER_SIG_${calls.server.length}` }
export const agent = () => ({ publicKey: { toBase58: () => 'AGENT' } })
export async function getSolBalance() { return 1.5 }
export async function rawBalances() { return [{ mint: 'native', units: 2_000_000_000n, decimals: 9 }, { mint: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU', units: 50_000_000n, decimals: 6 }] }
