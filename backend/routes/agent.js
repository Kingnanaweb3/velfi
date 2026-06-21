import express from 'express'
import crypto from 'crypto'
import supabase from '../lib/supabase.js'
import supabaseAdmin from '../lib/supabaseAdmin.js'
import { provider } from '../lib/sui.js'
import { requireAuth } from '../middleware/auth.js'
import { callModel, MODELS } from '../lib/openrouter.js'
import { CLASSIFIER_SYS, PARSER_SYS, ASSISTANT_SYS } from '../lib/agentPrompts.js'
import { getAllBalances, balanceOf, formatBalances } from '../lib/balances.js'
import { usdToToken, getUsdPrice } from '../lib/pricing.js'
import { getToken } from '../lib/tokens.js'
import {
  validateSchema, validateAmount, validateSplit,
  isSelfSend, needsClarification, parsesAgree, hasEnough, CONFIDENCE_FLOOR,
  normalizeVel, normalizeSplit, validateActions
} from '../lib/agentValidators.js'
import { buildSummary } from '../lib/summarize.js'
import { TransactionBlock } from '@mysten/sui.js/transactions'
import { buildSend, buildSplit, signAndRun, addTransfer, agentAddress } from '../lib/txBuilder.js'
import { runSwap, quoteSwap } from '../lib/deepbookSwap.js'
import { startStream, tickStreams } from '../lib/streams.js'
import { createSchedule, tickSchedules } from '../lib/schedule.js'

const router = express.Router()

// Agent-custodial (demo): the agent wallet funds + signs every send, so balance
// checks must read THIS wallet so check == spend. Per-user signing comes later.
const FUNDING_ADDRESS = agentAddress()

const suiToMist = (x) => Math.round(Number(x) * 1e9)

// Map a saved proposal to a TransactionBlock. SUI + any verified token.
async function buildFromProposal(pending) {
  const pay = pending.payment || {}
  const token = getToken((pay.currency || '').toUpperCase())
  if (!token) throw new Error(`I don't recognize ${pay.currency || 'that token'} yet.`)

  const recips = (pay.recipients || []).map(r => ({
    address: r.resolved?.address || r.address,
    amount: r.amount ?? pay.token_amount ?? pay.amount,
  }))
  if (!recips.length || recips.some(r => !r.address))
    throw new Error('Missing a resolved recipient address.')

  const sender = agentAddress()
  const txb = new TransactionBlock()

  // multi-action: loop each leg onto ONE shared PTB -> atomic, one signature
  if (Array.isArray(pending.actions) && pending.actions.length) {
    for (const a of pending.actions) {
      const tk = getToken(String(a.token || a.currency || '').toUpperCase())
      if (!tk) throw new Error(`I don't recognize ${a.token || a.currency || 'one of those tokens'} yet.`)
      const addr = a.recipient?.resolved?.address || a.recipient?.address || a.address
      if (!addr) throw new Error('One of the actions is missing a resolved recipient.')
      await addTransfer(txb, { sender, recipient: addr, amount: a.amount, token: tk })
    }
    return txb
  }

  if (pending.intent === 'send') {
    await addTransfer(txb, { sender, recipient: recips[0].address, amount: pay.token_amount ?? pay.amount, token })
    return txb
  }
  if (pending.intent === 'split') {
    for (const r of recips)
      await addTransfer(txb, { sender, recipient: r.address, amount: r.amount, token })
    return txb
  }
  throw new Error(`Execution for "${pending.intent}" isn't wired yet.`)
}

const VELFI_KB = `
Velfi is a non-custodial AI money agent on the Sui blockchain. Tagline: tell your money what to do.
- Sign in with Google via zkLogin. No seed phrase, no extension. Switch devices and your wallet comes back.
- Claim a .vel name (like alice.vel) so people pay you by name instead of a long 0x address.
- Just say what you want in plain language. Velfi reads it, proposes the exact action, and only moves money after you approve and sign.
- Money actions: send, split (one amount across people), stream (pay out over time), schedule (recurring), escrow (held until a condition is met), automate (rules like "save 10% of anything I receive"), and swap (convert one token to another).
- Swaps run through DeepBook, Sui's on-chain order book, so you can convert tokens like SUI to USDC right inside the app.
- Pay a .vel name, a 0x address, or an email. If they're not on Velfi yet, the email invite lets them claim it on sign-up.
- Right now Velfi holds and sends SUI and native USDC on Sui. Support for more Sui tokens is coming soon.
- Every payment produces a tamper-proof receipt stored on Walrus, so there's a permanent, shareable record you actually own.
- Non-custodial: only you hold the keys. The agent never moves money on its own - every action needs your explicit approval and signature, and that can never be turned off. That's the whole point.
- Two modes: Assisted (you approve and sign each action) and Autopilot (the agent can act on its own, but only inside hard on-chain limits you set: a budget, a per-payment cap, and an allow-list of recipients).
- Built on Sui: sub-second finality, near-zero fees, Move smart contracts.
What Velfi can't do yet (be honest, never promise these):
- No fiat on/off-ramp - you can't buy crypto with a card or cash out to a bank inside Velfi.
- No loans, credit, yield, or investment products. Velfi never gives financial, tax, or legal advice.
- It only works with tokens and names that exist on Sui; it can't reach other chains.
- .vel names are free during early access. A mobile app is coming soon.
`.trim()

function strip(s){ return String(s).replace(/<think>[\s\S]*?<\/think>/gi,'').replace(/```json/gi,'').replace(/```/g,'').trim() }

// ---- working recipient resolver (unchanged) ----
async function resolveRecipient(input) {
  const clean = String(input).toLowerCase().trim()
  if (clean.endsWith('.vel')) {
    const username = clean.replace('.vel', '')
    const { data } = await supabaseAdmin.from('users').select('sui_address, username').eq('username', username).single()
    return data ? { address: data.sui_address, label: input } : null
  }
  if (clean.startsWith('0x')) return { address: clean, label: clean }
  if (clean.includes('@')) return { address: null, email: clean, label: clean, needsInvite: true }
  const { data } = await supabaseAdmin.from('users').select('sui_address, username').eq('username', clean).single()
  return data ? { address: data.sui_address, label: clean } : null
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
  if (notFound.length === 1) problems.push(`I couldn't find ${notFound[0]}`)
  else if (notFound.length > 1) problems.push(`I couldn't find ${notFound.join(', ')}`)
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

// Given a parse that has an amount + chosen token, check balance and either
// propose or report a shortfall. usdMode = the amount is a USD value to convert.
async function settleWithToken(user, parsed, symbol) {
  const pay = parsed.payment
  const token = getToken(symbol)
  const held = await balanceOf(FUNDING_ADDRESS, symbol)

  let tokenAmount = pay.amount
  let note = ''
  if (parsed.needs_token_choice || pay.currency === 'USD') {
    // amount is a USD value -> convert to the chosen token
    const converted = await usdToToken(pay.amount, symbol)
    if (converted == null) {
      return { mode: 'clarify', reply: `I can't price ${symbol} right now, so I can't convert $${pay.amount} into it. Try SUI or a stablecoin.` }
    }
    tokenAmount = converted
    const price = await getUsdPrice(symbol)
    note = `$${pay.amount} ≈ ${tokenAmount.toFixed(4)} ${symbol} (at $${price?.toFixed(4)}/${symbol})`
  }

  const enough = hasEnough(held, tokenAmount)
  if (!enough.ok) {
    const bals = await getAllBalances(FUNDING_ADDRESS)
    return {
      mode: 'insufficient',
      reply: `You don't have enough ${symbol}. This needs ${tokenAmount.toFixed(4)} ${symbol}, but you hold ${held.toFixed(4)} ${symbol}.\n\nYour balances: ${formatBalances(bals)}\n\nWant to use a different token, or change the amount?`,
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
      const bals = await getAllBalances(FUNDING_ADDRESS)
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
        return await routePayment(res, user, convo.pending_parse)
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
        return await routePayment(res, user, mergeParsed(convo.pending_parse, fresh))
      // not a slot answer -> fall through and treat as a fresh message
    }

    // --- STEP 1: classify ---
    const klass = (await callModel(MODELS.classifier, [
      { role: 'system', content: CLASSIFIER_SYS },
      { role: 'user', content: ctxBlock },
    ])).toLowerCase().trim()

    // --- real-data answers: balance / activity / lookup ---
    if (klass === 'balance') {
      const bals = await getAllBalances(FUNDING_ADDRESS)
      const line = formatBalances(bals)
      if (!line || line === '0.00 SUI')
        return res.json({ mode: 'assistant', reply: `Your wallet is empty right now \u2014 no tokens yet. Once you receive some, it'll show up here.` })
      let totalUsd = 0
      for (const b of bals) { const px = await getUsdPrice(b.symbol); if (px) totalUsd += (b.human || 0) * px }
      const naira = Math.round(totalUsd * 1550).toLocaleString('en-US')
      return res.json({ mode: 'assistant', reply: `Here's what you're holding: ${line} \u2014 about $${totalUsd.toFixed(2)} (\u2248 \u20A6${naira}). Want to send, split, or stream any of it?` })
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
      const m = String(message).match(/([a-z0-9_]+\.vel|0x[a-fA-F0-9]{6,})/i)
      if (!m) return res.json({ mode: 'assistant', reply: 'Tell me the .vel name or address to check \u2014 like "is jordan.vel on Velfi?"' })
      const target = m[1]
      const resolved = await resolveRecipient(target)
      return res.json({ mode: 'assistant', reply: (resolved && resolved.address)
        ? `Yes \u2014 ${target} is on Velfi. Tell me an amount and I'll set up the payment (e.g. \"send 5 SUI to ${target}\").`
        : `I couldn't find ${target} on Velfi yet. Double-check the name, or send to a 0x address or email instead.` })
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
      return res.json({ mode: 'assistant', reply: "Hmm, I couldn't quite find who you're paying. Try their name in .vel format, like jordan.vel — or a Sui address or their email works too. Then just tell me the amount, e.g. send 20 USDC to jordan.vel." })
    }

    if (!validateSchema(parsed).ok)
      return res.json({ mode: 'clarify', reply: "Could you rephrase that? I want to get the details right." })

    // slot-fill: merge into any in-progress draft so earlier details aren't lost
    if (convo?.pending_state === 'drafting' && convo?.pending_parse)
      parsed = mergeParsed(convo.pending_parse, parsed)

    return await routePayment(res, user, parsed)
  } catch (err) {
    console.error('agent error:', err)
    res.status(500).json({ error: friendlyError(err) })
  }
})

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
async function routePayment(res, user, parsed) {
  await saveDraft(user, parsed)   // checkpoint so the next turn can complete it
  try {
    // --- MULTI-TOKEN: explicit per-leg token+amount+recipient (atomic, one approval) ---
    {
      const rawActions = parsed.payment?.actions
      if (Array.isArray(rawActions) && rawActions.length) {
        const va = validateActions(rawActions)
        if (!va.ok) return res.json({ mode: 'clarify', reply: `I couldn't work that out — ${va.error}. Try e.g. send 0.01 SUI to joshhhy.vel and 0.02 USDC to lazarus.vel.` })
        const legs = [], notFound = [], selfHit = []
        for (const a of rawActions) {
          const sym = String(a.token || '').toUpperCase()
          const tk = getToken(sym)
          if (!tk || String(tk.coinType || '').startsWith('TODO')) return res.json({ mode: 'clarify', reply: `I can only move SUI or USDC right now, not ${a.token}.` })
          const key = normalizeVel(a.recipient?.name) || a.recipient?.address || a.recipient?.email
          const resolved = await resolveRecipient(key)
          if (!resolved) { notFound.push(key); continue }
          if (isSelfSend(resolved, user)) { selfHit.push(resolved.label || key); continue }
          legs.push({ token: sym, amount: Number(a.amount), recipient: { name: resolved.label || key, resolved } })
        }
        if (notFound.length || selfHit.length) {
          const probs = []
          if (notFound.length) probs.push(`I couldn't find ${notFound.join(', ')}`)
          if (selfHit.length) probs.push(`${selfHit.join(', ')} is your own account`)
          return res.json({ mode: 'clarify', reply: `${probs.join(', and ')}. Fix that and I'll set it right up.` })
        }
        const needByTok = {}
        for (const l of legs) needByTok[l.token] = (needByTok[l.token] || 0) + l.amount
        for (const sym of Object.keys(needByTok)) {
          const held = await balanceOf(FUNDING_ADDRESS, sym)
          if (held < needByTok[sym]) {
            const bals = await getAllBalances(FUNDING_ADDRESS)
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

    // SWAP: dedicated path (no recipient resolution) — DeepBook execution
    if (parsed.intent === 'swap') {
      const sw = parsed.payment?.swap || {}
      const from = String(sw.from_token || '').toUpperCase()
      const to = String(sw.to_token || '').toUpperCase()
      const amt = Number(sw.amount)
      if (!from || !to)
        return res.json({ mode: 'clarify', reply: "What are you swapping \u2014 from which token to which? (e.g. swap 0.5 SUI to DEEP)" })
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
      const pay = parsed.payment || {}
      const sym = String(pay.currency || 'SUI').toUpperCase()
      const total = Number(pay.amount)
      const rc = (pay.recipients || [])[0] || {}
      const sch = pay.schedule || {}
      let durationSecs = sch.duration_secs ? Number(sch.duration_secs)
        : sch.duration_minutes ? Number(sch.duration_minutes) * 60
        : sch.duration_days ? Number(sch.duration_days) * 86400 : null
      const tk = getToken(sym)
      if (!tk || String(tk.coinType).startsWith('TODO'))
        return res.json({ mode: 'clarify', reply: 'I can stream SUI or USDC for now.' })
      if (!total || total <= 0)
        return res.json({ mode: 'clarify', reply: 'How much would you like to stream, and over how long?' })
      if (!durationSecs || durationSecs <= 0)
        return res.json({ mode: 'clarify', reply: `Over how long should I stream the ${total} ${sym}? (e.g. "over 30 days")` })
      const who = rc.name || rc.email || rc.address
      if (!who)
        return res.json({ mode: 'clarify', reply: 'Who should the stream pay? A .vel name, address, or email.' })
      const resolved = await resolveRecipient(who)
      if (!resolved?.address)
        return res.json({ mode: 'clarify', reply: `I couldn't find ${who}. Try a .vel name, address, or email.` })
      const held = await balanceOf(FUNDING_ADDRESS, sym)
      if (held < total)
        return res.json({ mode: 'insufficient', reply: `This stream needs ${total} ${sym}, but the wallet holds ${held.toFixed(4)} ${sym}.` })
      parsed.payment = { ...pay, currency: sym, amount: total, recipients: [{ name: rc.name || null, address: resolved.address }],
        stream: { recipient: resolved.address, recipientName: rc.name || who, token: sym, total_amount: total, duration_secs: durationSecs } }
      parsed.summary = `Streaming ${total} ${sym} to ${rc.name || who} \u2014 it'll start paying out automatically once you approve.`
      return res.json(await propose(user, parsed))
    }

    // SCHEDULE: dedicated path — recurring payments via the schedule engine
    if (parsed.intent === 'schedule') {
      const pay = parsed.payment || {}
      const sym = String(pay.currency || 'SUI').toUpperCase()
      const amount = Number(pay.amount)
      const rc = (pay.recipients || [])[0] || {}
      const sch = pay.schedule || {}
      const frequency = sch.frequency || null
      const occurrences = sch.occurrences || sch.count || null
      const tk = getToken(sym)
      if (!tk || String(tk.coinType).startsWith('TODO'))
        return res.json({ mode: 'clarify', reply: 'I can schedule SUI or USDC payments for now.' })
      if (!amount || amount <= 0)
        return res.json({ mode: 'clarify', reply: 'How much should each scheduled payment be?' })
      if (!frequency)
        return res.json({ mode: 'clarify', reply: 'How often \u2014 daily, weekly, or monthly?' })
      const who = rc.name || rc.email || rc.address
      if (!who)
        return res.json({ mode: 'clarify', reply: 'Who should the scheduled payments go to? A .vel name, address, or email.' })
      const resolved = await resolveRecipient(who)
      if (!resolved?.address)
        return res.json({ mode: 'clarify', reply: `I couldn't find ${who}. Try a .vel name, address, or email.` })
      const held = await balanceOf(FUNDING_ADDRESS, sym)
      if (held < amount)
        return res.json({ mode: 'insufficient', reply: `Each payment is ${amount} ${sym}, but the wallet only holds ${held.toFixed(4)} ${sym}.` })
      parsed.payment = { ...pay, currency: sym, amount, recipients: [{ name: rc.name || null, address: resolved.address }],
        sched: { recipient: resolved.address, recipientName: rc.name || who, token: sym, amount, frequency, occurrences } }
      parsed.summary = `Scheduling ${amount} ${sym} to ${rc.name || who} ${frequency}${occurrences ? ` for ${occurrences} payments` : ''} \u2014 starts once you approve.`
      return res.json(await propose(user, parsed))
    }

    // scope guard: only send/split execute today — never propose what /run can't run
    if (!['send', 'split'].includes(parsed.intent)) {
      const _names = { swap: 'Token swaps', stream: 'Streaming payments', schedule: 'Scheduled payments', escrow: 'Escrow', automate: 'Automations' }
      const _what = _names[parsed.intent] || 'That feature'
      return res.json({ mode: 'assistant', reply: `${_what} — coming soon. Right now I can send or split SUI and USDC. Want to do one of those?` })
    }

    // low-confidence double-check
    if (parsed.confidence < CONFIDENCE_FLOOR && !parsed.needs_clarification) {
      try {
        const second = JSON.parse(strip(await callModel(MODELS.doublecheck, [
          { role: 'system', content: PARSER_SYS },
          { role: 'user', content: ctxBlock },
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
      const bals = await getAllBalances(FUNDING_ADDRESS)
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

// POST /agent/approve/:id (unchanged — the real safety gate)
router.post('/approve/:id', requireAuth, async (req, res) => {
  try {
    const { txBytes, signature } = req.body
    if (!txBytes || !signature) return res.status(400).json({ error: 'txBytes and signature required' })
    const result = await provider.executeTransactionBlock({
      transactionBlock: txBytes, signature, options: { showEffects: true },
    })
    await supabaseAdmin.from('agent_conversations').update({ pending_tx: null }).eq('user_address', req.user.address)

    // log each executed leg to transactions (admin bypasses RLS; non-fatal)
    const _pay = pending.payment || {}
    const _legs = Array.isArray(pending.actions) && pending.actions.length
      ? pending.actions.map(a => ({ token: String(a.token || a.currency || '').toUpperCase(), amount: a.amount,
          who: a.recipient?.name || a.recipient?.resolved?.address || a.recipient?.address || a.address || null }))
      : (_pay.recipients?.length ? _pay.recipients : [{}]).map(r => ({ token: String(_pay.currency || '').toUpperCase(),
          amount: r.amount ?? _pay.token_amount ?? _pay.amount, who: r.name || r.resolved?.address || r.address || null }))
    const { error: _logErr } = await supabaseAdmin.from('transactions').insert(
      _legs.map(l => ({ user_address: req.user.address, digest: result.digest, type: pending.intent || 'send',
        label: l.who ? `Sent to ${l.who}` : 'Sent', sub_label: l.token || null, amount: l.amount,
        token: l.token || null, direction: 'out', counterparty: l.who || null }))
    )
    if (_logErr) console.error('tx log failed (non-fatal):', _logErr.message)
    await supabaseAdmin.from('notifications').insert({
      user_address: req.user.address, type: 'payment_sent',
      title: 'Payment sent', body: 'Transaction confirmed on Sui',
      action_url: `https://suiscan.xyz/testnet/tx/${result.digest}`,
    })
    res.json({ success: true, digest: result.digest })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

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
      const bals = await getAllBalances(FUNDING_ADDRESS)
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

// POST /agent/run/:id — agent-signed execution of a pending proposal (autopilot path)
router.post('/run/:id', requireAuth, async (req, res) => {
  try {
    const { data: convo } = await supabaseAdmin
      .from('agent_conversations').select('*').eq('user_address', req.user.address).single()
    const pending = convo?.pending_tx
    if (!pending || pending.id !== req.params.id)
      return res.status(404).json({ error: 'no matching pending proposal' })

    if (pending.intent === 'schedule') {
      const sd = pending.payment?.sched || {}
      const sc = await createSchedule({ userAddress: req.user.address, recipient: sd.recipient,
        recipientName: sd.recipientName, token: sd.token, amount: sd.amount, frequency: sd.frequency, occurrences: sd.occurrences })
      await supabaseAdmin.from('agent_conversations').update({ pending_tx: null }).eq('user_address', req.user.address)
      tickSchedules().catch(e => console.error('initial schedule tick:', e.message))
      await supabaseAdmin.from('notifications').insert({ user_address: req.user.address, type: 'schedule_started',
        title: 'Schedule started', body: `${sd.amount} ${sd.token} to ${sd.recipientName} ${sd.frequency}` })
      return res.json({ success: true, scheduleId: sc.id, message: 'Schedule set \u2014 first payment going out now, the rest run automatically.' })
    }

    if (pending.intent === 'stream') {
      const st = pending.payment?.stream || {}
      const stream = await startStream({ userAddress: req.user.address, recipient: st.recipient,
        recipientName: st.recipientName, token: st.token, totalAmount: st.total_amount, durationSecs: st.duration_secs })
      await supabaseAdmin.from('agent_conversations').update({ pending_tx: null }).eq('user_address', req.user.address)
      tickStreams().catch(e => console.error('initial stream tick:', e.message))
      await supabaseAdmin.from('notifications').insert({ user_address: req.user.address, type: 'stream_started',
        title: 'Stream started', body: `Streaming ${st.total_amount} ${st.token} to ${st.recipientName}` })
      return res.json({ success: true, streamId: stream.id, message: 'Stream started \u2014 payments will flow automatically.' })
    }

    if (pending.intent === 'swap') {
      await supabaseAdmin.from('agent_conversations').update({ pending_tx: null }).eq('user_address', req.user.address)
      return res.status(400).json({ error: 'Swaps go live on mainnet \u2014 DeepBook pools are not liquid on testnet yet, so nothing was charged.' })
    }

    const result = await signAndRun(await buildFromProposal(pending))
    if (result.effects?.status?.status !== 'success')
      return res.status(400).json({ error: 'on-chain failure', status: result.effects?.status, digest: result.digest })

    // log each leg to transactions so it shows in Activity/Home (admin bypasses RLS; non-fatal)
    try {
      const _pay = pending.payment || {}
      const _legs = Array.isArray(pending.actions) && pending.actions.length
        ? pending.actions.map(a => ({ token: String(a.token || a.currency || '').toUpperCase(), amount: a.amount,
            who: a.recipient?.name || a.recipient?.resolved?.label || a.recipient?.resolved?.address || a.address || null }))
        : (_pay.recipients?.length ? _pay.recipients : [{}]).map(r => ({ token: String(_pay.currency || '').toUpperCase(),
            amount: r.amount ?? _pay.token_amount ?? _pay.amount,
            who: r.name || r.resolved?.label || r.resolved?.address || r.address || null }))
      await supabaseAdmin.from('transactions').insert(_legs.map(l => ({
        user_address: req.user.address, digest: result.digest, type: pending.intent || 'send',
        label: l.who ? `Sent to ${l.who}` : 'Sent', sub_label: l.token || null,
        amount: l.amount, token: l.token || null, direction: 'out', counterparty: l.who || null })))
    } catch (e) { console.error('tx log (non-fatal):', e.message) }

    await supabaseAdmin.from('agent_conversations').update({ pending_tx: null }).eq('user_address', req.user.address)
    await supabaseAdmin.from('notifications').insert({
      user_address: req.user.address, type: 'payment_sent',
      title: 'Payment sent', body: 'Transaction confirmed on Sui',
      action_url: `https://suiscan.xyz/testnet/tx/${result.digest}`,
    })
    res.json({ success: true, digest: result.digest, explorer: `https://suiscan.xyz/testnet/tx/${result.digest}` })
  } catch (err) {
    console.error('run error:', err)
    res.status(500).json({ error: err.message })
  }
})


// GET /agent/flows — active streams + scheduled payments for the live "Active flows" UI
router.get('/flows', requireAuth, async (req, res) => {
  try {
    const addr = req.user.address
    const [streamsRes, schedRes] = await Promise.all([
      supabaseAdmin.from('streams').select('*').eq('user_address', addr).order('created_at', { ascending: false }),
      supabaseAdmin.from('scheduled_payments').select('*').eq('user_address', addr).order('created_at', { ascending: false }),
    ])
    const ACTIVE = new Set(['active', 'running', 'pending', 'streaming'])
    const streams = (streamsRes.data || [])
      .filter(s => ACTIVE.has(String(s.status || 'active').toLowerCase()))
      .map(s => {
        const total = Number(s.total_amount) || 0, done = Number(s.amount_streamed) || 0
        const rec = Array.isArray(s.recipients) ? s.recipients[0] : null
        return { type: 'stream', id: s.id, token: s.token || 'SUI',
          to: rec?.recipientName || rec?.name || rec?.label || 'recipient',
          total, done, pct: total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0, status: s.status || 'active' }
      })
    const schedules = (schedRes.data || [])
      .filter(s => ACTIVE.has(String(s.status || 'active').toLowerCase()))
      .map(s => {
        const occ = Number(s.occurrences) || 0, did = Number(s.occurrences_done) || 0
        return { type: 'schedule', id: s.id, token: s.token || 'SUI',
          to: s.recipientName || s.recipient_name || s.recipient || 'recipient',
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
