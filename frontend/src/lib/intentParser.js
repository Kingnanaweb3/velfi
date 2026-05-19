/**
 * Velfi AI — Intent Parser
 * Parses natural language payment commands into structured intents
 * Zero API cost, runs client-side
 */

const SUI_NAME = /[\w-]+\.sui/gi
const ADDRESS  = /0x[a-fA-F0-9]{10,}/g
const AMOUNT   = /\d+(\.\d+)?/
const DAYS     = /(\d+)\s*day/i

function extractRecipient(text) {
  const names = text.match(SUI_NAME)
  if (names) return names[0]
  const addrs = text.match(ADDRESS)
  if (addrs) return addrs[0]
  return null
}

function extractAllRecipients(text) {
  const names = text.match(SUI_NAME) || []
  const addrs = text.match(ADDRESS) || []
  return [...new Set([...names, ...addrs])]
}

function extractAmount(text) {
  const m = text.match(AMOUNT)
  return m ? m[0] : null
}

function extractMemo(text) {
  const forMatch = text.match(/\bfor\b\s+(.+?)(\s+to|\s+with|\s+over|$)/i)
  if (forMatch) return forMatch[1].trim()
  return null
}

function extractDays(text) {
  const m = text.match(DAYS)
  return m ? parseInt(m[1]) : 30
}

export function parseIntent(input) {
  const text = input.toLowerCase().trim()

  // SEND
  if (/\b(send|pay|transfer)\b/.test(text)) {
    const to = extractRecipient(text)
    const amount = extractAmount(text)
    const memo = extractMemo(text)
    if (to && amount) {
      return { action: 'send', to, amount, memo, confidence: 'high',
        summary: `Send ${amount} SUI to ${to}${memo ? ` for ${memo}` : ''}` }
    }
  }

  // SPLIT
  if (/\b(split|divide|share)\b/.test(text)) {
    const recipients = extractAllRecipients(text)
    const amount = extractAmount(text)
    if (recipients.length >= 2 && amount) {
      const perPerson = (parseFloat(amount) / recipients.length).toFixed(4)
      return { action: 'split', recipients, amount, perPerson, confidence: 'high',
        summary: `Split ${amount} SUI between ${recipients.length} people (${perPerson} SUI each)` }
    }
    if (recipients.length >= 1 && amount) {
      return { action: 'split', recipients, amount, confidence: 'medium',
        summary: `Split ${amount} SUI with ${recipients.join(', ')}` }
    }
  }

  // REQUEST
  if (/\b(request|ask|charge|invoice)\b/.test(text)) {
    const from = extractRecipient(text)
    const amount = extractAmount(text)
    const memo = extractMemo(text)
    return { action: 'request', from, amount, memo, confidence: from && amount ? 'high' : 'medium',
      summary: `Request ${amount || '?'} SUI${from ? ` from ${from}` : ''}${memo ? ` for ${memo}` : ''}` }
  }

  // STREAM
  if (/\b(stream|drip|salary|payroll|recurring)\b/.test(text)) {
    const to = extractRecipient(text)
    const amount = extractAmount(text)
    const days = extractDays(text)
    const perDay = amount ? (parseFloat(amount) / days).toFixed(4) : null
    return { action: 'stream', to, amount, days, perDay, confidence: to && amount ? 'high' : 'medium',
      summary: `Stream ${amount || '?'} SUI to ${to || '?'} over ${days} days (${perDay || '?'} SUI/day)` }
  }

  // BALANCE
  if (/\b(balance|how much|what.s my|check)\b/.test(text)) {
    return { action: 'balance', confidence: 'high',
      summary: 'Check your current balance' }
  }

  // HISTORY
  if (/\b(history|transactions|recent|activity)\b/.test(text)) {
    return { action: 'history', confidence: 'high',
      summary: 'Show recent transactions' }
  }

  return { action: 'unknown', confidence: 'low',
    summary: null,
    error: "I didn't understand that. Try: \"send almond.sui 0.01 for lunch\" or \"split 0.1 with a.sui and b.sui\"" }
}
