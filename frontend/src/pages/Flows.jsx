import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { useVelfiWallet } from '../hooks/useVelfiWallet.js'
import { useNavigate } from 'react-router-dom'
import { CalendarClock, Waypoints, Plus, ChevronRight } from 'lucide-react'

const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s
function fmtDate(ts) {
  if (!ts) return ''
  try { return new Date(ts).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }) } catch { return '' }
}
function stateOf(status, done, total) {
  const s = String(status || '').toLowerCase()
  if (['complete', 'completed', 'done', 'ended'].includes(s) || (total > 0 && done >= total)) return 'completed'
  if (s === 'paused' || s === 'failed') return 'paused'
  return 'active'
}
function toCards(flows, incoming = []) {
  const out = []
  for (const r of incoming) {
    const p = r.progress || {}
    out.push({ id: r.id, kind: 'stream', state: 'active',
      title: 'Incoming stream', desc: `${p.total} ${r.token} streaming to you`,
      amount: `${Number(p.vested || 0).toFixed(2)} ${r.token}`, freq: `${p.pct}% vested`,
      runline: 'Claim what has vested anytime', action: { label: 'Claim', path: `/streams/${r.id}/claim` } })
  }
  for (const r of (flows.streams || [])) {
    const st = stateOf(r.status, 0, 0)
    out.push({ id: r.id, kind: 'stream', state: st,
      title: 'Token stream', desc: `Streaming ${r.total} ${r.token} to ${r.to}`,
      amount: `${r.total} ${r.token}`, freq: `${r.pct}% vested`,
      runline: `${r.pct}% vested`, action: r.flow && st === 'active' ? { label: 'Stop', path: `/streams/${r.id}/stop`, confirm: 'Stop this stream? They keep what has vested; the rest comes back to you.' } : null })
  }
  for (const r of (flows.schedules || [])) {
    r.done = r.occurrences_done; r.total = r.occurrences
    const st = stateOf(r.status, r.done, r.total)
    const fl = cap(r.frequency || 'recurring')
    out.push({ id: r.id, kind: 'schedule', state: st,
      title: 'Scheduled payment', desc: `Send ${r.amount} ${r.token} to ${r.to} ${(r.frequency || '').toLowerCase()}`,
      amount: `${r.amount} ${r.token}`, freq: fl,
      runline: st === 'completed' ? `${r.done}/${r.total} sent` : (r.next_run_at ? `Next run: ${fmtDate(r.next_run_at)}` : `${r.done}/${r.total || '∞'} sent`),
      action: st === 'active' || st === 'paused' ? { label: 'Cancel', path: `/schedule/${r.id}/cancel`, confirm: 'Cancel this schedule? No more payments will go out.' } : null })
  }
  return out
}

const TABS = ['All flows', 'Active', 'Paused', 'Completed']

export default function Flows() {
  const { token } = useAuth()
  const navigate = useNavigate()
  const [flows, setFlows] = useState(null)
  const [tab, setTab] = useState('All flows')
  const [incoming, setIncoming] = useState([])
  const [busyId, setBusyId] = useState(null)
  const [note, setNote] = useState('')
  const wallet = useVelfiWallet()
  const H = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'ngrok-skip-browser-warning': 'true' }

  // Claim / stop / cancel: Velfi prepares, your wallet signs, Velfi sends.
  async function act(c) {
    if (c.action.confirm && !window.confirm(c.action.confirm)) return
    setBusyId(c.id); setNote('')
    let prep = null
    try {
      const pr = await fetch(`/api${c.action.path}`, { method: 'POST', headers: H, body: '{}' })
      prep = await pr.json()
      if (!pr.ok) throw new Error(prep.error || 'Could not prepare that.')
      if (!prep.tx) { setNote(prep.message || 'Done.'); return }
      if (prep.note) setNote(prep.note)
      const signedTx = await wallet.sign(prep.tx)
      const r = await fetch('/api/tx/submit', { method: 'POST', headers: H, body: JSON.stringify({ prepId: prep.prepId, signedTx }) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'That did not go through.')
      setNote(d.message || 'Done.')
    } catch (e) {
      const notSigned = /reject|denied|cancel/i.test(String(e.message))
      // A lite-mode cancel already stopped the schedule; signing only tidies up the wallet permission.
      if (notSigned && prep?.note) setNote('Schedule cancelled, no more payments will go out. The unused permission stays on your wallet until your next schedule replaces it, and Velfi won\'t use it.')
      else setNote(notSigned ? 'Not signed, nothing changed.' : e.message)
    }
    finally { setBusyId(null) }
  }
  useEffect(() => {
    if (!token) return
    let alive = true
    async function load() {
      try {
        const hdr = { headers: { 'Authorization': `Bearer ${token}`, 'ngrok-skip-browser-warning': 'true' } }
        const [r, ri] = await Promise.all([fetch('/api/agent/flows', hdr), fetch('/api/streams/incoming', hdr)])
        const d = await r.json()
        const di = await ri.json().catch(() => ({}))
        if (alive) { setFlows(d); setIncoming(di.streams || []) }
      } catch { if (alive) setFlows({ streams: [], schedules: [] }) }
    }
    load()
    const t = setInterval(load, 5000)
    return () => { alive = false; clearInterval(t) }
  }, [token])

  const cards = flows ? toCards(flows, incoming) : []
  const shown = tab === 'All flows' ? cards : cards.filter(c => c.state === tab.toLowerCase())

  return (
    <div className="vf page">
      <style>{FLOWS_CSS}</style>
      <div className="vf-wrap">
        <div className="vf-top">
          <div>
            <h1 className="vf-title">Flows</h1>
            <p className="vf-sub">Automate payments with AI using your intent. Create once, run on your terms.</p>
          </div>
          <button className="vf-new" onClick={() => navigate('/chat')}><Plus size={17} strokeWidth={2.4} /> New flow</button>
        </div>

        {note && <p className="vf-note">{note}</p>}
        <div className="vf-tabs">
          {TABS.map(t => (
            <button key={t} className={`vf-tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>{t}</button>
          ))}
        </div>

        {flows === null ? (
          <div className="vf-empty">Loading…</div>
        ) : shown.length === 0 ? (
          <div className="vf-empty-box">
            <Waypoints size={28} />
            <p className="vf-empty-h">{cards.length === 0 ? 'No flows yet' : `No ${tab.toLowerCase()} flows`}</p>
            <p className="vf-empty-b">Create a recurring payment from chat. Try “send 10 USDC to alex.vel every week for 4 weeks”.</p>
            <button className="vf-cta" onClick={() => navigate('/chat')}>Start a flow</button>
          </div>
        ) : (
          <div className="vf-list">
            {shown.map(c => (
              <div className="vf-card" key={c.id} onClick={() => navigate('/chat')}>
                <span className={`vf-ic ${c.state}`}>{c.kind === 'stream' ? <Waypoints size={20} /> : <CalendarClock size={20} />}</span>
                <div className="vf-mid">
                  <p className="vf-name">{c.title}</p>
                  <p className="vf-desc">{c.desc}</p>
                  <div className="vf-status">
                    <span className={`vf-pill ${c.state}`}><span className="vf-pdot" />{cap(c.state)}</span>
                    <span className="vf-sep" />
                    <span className="vf-runline">{c.runline}</span>
                  </div>
                </div>
                <div className="vf-right">
                  <p className="vf-amt">{c.amount}</p>
                  <p className="vf-freq">{c.freq}</p>
                  {c.action && <button className="vf-act" disabled={busyId === c.id} onClick={(e) => { e.stopPropagation(); act(c) }}>{busyId === c.id ? 'Signing…' : c.action.label}</button>}
                </div>
                <ChevronRight className="vf-chev" size={20} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const FLOWS_CSS = `
.vf-act{ margin-top:8px; padding:6px 14px; border-radius:999px; border:1px solid var(--v-accent, #7B4FFF); background:transparent; color:var(--v-accent, #7B4FFF); font-weight:600; font-size:12px; cursor:pointer; }
.vf-act:disabled{ opacity:.6; cursor:default; }
.vf-note{ margin:0 0 12px; padding:10px 14px; border-radius:12px; background:rgba(123,79,255,0.12); color:var(--v-accent, #7B4FFF); font-size:13px; font-weight:600; }
.vf{ background:var(--v-bg); min-height:100dvh; font-family:'DM Sans',system-ui,sans-serif; color:var(--v-ink); }
.vf-wrap{ padding:54px 18px 110px; }
.vf-top{ display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:20px; }
.vf-title{ font-size:30px; font-weight:700; letter-spacing:-0.6px; color:var(--v-ink); }
.vf-sub{ font-size:14px; font-weight:400; color:var(--v-sub); margin-top:5px; line-height:1.5; max-width:300px; }
.vf-new{ flex-shrink:0; display:inline-flex; align-items:center; gap:6px; padding:11px 16px; border-radius:999px; background:var(--v-accent); color:#fff; font-size:14px; font-weight:600; font-family:'DM Sans',sans-serif; box-shadow:0 6px 16px -6px rgba(123,79,255,0.5); }
.vf-tabs{ display:flex; gap:4px; background:var(--v-chip); border-radius:14px; padding:4px; margin-bottom:18px; }
.vf-tab{ flex:1; padding:11px 6px; border-radius:11px; background:none; color:var(--v-ink); font-size:13px; font-weight:600; font-family:'DM Sans',sans-serif; white-space:nowrap; }
.vf-tab.on{ background:var(--v-accent); color:#fff; box-shadow:0 4px 12px -4px rgba(123,79,255,0.5); }
.vf-empty{ text-align:center; padding:60px 0; color:var(--v-sub); }
.vf-empty-box{ text-align:center; padding:46px 24px; border:1px solid var(--v-card-bd); border-radius:22px; background:var(--v-card-solid); }
.vf-empty-box svg{ color:var(--v-accent); margin-bottom:12px; }
.vf-empty-h{ font-size:17px; font-weight:700; color:var(--v-ink); }
.vf-empty-b{ font-size:13px; font-weight:400; color:var(--v-sub); margin:6px auto 18px; max-width:280px; line-height:1.5; }
.vf-cta{ padding:12px 22px; border-radius:14px; background:var(--v-accent); color:#fff; font-weight:600; font-size:14px; font-family:'DM Sans',sans-serif; }
.vf-list{ display:flex; flex-direction:column; gap:12px; }
.vf-card{ display:flex; align-items:center; gap:14px; background:var(--v-card-solid); border:1px solid var(--v-card-bd); border-radius:20px; padding:16px; }
.vf-ic{ width:48px; height:48px; border-radius:50%; flex-shrink:0; display:flex; align-items:center; justify-content:center; }
.vf-ic.active{ background:rgba(123,79,255,0.12); color:var(--v-accent); }
.vf-ic.paused{ background:rgba(245,178,7,0.16); color:#E0A106; }
.vf-ic.completed{ background:rgba(41,209,125,0.14); color:#1DB866; }
.vf-mid{ flex:1; min-width:0; }
.vf-name{ font-size:16px; font-weight:700; color:var(--v-ink); }
.vf-desc{ font-size:13px; font-weight:400; color:var(--v-sub); margin-top:3px; line-height:1.45; }
.vf-status{ display:flex; align-items:center; gap:10px; margin-top:9px; }
.vf-pill{ display:inline-flex; align-items:center; gap:5px; font-size:12px; font-weight:600; color:var(--v-ink); }
.vf-pdot{ width:7px; height:7px; border-radius:50%; background:var(--v-sub); }
.vf-pill.active .vf-pdot{ background:#1DB866; }
.vf-pill.paused .vf-pdot{ background:#E0A106; }
.vf-pill.completed .vf-pdot{ background:var(--v-sub); }
.vf-sep{ width:1px; height:12px; background:var(--v-card-bd); }
.vf-runline{ font-size:12px; font-weight:400; color:var(--v-sub); }
.vf-right{ text-align:right; flex-shrink:0; }
.vf-amt{ font-size:15px; font-weight:700; color:var(--v-ink); white-space:nowrap; }
.vf-freq{ font-size:12px; font-weight:400; color:var(--v-sub); margin-top:2px; }
.vf-chev{ color:var(--v-sub); flex-shrink:0; }
`
