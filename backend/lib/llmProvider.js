// Which AI provider to use. Pure (no imports) so it can be tested directly.
const KNOWN = ['usepod', 'openrouter', 'groq']
export function pickProvider(e = process.env) {
  const asked = String(e.LLM_PROVIDER || '').toLowerCase()
  if (KNOWN.includes(asked)) return asked
  if (e.USEPOD_TOKEN) return 'usepod'
  if (e.OPENROUTER_API_KEY) return 'openrouter'
  return 'groq'
}
