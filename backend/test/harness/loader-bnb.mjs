// ESM loader for the BNB chain tests: fakes Supabase, Privy, the AI and the web
// framework, but keeps the REAL chain code (bnb.js, txBuilder.js), so every
// payment really runs on a local EVM chain. See test/chain/bnb.chain.test.mjs.
const here = new URL('./stubs/', import.meta.url)
const PACKAGES = {
  express: 'express.mjs',
  dotenv: 'dotenv.mjs',
  'dotenv/config': 'empty.mjs',
  jsonwebtoken: 'jsonwebtoken.mjs',
  cors: 'empty.mjs',
  '@supabase/supabase-js': 'supabase.mjs',
  '@privy-io/server-auth': 'privy.mjs',
}
const LOCAL = {
  '/lib/supabaseAdmin.js': 'db.mjs',
  '/lib/supabase.js': 'db.mjs',
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
