import { useState, useEffect, useRef, Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { ArrowLeft, ArrowUp, Plus, Wallet, Check, ExternalLink, ShieldCheck, SquarePen, AlertTriangle, Info, BadgeCheck } from 'lucide-react'
import otterAgent from '../assets/otter-agent.png'
import otterImg from '../assets/otter.png'

const API = '/api'
const STORE = 'velfi_chat_v1'
const h = (token) => ({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'ngrok-skip-browser-warning': 'true' })
const now = () => new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
const short = (a) => a ? a.slice(0, 6) + '…' + a.slice(-4) : ''
const SUISCAN = (d) => `https://suiscan.xyz/testnet/tx/${d}`
const recipientsOf = (p) => (p?.recipients || []).map(r => ({ label: r.resolved?.label || r.name || r.email || short(r.resolved?.address) || 'recipient', amount: r.amount ?? p?.token_amount ?? p?.amount }))
const sym = (p) => (p?.currency && p.currency !== 'USD') ? p.currency : 'SUI'
const totalOf = (p) => { const r = recipientsOf(p); const s = r.reduce((a, x) => a + (Number(x.amount) || 0), 0); return s || p?.token_amount || p?.amount || 0 }
const fmt = (n) => Number(n).toLocaleString(undefined, { maximumFractionDigits: 4 })
const humanDur = (s) => { s = Number(s) || 0; if (s >= 86400 && s % 86400 === 0) { const d = s / 86400; return d + (d === 1 ? ' day' : ' days') } if (s >= 3600) return Math.round(s / 3600) + 'h'; if (s >= 60) return Math.round(s / 60) + ' min'; return s + 's' }
function desc(p) {
  const intent = p?.intent, pay = p?.payment || {}
  if (intent === 'swap') { const sw = pay.swap || {}; return { kind: 'swap', done: 'Swapped', title: 'Swap', rows: [{ label: `${sw.from_token} \u2192 ${sw.to_token}`, amount: `${fmt(sw.amount)} ${sw.from_token}` }], note: p.summary || null } }
  if (intent === 'stream') { const st = pay.stream || {}; return { kind: 'stream', done: 'Stream started', title: 'Stream', rows: [{ label: st.recipientName || 'recipient', amount: `${fmt(st.total_amount)} ${st.token}` }], note: `Streams automatically over ${humanDur(st.duration_secs)}` } }
  if (intent === 'schedule') { const sc = pay.sched || {}; return { kind: 'schedule', done: 'Scheduled', title: 'Schedule', rows: [{ label: sc.recipientName || 'recipient', amount: `${fmt(sc.amount)} ${sc.token}` }], note: `${sc.frequency}${sc.occurrences ? ` \u00B7 ${sc.occurrences} payments` : ''}` } }
  const rec = recipientsOf(pay), s = sym(pay)
  const toks = (pay.recipients || []).map(r => r.token)
  return { kind: intent === 'split' ? 'split' : 'send', done: 'Sent', title: intent === 'split' ? `Split ${rec.length} ways` : 'Payment', rows: rec.map((r, i) => ({ label: r.label, amount: `${fmt(r.amount)} ${toks[i] || s}` })), note: null }
}

function dayLabel(ts) {
  if (!ts) return ''
  const d = new Date(ts), n = new Date()
  const same = (a, b) => a.toDateString() === b.toDateString()
  if (same(d, n)) return 'Today'
  const y = new Date(n); y.setDate(n.getDate() - 1)
  if (same(d, y)) return 'Yesterday'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
function inlineBold(s, k) {
  return String(s).split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    /^\*\*[^*]+\*\*$/.test(p) ? <strong key={k + '-' + i}>{p.slice(2, -2)}</strong> : <Fragment key={k + '-' + i}>{p}</Fragment>)
}
function renderRich(text) {
  return String(text).split('\n').map((line, i) => {
    const t = line.trim()
    if (!t) return <span key={i} className="vc-br" />
    const bullet = /^[\*\-•]\s+/.test(t)
    const body = bullet ? t.replace(/^[\*\-•]\s+/, '') : line
    return bullet
      ? <span key={i} className="vc-li"><span className="vc-dot">•</span><span>{inlineBold(body, i)}</span></span>
      : <span key={i} className="vc-ln">{inlineBold(body, i)}</span>
  })
}

export default function Chat() {
  const navigate = useNavigate()
  const { token } = useAuth()
  const inputRef = useRef(null)
  const scroll = useRef(null)
  const [messages, setMessages] = useState(() => {
    try { const d = JSON.parse(localStorage.getItem(STORE)); return (d?.messages || []).map(m => ({ ts: Date.now(), ...m })) } catch { return [] }
  })
  const [pending, setPending] = useState(() => { try { return JSON.parse(localStorage.getItem(STORE))?.pending || null } catch { return null } })
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [sheet, setSheet] = useState(null)
  const push = (m) => setMessages(prev => [...prev, { ts: Date.now(), time: now(), ...m }])

  useEffect(() => { try { localStorage.setItem(STORE, JSON.stringify({ messages, pending })) } catch {} }, [messages, pending])
  useEffect(() => {
    const pm = sessionStorage.getItem('velfi_pending_msg')
    if (pm) { sessionStorage.removeItem('velfi_pending_msg'); send(pm) }
    else setTimeout(() => inputRef.current?.focus(), 250)
  }, [])
  useEffect(() => { scroll.current?.scrollTo({ top: scroll.current.scrollHeight, behavior: 'smooth' }) }, [messages, busy])

  async function send(text) {
    const t = (text ?? input).trim(); if (!t || busy) return
    setInput(''); push({ role: 'user', text: t }); setBusy(true)
    try {
      const r = await fetch(`${API}/agent/message`, { method: 'POST', headers: h(token), body: JSON.stringify({ message: t }) })
      const d = await r.json()
      if (d.mode === 'propose') { const p = { id: d.pendingTxId, summary: d.summary, payment: d.payment, intent: d.intent }; setPending(p); push({ role: 'assistant', text: d.summary || 'Here’s what I’ll do:', proposal: p }) }
      else if (d.mode === 'choose_token') push({ role: 'assistant', text: d.reply || 'Which token would you like to use?', tokens: ['SUI', 'USDC'] })
      else push({ role: 'assistant', text: d.reply || d.summary || d.error || 'Okay.' })
    } catch { push({ role: 'assistant', text: 'I couldn’t reach the network — try again?' }) }
    finally { setBusy(false) }
  }

  async function run() {
    if (!pending) return
    setSheet(s => ({ ...s, type: 'confirm', running: true }))
    try {
      const r = await fetch(`${API}/agent/run/${pending.id}`, { method: 'POST', headers: h(token), body: '{}' })
      const d = await r.json()
      if (d.success) { setSheet({ type: 'success', digest: d.digest, payment: pending.payment, intent: pending.intent }); push({ role: 'assistant', done: { digest: d.digest, payment: pending.payment, intent: pending.intent } }); setPending(null) }
      else { setSheet(null); push({ role: 'assistant', text: d.error || 'That didn’t go through on-chain.' }) }
    } catch { setSheet(null); push({ role: 'assistant', text: 'Network error while signing — nothing was sent.' }) }
  }

  function newChat() { setMessages([]); setPending(null); setSheet(null); try { localStorage.removeItem(STORE) } catch {} setTimeout(() => inputRef.current?.focus(), 100) }
  function cancel() { if (pending) { fetch(`${API}/agent/cancel/${pending.id}`, { method: 'POST', headers: h(token), body: '{}' }).catch(() => {}) } setPending(null); setSheet(null); push({ role: 'assistant', text: 'Okay, cancelled \u2014 nothing was sent.' }) }
  function revise() { setSheet(null); setTimeout(() => inputRef.current?.focus(), 50) }

  const chips = ['What can I do?', 'Check my balance', 'Recent activity']
  let lastDay = null

  return (
    <div className="vchat">
      <style>{CHAT_CSS}</style>
      <header className="vc-head">
        <button className="vc-back" onClick={() => navigate('/')}><ArrowLeft size={20} /></button>
        <img className="vc-ava" src={otterAgent} alt="" />
        <div className="vc-id"><p className="vc-name">Velfi Agent<BadgeCheck size={17} className="vc-verified" /></p><p className="vc-stat">Always here to help</p></div>
        <button className="vc-new" onClick={newChat} aria-label="New chat"><SquarePen size={19} /></button>
      </header>

      <div className="vc-scroll" ref={scroll}>

        {messages.map((m, i) => {
          const lbl = dayLabel(m.ts); const showDay = lbl && lbl !== lastDay; lastDay = lbl
          return (
            <Fragment key={i}>
              {showDay && <div className="vc-day"><span>{lbl}</span></div>}
              <Msg m={m} onConfirm={() => setSheet({ type: 'confirm' })} onCancel={cancel} onRevise={revise} onSend={send} />
            </Fragment>
          )
        })}

        {busy && <div className="vc-row left"><img className="vc-bubava" src={otterAgent} alt="" /><div className="vc-bubble assistant vc-typing"><span /><span /><span /></div></div>}
      </div>

      <div className="vc-bottom">
        <div className="vc-chips">{chips.map(c => <button key={c} className="vc-chip" onClick={() => send(c)}>{c}</button>)}</div>
        <div className="vc-input">
          <button className="vc-plus"><Plus size={20} /></button>
          <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder="Message Velfi…" />
          <button className="vc-send" onClick={() => send()} disabled={busy}><ArrowUp size={18} color="#fff" strokeWidth={2.4} /></button>
        </div>
      </div>

      {sheet?.type === 'confirm' && <ConfirmSheet pending={pending} running={sheet.running} onApprove={run} onClose={() => setSheet(null)} />}
      {sheet?.type === 'success' && <SuccessSheet data={sheet} onClose={() => setSheet(null)} />}
    </div>
  )
}

function Msg({ m, onConfirm, onCancel, onRevise, onSend }) {
  if (m.role === 'user') return <div className="vc-row right"><div className="vc-bubble user"><span className="vc-utext">{m.text}</span><span className="vc-time">{m.time}</span></div></div>
  return (
    <div className="vc-row left">
      <img className="vc-bubava" src={otterAgent} alt="" />
      <div className="vc-astack">
        {m.text && <div className="vc-bubble assistant">{renderRich(m.text)}<span className="vc-time">{m.time}</span></div>}
        {m.tokens && <div className="vc-tokpick">{m.tokens.map(tk => <button key={tk} className="vc-tokbtn" onClick={() => onSend(tk)}>{tk}</button>)}</div>}
        {m.proposal && <ProposalCard p={m.proposal} onConfirm={onConfirm} onCancel={onCancel} onRevise={onRevise} />}
        {m.done && <DoneCard done={m.done} />}
      </div>
    </div>
  )
}
function guardianChecks(p, d, bals) {
  const out = []
  const pay = p.payment || {}
  const recs = pay.recipients || []
  if (recs.some(r => (r.resolved?.address || r.address) && !(r.name || r.email || r.resolved?.label)))
    out.push("You're paying a raw wallet address — if it's even slightly off, the funds can't be recovered.")
  if (d.kind !== 'swap' && bals?.tokens) {
    const tok = sym(pay)
    const total = recipientsOf(pay).reduce((a, r) => a + (Number(r.amount) || 0), 0)
    const held = bals.tokens.find(t => String(t.symbol || '').toUpperCase() === String(tok).toUpperCase())?.human || 0
    if (held > 0 && total / held >= 0.5) out.push(`This moves ${Math.round((total / held) * 100)}% of your ${tok} balance in one transaction.`)
  }
  if (d.kind === 'swap') out.push('Swaps fill at the live market price — the amount you receive can shift with slippage before it lands.')
  return out
}
function ProposalCard({ p, onConfirm, onCancel, onRevise }) {
  const d = desc(p)
  const { token } = useAuth()
  const [bals, setBals] = useState(null)
  useEffect(() => {
    if (!token) return
    fetch(`${API}/account/balances`, { headers: h(token) }).then(r => r.json()).then(setBals).catch(() => {})
  }, [token])
  const warns = guardianChecks(p, d, bals)
  return (
    <div className="vc-prop">
      <div className="vc-prop-rows">{d.rows.map((r, i) => <div className="vc-prop-row" key={i}><span className="vc-prop-to">{r.label}</span><span className="vc-prop-amt">{r.amount}</span></div>)}</div>
      {d.note && <div className="vc-prop-note">{d.note}</div>}
      <div className={`vc-guard-box ${warns.length ? 'warn' : 'ok'}`}>
        {warns.length === 0
          ? <div className="vc-guard-row vc-guard-ok"><ShieldCheck size={14} /> Guardian checked — no risks flagged</div>
          : warns.map((w, i) => <div className="vc-guard-row" key={i}><AlertTriangle size={14} /> <span>{w}</span></div>)}
      </div>
      <div className="vc-prop-meta"><span>Network fee</span><span>≈ 0.003 SUI</span></div>
      <button className="vc-confirm" onClick={onConfirm}>Confirm</button>
      <div className="vc-prop-sub"><button onClick={onRevise}>Revise</button><span>·</span><button onClick={onCancel}>Cancel</button></div>
    </div>
  )
}
function DoneCard({ done }) {
  const d = desc(done)
  return (
    <div className="vc-done">
      <div className="vc-done-ic"><Check size={16} color="#fff" strokeWidth={3} /></div>
      <div><p className="vc-done-h">Done! 🎉 {d.done} {d.rows.map(r => r.amount).join(' + ')}</p>
        {done.digest && <a className="vc-done-link" href={SUISCAN(done.digest)} target="_blank" rel="noreferrer">View on Sui <ExternalLink size={12} /></a>}</div>
    </div>
  )
}
function ConfirmSheet({ pending, running, onApprove, onClose }) {
  const d = desc(pending)
  return (
    <div className="vc-sheet-wrap" onClick={onClose}>
      <div className="vc-sheet" onClick={e => e.stopPropagation()}>
        <div className="vc-grab" />
        <div className="vc-sheet-head"><div className="vc-sheet-ic"><Wallet size={20} color="var(--v-accent)" /></div><div><p className="vc-sheet-h">{d.title}</p><p className="vc-sheet-sub">Review and approve</p></div></div>
        <div className="vc-sheet-list">{d.rows.map((r, i) => <div className="vc-sheet-row" key={i}><span className="vc-sheet-to">{r.label}</span><span className="vc-sheet-amt">{r.amount}</span></div>)}</div>
        {d.note && <div className="vc-using">{d.note}</div>}
        <div className="vc-guard"><ShieldCheck size={15} color="var(--v-sub)" /> Velfi can’t move money without you.</div>
        <SlideToApprove running={running} onApprove={onApprove} />
      </div>
    </div>
  )
}
function SuccessSheet({ data, onClose }) {
  const d = desc(data)
  return (
    <div className="vc-sheet-wrap" onClick={onClose}>
      <div className="vc-sheet" onClick={e => e.stopPropagation()}>
        <div className="vc-grab" />
        <div className="vc-success-top"><img src={otterImg} alt="" className="vc-success-otter" /><div className="vc-success-check"><Check size={30} color="#fff" strokeWidth={3} /></div></div>
        <p className="vc-success-h">{d.done}</p>
        <p className="vc-success-sub">{d.title} · just now</p>
        <div className="vc-sheet-list">{d.rows.map((r, i) => <div className="vc-sheet-row" key={i}><span className="vc-sheet-to"><Check size={13} color="var(--v-success)" strokeWidth={3} /> {r.label}</span><span className="vc-sheet-amt">{r.amount}</span></div>)}</div>
        {data.digest && <a className="vc-tx" href={SUISCAN(data.digest)} target="_blank" rel="noreferrer"><span>Transaction {short(data.digest)}</span><span className="vc-tx-link">View on Sui <ExternalLink size={12} /></span></a>}
        <button className="vc-done-btn" onClick={onClose}>Done</button>
      </div>
    </div>
  )
}
function SlideToApprove({ onApprove, running }) {
  const track = useRef(null); const [x, setX] = useState(0); const [drag, setDrag] = useState(false); const [done, setDone] = useState(false); const KNOB = 54
  const down = (e) => { if (running || done) return; setDrag(true); e.currentTarget.setPointerCapture(e.pointerId) }
  const move = (e) => { if (!drag) return; const t = track.current.getBoundingClientRect(); let nx = Math.max(0, Math.min(e.clientX - t.left - KNOB / 2, t.width - KNOB)); setX(nx); if (nx >= t.width - KNOB - 6) { setDone(true); setDrag(false); onApprove() } }
  const up = () => { if (!done) setX(0); setDrag(false) }
  return (
    <div className="vc-slide" ref={track}>
      <span className="vc-slide-label">{running ? 'Signing…' : done ? 'Approved' : 'Slide to approve & sign'}</span>
      <div className="vc-slide-knob" style={{ transform: `translateX(${x}px)`, transition: drag ? 'none' : 'transform .25s' }} onPointerDown={down} onPointerMove={move} onPointerUp={up}>
        {running ? <span className="vc-spin" /> : <ArrowUp size={20} color="#fff" strokeWidth={2.6} style={{ transform: 'rotate(90deg)' }} />}
      </div>
    </div>
  )
}

const CHAT_CSS = `
.vchat{ position:fixed; inset:0; width:100%; max-width:430px; margin:0 auto; display:flex; flex-direction:column; background:var(--v-bg); color:var(--v-ink); font-family:'DM Sans',system-ui,sans-serif; }
.vc-head{ display:flex; align-items:center; gap:12px; padding:calc(env(safe-area-inset-top, 0px) + 14px) 16px 14px; border-bottom:1px solid var(--v-card-bd); }
.vc-back{ width:36px; height:36px; border-radius:11px; display:flex; align-items:center; justify-content:center; background:none; color:var(--v-ink); flex-shrink:0; }
.vc-ava{ width:46px; height:46px; border-radius:50%; object-fit:cover; flex-shrink:0; }
.vc-id{ flex:1; min-width:0; }
.vc-name{ font-size:21px; font-weight:700; letter-spacing:-0.3px; line-height:1.2; display:flex; align-items:center; gap:5px; }
.vc-verified{ color:var(--v-accent); flex-shrink:0; }
.vc-stat{ font-size:13px; color:var(--v-sub); margin-top:1px; font-weight:400; }
.vc-new{ width:38px; height:38px; border-radius:11px; display:flex; align-items:center; justify-content:center; background:none; color:var(--v-sub); flex-shrink:0; }
.vc-scroll{ flex:1; overflow-y:auto; padding:16px 16px 8px; scrollbar-width:none; }
.vc-scroll::-webkit-scrollbar{ display:none; }
.vc-welcome{ position:relative; overflow:hidden; display:flex; align-items:center; gap:12px; padding:14px; border-radius:22px; margin-bottom:18px; background:linear-gradient(135deg, rgba(255,255,255,0.66), rgba(239,237,247,0.5)); -webkit-backdrop-filter:blur(16px); backdrop-filter:blur(16px); border:1px solid rgba(255,255,255,0.6); }
.vc-welcome::after{ content:''; position:absolute; inset:0; background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"); background-size:160px; opacity:.05; pointer-events:none; }
.vc-welcome img{ width:92px; height:92px; object-fit:contain; flex-shrink:0; position:relative; z-index:1; }
.vc-welcome > div{ position:relative; z-index:1; }
.vc-wel-h{ font-size:20px; font-weight:700; letter-spacing:-0.3px; line-height:1.25; }
.vc-wel-b{ font-size:13px; color:var(--v-sub); margin-top:4px; line-height:1.45; }
.vc-day{ display:flex; justify-content:center; margin:6px 0 16px; }
.vc-day span{ font-size:11px; font-weight:500; color:var(--v-sub); background:var(--v-chip); padding:4px 12px; border-radius:999px; }
.vc-row{ display:flex; gap:8px; margin-bottom:14px; align-items:flex-end; }
.vc-row.right{ justify-content:flex-end; } .vc-row.left{ justify-content:flex-start; }
.vc-bubava{ width:30px; height:30px; border-radius:50%; object-fit:cover; flex-shrink:0; }
.vc-astack{ display:flex; flex-direction:column; gap:8px; max-width:90%; }
.vc-bubble{ position:relative; overflow:hidden; padding:6px 14px; font-size:14px; line-height:1.3; max-width:100%; width:fit-content; }
.vc-row.right .vc-bubble.user{ max-width:90%; }
.vc-bubble > *{ position:relative; z-index:1; }
.vc-bubble::after{ content:''; position:absolute; inset:0; z-index:0; pointer-events:none; background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"); background-size:140px; }
.vc-bubble.user{ color:#fff; border-radius:22px 22px 7px 22px; background:linear-gradient(135deg, rgba(123,79,255,0.96), rgba(139,107,255,0.82)); -webkit-backdrop-filter:blur(8px); backdrop-filter:blur(8px); box-shadow:0 8px 20px -10px rgba(123,79,255,0.5); }
.vc-bubble.user::after{ opacity:.10; mix-blend-mode:overlay; }
.vc-bubble.assistant{ color:var(--v-ink); border-radius:22px 22px 22px 7px; background:linear-gradient(135deg, rgba(255,255,255,0.92), rgba(251,250,254,0.82)); border:1px solid var(--v-card-bd); -webkit-backdrop-filter:blur(8px); backdrop-filter:blur(8px); }
.vc-bubble.assistant::after{ opacity:.045; }
.vc-ln{ display:block; } .vc-li{ display:flex; gap:7px; align-items:flex-start; } .vc-dot{ opacity:.6; } .vc-br{ display:block; height:11px; }
.vc-utext{ white-space:pre-wrap; }
.vc-time{ display:inline-block; font-size:10px; opacity:.6; margin-left:10px; }
.vc-row.left .vc-time{ display:block; text-align:right; margin-left:0; margin-top:1px; }
.vc-typing{ display:flex; gap:4px; align-items:center; border-radius:22px 22px 22px 7px; }
.vc-typing span{ width:6px; height:6px; border-radius:50%; background:var(--v-sub); animation:vcb 1s infinite; }
.vc-typing span:nth-child(2){ animation-delay:.15s } .vc-typing span:nth-child(3){ animation-delay:.3s }
@keyframes vcb{ 0%,100%{ opacity:.3; transform:translateY(0) } 50%{ opacity:1; transform:translateY(-3px) } }
.vc-prop{ background:var(--v-card-solid); border:1px solid var(--v-card-bd); border-radius:18px; padding:14px; box-shadow:0 10px 24px -16px rgba(42,26,58,0.25); }
.vc-prop-rows{ display:flex; flex-direction:column; gap:8px; }
.vc-prop-row{ display:flex; justify-content:space-between; align-items:center; }
.vc-prop-to{ font-size:14px; font-weight:600; } .vc-prop-amt{ font-size:14px; font-weight:700; }
.vc-prop-meta{ display:flex; justify-content:space-between; font-size:12px; color:var(--v-sub); margin:12px 0; padding-top:10px; border-top:1px solid var(--v-card-bd); }
.vc-confirm{ width:100%; padding:12px; border-radius:14px; background:var(--v-accent); color:#fff; font-size:15px; font-weight:700; }
.vc-guard-box{ margin:10px 0 2px; padding:10px 12px; border-radius:12px; display:flex; flex-direction:column; gap:6px; }
.vc-guard-box.ok{ background:rgba(29,184,102,0.08); }
.vc-guard-box.warn{ background:rgba(224,152,42,0.12); }
.vc-guard-row{ display:flex; align-items:flex-start; gap:7px; font-size:12.5px; line-height:1.4; color:var(--v-ink); }
.vc-guard-row svg{ flex-shrink:0; margin-top:1px; color:#E0982A; }
.vc-guard-ok{ color:var(--v-sub); }
.vc-guard-ok svg{ color:var(--v-success); }
.vc-done{ display:flex; align-items:center; gap:10px; background:var(--v-card-solid); border:1px solid var(--v-card-bd); border-radius:16px; padding:12px 14px; }
.vc-done-ic{ width:30px; height:30px; border-radius:50%; background:var(--v-success); display:flex; align-items:center; justify-content:center; flex-shrink:0; }
.vc-done-h{ font-size:14px; font-weight:700; }
.vc-done-link{ font-size:12px; color:var(--v-accent); font-weight:600; display:inline-flex; align-items:center; gap:3px; margin-top:2px; }
.vc-bottom{ padding:8px 16px calc(14px + env(safe-area-inset-bottom)); border-top:1px solid var(--v-card-bd); background:var(--v-bg); }
.vc-chips{ display:flex; gap:8px; overflow-x:auto; margin-bottom:10px; scrollbar-width:none; } .vc-chips::-webkit-scrollbar{ display:none; }
.vc-chip{ flex-shrink:0; padding:11px 15px; border-radius:999px; font-size:13px; font-weight:400; color:var(--v-ink); background:linear-gradient(135deg, rgba(255,255,255,0.7), rgba(239,237,247,0.5)); border:1px solid rgba(255,255,255,0.6); -webkit-backdrop-filter:blur(14px); backdrop-filter:blur(14px); }
.vc-input{ position:relative; overflow:hidden; display:flex; align-items:center; gap:8px; padding:7px 7px 7px 12px; border-radius:24px; background:linear-gradient(135deg, rgba(245,243,252,0.9), rgba(255,255,255,0.62)); -webkit-backdrop-filter:blur(22px) saturate(150%); backdrop-filter:blur(22px) saturate(150%); border:1px solid rgba(255,255,255,0.6); box-shadow:0 8px 26px -14px rgba(42,26,58,0.18), inset 0 1px 0 rgba(255,255,255,0.5); }
.vc-input::after{ content:''; position:absolute; inset:0; z-index:0; pointer-events:none; opacity:.05; background-size:140px; background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"); }
.vc-input > *{ position:relative; z-index:1; }
.vc-plus{ width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:var(--v-sub); background:none; flex-shrink:0; }
.vc-input input{ flex:1; min-width:0; background:none; border:none; outline:none; font-size:15px; color:var(--v-ink); font-family:'DM Sans',sans-serif; }
.vc-input input::placeholder{ color:var(--v-sub); }
.vc-send{ width:42px; height:42px; border-radius:50%; flex-shrink:0; background:var(--v-accent); display:flex; align-items:center; justify-content:center; box-shadow:0 6px 16px -4px rgba(123,79,255,0.5); }
.vc-send:disabled{ opacity:.5; }
.vc-sheet-wrap{ position:fixed; inset:0; z-index:200; background:rgba(20,12,30,0.45); -webkit-backdrop-filter:blur(4px); backdrop-filter:blur(4px); display:flex; align-items:flex-end; justify-content:center; animation:vcfade .2s; }
@keyframes vcfade{ from{ opacity:0 } to{ opacity:1 } }
.vc-sheet{ width:100%; max-width:430px; background:var(--v-card-solid); border-radius:28px 28px 0 0; padding:10px 20px calc(24px + env(safe-area-inset-bottom)); animation:vcup .28s cubic-bezier(.2,.9,.3,1); box-shadow:0 -20px 60px -20px rgba(20,12,30,0.4); }
@keyframes vcup{ from{ transform:translateY(100%) } to{ transform:translateY(0) } }
.vc-grab{ width:40px; height:4px; border-radius:2px; background:var(--v-card-bd); margin:0 auto 18px; }
.vc-sheet-head{ display:flex; align-items:center; gap:12px; margin-bottom:16px; }
.vc-sheet-ic{ width:42px; height:42px; border-radius:13px; background:var(--v-chip); display:flex; align-items:center; justify-content:center; }
.vc-sheet-h{ font-size:20px; font-weight:700; } .vc-sheet-sub{ font-size:13px; color:var(--v-sub); }
.vc-sheet-list{ background:var(--v-bg); border-radius:16px; padding:2px 14px; margin-bottom:12px; }
.vc-sheet-row{ display:flex; justify-content:space-between; align-items:center; padding:13px 0; border-bottom:1px solid var(--v-card-bd); }
.vc-sheet-row:last-child{ border-bottom:none; }
.vc-sheet-to{ font-size:14px; font-weight:600; display:inline-flex; align-items:center; gap:6px; } .vc-sheet-amt{ font-size:14px; font-weight:700; }
.vc-using{ display:flex; align-items:center; gap:6px; font-size:14px; background:var(--v-bg); border-radius:14px; padding:12px 14px; margin-bottom:12px; }
.vc-using-tot{ margin-left:auto; color:var(--v-accent); font-weight:700; }
.vc-guard{ display:flex; align-items:center; gap:6px; justify-content:center; font-size:12px; color:var(--v-sub); margin-bottom:16px; }
.vc-slide{ position:relative; height:58px; border-radius:999px; background:var(--v-chip); display:flex; align-items:center; justify-content:center; overflow:hidden; user-select:none; touch-action:none; }
.vc-slide-label{ font-size:14px; font-weight:600; color:var(--v-accent); }
.vc-slide-knob{ position:absolute; left:2px; top:2px; width:54px; height:54px; border-radius:50%; background:var(--v-accent); display:flex; align-items:center; justify-content:center; cursor:grab; box-shadow:0 6px 16px -4px rgba(123,79,255,0.6); }
.vc-spin{ width:18px; height:18px; border-radius:50%; border:2px solid rgba(255,255,255,0.4); border-top-color:#fff; animation:spin .7s linear infinite; }
.vc-success-top{ display:flex; align-items:center; justify-content:center; gap:8px; margin:6px 0 14px; }
.vc-success-otter{ width:96px; height:96px; object-fit:contain; }
.vc-success-check{ width:64px; height:64px; border-radius:50%; background:var(--v-success); display:flex; align-items:center; justify-content:center; box-shadow:0 0 30px -4px rgba(29,184,102,0.6); }
.vc-success-h{ text-align:center; font-size:26px; font-weight:800; }
.vc-success-sub{ text-align:center; font-size:13px; color:var(--v-sub); margin:2px 0 16px; }
.vc-tx{ display:flex; align-items:center; justify-content:space-between; background:var(--v-bg); border-radius:14px; padding:13px 14px; font-size:13px; color:var(--v-sub); margin-bottom:14px; }
.vc-tx-link{ color:var(--v-accent); font-weight:600; display:inline-flex; align-items:center; gap:4px; }
.vc-done-btn{ width:100%; padding:15px; border-radius:16px; background:var(--v-accent); color:#fff; font-size:16px; font-weight:700; }

/* ---- dark mode: aubergine + grain (white glass reads badly on black) ---- */
[data-theme="dark"] .vc-welcome{ background:linear-gradient(135deg, rgba(58,42,77,0.92), rgba(42,26,58,0.82)); border:1px solid rgba(255,255,255,0.08); }
[data-theme="dark"] .vc-welcome::after{ opacity:.10; mix-blend-mode:soft-light; }
[data-theme="dark"] .vc-bubble.assistant{ color:#F4F2FA; border:1px solid rgba(255,255,255,0.08); background:linear-gradient(135deg, rgba(58,42,77,0.96), rgba(42,26,58,0.92)); }
[data-theme="dark"] .vc-bubble.assistant::after{ opacity:.10; mix-blend-mode:soft-light; }
[data-theme="dark"] .vc-chip{ color:#F4F2FA; border:1px solid rgba(255,255,255,0.08); background:linear-gradient(135deg, rgba(58,42,77,0.88), rgba(42,26,58,0.72)); }
[data-theme="dark"] .vc-input{ border:1px solid rgba(255,255,255,0.08); background:linear-gradient(135deg, rgba(58,42,77,0.92), rgba(42,26,58,0.78)); box-shadow:0 8px 26px -14px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06); }
[data-theme="dark"] .vc-input::after{ opacity:.09; mix-blend-mode:soft-light; }
[data-theme="dark"] .vc-head{ border-bottom-color:rgba(255,255,255,0.07); }
[data-theme="dark"] .vc-bottom{ border-top-color:rgba(255,255,255,0.07); }
[data-theme="dark"] .vc-sheet{ background:#1a1226; }
[data-theme="dark"] .vc-sheet-list, [data-theme="dark"] .vc-using, [data-theme="dark"] .vc-tx{ background:rgba(255,255,255,0.05); }
.vc-prop-note{ font-size:12px; color:var(--v-sub); margin-top:9px; line-height:1.45; }
.vc-prop-sub{ display:flex; align-items:center; justify-content:center; gap:12px; margin-top:9px; }
.vc-prop-sub button{ background:none; color:var(--v-sub); font-size:13px; font-weight:600; font-family:'DM Sans',sans-serif; }
.vc-prop-sub > span{ color:var(--v-card-bd); }
.vc-tokpick{ display:flex; gap:8px; margin-top:4px; max-width:280px; }
.vc-tokbtn{ flex:1; padding:11px; border-radius:13px; border:1px solid var(--v-card-bd); background:var(--v-card-solid); color:var(--v-ink); font-weight:700; font-size:14px; font-family:\'DM Sans\',sans-serif; }
.vc-tokbtn:active{ background:var(--v-chip); }
`