import { useState, useEffect, useRef, Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowUp, ArrowRight, Check, ShieldCheck, SquarePen, TriangleAlert } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { useVelfiWallet } from '../hooks/useVelfiWallet.js'
import { explorerTx, EXPLORER_NAME } from '../lib/chain.js'
import { api, dayLabel, shortAddr } from '../lib/api.js'
import { Sheet, CloseButton, Pill, Row, useToast, fmtAmt } from '../ui/kit.jsx'
import otterAgent from '../assets/otter-agent.webp'
import otterFace from '../assets/otter-face.webp'

const STORE = 'velfi_chat_v1'
const clock = () => new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
// A wallet that never answers must not leave the slider spinning forever.
function withTimeout(promise, ms, message) {
  let t
  return Promise.race([promise, new Promise((_, rej) => { t = setTimeout(() => rej(new Error(message)), ms) })]).finally(() => clearTimeout(t))
}
const sym = (p) => (p?.currency && p.currency !== 'USD') ? p.currency : 'USDC'
const recipientsOf = (p) => (p?.recipients || []).map(r => ({
  label: r.resolved?.label || r.name || r.email || r.resolved?.email || shortAddr(r.resolved?.address) || 'recipient',
  amount: r.amount ?? p?.token_amount ?? p?.amount,
  token: r.token,
}))
const humanDur = (s) => { s = Number(s) || 0; if (s >= 86400 && s % 86400 === 0) { const d = s / 86400; return d + (d === 1 ? ' day' : ' days') } if (s >= 3600) return Math.round(s / 3600) + ' hours'; if (s >= 60) return Math.round(s / 60) + ' min'; return s + 's' }

// What a proposal will do, in the person's words.
function describe(p) {
  const intent = p?.intent, pay = p?.payment || {}
  if (intent === 'swap') {
    const sw = pay.swap || {}
    return { kind: 'swap', title: 'Swap', done: 'Swapped', rows: [{ label: `${sw.from_token} → ${sw.to_token}`, amount: sw.amount, token: sw.from_token }], note: p.summary || null, fee: 'Small BNB fee' }
  }
  if (intent === 'stream') {
    const st = pay.stream || {}
    return { kind: 'stream', title: 'Stream', done: 'Started', rows: [{ label: st.recipientName || 'recipient', amount: st.total_amount, token: st.token }], note: `Pays out every second over ${humanDur(st.duration_secs)}. They can claim anytime.` }
  }
  if (intent === 'schedule') {
    const sc = pay.sched || {}
    return { kind: 'schedule', title: 'Schedule', done: 'Set', each: true, rows: [{ label: sc.recipientName || 'recipient', amount: sc.amount, token: sc.token }],
      note: `${sc.frequency || 'Recurring'}${sc.occurrences ? `, ${sc.occurrences} payments` : ''}. Cancel anytime in Flows.` }
  }
  const s = sym(pay)
  const rows = recipientsOf(pay).map(r => ({ ...r, token: r.token || s }))
  return { kind: intent === 'split' ? 'split' : 'send', title: intent === 'split' ? 'Split' : 'Send', done: intent === 'split' ? 'Split' : 'Sent', rows, note: null }
}
function totalOf(rows) {
  const by = {}
  for (const r of rows) by[r.token] = (by[r.token] || 0) + (Number(r.amount) || 0)
  return Object.entries(by).map(([t, v]) => `${fmtAmt(v)} ${t}`).join(' + ')
}

function inlineBold(s, k) {
  return String(s).split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    /^\*\*[^*]+\*\*$/.test(p) ? <strong key={k + '-' + i}>{p.slice(2, -2)}</strong> : <Fragment key={k + '-' + i}>{p}</Fragment>)
}
function rich(text) {
  return String(text).split('\n').map((line, i) => {
    const t = line.trim()
    if (!t) return <span key={i} className="c-br" />
    const bullet = /^[*\-•]\s+/.test(t)
    return bullet
      ? <span key={i} className="c-li"><span aria-hidden="true">•</span><span>{inlineBold(t.replace(/^[*\-•]\s+/, ''), i)}</span></span>
      : <span key={i} className="c-ln">{inlineBold(line, i)}</span>
  })
}

const STARTERS = [
  { text: 'Send 5 USDC to ', label: 'Send money', sub: 'to a .vel name, email or address' },
  { text: 'Split 30 USDC between ', label: 'Split a bill', sub: 'one amount, many people' },
  { text: 'Every month send ', label: 'Pay on a schedule', sub: 'rent, allowance, subscriptions' },
  { text: "What's my balance?", label: 'Check my money', sub: 'see what you hold', send: true },
]

export default function Chat() {
  const navigate = useNavigate()
  const { token } = useAuth()
  const wallet = useVelfiWallet()
  const toast = useToast()
  const inputRef = useRef(null)
  const scroller = useRef(null)
  const [messages, setMessages] = useState(() => {
    try { const d = JSON.parse(localStorage.getItem(STORE)); return (d?.messages || []).map(m => ({ ts: Date.now(), ...m })) } catch { return [] }
  })
  const [pending, setPending] = useState(() => { try { return JSON.parse(localStorage.getItem(STORE))?.pending || null } catch { return null } })
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [sheet, setSheet] = useState(null)
  const push = (m) => setMessages(prev => [...prev, { ts: Date.now(), time: clock(), ...m }])
  const dropProposal = (id) => setMessages(prev => prev.map(m => (m.proposal && m.proposal.id === id) ? { ...m, proposal: null } : m))

  useEffect(() => { try { localStorage.setItem(STORE, JSON.stringify({ messages: messages.slice(-80), pending })) } catch {} }, [messages, pending])
  useEffect(() => {
    let pm = null, dr = null
    try { pm = sessionStorage.getItem('velfi_pending_msg'); dr = sessionStorage.getItem('velfi_draft'); sessionStorage.removeItem('velfi_pending_msg'); sessionStorage.removeItem('velfi_draft') } catch {}
    if (pm) send(pm)
    else { if (dr) setInput(dr); setTimeout(() => { inputRef.current?.focus(); const n = (dr || '').length; inputRef.current?.setSelectionRange?.(n, n) }, 250) }
  }, [])
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' }) }, [messages, busy])

  async function send(text) {
    const t = (text ?? input).trim(); if (!t || busy) return
    setInput(''); push({ role: 'user', text: t }); setBusy(true)
    try {
      const d = await api(token, '/agent/message', { method: 'POST', body: { message: t } })
      if (d.mode === 'propose') {
        const p = { id: d.pendingTxId, summary: d.summary, payment: d.payment, intent: d.intent }
        if (pending) dropProposal(pending.id)
        setPending(p); push({ role: 'assistant', text: d.summary || 'Here’s what I’ll do:', proposal: p })
      }
      else if (d.mode === 'choose_token') push({ role: 'assistant', text: d.reply || 'Which token would you like to use?', tokens: ['USDC', 'BNB'] })
      else push({ role: 'assistant', text: d.reply || d.summary || 'Okay.' })
    } catch (e) { push({ role: 'assistant', text: e.status ? e.message : 'I couldn’t reach Velfi just now. Check your connection and try again.' }) }
    finally { setBusy(false) }
  }

  // Velfi prepares and pays the fee, your wallet signs, Velfi checks and sends.
  async function approve() {
    if (!pending) return
    const p = pending
    setSheet({ type: 'confirm', running: 'Preparing…' })
    let prep
    try {
      prep = await api(token, `/agent/prepare/${p.id}`, { method: 'POST', body: {} })
    } catch (e) {
      if (e.status === 404 || e.status === 410) { dropProposal(p.id); setPending(null) }
      setSheet({ type: 'failed', message: e.message }); return
    }
    let signedTx
    setSheet({ type: 'confirm', running: 'Signing…' })
    try { signedTx = await withTimeout(wallet.sign(prep.tx), 70_000, 'Your wallet didn’t respond in time') }
    catch (e) {
      console.error('Velfi sign failed:', e)
      setSheet(null)
      const why = String(e?.message || e || '').slice(0, 400)
      toast(/reject|denied|cancel|closed/i.test(why) ? 'You didn’t sign it, so nothing was sent.' : `Your wallet couldn’t sign that, so nothing was sent.${why ? ` (${why})` : ''}`)
      return
    }
    setSheet({ type: 'confirm', running: 'Sending…' })
    try {
      const d = await api(token, `/agent/approve/${p.id}`, { method: 'POST', body: { prepId: prep.prepId, signedTx } })
      dropProposal(p.id); setPending(null)
      setSheet({ type: 'success', digest: d.digest, pending: p, message: d.message })
      push({ role: 'assistant', done: { digest: d.digest, ...p }, text: d.message || null })
    } catch (e) {
      setSheet({ type: 'failed', message: e.message })
    }
  }

  function newChat() { setMessages([]); setPending(null); setSheet(null); try { localStorage.removeItem(STORE) } catch {} setTimeout(() => inputRef.current?.focus(), 100) }
  function cancel() {
    if (pending) api(token, `/agent/cancel/${pending.id}`, { method: 'POST', body: {} }).catch(() => {})
    if (pending) dropProposal(pending.id)
    setPending(null); setSheet(null)
    push({ role: 'assistant', text: 'Cancelled. Nothing was sent.' })
  }
  function revise() {
    if (pending) api(token, `/agent/cancel/${pending.id}`, { method: 'POST', body: {} }).catch(() => {})
    const lastUser = [...messages].reverse().find(m => m.role === 'user')
    if (pending) dropProposal(pending.id)
    setPending(null); setSheet(null)
    if (lastUser?.text) setInput(lastUser.text)
    setTimeout(() => inputRef.current?.focus(), 50)
  }
  function start(s) {
    if (s.send) return send(s.text)
    setInput(s.text); setTimeout(() => { inputRef.current?.focus(); inputRef.current?.setSelectionRange?.(s.text.length, s.text.length) }, 30)
  }

  let lastDay = null
  return (
    <div className="chat">
      <header className="chat-top">
        <button className="circle-btn" onClick={() => navigate('/')} aria-label="Back to home"><ArrowLeft size={20} /></button>
        <img className="chat-ava" src={otterAgent} alt="" />
        <div className="top-title"><small>Your money agent</small><b>Velfi</b></div>
        <button className="circle-btn" onClick={newChat} aria-label="New chat"><SquarePen size={18} /></button>
      </header>

      <div className="chat-scroll" ref={scroller}>
        <div className="chat-col">
          {messages.length === 0 && !busy && (
            <div className="welcome">
              <img src={otterFace} alt="" />
              <h1>What should your money do?</h1>
              <p>Say it the way you’d text a friend. I’ll show you exactly what will happen, and nothing moves until you approve it.</p>
              <div className="starters">
                {STARTERS.map(s => (
                  <button key={s.label} className="starter" onClick={() => start(s)}>
                    <b>{s.label}</b><small>{s.sub}</small><ArrowRight size={16} aria-hidden="true" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => {
            const lbl = dayLabel(m.ts); const showDay = lbl && lbl !== lastDay; lastDay = lbl
            return (
              <Fragment key={i}>
                {showDay && <p className="c-day"><span>{lbl}</span></p>}
                <Message m={m} onReview={() => setSheet({ type: 'confirm' })} onCancel={cancel} onRevise={revise} onSend={send} />
              </Fragment>
            )
          })}

          {busy && <div className="c-row left"><div className="c-bubble them c-typing" aria-label="Velfi is typing"><span /><span /><span /></div></div>}
        </div>
      </div>

      <div className="composer">
        <div className="chat-col">
          {messages.length > 0 && (
            <div className="c-chips">
              {['What can I do?', 'Check my balance', 'Recent activity'].map(c => <button key={c} className="pill soft" onClick={() => send(c)}>{c}</button>)}
            </div>
          )}
          <form className="ask" onSubmit={e => { e.preventDefault(); send() }}>
            <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)} placeholder="Tell your money what to do…" aria-label="Message Velfi" enterKeyHint="send" />
            <button className="go" type="submit" disabled={busy || !input.trim()} aria-label="Send"><ArrowUp size={20} strokeWidth={2.2} /></button>
          </form>
        </div>
      </div>

      <ConfirmSheet open={sheet?.type === 'confirm'} pending={pending} running={sheet?.running || false} onApprove={approve} onClose={() => !sheet?.running && setSheet(null)} />
      <SuccessSheet open={sheet?.type === 'success'} data={sheet} onClose={() => setSheet(null)} />
      <FailedSheet open={sheet?.type === 'failed'} message={sheet?.message} canRetry={!!pending} onRetry={() => setSheet({ type: 'confirm' })} onClose={() => setSheet(null)} />
    </div>
  )
}

function Message({ m, onReview, onCancel, onRevise, onSend }) {
  if (m.role === 'user') return <div className="c-row right"><div className="c-bubble me"><span className="c-text">{m.text}</span><span className="c-time">{m.time}</span></div></div>
  return (
    <div className="c-row left">
      <div className="c-stack">
        {m.text && <div className="c-bubble them">{rich(m.text)}<span className="c-time">{m.time}</span></div>}
        {m.txDigest && <a className="link-btn" href={explorerTx(m.txDigest)} target="_blank" rel="noreferrer">View on {EXPLORER_NAME}</a>}
        {m.tokens && <div className="c-chips">{m.tokens.map(tk => <button key={tk} className="pill" onClick={() => onSend(tk)}>{tk}</button>)}</div>}
        {m.proposal && <Proposal p={m.proposal} onReview={onReview} onCancel={onCancel} onRevise={onRevise} />}
        {m.done && <Done done={m.done} />}
      </div>
    </div>
  )
}

function warningsFor(p, d, bals) {
  const out = []
  const recs = p.payment?.recipients || []
  if (recs.some(r => (r.resolved?.address || r.address) && !(r.name || r.email || r.resolved?.label)))
    out.push('You’re paying a raw wallet address. If it’s even slightly wrong, the money can’t be recovered.')
  if (d.kind !== 'swap' && bals?.tokens) {
    for (const [tok, total] of Object.entries(d.rows.reduce((a, r) => ({ ...a, [r.token]: (a[r.token] || 0) + (Number(r.amount) || 0) }), {}))) {
      const held = bals.tokens.find(t => String(t.symbol).toUpperCase() === String(tok).toUpperCase())?.human || 0
      if (held > 0 && total / held >= 0.5) out.push(`This moves ${Math.round((total / held) * 100)}% of your ${tok}.`)
    }
  }
  if (d.kind === 'swap') out.push('Swaps fill at the live price, so what you get can shift a little before it lands.')
  return out
}

function Proposal({ p, onReview, onCancel, onRevise }) {
  const d = describe(p)
  const { token } = useAuth()
  const [bals, setBals] = useState(null)
  useEffect(() => { if (token) api(token, '/account/balances').then(setBals).catch(() => {}) }, [token])
  const warns = warningsFor(p, d, bals)
  return (
    <div className="prop">
      <div className="prop-top">
        <span className="eyebrow">{d.title}{d.each ? ' · each payment' : ''}</span>
        <Pill tone={d.kind === 'swap' ? 'amber' : 'lime'}>{d.fee ? d.fee : 'Fee covered'}</Pill>
      </div>
      <p className="amount-big">{totalOf(d.rows)}</p>
      <ul className="feed">
        {d.rows.map((r, i) => <li key={i}><Row title={r.label} end={`${fmtAmt(r.amount)} ${r.token}`} /></li>)}
      </ul>
      {d.note && <p className="flow-note">{d.note}</p>}
      {warns.length > 0 && (
        <div className="warnbox">{warns.map((w, i) => <p key={i}><TriangleAlert size={15} aria-hidden="true" /> <span>{w}</span></p>)}</div>
      )}
      <button className="btn primary block" onClick={onReview}>Review and approve</button>
      <div className="prop-sub"><button onClick={onRevise}>Change it</button><span aria-hidden="true">·</span><button onClick={onCancel}>Cancel</button></div>
    </div>
  )
}

function Done({ done }) {
  const d = describe(done)
  return (
    <div className="done-card">
      <span className="done-ic"><Check size={16} strokeWidth={3} /></span>
      <div><b>{d.done} {totalOf(d.rows)}</b>
        {done.digest && <a href={explorerTx(done.digest)} target="_blank" rel="noreferrer">Public receipt on {EXPLORER_NAME}</a>}</div>
    </div>
  )
}

function ConfirmSheet({ open, pending, running, onApprove, onClose }) {
  if (!pending) return null
  const d = describe(pending)
  return (
    <Sheet open={open} onClose={onClose} pale label={`Approve: ${d.title}`} dismissable={!running}>
      <div className="flow-head">
        <CloseButton onClick={onClose} label="Close" />
        <Pill tone={d.kind === 'swap' ? 'amber' : 'lime'}>{d.fee || 'Velfi pays the fee'}</Pill>
      </div>
      <h2 className="flow-title">{d.title}</h2>
      <p className="flow-sub">From your Velfi wallet</p>
      <div className="amount-card">
        <div className="amount-top"><span>{d.each ? 'Each payment' : 'Total'}</span><span>{d.rows.length} {d.rows.length === 1 ? 'recipient' : 'recipients'}</span></div>
        <p className="amount-big">{totalOf(d.rows)}</p>
        <ul className="feed">{d.rows.map((r, i) => <li key={i}><Row title={r.label} end={`${fmtAmt(r.amount)} ${r.token}`} /></li>)}</ul>
      </div>
      {d.note && <p className="flow-note">{d.note}</p>}
      <p className="flow-note" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><ShieldCheck size={16} aria-hidden="true" /> Your wallet signs this, not Velfi. Nothing moves until you slide.</p>
      <SlideToApprove running={running} onApprove={onApprove} />
    </Sheet>
  )
}

function SuccessSheet({ open, data, onClose }) {
  if (!data?.pending) return null
  const d = describe(data.pending)
  const big = d.done.length > 5
  return (
    <Sheet open={open} onClose={onClose} pale label="Payment complete">
      <div className="flow-head"><Pill tone="lime">Confirmed on BNB Chain</Pill><span /></div>
      <div className={`stamp ${d.kind === 'swap' ? 'blue' : d.kind === 'schedule' ? 'lav' : ''}`}><span style={big ? { fontSize: 'clamp(60px, 19vw, 100px)' } : undefined}>{d.done}</span></div>
      <div className="amount-card">
        <div className="amount-top"><span>{d.title}</span><span>Just now</span></div>
        <p className="amount-big">{totalOf(d.rows)}</p>
        <ul className="feed">{d.rows.map((r, i) => <li key={i}><Row icon={<Check size={16} strokeWidth={2.6} />} tone="good" title={r.label} end={`${fmtAmt(r.amount)} ${r.token}`} /></li>)}</ul>
        <div className="kv"><div><small>Network fee</small><b>{d.fee ? 'Paid by you' : 'Paid by Velfi'}</b></div><div><small>Receipt</small><b>{data.digest ? shortAddr(data.digest) : '—'}</b></div></div>
      </div>
      {data.message && <p className="flow-note">{data.message}</p>}
      <div className="actions-row">
        {data.digest ? <a className="btn pale" href={explorerTx(data.digest)} target="_blank" rel="noreferrer">View receipt</a> : <span />}
        <button className="round" onClick={onClose} aria-label="Done"><Check size={22} strokeWidth={2.4} /></button>
      </div>
    </Sheet>
  )
}

function FailedSheet({ open, message, canRetry, onRetry, onClose }) {
  return (
    <Sheet open={open} onClose={onClose} pale label="Payment not sent">
      <div className="flow-head"><Pill tone="amber">Nothing was sent</Pill><span /></div>
      <div className="stamp" style={{ background: 'linear-gradient(180deg, #FFD9A8 0%, #F7A86A 100%)' }}><span style={{ fontSize: 'clamp(60px, 19vw, 100px)' }}>Not sent</span></div>
      <div className="amount-card">
        <p style={{ fontSize: 17 }}>{message || 'That didn’t go through.'}</p>
        <p className="flow-note">Your money is still in your wallet.</p>
      </div>
      <div className="actions-row">
        {canRetry ? <button className="btn pale" onClick={onRetry}>Try again</button> : <span />}
        <button className="round" onClick={onClose} aria-label="Close"><Check size={22} strokeWidth={2.4} /></button>
      </div>
    </Sheet>
  )
}

// Drag the knob to the end to approve. Keyboard: focus the knob and press Enter.
function SlideToApprove({ onApprove, running }) {
  const track = useRef(null)
  const [x, setX] = useState(0)
  const [drag, setDrag] = useState(false)
  const [done, setDone] = useState(false)
  const KNOB = 56
  useEffect(() => { if (!running && done) { setDone(false); setX(0) } }, [running])
  const max = () => (track.current ? track.current.getBoundingClientRect().width - KNOB - 8 : 0)
  const finish = () => { setX(max()); setDone(true); setDrag(false); onApprove() }
  const down = (e) => { if (running || done) return; setDrag(true); e.currentTarget.setPointerCapture(e.pointerId) }
  const move = (e) => {
    if (!drag) return
    const t = track.current.getBoundingClientRect()
    const nx = Math.max(0, Math.min(e.clientX - t.left - KNOB / 2, max()))
    setX(nx)
    if (nx >= max() - 4) finish()
  }
  const up = () => { if (!done) setX(0); setDrag(false) }
  return (
    <div className="slide" ref={track}>
      <span className="slide-fill" style={{ width: x + KNOB + 8 }} />
      <span className="slide-label">{running ? (typeof running === 'string' ? running : 'Signing…') : done ? 'Approved' : 'Slide to approve'}</span>
      <button className="slide-knob" style={{ transform: `translateX(${x}px)`, transition: drag ? 'none' : 'transform .3s var(--ease)' }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && !running && !done) { e.preventDefault(); finish() } }}
        aria-label="Approve and sign. Drag to the end, or press Enter." disabled={running}>
        {running ? <span className="spin" /> : <ArrowRight size={22} strokeWidth={2.4} />}
      </button>
    </div>
  )
}
