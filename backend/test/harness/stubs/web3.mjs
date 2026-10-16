// Only the names the routes import; the chain itself is faked in solana.mjs.
export class Keypair {
  static generate() { throw new Error('not used in route tests') }
  // Unsealing an invite key: tests seal real bytes, so this proves the AES round trip.
  static fromSecretKey(bytes) {
    const tag = Buffer.from(bytes).subarray(0, 4).toString('hex')
    return { secretKey: bytes, publicKey: { toBase58: () => `CLAIMKEY_${tag}` } }
  }
}
export class VersionedTransaction {}
