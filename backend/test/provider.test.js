import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pickProvider } from '../lib/llmProvider.js'

test('AI provider: uses the one asked for, else whichever has a key (usepod first)', () => {
  assert.equal(pickProvider({ LLM_PROVIDER: 'usepod' }), 'usepod')
  assert.equal(pickProvider({ LLM_PROVIDER: 'OpenRouter', USEPOD_TOKEN: 'x' }), 'openrouter')
  assert.equal(pickProvider({ USEPOD_TOKEN: 'x', OPENROUTER_API_KEY: 'y' }), 'usepod')
  assert.equal(pickProvider({ OPENROUTER_API_KEY: 'y' }), 'openrouter', 'no more silent fallback to a provider with no key')
  assert.equal(pickProvider({ LLM_PROVIDER: 'nonsense', OPENROUTER_API_KEY: 'y' }), 'openrouter')
  assert.equal(pickProvider({}), 'groq')
})
