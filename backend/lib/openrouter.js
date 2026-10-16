// The AI models behind Velfi's chat. One OpenAI-style chat endpoint, several
// possible providers. Pick one with LLM_PROVIDER, or leave it empty and Velfi
// uses whichever provider has a key set (usepod first).
//
//   usepod      USEPOD_TOKEN       https://api.usepod.ai/proxy/<token>/v1  (token in the URL)
//   openrouter  OPENROUTER_API_KEY https://openrouter.ai/api/v1
//   groq        GROQ_API_KEY       https://api.groq.com/openai/v1
//
// Models: VELFI_MODEL sets one model for everything; VELFI_CLASSIFIER_MODEL,
// VELFI_PARSER_MODEL, VELFI_ASSISTANT_MODEL and VELFI_DOUBLECHECK_MODEL override
// each job.
import dotenv from 'dotenv'
import { pickProvider } from './llmProvider.js'
dotenv.config()

const env = process.env
const PROVIDERS = {
  usepod:     { url: () => `https://api.usepod.ai/proxy/${encodeURIComponent(env.USEPOD_TOKEN)}/v1/chat/completions`, key: () => env.USEPOD_TOKEN },
  openrouter: { url: () => 'https://openrouter.ai/api/v1/chat/completions', key: () => env.OPENROUTER_API_KEY },
  groq:       { url: () => 'https://api.groq.com/openai/v1/chat/completions', key: () => env.GROQ_API_KEY },
}

export const PROVIDER = pickProvider()

const DEFAULTS = {
  usepod: { classifier: 'deepseek-v4-1-flash', parser: 'deepseek-v4-1-flash', assistant: 'deepseek-v4-1-flash', doublecheck: 'deepseek-v4-1-flash' },
  groq: { classifier: 'llama-3.3-70b-versatile', parser: 'llama-3.3-70b-versatile', assistant: 'llama-3.3-70b-versatile', doublecheck: 'llama-3.3-70b-versatile' },
  openrouter: { classifier: 'anthropic/claude-haiku-4.5', parser: 'anthropic/claude-haiku-4.5', assistant: 'anthropic/claude-haiku-4.5', doublecheck: 'anthropic/claude-sonnet-4.6' },
}
const d = DEFAULTS[PROVIDER]
const one = env.VELFI_MODEL

export const MODELS = {
  classifier:  env.VELFI_CLASSIFIER_MODEL  || one || d.classifier,
  parser:      env.VELFI_PARSER_MODEL      || one || d.parser,
  assistant:   env.VELFI_ASSISTANT_MODEL   || one || d.assistant,
  doublecheck: env.VELFI_DOUBLECHECK_MODEL || one || d.doublecheck,
}

async function post(body) {
  const p = PROVIDERS[PROVIDER]
  const res = await fetch(p.url(), {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${p.key()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  return { ok: res.ok, status: res.status, text }
}

export async function callModel(model, messages, { json = false, maxTokens = 1024 } = {}) {
  if (!PROVIDERS[PROVIDER].key()) throw new Error(`No API key for provider "${PROVIDER}"`)
  const base = { model, messages, max_tokens: maxTokens }
  let r = await post(json ? { ...base, response_format: { type: 'json_object' } } : base)
  // Some models behind a router don't support strict JSON mode. The prompts
  // already ask for JSON, so retry once without it.
  if (!r.ok && json && r.status >= 400 && r.status < 500 && /response_format|json/i.test(r.text)) r = await post(base)
  if (!r.ok) throw new Error(`${PROVIDER} ${r.status}: ${r.text.slice(0, 300)}`)
  const data = JSON.parse(r.text)
  return data.choices?.[0]?.message?.content ?? ''
}
