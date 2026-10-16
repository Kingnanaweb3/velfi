import express from 'express'
import crypto from 'crypto'
import supabase from '../lib/supabaseAdmin.js'
import supabaseAdmin from '../lib/supabaseAdmin.js'
import { requireAuth } from '../middleware/auth.js'
import { callModel, MODELS } from '../lib/openrouter.js'
import { CLASSIFIER_SYS, PARSER_SYS, ASSISTANT_SYS } from '../lib/agentPrompts.js'
import { getAllBalances, balanceOf, formatBalances } from '../lib/balances.js'
import { usdToToken, getUsdPrice } from '../lib/pricing.js'
import { getToken, TOKEN_LIST } from '../lib/tokens.js'
import {
  validateSchema, validateAmount, validateSplit,
  isSelfSend, needsClarification, parsesAgree, hasEnough, CONFIDENCE_FLOOR,
  normalizeVel, normalizeSplit, validateActions
} from '../lib/agentValidators.js'
import { buildSummary } from '../lib/summarize.js'
import { applyDollarFigure } from '../lib/dollars.js'
import { buildPayment, buildStartStream, buildCreateScheduleMandate, buildSetAllowance } from '../lib/txBuilder.js'
import { prepareForUser, submitUserSigned, submitVersioned, versionedHash, explorerTx, PROGRAM_ENABLED, feePayerLamports } from '../lib/solana.js'
import { quoteSwap, buildSwapTx } from '../lib/jupiter.js'
import { recordStream, streamProgress } from '../lib/streams.js'
import { recordSchedule, tickSchedules } from '../lib/schedule.js'
import { saveInvites } from '../lib/invites.js'
import { remember, take, allowSubmission, canOpenAccounts, recordOpenedAccounts } from '../lib/prepared.js'
import { allowanceFor } from '../lib/chain/lite.js'
import { scheduleToMandate } from '../lib/chain/plan.js'
import { isSolanaAddress } from '../lib/chain/base58.js'
import { toBaseUnits } from '../lib/chain/amounts.js'

const router = express.Router()

// Non-custodial: every payment is signed by the user's own wallet. Balance
// checks read the user's wallet, because that is where the money comes from.

const STREAMS_SOON = 'Streaming payments are coming soon. For now I can send it all now, or set it up as a scheduled payment (for example weekly). Want one of those?'
const AUTOPILOT_KB = PROGRAM_ENABLED
  ? 'Autopilot (scheduled payments run from an on-chain mandate you fund and sign once: it can only pay the recipient you chose, at most the amount you set, until it expires, and you can cancel it anytime)'
  : 'Autopilot (for a schedule you approve once, letting Velfi spend up to that schedule\'s total from your wallet. The money stays in your wallet until each payment. Solana itself caps the total; Velfi\'s server sticks to the recipient, amount and timing you chose. Cancel anytime in Flows and the permission is removed)'
const VELFI_KB = `
Velfi is a non-custodial AI money agent launching on Solana. Tagline: tell your money what to do.
- Sign in with Google. Velfi creates your Solana wallet for you: no seed phrase, no extension. Switch devices and the same wallet comes back.
- Claim a .vel name (like alice.vel) so people pay you by name instead of a long wallet address.
- Just say what you want in plain language. Velfi reads it, proposes the exact action, and only moves money after you approve and sign.
- Money actions: send, split (one amount across people), ${PROGRAM_ENABLED ? 'stream (pays out second by second, the recipient claims anytime), ' : ''}schedule (recurring payments), send to an email (held until they sign up), and swaps on mainnet through Jupiter.${PROGRAM_ENABLED ? '' : ' Streaming payments are coming soon.'}
- Gasless: Velfi pays the Solana network fee for your payments, so you don't need SOL to move USDC.
- Pay a .vel name, a Solana address, or an email. If they're not on Velfi yet, the money waits ${PROGRAM_ENABLED ? 'in an on-chain escrow' : 'in a one-off holding wallet Velfi manages'} for up to 7 days and lands in their wallet when they sign up; otherwise it comes back to you.
- Right now Velfi moves SOL and USDC (plus USDT on mainnet). Schedules and email payments use USDC or other tokens, not SOL.
- Every payment is a Solana transaction anyone can check on Solscan.
- Self-custody: your wallet is yours and every one-off payment needs your approval and signature. The agent never moves money on its own.
- Two modes: Assisted (you approve and sign each action) and ${AUTOPILOT_KB}.
What Velfi can't do yet (be honest, never promise these):
- No fiat on/off-ramp - you can't buy crypto with a card or cash out to a bank inside Velfi.
- No loans, credit, yield, or investment products. Velfi never gives financial, tax, or legal advice.
- It only works on Solana; it can't reach other chains.
- .vel names are free during early access. A mobile app is coming soon.
`.trim()

function strip(s){ return String(s).replace(/<think>[\s\S]*?<\/think>/gi,'').replace(/```json/gi,'').replace(/```/g,'').trim() }

// ---- working recipient resolver (unchanged) ----
async function resolveRecipient(input) {
  const clean = String(input).toLowerCase().trim()
  if (clean.endsWith('.vel')) {
    const username = clean.replace('.vel', '')
    const { data } = await supabaseAdmin.from('users').select('wallet_address, username').eq('username', username).maybeSingle()
    return data?.wallet_address ? { address: data.wallet_address, label: input } : null
  }
  // Solana addresses are case-sensitive, so check the original input, not the lowercased one.
  if (isSolanaAddress(String(input).trim())) return { address: String(input).trim(), label: String(input).trim() }
  if (clean.includes('@')) return { address: null, email: clean, label: clean, needsInvite: true }
  const { data } = await supabaseAdmin.from('users').select('wallet_address, username').eq('username', clean).maybeSingle()
  return data?.wallet_address ? { address: data.wallet_address, label: clean } : null
}

// Explain why recipients weren't found. A name from before the move to Solana still
// exists, but has no Solana wallet until that person signs in once more.
export async function missingText(names) {
  const waiting = []
  const unknown = []
  for (const n of names) {
    const u = String(n).toLowerCase().trim().replace(/\.vel$/, '')
    let old = null
    if (/^[a-z0-9_]{3,20}$/.test(u)) {
      const { data } = await supabaseAdmin.from('users').select('username, wallet_address').eq('username', u).maybeSingle()
      old = data && !data.wallet_address ? data : null
    }
    ;(old ? waiting : unknown).push(n)
  }
  const parts = []
  if (unknown.length) parts.push(`I couldn't find ${unknown.join(', ')} on Velfi`)
  if (waiting.length) {
    const one = waiting.length === 1
    parts.push(`${waiting.join(', ')} ${one ? "hasn't" : "haven't"} signed in since Velfi moved to Solana, so ${one ? 'there is no wallet to pay yet' : 'there are no wallets to pay yet'}. Ask ${one ? 'them' : 'each of them'} to sign in once at app.velfi.xyz, or send to a Solana address instead`)
  }
  return parts.join('. ')
}

// A token Velfi can't move on Solana (e.g. SUI from the old app, or ETH).
export function unsupportedToken(sym, pay = {}) {
  const list = TOKEN_LIST.map(t => t.symbol)
  const usable = list.length > 1 ? `${list.slice(0, -1).join(', ')} or ${list.at(-1)}` : list[0]
  const s = String(sym || '').toUpperCase()
  const why = s === 'SUI' ? ' Velfi moved from Sui to Solana, so SUI isn\'t something I can send anymore.' : ''
  const amt = pay.amount != null ? (pay.amount_in_usd ? `$${pay.amount} of SOL or USDC` : `${pay.amount} SOL or USDC`) : 'SOL or USDC'
  return `I can't send ${s} \u2014 on Velfi I can move ${usable} on Solana.${why} Want to send ${amt} instead?`
}

// Try to read a token symbol the user picked, restricted to what they actually hold.
function pickTokenFromMessage(message, balances) {
  const text = String(message).toUpperCase()
  for (const b of balances) {
    if (text.includes(b.symbol.toUpperCase())) return b.symbol
  }
  return null
}

// Resolve recipients + run validators. Returns {error} or {recipients}.
async function resolveAndValidate(parsed, user) {
  const pay = parsed.payment || {}
  const out = []
  const notFound = []
  const selfRecipients = []

  for (const r of (pay.recipients || [])) {
    const key = normalizeVel(r.name) || r.address || r.email
    if (!key) continue
    const resolved = await resolveRecipient(key)
    if (!resolved) { notFound.push(key); continue }
    if (isSelfSend(resolved, user)) { selfRecipients.push(resolved.label || key); continue }
    out.push({ ...r, resolved })
  }

  // Collect ALL problems and report them together (better UX than one-at-a-time).
  const problems = []
  if (notFound.length) problems.push(await missingText(notFound))
  if (selfRecipients.length === 1) problems.push(`${selfRecipients[0]} is your own account`)
  else if (selfRecipients.length > 1) problems.push(`${selfRecipients.join(', ')} are your own account`)

  if (problems.length > 0) {
    if (out.length === 0) {
      // nothing valid left to send to
      return { error: `${problems.join('. ')}. Please check the recipients and try again.` }
    }
    const others = out.map(r => r.resolved?.label || r.name || r.email || r.address).join(', ')
    // Some recipients are bad/self, but valid ones remain -> offer to proceed with just those.
    return {
      droppable: true,
      validRecipients: out,
      ask: `${problems.join(', and ')}. I can still send to ${others} — want me to do that, or fix the others first?`,
    }
  }

  return { recipients: out }
}

// Build + save the pending proposal.
async function propose(user, parsed, extra = {}) {
  const pay = parsed.payment || {}
  const pendingTx = {
    id: crypto.randomUUID(),
    intent: parsed.intent,
    payment: pay,
    summary: parsed.summary,
    status: 'pending',
    ...extra,
  }
  await supabaseAdmin.from('agent_conversations').upsert({
    user_address: user.address,
    last_intent: parsed.intent,
    pending_tx: pendingTx,
    pending_state: null,
    pending_parse: null,
    updated_at: new Date(),
  }, { onConflict: 'user_address' })
  return {
    mode: 'propose',
    intent: parsed.intent,
    summary: parsed.summary,
    payment: pay,
    pendingTxId: pendingTx.id,
    ...extra,
  }
}

const fmtTok = (n) => (n >= 1 ? n.toFixed(4) : Number(n.toPrecision(3)).toString())

// Given a parse that has an amount + chosen token, check balance and either
// propose or report a shortfall. usdMode = the amount is a USD value to convert.
async function settleWithToken(user, parsed, symbol) {
  const pay = parsed.payment
  const token = getToken(symbol)
  const held = await balanceOf(user.address, symbol)

  let tokenAmount = pay.amount
  let note = ''
  if (parsed.needs_token_choice || pay.currency === 'USD' || pay.amount_in_usd) {
    // amount is a USD value -> convert to the chosen token
    const price = await getUsdPrice(symbol)
    if (!(price > 0)) {
      return { mode: 'clarify', reply: `I can't get a live ${symbol} price right now, so I can't turn $${pay.amount} into ${symbol}. Try again in a minute, or give the amount in ${symbol}.` }
    }
    const rate = 1 / price
    tokenAmount = Number(pay.amount) * rate
    // Per-person amounts in a split are dollars too: convert each one the same way,
    // so nobody is sent "5 SOL" when they were meant to get $5.
    for (const r of (pay.recipients || [])) {
      if (r.amount != null && r.usd_amount == null) { r.usd_amount = Number(r.amount); r.amount = Number(r.amount) * rate }
    }
    pay.usd_amount = Number(pay.amount)
    pay.amount_in_usd = false
    note = `$${pay.amount} ≈ ${fmtTok(tokenAmount)} ${symbol} (at $${price.toFixed(2)}/${symbol})`
  }

  const enough = hasEnough(held, tokenAmount)
  if (!enough.ok) {
    const bals = await getAllBalances(user.address)
    return {
      mode: 'insufficient',
      reply: `You don't have enough ${symbol}. This needs ${fmtTok(tokenAmount)} ${symbol}${pay.usd_amount != null ? ` ($${pay.usd_amount})` : ''}, but you hold ${fmtTok(held)} ${symbol}.\n\nYour balances: ${formatBalances(bals)}\n\nWant to use a different token, or change the amount?`,
    }
  }

  // lock in the resolved token + amount
  pay.currency = symbol
  pay.token_amount = tokenAmount
  parsed.needs_token_choice = false
  // rebuild a clean summary from the now-final fields (no stale 'requires token choice' text)
  parsed.summary = buildSummary(parsed.intent, pay) + (note ? ` — ${note}` : '')
  return await propose(user, parsed, { note })
}

// POST /agent/message
router.post('/message', requireAuth, async (req, res) => {
  try {
    const { message } = req.body
    if (!message) return res.status(400).json({ error: 'message required' })
    const user = req.user

    // load any pending multi-turn state
    const { data: convo } = await supabaseAdmin
      .from('agent_conversations').select('*').eq('user_address', user.address).single()

    // --- conversation memory: rolling window of recent user messages ---
    const userHistory = Array.isArray(convo?.history) ? convo.history : []
    const ctxBlock = userHistory.length
      ? `Earlier in this conversation the user said:\n${userHistory.slice(-6).map(m => `- "${m}"`).join('\n')}\n\nLatest message: "${message}"\n\nInterpret the LATEST message. Use the earlier lines only to resolve references like "them", "the two", or "those people", or to carry forward an amount or recipients already stated. If the latest message fully specifies the action, use it as-is.`
      : message
    try {
      await supabaseAdmin.from('agent_conversations').upsert(
        { user_address: user.address, history: [...userHistory, message].slice(-8), updated_at: new Date() },
        { onConflict: 'user_address' })
    } catch (e) { /* history column optional */ }

    // --- MULTI-TURN: awaiting a token choice ---
    if (convo?.pending_state === 'awaiting_token' && convo?.pending_parse) {
      const bals = await getAllBalances(user.address)
      const symbol = pickTokenFromMessage(message, bals)
      if (!symbol) {
        return res.json({
          mode: 'choose_token',
          reply: `I didn't catch which token. You hold: ${formatBalances(bals)}. Which would you like to use?`,
        })
      }
      const result = await settleWithToken(user, convo.pending_parse, symbol)
      return res.json(result)
    }

    // --- MULTI-TURN: awaiting confirmation to drop a self-recipient and send to the rest ---
    if (convo?.pending_state === 'awaiting_drop_self_confirm' && convo?.pending_parse) {
      const yes = /\b(yes|yeah|yep|sure|ok|okay|go ahead|do it|send|proceed|confirm)\b/i.test(message)
      const no = /\b(no|nope|cancel|stop|don'?t)\b/i.test(message)
      if (yes && !no) {
        const parsed = convo.pending_parse
        // recipients already resolved + self stripped when we saved this state
        return res.json(await propose(user, parsed))
      }
      // clear the pending state and ask them to restate
      await supabaseAdmin.from('agent_conversations')
        .update({ pending_state: null, pending_parse: null })
        .eq('user_address', user.address)
      return res.json({ mode: 'clarify', reply: "Okay, I won't send that. Tell me the corrected payment and I'll set it up." })
    }

    // --- MULTI-TURN: finish an in-progress draft BEFORE classifying ---
    // A bare answer like "usdc" or "0.003 sui" must complete the draft, not get
    // misrouted by the classifier. Only fall through if it adds nothing (topic switch).
    if (convo?.pending_state === 'drafting' && convo?.pending_parse) {
      if (isFiller(message))
        return await routePayment(res, user, convo.pending_parse, ctxBlock)
      let fresh = null
      for (let a = 0; a < 2 && !fresh; a++) {
        try {
          fresh = JSON.parse(strip(await callModel(MODELS.parser, [
            { role: 'system', content: PARSER_SYS },
            { role: 'user', content: ctxBlock },
          ], { json: true })))
        } catch { fresh = null }
      }
      if (advancesDraft(fresh))
        return await routePayment(res, user, applyDollarFigure(mergeParsed(convo.pending_parse, fresh), message), ctxBlock)
      // not a slot answer -> fall through and treat as a fresh message
    }

    // --- STEP 1: classify ---
    const klass = (await callModel(MODELS.classifier, [
      { role: 'system', content: CLASSIFIER_SYS },
      { role: 'user', content: ctxBlock },
    ])).toLowerCase().trim()

    // --- real-data answers: balance / activity / lookup ---
    if (klass === 'balance') {
      const bals = await getAllBalances(user.address)
      const line = formatBalances(bals)
      if (!bals.length)
        return res.json({ mode: 'assistant', reply: `Your wallet is empty right now \u2014 no tokens yet. Once you receive some, it'll show up here.` })
      let totalUsd = 0
      for (const b of bals) { const px = await getUsdPrice(b.symbol); if (px) totalUsd += (b.human || 0) * px }
      return res.json({ mode: 'assistant', reply: `Here's what you're holding: ${line} \u2014 about $${totalUsd.toFixed(2)}. Want to send, split, or stream any of it?` })
    }
    if (klass === 'activity') {
      const { data: txs } = await supabaseAdmin.from('transactions').select('*')
        .eq('user_address', user.address).order('created_at', { ascending: false }).limit(5)
      if (!txs || txs.length === 0)
        return res.json({ mode: 'assistant', reply: "You don't have any transactions yet. Once you send or receive, they'll show up here and in the Activity tab." })
      const lines = txs.map(t => {
        const out = t.direction === 'out'
        const who = t.label || (out ? 'Sent' : 'Received')
        const amt = t.amount != null ? ` ${out ? '-' : '+'}${t.amount}${t.token ? ' ' + t.token : ''}` : ''
        return `\u2022 ${who}${amt}`
      }).join('\n')
      return res.json({ mode: 'assistant', reply: `Here are your most recent transactions:\n${lines}\n\nThe full history lives in the Activity tab.` })
    }
    if (klass === 'lookup') {
      const m = String(message).match(/([a-z0-9_]+\.vel|[1-9A-HJ-NP-Za-km-z]{32,44})/i)
      if (!m) return res.json({ mode: 'assistant', reply: 'Tell me the .vel name or address to check \u2014 like "is jordan.vel on Velfi?"' })
      const target = m[1]
      const resolved = await resolveRecipient(target)
      return res.json({ mode: 'assistant', reply: (resolved && resolved.address)
        ? `Yes \u2014 ${target} is on Velfi. Tell me an amount and I'll set up the payment (e.g. \"send 5 USDC to ${target}\").`
        : `${await missingText([target])}. Double-check the name, or send to a Solana address instead.` })
    }

    // --- STEP 2a: assistant ---
    if (klass !== 'payment') {
      const answer = await callModel(MODELS.assistant, [
        { role: 'system', content: ASSISTANT_SYS(VELFI_KB) },
        { role: 'user', content: ctxBlock },
      ])
      return res.json({ mode: 'assistant', reply: answer })
    }

    // --- STEP 2b: parse ---
    let parsed = null
    for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
      try {
        parsed = JSON.parse(strip(await callModel(MODELS.parser, [
          { role: 'system', content: PARSER_SYS },
          { role: 'user', content: ctxBlock },
        ], { json: true })))
      } catch { parsed = null }
    }
    if (!parsed) {
      return res.json({ mode: 'assistant', reply: "Hmm, I couldn't quite find who you're paying. Try their name in .vel format, like jordan.vel — or a Solana address or their email works too. Then just tell me the amount, e.g. send 20 USDC to jordan.vel." })
    }

    if (!validateSchema(parsed).ok)
      return res.json({ mode: 'clarify', reply: "Could you rephrase that? I want to get the details right." })

    // slot-fill: merge into any in-progress draft so earlier details aren't lost
    if (convo?.pending_state === 'drafting' && convo?.pending_parse)
      parsed = mergeParsed(convo.pending_parse, parsed)

    return await routePayment(res, user, applyDollarFigure(parsed, message), ctxBlock)
  } catch (err) {
    console.error('agent error:', err)
    res.status(500).json({ error: friendlyError(err) })
  }
})

// Keep a float in Velfi's fee payer. Below this, pause new payments rather than fail mid-way.
const MIN_FEE_PAYER_LAMPORTS = Number(process.env.MIN_FEE_PAYER_SOL || 0.05) * 1e9
async function feePayerLow() {
  try {
    const l = await feePayerLamports()
    if (l < MIN_FEE_PAYER_LAMPORTS) { console.error(`FEE PAYER LOW: ${l / 1e9} SOL. Top it up now.`); return true }
    return false
  } catch { return false }
}

// For the signing flow: our own validation errors are written for people, so show
// them; anything that looks like a crash gets the generic line.
function userError(err) {
  const m = String(err?.message || err || '')
  if (/fetch failed|ECONN|ETIMEDOUT|ENOTFOUND|socket/i.test(m)) return 'I hit a network hiccup just now. Mind trying that once more?'
  if (!m || m.length > 220 || /TypeError|ReferenceError|undefined|Cannot read/i.test(m)) return 'Something glitched on my end. Try that again and I\'ll pick it right back up.'
  return m
}

// Turn raw errors into something a person can act on (no scary "fetch failed").
function friendlyError(err) {
  const m = String(err?.message || err || '')
  if (/fetch failed|ECONN|ETIMEDOUT|ENOTFOUND|network|timeout|socket/i.test(m))
    return "I hit a network hiccup reaching the model just now — mind sending that once more?"
  return "Something glitched on my end — try that again and I'll pick it right back up."
}

// Bare affirmations ("ok", "do it") carry no new info — re-ask the missing slot instead of re-parsing.
const FILLER_RE = /^(ok(ay)?|kk?|yes|yep|yeah|ya|sure|cool|go( ahead)?|do it|send( it)?|proceed|confirm|that'?s? (it|right)|right)\.?\s*$/i
function isFiller(msg) { return FILLER_RE.test(String(msg || '').trim()) }

// Does this fresh parse actually add a payment slot? If not, it's a topic switch, not a draft answer.
function advancesDraft(fresh) {
  if (!fresh) return false
  if (fresh.intent && fresh.intent !== 'unknown') return true
  const p = fresh.payment || {}
  if (p.amount != null) return true
  if (p.currency && p.currency !== 'USD') return true
  if (Array.isArray(p.recipients) && p.recipients.some(r => r && (r.name || r.address || r.email))) return true
  if (Array.isArray(p.actions) && p.actions.length) return true
  const sc = p.schedule || {}
  if (sc.frequency || sc.duration_secs || sc.duration_minutes || sc.duration_days || sc.occurrences) return true
  const sw = p.swap || {}
  if (sw.from_token || sw.to_token || sw.amount != null) return true
  return false
}

// Remember an in-progress action so the NEXT message only has to add the missing piece.
async function saveDraft(user, parsed) {
  try {
    await supabaseAdmin.from('agent_conversations')
      .update({ pending_state: 'drafting', pending_parse: parsed, updated_at: new Date() })
      .eq('user_address', user.address)
  } catch (e) { /* non-fatal */ }
}

// Deterministic merge: keep everything we already learned, let the new turn fill/override.
function mergeParsed(draft, fresh) {
  if (!draft) return fresh
  if (!fresh) return draft
  const dp = draft.payment || {}, fp = fresh.payment || {}
  const keep = (a, b) => (b !== null && b !== undefined && b !== '' ? b : a)
  const tokFresh = fp.currency && fp.currency !== 'USD'
  const tokDraft = dp.currency && dp.currency !== 'USD'
  const hasRec = arr => Array.isArray(arr) && arr.some(r => r && (r.name || r.address || r.email))
  const dsch = dp.schedule || {}, fsch = fp.schedule || {}
  const dsw = dp.swap || {}, fsw = fp.swap || {}
  const payment = {
    ...dp, ...fp,
    amount: keep(dp.amount, fp.amount),
    currency: tokFresh ? fp.currency : (tokDraft ? dp.currency : (fp.currency || dp.currency || 'USD')),
    recipients: hasRec(fp.recipients) ? fp.recipients : dp.recipients,
    actions: (Array.isArray(fp.actions) && fp.actions.length) ? fp.actions : dp.actions,
    schedule: {
      ...dsch, ...fsch,
      frequency: keep(dsch.frequency, fsch.frequency),
      duration_secs: keep(dsch.duration_secs, fsch.duration_secs),
      duration_minutes: keep(dsch.duration_minutes, fsch.duration_minutes),
      duration_days: keep(dsch.duration_days, fsch.duration_days),
      occurrences: keep(dsch.occurrences, fsch.occurrences),
    },
    swap: {
      ...dsw, ...fsw,
      from_token: keep(dsw.from_token, fsw.from_token),
      to_token: keep(dsw.to_token, fsw.to_token),
      amount: keep(dsw.amount, fsw.amount),
    },
  }
  const intent = (fresh.intent && fresh.intent !== 'unknown') ? fresh.intent : draft.intent
  return {
    ...draft, ...fresh,
    intent,
    needs_clarification: false,
    needs_token_choice: payment.currency === 'USD' ? (fresh.needs_token_choice ?? draft.needs_token_choice ?? false) : false,
    payment,
  }
}

// ===== payment routing — shared by fresh messages and drafting (slot-fill) =====
async function routePayment(res, user, parsed, ctxBlock = '') {
  await saveDraft(user, parsed)   // checkpoint so the next turn can complete it
  try {
    // --- MULTI-TOKEN: explicit per-leg token+amount+recipient (atomic, one approval) ---
    {
      const rawActions = parsed.payment?.actions
      if (Array.isArray(rawActions) && rawActions.length) {
        const va = validateActions(rawActions)
        if (!va.ok) return res.json({ mode: 'clarify', reply: `I couldn't work that out — ${va.error}. Try e.g. send 0.01 SOL to joshhhy.vel and 2 USDC to lazarus.vel.` })
        const legs = [], notFound = [], selfHit = []
        for (const a of rawActions) {
          const sym = String(a.token || '').toUpperCase()
          const tk = getToken(sym)
          if (!tk) return res.json({ mode: 'clarify', reply: `I can only move SOL or USDC right now, not ${a.token}.` })
          const key = normalizeVel(a.recipient?.name) || a.recipient?.address || a.recipient?.email
          const resolved = await resolveRecipient(key)
          if (!resolved) { notFound.push(key); continue }
          if (isSelfSend(resolved, user)) { selfHit.push(resolved.label || key); continue }
          legs.push({ token: sym, amount: Number(a.amount), recipient: { name: resolved.label || key, resolved } })
        }
        if (notFound.length || selfHit.length) {
          const probs = []
          if (notFound.length) probs.push(await missingText(notFound))
          if (selfHit.length) probs.push(`${selfHit.join(', ')} is your own account`)
          return res.json({ mode: 'clarify', reply: `${probs.join(', and ')}. Fix that and I'll set it right up.` })
        }
        const needByTok = {}
        for (const l of legs) needByTok[l.token] = (needByTok[l.token] || 0) + l.amount
        for (const sym of Object.keys(needByTok)) {
          const held = await balanceOf(user.address, sym)
          if (held < needByTok[sym]) {
            const bals = await getAllBalances(user.address)
            return res.json({ mode: 'insufficient', reply: `You don't have enough ${sym}. This needs ${needByTok[sym].toFixed(4)} ${sym}, but you hold ${held.toFixed(4)} ${sym}.\n\nYour balances: ${formatBalances(bals)}` })
          }
        }
        const human = legs.map(l => `${l.amount} ${l.token} to ${l.recipient.name}`).join(' and ')
        parsed.intent = 'send'
        parsed.needs_token_choice = false
        parsed.summary = `Sending ${human} — ready when you are.`
        parsed.payment = {
          ...parsed.payment,
          currency: legs[0].token,
          recipients: legs.map(l => ({ name: l.recipient.name, resolved: l.recipient.resolved, amount: l.amount, token: l.token })),
        }
        const actions = legs.map(l => ({ token: l.token, amount: l.amount, recipient: { name: l.recipient.name, resolved: l.recipient.resolved } }))
        return res.json(await propose(user, parsed, { actions }))
      }
    }

    // SWAP: dedicated path (no recipient resolution) — Jupiter on mainnet
    if (parsed.intent === 'swap') {
      const sw = parsed.payment?.swap || {}
      const from = String(sw.from_token || '').toUpperCase()
      const to = String(sw.to_token || '').toUpperCase()
      const amt = Number(sw.amount)
      if (!from || !to)
        return res.json({ mode: 'clarify', reply: "What are you swapping \u2014 from which token to which? (e.g. swap 0.5 SOL to USDC)" })
      if (!amt || amt <= 0)
        return res.json({ mode: 'clarify', reply: `How much ${from} would you like to swap?` })
      let summary = `Swapping ${amt} ${from} for ${to}.`
      try {
        const { expectedOut } = await quoteSwap({ fromToken: from, toToken: to, amount: amt })
        summary = `Swapping ${amt} ${from} for about ${expectedOut.toFixed(3)} ${to} \u2014 ready when you are.`
      } catch (e) { return res.json({ mode: 'clarify', reply: e.message }) }
      parsed.payment.swap = { from_token: from, to_token: to, amount: amt }
      parsed.summary = summary
      return res.json(await propose(user, parsed))
    }

    // STREAM: dedicated path — resolve recipient, persist + auto-run via the stream engine
    if (parsed.intent === 'stream') {
      if (!PROGRAM_ENABLED) return res.json({ mode: 'assistant', reply: STREAMS_SOON })
      const pay = parsed.payment || {}
      const sym = String(pay.currency || 'USDC').toUpperCase()
      const total = Number(pay.amount)
      const rc = (pay.recipients || [])[0] || {}
      const sch = pay.schedule || {}
      let durationSecs = sch.duration_secs ? Number(sch.duration_secs)
        : sch.duration_minutes ? Number(sch.duration_minutes) * 60
        : sch.duration_days ? Number(sch.duration_days) * 86400 : null
      const tk = getToken(sym)
      if (!tk || tk.mint === 'native')
        return res.json({ mode: 'clarify', reply: 'I can stream USDC for now. Want to stream it in USDC?' })
      if (!total || total <= 0)
        return res.json({ mode: 'clarify', reply: 'How much would you like to stream, and over how long?' })
      if (!durationSecs || durationSecs <= 0)
        return res.json({ mode: 'clarify', reply: `Over how long should I stream the ${total} ${sym}? (e.g. "over 30 days")` })
      const who = rc.name || rc.email || rc.address
      if (!who)
        return res.json({ mode: 'clarify', reply: 'Who should the stream pay? A .vel name, address, or email.' })
      const resolved = await resolveRecipient(who)
      if (!resolved?.address)
        return res.json({ mode: 'clarify', reply: `${await missingText([who])}. Try a .vel name or a Solana address.` })
      const held = await balanceOf(user.address, sym)
      if (held < total)
        return res.json({ mode: 'insufficient', reply: `This stream needs ${total} ${sym}, but your wallet holds ${held.toFixed(4)} ${sym}.` })
      parsed.payment = { ...pay, currency: sym, amount: total, recipients: [{ name: rc.name || null, address: resolved.address }],
        stream: { recipient: resolved.address, recipientName: rc.name || who, token: sym, total_amount: total, duration_secs: durationSecs } }
      parsed.summary = `Streaming ${total} ${sym} to ${rc.name || who} \u2014 it starts vesting the moment you approve, and they can claim anytime.`
      return res.json(await propose(user, parsed))
    }

    // SCHEDULE: dedicated path — recurring payments via the schedule engine
    if (parsed.intent === 'schedule') {
      const pay = parsed.payment || {}
      let sym = String(pay.currency || 'USDC').toUpperCase()
      if (sym === 'USD') sym = 'USDC'   // "$5 weekly" = 5 USDC weekly (1 USDC = $1)
      if (pay.amount_in_usd && sym === 'USDC') pay.amount_in_usd = false
      if (sym !== 'USDC' && !getToken(sym)) return res.json({ mode: 'clarify', reply: unsupportedToken(sym, pay) })
      const amount = Number(pay.amount)
      const rc = (pay.recipients || [])[0] || {}
      const sch = pay.schedule || {}
      const frequency = sch.frequency || null
      // No count given: 4 payments (the approval covers exactly that many, so say it).
      const occurrences = Math.min(Number(sch.occurrences || sch.count) || 4, 120)
      const tk = getToken(sym)
      if (!tk || tk.mint === 'native')
        return res.json({ mode: 'clarify', reply: 'I can schedule USDC payments for now. Want to schedule it in USDC?' })
      if (!amount || amount <= 0)
        return res.json({ mode: 'clarify', reply: 'How much should each scheduled payment be?' })
      if (!frequency)
        return res.json({ mode: 'clarify', reply: 'How often \u2014 daily, weekly, or monthly?' })
      try { scheduleToMandate({ amountUnits: 1n, frequency, occurrences }) }
      catch (e) { return res.json({ mode: 'clarify', reply: e.message }) }
      const who = rc.name || rc.email || rc.address
      if (!who)
        return res.json({ mode: 'clarify', reply: 'Who should the scheduled payments go to? A .vel name, address, or email.' })
      const resolved = await resolveRecipient(who)
      if (!resolved?.address)
        return res.json({ mode: 'clarify', reply: `${await missingText([who])}. Try a .vel name or a Solana address.` })
      const held = await balanceOf(user.address, sym)
      if (held < amount)
        return res.json({ mode: 'insufficient', reply: `Each payment is ${amount} ${sym}, but your wallet only holds ${held.toFixed(4)} ${sym}.` })
      parsed.payment = { ...pay, currency: sym, amount, recipients: [{ name: rc.name || null, address: resolved.address }],
        sched: { recipient: resolved.address, recipientName: rc.name || who, token: sym, amount, frequency, occurrences } }
      parsed.summary = `Scheduling ${amount} ${sym} to ${rc.name || who} ${frequency}${occurrences ? ` for ${occurrences} payments` : ''} \u2014 starts once you approve.`
        + (PROGRAM_ENABLED ? '' : ' You approve once; the money stays in your wallet until each payment, and you can cancel anytime.')
      return res.json(await propose(user, parsed))
    }

    // scope guard: only send/split execute today — never propose what /run can't run
    if (!['send', 'split'].includes(parsed.intent)) {
      const _names = { swap: 'Token swaps', stream: 'Streaming payments', schedule: 'Scheduled payments', escrow: 'Escrow', automate: 'Automations' }
      const _what = _names[parsed.intent] || 'That feature'
      return res.json({ mode: 'assistant', reply: `${_what} — coming soon. Right now I can send, split${PROGRAM_ENABLED ? ', stream' : ''} and schedule. Want to do one of those?` })
    }

    // low-confidence double-check
    if (parsed.confidence < CONFIDENCE_FLOOR && !parsed.needs_clarification) {
      try {
        const second = JSON.parse(strip(await callModel(MODELS.doublecheck, [
          { role: 'system', content: PARSER_SYS },
          { role: 'user', content: ctxBlock || JSON.stringify(parsed.payment || {}) },
        ], { json: true })))
        if (parsesAgree(parsed, second)) parsed.confidence = Math.max(parsed.confidence, 0.7)
        else { parsed.needs_clarification = true; parsed.clarifying_question ||= "Can you restate the amount and who it's going to?" }
      } catch {}
    }

    if (needsClarification(parsed))
      return res.json({ mode: 'clarify', reply: parsed.clarifying_question || "Can you give me a bit more detail — amount and recipient?" })

    // resolve recipients + validate
    const rv = await resolveAndValidate(parsed, user)
    if (rv.error) return res.json({ mode: 'clarify', reply: rv.error })
    if (rv.droppable) {
      // save the valid (self/bad stripped) recipients; user confirms to proceed
      const strippedPay = { ...parsed.payment, recipients: rv.validRecipients }
      // recompute amount for the stripped set (per-recipient amounts) so totals are correct
      if (rv.validRecipients.every(r => r.amount != null)) {
        strippedPay.amount = rv.validRecipients.reduce((s, r) => s + Number(r.amount), 0)
      }
      // single remaining recipient -> it's really a send, not a split
      const strippedIntent = rv.validRecipients.length === 1 && parsed.intent === 'split' ? 'send' : parsed.intent
      const pendingParse = { ...parsed, intent: strippedIntent, payment: strippedPay, summary: buildSummary(strippedIntent, strippedPay) }
      await supabaseAdmin.from('agent_conversations').upsert({
        user_address: user.address,
        pending_state: 'awaiting_drop_self_confirm',
        pending_parse: pendingParse,
        pending_tx: null,
        updated_at: new Date(),
      }, { onConflict: 'user_address' })
      return res.json({ mode: 'clarify', reply: rv.ask })
    }
    parsed.payment.recipients = rv.recipients

    // amount sanity (skip automate)
    if (!['automate','swap'].includes(parsed.intent)) {
      const amt = validateAmount(parsed.payment.amount)
      if (!amt.ok) return res.json({ mode: 'clarify', reply: 'How much would you like to send?' })
      parsed.payment.amount = amt.value
    }

    // split math
    if (parsed.intent === 'split') {
      normalizeSplit(parsed.payment)
      const sp = validateSplit(parsed.payment.recipients)
      if (!sp.ok) return res.json({ mode: 'clarify', reply: `I couldn't work out the split — ${sp.error}.` })
    }

    // --- TOKEN CHOICE: amount given as a value, no token chosen ---
    if (parsed.needs_token_choice && ['send','split','stream','schedule'].includes(parsed.intent)) {
      const bals = await getAllBalances(user.address)
      await supabaseAdmin.from('agent_conversations').upsert({
        user_address: user.address,
        pending_state: 'awaiting_token',
        pending_parse: parsed,
        pending_tx: null,
        updated_at: new Date(),
      }, { onConflict: 'user_address' })
      return res.json({
        mode: 'choose_token',
        reply: `Which token should I use for this $${parsed.payment.amount} payment? You hold: ${formatBalances(bals)}.`,
        summary: parsed.summary,
      })
    }

    // --- token named explicitly: check balance, then propose ---
    if (['send','split','stream','schedule'].includes(parsed.intent) && parsed.payment.currency !== 'USD') {
      if (!getToken(parsed.payment.currency)) return res.json({ mode: 'clarify', reply: unsupportedToken(parsed.payment.currency, parsed.payment) })
      const result = await settleWithToken(user, parsed, parsed.payment.currency)
      return res.json(result)
    }

    // escrow / automate / fallback: propose directly
    return res.json(await propose(user, parsed))
  } catch (err) {
    console.error('routePayment error:', err)
    return res.json({ mode: 'clarify', reply: friendlyError(err) })
  }
}

// POST /agent/cancel/:id
router.post('/cancel/:id', requireAuth, async (req, res) => {
  try {
    await supabaseAdmin.from('agent_conversations').update({ pending_tx: null, pending_state: null, pending_parse: null }).eq('user_address', req.user.address)
    res.json({ success: true, message: 'Cancelled' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /agent/revise/:id — user manually edits a pending proposal; re-validate EVERYTHING
router.post('/revise/:id', requireAuth, async (req, res) => {
  try {
    const user = req.user
    const { edits } = req.body // { intent?, amount?, currency?, recipients?, schedule?, condition?, rule? }
    if (!edits || typeof edits !== 'object') return res.status(400).json({ error: 'edits required' })

    const { data: convo } = await supabaseAdmin
      .from('agent_conversations').select('*').eq('user_address', user.address).single()

    const pending = convo?.pending_tx
    if (!pending || pending.id !== req.params.id)
      return res.status(404).json({ error: 'no matching pending proposal' })

    const intent = edits.intent || pending.intent
    const pay = { ...(pending.payment || {}) }
    if (edits.amount != null) { pay.amount = edits.amount; pay.token_amount = null }
    if (edits.currency) pay.currency = edits.currency
    if (edits.recipients) pay.recipients = edits.recipients
    if (edits.schedule) pay.schedule = { ...(pay.schedule || {}), ...edits.schedule }
    if (edits.condition != null) pay.condition = edits.condition
    if (edits.rule) pay.rule = { ...(pay.rule || {}), ...edits.rule }

    const parsed = { intent, confidence: 1, needs_clarification: false, needs_token_choice: false, payment: pay, summary: null }

    // re-resolve recipients (edits may have added/changed them)
    const rv = await resolveAndValidate(parsed, user)
    if (rv.error) return res.json({ mode: 'clarify', reply: rv.error })
    if (rv.droppable) return res.json({ mode: 'clarify', reply: rv.ask })
    parsed.payment.recipients = rv.recipients

    // re-validate amount
    if (intent !== 'automate') {
      const amt = validateAmount(parsed.payment.amount)
      if (!amt.ok) return res.json({ mode: 'clarify', reply: `Amount issue: ${amt.error}.` })
      parsed.payment.amount = amt.value
    }
    // re-validate split
    if (intent === 'split') {
      const sp = validateSplit(parsed.payment.recipients)
      if (!sp.ok) return res.json({ mode: 'clarify', reply: `Split issue: ${sp.error}.` })
    }

    const symbol = parsed.payment.currency

    // explicit token -> rebuild summary + re-check balance + propose
    if (['send','split','stream','schedule'].includes(intent) && symbol && symbol !== 'USD') {
      parsed.summary = buildSummary(intent, parsed.payment)
      return res.json(await settleWithToken(user, parsed, symbol))
    }

    // still a USD value -> ask token again
    if (symbol === 'USD' && ['send','split','stream','schedule'].includes(intent)) {
      const bals = await getAllBalances(user.address)
      await supabaseAdmin.from('agent_conversations').upsert({
        user_address: user.address, pending_state: 'awaiting_token',
        pending_parse: parsed, pending_tx: null, updated_at: new Date(),
      }, { onConflict: 'user_address' })
      return res.json({ mode: 'choose_token', reply: `Which token for this $${parsed.payment.amount} payment? You hold: ${formatBalances(bals)}.` })
    }

    // escrow / automate -> rebuild summary + propose
    parsed.summary = buildSummary(intent, parsed.payment)
    return res.json(await propose(user, parsed))
  } catch (err) {
    console.error('revise error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ===== Signing flow =====
// 1. POST /agent/prepare/:id  -> Velfi builds the transaction for the pending
//    proposal, co-signs it as fee payer, and returns it for the user's wallet.
// 2. The app signs it with the user's Google wallet (Privy).
// 3. POST /agent/approve/:id { prepId, signedTx } -> Velfi checks it is exactly
//    what was prepared, sends it, and records the result.
async function loadPending(userAddress, id) {
  const { data: convo } = await supabaseAdmin.from('agent_conversations').select('*').eq('user_address', userAddress).single()
  const pending = convo?.pending_tx
  return pending && pending.id === id ? pending : null
}

router.post('/prepare/:id', requireAuth, async (req, res) => {
  try {
    const user = req.user
    const pending = await loadPending(user.address, req.params.id)
    if (!pending) return res.status(404).json({ error: 'That proposal has expired. Ask me again and I\'ll set it up.' })
    if (process.env.PAUSE_PAYMENTS === 'on')
      return res.status(503).json({ error: 'Velfi payments are paused for a few minutes of maintenance. Nothing was sent. Try again soon.' })
    if (pending.intent !== 'swap' && await feePayerLow())
      return res.status(503).json({ error: 'Velfi is topping up its network-fee wallet. Try again in a few minutes. Nothing was sent.' })

    if (pending.intent === 'swap') {
      const sw = pending.payment?.swap || {}
      const { quote, expectedOut } = await quoteSwap({ fromToken: sw.from_token, toToken: sw.to_token, amount: sw.amount })
      const tx = await buildSwapTx({ quote, userAddress: user.address })
      const prepId = remember({ userAddress: user.address, messageHash: versionedHash(tx), after: { type: 'swap', pending, expectedOut } })
      return res.json({ prepId, tx, versioned: true, note: `You'll get about ${expectedOut.toFixed(4)} ${sw.to_token}. Swaps pay a small SOL network fee.` })
    }

    if (pending.intent === 'stream') {
      if (!PROGRAM_ENABLED) return res.status(400).json({ error: STREAMS_SOON })
      const st = pending.payment?.stream || {}
      const token = getToken(st.token)
      const amountUnits = toBaseUnits(Number(st.total_amount).toFixed(token.decimals), token.decimals)
      const built = await buildStartStream({ userAddress: user.address, recipient: st.recipient, token, amountUnits, durationSecs: Number(st.duration_secs) })
      const prep = await prepareForUser(built.instructions)
      const prepId = remember({ userAddress: user.address, messageHash: prep.messageHash,
        after: { type: 'stream', pending, flow: built.flow.toString(), token: token.symbol, mint: token.mint, decimals: token.decimals, totalUnits: amountUnits.toString() } })
      return res.json({ prepId, tx: prep.tx })
    }

    if (pending.intent === 'schedule') {
      const sd = pending.payment?.sched || {}
      const token = getToken(sd.token)
      const amountUnits = toBaseUnits(Number(sd.amount).toFixed(token.decimals), token.decimals)
      if (!PROGRAM_ENABLED) {
        // Lite: one approval covering this schedule plus the user's other active ones in this token.
        const plan = scheduleToMandate({ amountUnits, frequency: sd.frequency, occurrences: sd.occurrences })
        // Limits how much any one approval exposes while Autopilot runs without the on-chain program.
        const cap = Number(process.env.MAX_SCHEDULE_TOTAL || 500)
        if (Number(sd.amount) * plan.count > cap)
          return res.status(400).json({ error: `For now a schedule can cover up to ${cap} ${token.symbol} in total. Try fewer payments or a smaller amount.` })
        const { data: mine } = await supabaseAdmin.from('scheduled_payments').select('*').eq('user_address', user.address)
        const allowanceUnits = allowanceFor(mine, token.mint, { plus: plan.totalBudget })
        const prep = await prepareForUser(await buildSetAllowance({ userAddress: user.address, token, allowanceUnits }))
        const prepId = remember({ userAddress: user.address, messageHash: prep.messageHash,
          after: { type: 'schedule', mode: 'delegate', pending, token: token.symbol, mint: token.mint, amountUnits: amountUnits.toString(),
            plan: { intervalSecs: plan.intervalSecs, count: plan.count } } })
        const total = Number(sd.amount) * plan.count
        return res.json({ prepId, tx: prep.tx, note: `This lets Velfi pay ${sd.recipientName} ${sd.amount} ${token.symbol} ${sd.frequency}, ${plan.count} times (${total} ${token.symbol} in total). The money stays in your wallet until each payment. Cancel anytime in Flows.` })
      }
      const built = await buildCreateScheduleMandate({ userAddress: user.address, recipient: sd.recipient, token, amountUnits, frequency: sd.frequency, occurrences: sd.occurrences })
      const prep = await prepareForUser(built.instructions)
      const prepId = remember({ userAddress: user.address, messageHash: prep.messageHash,
        after: { type: 'schedule', pending, mandate: built.mandate, token: token.symbol, mint: token.mint, amountUnits: amountUnits.toString(),
          plan: { intervalSecs: built.plan.intervalSecs, count: built.plan.count } } })
      const total = Number(sd.amount) * built.plan.count
      return res.json({ prepId, tx: prep.tx, note: `This locks ${total} ${token.symbol} in an on-chain mandate that can only pay ${sd.recipientName}, ${sd.amount} at a time. You can cancel it anytime and get the rest back.` })
    }

    // send / split / multi-token / email invites
    const built = await buildPayment(pending, user.address)
    const room = canOpenAccounts(user.address, built.newAccounts)
    if (!room.ok) return res.status(429).json({ error: room.reason === 'user'
      ? 'You\'ve sent to a lot of new wallets today. Velfi covers their setup cost, so there is a daily limit. Try again tomorrow, or send to people who already hold this token.'
      : 'Velfi is busy setting up new wallets right now. Try again in a little while. Nothing was sent.' })
    const prep = await prepareForUser(built.instructions)
    const prepId = remember({ userAddress: user.address, messageHash: prep.messageHash,
      after: { type: 'payment', pending, newAccounts: built.newAccounts, invites: built.invites.map(i => ({ ...i })) } })
    return res.json({ prepId, tx: prep.tx })
  } catch (err) {
    console.error('prepare error:', err)
    res.status(400).json({ error: userError(err) })
  }
})

router.post('/approve/:id', requireAuth, async (req, res) => {
  try {
    const user = req.user
    const { prepId, signedTx } = req.body || {}
    if (!prepId || !signedTx) return res.status(400).json({ error: 'prepId and signedTx required' })
    if (!allowSubmission(user.address)) return res.status(429).json({ error: 'Too many payments in a short time. Try again in a bit.' })
    const prep = take(prepId, user.address)
    if (!prep || prep.after?.pending?.id !== req.params.id)
      return res.status(410).json({ error: 'That approval expired. Slide again and I\'ll prepare a fresh one.' })
    const { after } = prep
    const pending = after.pending
    if (after.newAccounts && !canOpenAccounts(user.address, after.newAccounts).ok)
      return res.status(429).json({ error: 'Too many new wallets today. Try again tomorrow. Nothing was sent.' })

    const signature = after.type === 'swap'
      ? await submitVersioned(signedTx, prep.messageHash)
      : await submitUserSigned(signedTx, prep.messageHash)
    recordOpenedAccounts(user.address, after.newAccounts || 0)
    await supabaseAdmin.from('agent_conversations').update({ pending_tx: null }).eq('user_address', user.address)

    let message = 'Done.'
    if (after.type === 'payment') {
      await logLegs(user.address, signature, pending)
      await saveInvites({ fromAddress: user.address, invites: after.invites, signature })
      if (after.invites.length) message = `Sent. ${after.invites.map(i => i.email).join(', ')} will get it as soon as they sign up (or it comes back to you in 7 days).`
      else message = 'Sent.'
    } else if (after.type === 'stream') {
      const st = pending.payment?.stream || {}
      await recordStream({ userAddress: user.address, recipient: st.recipient, recipientName: st.recipientName, token: after.token, mint: after.mint,
        decimals: after.decimals, totalUnits: BigInt(after.totalUnits), durationSecs: Number(st.duration_secs), flow: after.flow, signature })
      message = 'Stream started. It vests every second and they can claim anytime.'
    } else if (after.type === 'schedule') {
      const sd = pending.payment?.sched || {}
      await recordSchedule({ userAddress: user.address, recipient: sd.recipient, recipientName: sd.recipientName, token: after.token, mint: after.mint,
        amount: Number(sd.amount), amountUnits: BigInt(after.amountUnits), frequency: sd.frequency, plan: after.plan,
        mandate: after.mandate || null, mode: after.mode || 'mandate', signature })
      tickSchedules().catch(e => console.error('initial schedule tick:', e.message))
      message = 'Schedule set. The first payment goes out now, the rest run on time.'
    } else if (after.type === 'swap') {
      const sw = pending.payment?.swap || {}
      await supabaseAdmin.from('transactions').insert({ user_address: user.address, digest: signature, type: 'swap',
        label: `Swapped ${sw.from_token} to ${sw.to_token}`, sub_label: sw.from_token, amount: Number(sw.amount), token: sw.from_token, direction: 'out' })
      message = 'Swap complete.'
    }
    await supabaseAdmin.from('notifications').insert({
      user_address: user.address, type: `${after.type}_done`, title: message.split('.')[0], body: 'Confirmed on Solana', action_url: explorerTx(signature),
    })
    res.json({ success: true, digest: signature, explorer: explorerTx(signature), message })
  } catch (err) {
    console.error('approve error:', err)
    res.status(400).json({ error: userError(err) })
  }
})

// Old Sui endpoint: the app now uses /prepare + /approve so the user signs.
router.post('/run/:id', requireAuth, (req, res) =>
  res.status(410).json({ error: 'Velfi now asks your wallet to sign. Update the app and slide to approve again.' }))

async function logLegs(userAddress, signature, pending) {
  const pay = pending.payment || {}
  const legs = Array.isArray(pending.actions) && pending.actions.length
    ? pending.actions.map(a => ({ token: String(a.token || a.currency || '').toUpperCase(), amount: a.amount,
        who: a.recipient?.name || a.recipient?.resolved?.label || a.recipient?.resolved?.address || null }))
    : (pay.recipients?.length ? pay.recipients : [{}]).map(r => ({ token: String(pay.currency || '').toUpperCase(),
        amount: r.amount ?? pay.token_amount ?? pay.amount, who: r.name || r.resolved?.label || r.resolved?.address || r.resolved?.email || null }))
  const { error } = await supabaseAdmin.from('transactions').insert(legs.map(l => ({
    user_address: userAddress, digest: signature, type: pending.intent || 'send',
    label: l.who ? `Sent to ${l.who}` : 'Sent', sub_label: l.token || null,
    amount: l.amount, token: l.token || null, direction: 'out', counterparty: l.who || null })))
  if (error) console.error('tx log failed (non-fatal):', error.message)
}

// GET /agent/flows — active streams + scheduled payments for the live "Active flows" UI
router.get('/flows', requireAuth, async (req, res) => {
  try {
    const addr = req.user.address
    const [streamsRes, schedRes] = await Promise.all([
      supabaseAdmin.from('streams').select('*').eq('user_address', addr).order('created_at', { ascending: false }),
      supabaseAdmin.from('scheduled_payments').select('*').eq('user_address', addr).order('created_at', { ascending: false }),
    ])
    const ACTIVE = new Set(['active', 'running', 'pending', 'streaming', 'failed'])
    const streams = (streamsRes.data || [])
      .filter(s => ACTIVE.has(String(s.status || 'active').toLowerCase()))
      .map(s => {
        const p = streamProgress(s)
        const rec = Array.isArray(s.recipients) ? s.recipients[0] : null
        return { type: 'stream', id: s.id, token: s.token || 'USDC', flow: s.flow_address || null,
          to: rec?.recipientName || rec?.name || rec?.label || 'recipient',
          total: p.total, done: p.vested, pct: p.pct, status: p.finished ? 'vested' : (s.status || 'active') }
      })
    const schedules = (schedRes.data || [])
      .filter(s => ACTIVE.has(String(s.status || 'active').toLowerCase()))
      .map(s => {
        const occ = Number(s.occurrences) || 0, did = Number(s.occurrences_done) || 0
        return { type: 'schedule', id: s.id, token: s.token || 'USDC', mandate: s.mandate_address || null,
          to: s.recipient_name || s.recipient || 'recipient',
          amount: Number(s.amount) || 0, frequency: s.frequency || 'recurring',
          occurrences: occ, occurrences_done: did,
          pct: occ > 0 ? Math.min(100, Math.round((did / occ) * 100)) : 0,
          next_run_at: s.next_run_at || null, status: s.status || 'active' }
      })
    res.json({ streams, schedules, count: streams.length + schedules.length })
  } catch (err) {
    console.error('flows error:', err)
    res.status(500).json({ error: err.message })
  }
})

// GET /activity — full transaction feed for the dashboard + modal
router.get('/activity', requireAuth, async (req, res) => {
  try {
    const addr = req.user.address
    const limit = Math.min(Number(req.query.limit) || 50, 100)
    const { data } = await supabaseAdmin.from('transactions').select('*')
      .eq('user_address', addr).order('created_at', { ascending: false }).limit(limit)
    const rows = (data || []).map(t => ({
      id: t.id,
      direction: t.direction || 'out',
      label: t.label || t.counterparty || (t.direction === 'in' ? 'Received' : 'Sent'),
      sub_label: t.sub_label || null,
      amount: t.amount != null ? Number(t.amount) : null,
      token: t.token || null,
      type: t.type || 'payment',
      digest: t.digest || null,
      created_at: t.created_at,
    }))
    res.json({ transactions: rows })
  } catch (err) {
    console.error('activity error:', err)
    res.json({ transactions: [] })
  }
})
export default router
