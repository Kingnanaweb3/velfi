// Only the names the routes import; the chain itself is faked in solana.mjs.
export class Keypair {
  static generate() { throw new Error('not used in route tests') }
  static fromSecretKey() { throw new Error('not used in route tests') }
}
export class VersionedTransaction {}
