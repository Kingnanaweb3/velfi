// ESM loader for route tests: maps third-party packages and the chain-facing
// modules to in-memory fakes, so routes run without a network, Supabase or
// Solana. Used only by test/routes.test.js (see package.json "test:routes").
const here = new URL('./stubs/', import.meta.url)
const PACKAGES = {
  express: 'express.mjs',
  dotenv: 'dotenv.mjs',
  'dotenv/config': 'empty.mjs',
  jsonwebtoken: 'jsonwebtoken.mjs',
  cors: 'empty.mjs',
  '@supabase/supabase-js': 'supabase.mjs',
  '@privy-io/server-auth': 'privy.mjs',
  '@solana/web3.js': 'web3.mjs',
  '@solana/spl-token': 'empty.mjs',
}
const LOCAL = {
  '/lib/supabaseAdmin.js': 'db.mjs',
  '/lib/supabase.js': 'db.mjs',
  '/lib/solana.js': 'solana.mjs',
  '/lib/txBuilder.js': 'txBuilder.mjs',
  '/lib/openrouter.js': 'openrouter.mjs',
}
export async function resolve(specifier, context, next) {
  if (PACKAGES[specifier]) return { url: new URL(PACKAGES[specifier], here).href, shortCircuit: true }
  if (specifier.startsWith('.') && context.parentURL && !context.parentURL.includes('/test/harness/')) {
    const abs = new URL(specifier, context.parentURL).href
    for (const [suffix, stub] of Object.entries(LOCAL)) if (abs.endsWith(suffix)) return { url: new URL(stub, here).href, shortCircuit: true }
  }
  return next(specifier, context)
}
