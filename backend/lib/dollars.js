// Reads a dollar figure straight from what the user typed, without the AI.
// "$1", "$ 1", "1$", "1 $", "1 usd", "5 dollars", "20 bucks" -> that number.
// Returns null when there is no dollar figure, or more than one different one
// (e.g. "$3 to amy and $7 to ben"), so the AI's reading is used for those.
const NUM = String.raw`(\d[\d,]*(?:\.\d+)?|\.\d+)`
const PATTERNS = [
  new RegExp(String.raw`\$\s?` + NUM, 'g'),
  new RegExp(NUM + String.raw`\s?\$`, 'g'),
  new RegExp(NUM + String.raw`\s?(?:usd|dollars?|bucks)\b`, 'gi'),
]

export function dollarFigure(message) {
  const text = String(message || '')
  const found = new Set()
  for (const re of PATTERNS) {
    for (const m of text.matchAll(re)) {
      const n = Number(m[1].replace(/,/g, ''))
      if (Number.isFinite(n) && n > 0) found.add(n)
    }
  }
  return found.size === 1 ? [...found][0] : null
}

// If the user typed one dollar figure and named a token ("send 1$ sol"), the
// amount is dollars to convert into that token, whatever the AI decided.
export function applyDollarFigure(parsed, message) {
  const usd = dollarFigure(message)
  const pay = parsed?.payment
  if (usd == null || !pay) return parsed
  if (!['send', 'split', 'schedule', 'stream'].includes(parsed.intent)) return parsed
  if (Array.isArray(pay.actions) && pay.actions.length) return parsed
  const cur = String(pay.currency || 'USD').toUpperCase()
  if (cur === 'USD') { if (pay.amount == null) pay.amount = usd; return parsed }   // token is asked next
  if (pay.amount_in_usd && Number(pay.amount) === usd) return parsed
  const before = Number(pay.amount)
  pay.amount = usd
  pay.amount_in_usd = true
  pay.token_amount = null
  // Equal split amounts worked out from the old figure: let them be recomputed.
  const rs = pay.recipients || []
  if (parsed.intent === 'split' && rs.length > 1 && rs.every(r => r.share == null)) {
    const sum = rs.reduce((s, r) => s + (Number(r.amount) || 0), 0)
    if (Math.abs(sum - usd) > 1e-9 || before !== usd) rs.forEach(r => { r.amount = null })
  }
  return parsed
}
