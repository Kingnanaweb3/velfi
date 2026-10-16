// Instruction encoders and account decoders for the Velfi Anchor program.
// Pure and dependency-free: addresses are base58 strings, data is a Buffer.
// solana.js turns the output into real web3.js instructions.
//
// The specs below mirror programs/velfi/src exactly (field order matters);
// test/velfiProgram.test.js re-reads the Rust sources and fails if they drift.
import crypto from 'node:crypto'
import { encode as b58encode, decode as b58decode } from './base58.js'

export const SEEDS = { mandate: 'mandate', escrow: 'escrow', stream: 'stream', split: 'split', safePay: 'safepay', stagePay: 'stagepay' }

// [accountName, flags]  flags: s = signer, w = writable
export const IX_ACCOUNTS = {
  create_mandate: [['owner', 's'], ['payer', 'sw'], ['mint', ''], ['owner_token', 'w'], ['mandate', 'w'], ['vault', 'w'], ['token_program', ''], ['associated_token_program', ''], ['system_program', '']],
  execute_mandate: [['caller', 's'], ['payer', 'sw'], ['mandate', 'w'], ['mint', ''], ['vault', 'w'], ['recipient', ''], ['recipient_token', 'w'], ['token_program', ''], ['associated_token_program', ''], ['system_program', '']],
  revoke_mandate: [['owner', 's'], ['mandate', 'w'], ['mint', ''], ['vault', 'w'], ['owner_token', 'w'], ['rent_payer', 'w'], ['token_program', '']],
  create_escrow: [['sender', 's'], ['payer', 'sw'], ['mint', ''], ['sender_token', 'w'], ['escrow', 'w'], ['vault', 'w'], ['token_program', ''], ['associated_token_program', ''], ['system_program', '']],
  claim_escrow: [['claim_authority', 's'], ['payer', 'sw'], ['escrow', 'w'], ['mint', ''], ['vault', 'w'], ['claimer', ''], ['claimer_token', 'w'], ['rent_payer', 'w'], ['token_program', ''], ['associated_token_program', ''], ['system_program', '']],
  refund_escrow: [['sender', 's'], ['escrow', 'w'], ['mint', ''], ['vault', 'w'], ['sender_token', 'w'], ['rent_payer', 'w'], ['token_program', '']],
  start_stream: [['sender', 's'], ['payer', 'sw'], ['mint', ''], ['sender_token', 'w'], ['stream', 'w'], ['vault', 'w'], ['token_program', ''], ['associated_token_program', ''], ['system_program', '']],
  claim_stream: [['recipient', 's'], ['payer', 'sw'], ['stream', 'w'], ['mint', ''], ['vault', 'w'], ['recipient_token', 'w'], ['rent_payer', 'w'], ['token_program', ''], ['associated_token_program', ''], ['system_program', '']],
  stop_stream: [['sender', 's'], ['payer', 'sw'], ['stream', 'w'], ['mint', ''], ['vault', 'w'], ['recipient', ''], ['recipient_token', 'w'], ['sender_token', 'w'], ['rent_payer', 'w'], ['token_program', ''], ['associated_token_program', ''], ['system_program', '']],
  start_split_stream: [['sender', 's'], ['payer', 'sw'], ['mint', ''], ['sender_token', 'w'], ['split', 'w'], ['vault', 'w'], ['token_program', ''], ['associated_token_program', ''], ['system_program', '']],
  claim_split_stream: [['claimer', 's'], ['payer', 'sw'], ['split', 'w'], ['mint', ''], ['vault', 'w'], ['claimer_token', 'w'], ['token_program', ''], ['associated_token_program', ''], ['system_program', '']],
  stop_split_stream: [['sender', 's'], ['split', 'w'], ['mint', ''], ['vault', 'w'], ['sender_token', 'w'], ['token_program', '']],
  close_split_stream: [['sender', 's'], ['split', 'w'], ['mint', ''], ['vault', 'w'], ['sender_token', 'w'], ['rent_payer', 'w'], ['token_program', '']],
  create_safe_pay: [['sender', 's'], ['payer', 'sw'], ['mint', ''], ['sender_token', 'w'], ['safe_pay', 'w'], ['vault', 'w'], ['token_program', ''], ['associated_token_program', ''], ['system_program', '']],
  confirm_safe_pay: [['caller', 's'], ['payer', 'sw'], ['safe_pay', 'w'], ['mint', ''], ['vault', 'w'], ['recipient', ''], ['recipient_token', 'w'], ['rent_payer', 'w'], ['token_program', ''], ['associated_token_program', ''], ['system_program', '']],
  reclaim_safe_pay: [['sender', 's'], ['safe_pay', 'w'], ['mint', ''], ['vault', 'w'], ['sender_token', 'w'], ['rent_payer', 'w'], ['token_program', '']],
  create_stage_pay: [['sender', 's'], ['payer', 'sw'], ['mint', ''], ['sender_token', 'w'], ['stage_pay', 'w'], ['vault', 'w'], ['token_program', ''], ['associated_token_program', ''], ['system_program', '']],
  release_stage: [['sender', 's'], ['payer', 'sw'], ['stage_pay', 'w'], ['mint', ''], ['vault', 'w'], ['recipient', ''], ['recipient_token', 'w'], ['rent_payer', 'w'], ['token_program', ''], ['associated_token_program', ''], ['system_program', '']],
  cancel_stage_pay: [['sender', 's'], ['stage_pay', 'w'], ['mint', ''], ['vault', 'w'], ['sender_token', 'w'], ['rent_payer', 'w'], ['token_program', '']],
}

// [argName, type]
export const IX_ARGS = {
  create_mandate: [['id', 'u64'], ['agent', 'pubkey'], ['recipients', 'vec<pubkey>'], ['max_per_tx', 'u64'], ['total_budget', 'u64'], ['duration', 'i64']],
  execute_mandate: [['amount', 'u64']],
  revoke_mandate: [],
  create_escrow: [['id', 'u64'], ['amount', 'u64'], ['claim_authority', 'pubkey'], ['window', 'i64']],
  claim_escrow: [],
  refund_escrow: [],
  start_stream: [['id', 'u64'], ['recipient', 'pubkey'], ['amount', 'u64'], ['duration', 'i64']],
  claim_stream: [],
  stop_stream: [],
  start_split_stream: [['id', 'u64'], ['recipients', 'vec<pubkey>'], ['total', 'u64'], ['duration', 'i64']],
  claim_split_stream: [],
  stop_split_stream: [],
  close_split_stream: [],
  create_safe_pay: [['id', 'u64'], ['recipient', 'pubkey'], ['amount', 'u64'], ['window', 'i64']],
  confirm_safe_pay: [],
  reclaim_safe_pay: [],
  create_stage_pay: [['id', 'u64'], ['recipient', 'pubkey'], ['stages', 'vec<u64>']],
  release_stage: [],
  cancel_stage_pay: [],
}

// On-chain account layouts (after the 8-byte discriminator).
export const STATE_FIELDS = {
  MandateState: [['owner', 'pubkey'], ['agent', 'pubkey'], ['mint', 'pubkey'], ['rent_payer', 'pubkey'], ['id', 'u64'], ['bump', 'u8'], ['recipients', 'vec<pubkey>'], ['max_per_tx', 'u64'], ['total_budget', 'u64'], ['spent', 'u64'], ['expires_at', 'i64'], ['active', 'bool']],
  EscrowState: [['sender', 'pubkey'], ['claim_authority', 'pubkey'], ['mint', 'pubkey'], ['rent_payer', 'pubkey'], ['id', 'u64'], ['bump', 'u8'], ['amount', 'u64'], ['expires_at', 'i64'], ['active', 'bool']],
  StreamState: [['sender', 'pubkey'], ['recipient', 'pubkey'], ['mint', 'pubkey'], ['rent_payer', 'pubkey'], ['id', 'u64'], ['bump', 'u8'], ['total', 'u64'], ['claimed', 'u64'], ['start', 'i64'], ['end', 'i64'], ['active', 'bool']],
  SplitStreamState: [['sender', 'pubkey'], ['mint', 'pubkey'], ['rent_payer', 'pubkey'], ['id', 'u64'], ['bump', 'u8'], ['recipients', 'vec<pubkey>'], ['claimed', 'vec<u64>'], ['per_person', 'u64'], ['start', 'i64'], ['end', 'i64'], ['stopped', 'bool'], ['stopped_at', 'i64']],
  SafePayState: [['sender', 'pubkey'], ['recipient', 'pubkey'], ['mint', 'pubkey'], ['rent_payer', 'pubkey'], ['id', 'u64'], ['bump', 'u8'], ['amount', 'u64'], ['sender_confirmed', 'bool'], ['recipient_confirmed', 'bool'], ['deadline', 'i64'], ['active', 'bool']],
  StagePayState: [['sender', 'pubkey'], ['recipient', 'pubkey'], ['mint', 'pubkey'], ['rent_payer', 'pubkey'], ['id', 'u64'], ['bump', 'u8'], ['stages', 'vec<u64>'], ['current', 'u8'], ['active', 'bool']],
}

const sha8 = (s) => crypto.createHash('sha256').update(s).digest().subarray(0, 8)
export const ixDiscriminator = (name) => sha8(`global:${name}`)
export const accountDiscriminator = (name) => sha8(`account:${name}`)

// ── Borsh ──────────────────────────────────────────────────────────────
function u64(v) {
  const n = BigInt(v)
  if (n < 0n || n > 0xffffffffffffffffn) throw new Error(`u64 out of range: ${v}`)
  const b = Buffer.alloc(8); b.writeBigUInt64LE(n); return b
}
function i64(v) {
  const n = BigInt(v)
  const b = Buffer.alloc(8); b.writeBigInt64LE(n); return b
}
function pubkey(v) {
  const b = Buffer.from(b58decode(String(v)))
  if (b.length !== 32) throw new Error(`not a 32-byte address: ${v}`)
  return b
}
function u32(n) { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b }

function encodeValue(type, v) {
  switch (type) {
    case 'u64': return u64(v)
    case 'i64': return i64(v)
    case 'u8': return Buffer.from([Number(v)])
    case 'bool': return Buffer.from([v ? 1 : 0])
    case 'pubkey': return pubkey(v)
    case 'vec<pubkey>': return Buffer.concat([u32(v.length), ...v.map(pubkey)])
    case 'vec<u64>': return Buffer.concat([u32(v.length), ...v.map(u64)])
    default: throw new Error(`unknown type ${type}`)
  }
}

function decodeValue(type, buf, o) {
  switch (type) {
    case 'u64': return [buf.readBigUInt64LE(o), o + 8]
    case 'i64': return [buf.readBigInt64LE(o), o + 8]
    case 'u8': return [buf[o], o + 1]
    case 'bool': return [buf[o] === 1, o + 1]
    case 'pubkey': return [b58encode(buf.subarray(o, o + 32)), o + 32]
    case 'vec<pubkey>': case 'vec<u64>': {
      const n = buf.readUInt32LE(o); o += 4
      const out = []
      for (let i = 0; i < n; i++) { const [v, no] = decodeValue(type.slice(4, -1), buf, o); out.push(v); o = no }
      return [out, o]
    }
    default: throw new Error(`unknown type ${type}`)
  }
}

// args use camelCase or snake_case keys
const camel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
const pick = (obj, k) => (obj[k] !== undefined ? obj[k] : obj[camel(k)])

export function encodeIxData(name, args = {}) {
  const spec = IX_ARGS[name]
  if (!spec) throw new Error(`unknown instruction ${name}`)
  const parts = [ixDiscriminator(name)]
  for (const [k, t] of spec) {
    const v = pick(args, k)
    if (v === undefined || v === null) throw new Error(`${name}: missing argument ${k}`)
    parts.push(encodeValue(t, v))
  }
  return Buffer.concat(parts)
}

export function decodeIxData(name, data) {
  const spec = IX_ARGS[name]
  const buf = Buffer.from(data)
  if (!buf.subarray(0, 8).equals(ixDiscriminator(name))) throw new Error(`not a ${name} instruction`)
  const out = {}; let o = 8
  for (const [k, t] of spec) { const [v, no] = decodeValue(t, buf, o); out[k] = v; o = no }
  return out
}

// accounts: object keyed by name (snake or camel). Returns ordered metas.
export function accountMetas(name, accounts) {
  const spec = IX_ACCOUNTS[name]
  if (!spec) throw new Error(`unknown instruction ${name}`)
  return spec.map(([k, flags]) => {
    const pk = pick(accounts, k)
    if (!pk) throw new Error(`${name}: missing account ${k}`)
    return { name: k, pubkey: String(pk), isSigner: flags.includes('s'), isWritable: flags.includes('w') }
  })
}

export function buildIx(programId, name, accounts, args) {
  return { programId: String(programId), keys: accountMetas(name, accounts), data: encodeIxData(name, args) }
}

export function decodeState(typeName, data) {
  const spec = STATE_FIELDS[typeName]
  if (!spec) throw new Error(`unknown account type ${typeName}`)
  const buf = Buffer.from(data)
  if (!buf.subarray(0, 8).equals(accountDiscriminator(typeName))) throw new Error(`not a ${typeName} account`)
  const out = {}; let o = 8
  for (const [k, t] of spec) { const [v, no] = decodeValue(t, buf, o); out[camel(k)] = v; o = no }
  return out
}

export function encodeState(typeName, values) {
  const spec = STATE_FIELDS[typeName]
  return Buffer.concat([accountDiscriminator(typeName), ...spec.map(([k, t]) => encodeValue(t, pick(values, k)))])
}

// PDA seeds for a flow: [seed, owner, id as u64 LE]
export function flowSeeds(kind, owner, id) {
  return [Buffer.from(SEEDS[kind]), pubkey(owner), u64(id)]
}

// Linear vesting, mirrored from velfi-core, for showing claimable amounts.
export function vested(total, start, end, now) {
  const [t, s, e, n] = [BigInt(total), BigInt(start), BigInt(end), BigInt(now)]
  if (n <= s) return 0n
  if (n >= e) return t
  return (t * (n - s)) / (e - s)
}
