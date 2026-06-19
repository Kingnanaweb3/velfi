import dotenv from 'dotenv'
dotenv.config()

const PROVIDER = (process.env.LLM_PROVIDER || 'groq').toLowerCase()
const PROVIDERS = {
  groq:       { url: 'https://api.groq.com/openai/v1/chat/completions', key: process.env.GROQ_API_KEY },
  openrouter: { url: 'https://openrouter.ai/api/v1/chat/completions',   key: process.env.OPENROUTER_API_KEY },
}
const { url: API_URL, key: API_KEY } = PROVIDERS[PROVIDER] || PROVIDERS.groq

const DEFAULTS = {
  groq: { classifier: 'llama-3.3-70b-versatile', parser: 'llama-3.3-70b-versatile', assistant: 'llama-3.3-70b-versatile', doublecheck: 'llama-3.3-70b-versatile' },
  openrouter: { classifier: 'anthropic/claude-haiku-4.5', parser: 'anthropic/claude-haiku-4.5', assistant: 'anthropic/claude-haiku-4.5', doublecheck: 'anthropic/claude-sonnet-4.6' },
}
const d = DEFAULTS[PROVIDER] || DEFAULTS.groq

export const MODELS = {
  classifier:  process.env.VELFI_CLASSIFIER_MODEL  || d.classifier,
  parser:      process.env.VELFI_PARSER_MODEL      || d.parser,
  assistant:   process.env.VELFI_ASSISTANT_MODEL   || d.assistant,
  doublecheck: process.env.VELFI_DOUBLECHECK_MODEL || d.doublecheck,
}

export async function callModel(model, messages, { json = false, maxTokens = 1024 } = {}) {
  if (!API_KEY) throw new Error(`No API key for provider "${PROVIDER}"`)
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, ...(json ? { response_format: { type: 'json_object' } } : {}) }),
  })
  if (!res.ok) { const t = await res.text(); throw new Error(`${PROVIDER} ${res.status}: ${t}`) }
  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? ''
}
