import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { supabase } from '../lib/supabase.js'
import otterImg from '../assets/otter.png'
import otterAvatar from '../assets/otter-avatar.png'
import otterCard from '../assets/otter.png'
import otterAgent from '../assets/otter-agent.png'
import { Bell, Eye, ChevronRight, ArrowDown, ArrowUp, Send, Users, Droplet, DollarSign } from 'lucide-react'
import suiCoin from '../assets/sui_coin.png'
import usdcCoin from '../assets/usdc_coin.png'
import ActivityModal from '../components/ActivityModal.jsx'
import ReceiveSheet from '../components/ReceiveSheet.jsx'
import EmptyHome from '../components/EmptyHome.jsx'

const RPC = 'https://fullnode.testnet.sui.io'
const SUI_PRICE_FALLBACK = 3.2   // TODO: pull from backend /pricing
const NGN_RATE_FALLBACK = 1550   // TODO: pull from backend fx

function TallyLogo() {
  return (
    <svg width="26" height="26" viewBox="0 0 40 40" fill="currentColor" aria-hidden="true">
      <rect x="11.4" y="9" width="3.2" height="18" rx="0.6" />
      <rect x="18.4" y="9" width="3.2" height="22" rx="0.6" />
      <rect x="25.4" y="9" width="3.2" height="18" rx="0.6" />
      <rect x="9" y="18.4" width="22" height="3.2" rx="0.6" />
    </svg>
  )
}

function SuiMark() {
  return (
    <svg width="13" height="13" viewBox="0 0 64 64" fill="#fff" aria-hidden="true">
      <path d="M32 7 C 26 18, 15 28, 15 40 A 17 17 0 0 0 49 40 C 49 28, 38 18, 32 7 Z" />
    </svg>
  )
}

function UsdcMark() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 5.5v13" />
      <path d="M15 8.4C15 6.9 13.7 6.1 12 6.1S9 6.9 9 8.4s1.3 2.1 3 2.4 3 1 3 2.6S13.7 17.9 12 17.9 9 17 9 15.5" />
    </svg>
  )
}

const fmtUsd = n => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function Home() {
  const navigate = useNavigate()
  const { user, token } = useAuth()
  const addr = user?.suiAddress || user?.sui_address
  const name = user?.username || 'there'

  const [bals, setBals] = useState(null)
  const [loading, setLoading] = useState(true)
  const [hidden, setHidden] = useState(false)
  const [msg, setMsg] = useState('')
  const [actOpen, setActOpen] = useState(false)
  const [recvOpen, setRecvOpen] = useState(false)

  useEffect(() => { if (token) loadBalance() }, [token])

  async function loadBalance() {
    try {
      const r = await fetch('/api/account/balances', {
        headers: { 'Authorization': `Bearer ${token}`, 'ngrok-skip-browser-warning': 'true' }
      })
      const d = await r.json()
      if (r.ok) setBals(d)
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }

  const usd = bals?.total_usd ?? 0
  const ngn = usd * NGN_RATE_FALLBACK
  const tokenLine = bals?.tokens?.length
    ? [...bals.tokens].sort((a, b) => (a.symbol === 'SUI' ? -1 : b.symbol === 'SUI' ? 1 : 0)).slice(0, 2).map(t => `${t.human >= 1 ? Number(t.human.toFixed(2)) : Number(t.human.toPrecision(3))} ${t.symbol}`).join(' · ')
    : "0.00 SUI"

  const _emptyParam = new URLSearchParams(window.location.search).has('empty')
  const isEmpty = !loading && (_emptyParam || (usd === 0 && !(bals?.tokens?.length)))
  if (isEmpty) return <EmptyHome user={user} navigate={navigate} />

  function submit() {
    const t = msg.trim(); if (!t) return
    sessionStorage.setItem('velfi_pending_msg', t)
    navigate('/chat')
  }

  const ACTIONS = [
    { k: 'send', label: 'Send', d: 'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z' },
    { k: 'receive', label: 'Receive', d: 'M12 3v14M5 10l7 7 7-7' },
    { k: 'split', label: 'Split', d: 'M17 20v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2 M9 11a4 4 0 100-8 4 4 0 000 8 M23 20v-2a4 4 0 00-3-3.9 M16 3.1a4 4 0 010 7.8' },
  ]

  return (
    <div className="vhome page">
      <style>{HOME_CSS}</style>
      <div className="vh-wrap">

        <div className="vh-head">
          <div className="vh-brand"><TallyLogo /><span className="vh-word">Velfi</span></div>
          <div className="vh-head-r">
            <button className="vh-iconbtn" aria-label="Notifications">
              <Bell size={20} strokeWidth={1.7} />
              <span className="vh-dot" />
            </button>
            <button className="vh-avatar" onClick={() => navigate('/account')} aria-label="Account">
              <img src={otterAgent} alt="" />
            </button>
          </div>
        </div>

        <div className="vh-balance">
          <div className="vh-bal-top">
            <span>Total Balance</span>
            <button onClick={() => setHidden(h => !h)} aria-label="Toggle balance">
              <Eye size={17} strokeWidth={1.7} />
            </button>
          </div>
          <div className="vh-bal-amt">{loading ? '—' : hidden ? '••••••' : '$' + fmtUsd(usd)}</div>
          <div className="vh-bal-fiat">{hidden || loading ? '\u00A0' : '\u2248 \u20A6' + Math.round(ngn).toLocaleString()}</div>
          <div className="vh-bal-row">
            <button className="vh-tokenchip" onClick={() => navigate('/chat')}>
              <span className="vh-coin"><img src={suiCoin} alt="SUI" /></span><span className="vh-coin"><img src={usdcCoin} alt="USDC" /></span>
              <span className="vh-tok-txt">{tokenLine}</span>
              <ChevronRight size={15} strokeWidth={2.2} />
            </button>
            <button className="vh-receive" onClick={() => setRecvOpen(true)}>
              Receive
              <span className="vh-recv-ic"><ArrowDown size={15} strokeWidth={2.2} /></span>
            </button>
          </div>
        </div>

        <div className="vh-cmd" onClick={() => navigate('/chat')}>
          <input readOnly value="" placeholder="Tell your money what to do…" />
          <button className="vh-send" onClick={(e) => { e.stopPropagation(); navigate('/chat') }} aria-label="Open chat">
            <ArrowUp size={20} color="#fff" strokeWidth={2.4} />
          </button>
        </div>

        <div className="vh-actions">
          {ACTIONS.map(a => {
            const I = a.k === 'send' ? Send : a.k === 'receive' ? ArrowDown : Users
            return (
              <button key={a.k} className="vh-action" onClick={() => a.k === 'receive' ? setRecvOpen(true) : navigate('/chat')}>
                <span className="vh-action-ic"><I size={20} strokeWidth={1.8} /></span>
                <span className="vh-action-l">{a.label}</span>
              </button>
            )
          })}
        </div>

        <div className="vh-sec">
          <span>Active flows</span>
          <button className="vh-sec-more" onClick={() => navigate('/flows')} aria-label="See all"><ChevronRight size={18} strokeWidth={2} /></button>
        </div>
        <HomeFlows token={token} navigate={navigate} />

        <RecentActivity token={token} navigate={navigate} onSeeAll={() => setActOpen(true)} />
      </div>
      <ActivityModal open={actOpen} onClose={() => setActOpen(false)} token={token} />
      <ReceiveSheet open={recvOpen} onClose={() => setRecvOpen(false)} username={user?.username} />
    </div>
  )
}

function RecentActivity({ token, navigate, onSeeAll }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => { if (token) load() }, [token])
  async function load() {
    try {
      const r = await fetch('/api/agent/activity?limit=6', { headers: { 'Authorization': `Bearer ${token}`, 'ngrok-skip-browser-warning': 'true' } })
      const d = await r.json()
      setRows(d.transactions || [])
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }
  function rel(t) {
    if (!t) return ''
    const d = Date.now() - new Date(t).getTime()
    if (d < 60000) return 'just now'
    if (d < 3600000) return Math.floor(d / 60000) + 'm ago'
    if (d < 86400000) return Math.floor(d / 3600000) + 'h ago'
    return new Date(t).toLocaleDateString()
  }
  return (
    <>
      <div className="vh-sec">
        <span>Recent activity</span>
        <button className="vh-sec-link" onClick={onSeeAll}>See all</button>
      </div>
      <div className="vh-list">
        {loading ? (
          <div className="vh-act-empty">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="vh-act-empty">No transactions yet</div>
        ) : rows.map((t, i) => {
          const out = t.direction === 'out'
          const action = t.type === 'stream' ? 'Streamed' : t.type === 'schedule' ? 'Scheduled' : (out ? 'Sent' : 'Received')
          const who = (t.counterparty || (t.label || '').replace(/^(Streamed to|Scheduled payment to|Sent to|Received from)\s*/i, '') || 'someone')
          return (
            <div className="vh-act" key={i} style={{ borderTop: i ? '1px solid var(--v-card-bd)' : 'none' }}>
              <div className="vh-act-l">
                <span className="vh-act-av">{who.charAt(0).toUpperCase()}</span>
                <div>
                  <p className="vh-act-name">{who}</p>
                  <p className="vh-act-sub">{action}</p>
                </div>
              </div>
              <div className="vh-act-r">
                <p className="vh-act-amt" style={{ color: out ? 'var(--v-ink)' : 'var(--v-accent)' }}>
                  {out ? '-' : '+'}{t.amount != null ? Number(t.amount).toLocaleString(undefined, { maximumFractionDigits: 4 }) : '\u2014'} {t.token || ''}
                </p>
                <p className="vh-act-time">{rel(t.created_at)}</p>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}

function HomeFlows({ token, navigate }) {
  const [flows, setFlows] = useState(null)
  useEffect(() => {
    if (!token) return
    let alive = true
    async function load() {
      try {
        const r = await fetch('/api/agent/flows', { headers: { 'Authorization': `Bearer ${token}`, 'ngrok-skip-browser-warning': 'true' } })
        const d = await r.json()
        if (alive) setFlows(d)
      } catch { if (alive) setFlows({ streams: [], schedules: [] }) }
    }
    load()
    const t = setInterval(load, 5000)
    return () => { alive = false; clearInterval(t) }
  }, [token])
  if (!flows) return <div className="vh-empty">Loading flows…</div>
  const items = [...(flows.streams || []), ...(flows.schedules || [])]
  if (items.length === 0) return <div className="vh-empty">No active flows yet — start a stream or schedule with a command.</div>
  return (
    <div className="vh-flows">
      {items.slice(0, 3).map(f => (
        <div className="vh-flow" key={f.id} onClick={() => navigate('/flows')}>
          <div className="vh-flow-top">
            <span className="vh-flow-kind">{f.type === 'stream' ? 'Streaming' : 'Scheduled'}</span>
            <span className="vh-flow-to">{f.to}</span>
          </div>
          <div className="vh-flow-bar"><span style={{ width: f.pct + '%' }} /></div>
          <div className="vh-flow-sub">
            {f.type === 'stream'
              ? `${Number(f.done || 0).toFixed(3)} / ${f.total} ${f.token} · ${f.pct}%`
              : `${f.occurrences_done || 0}/${f.occurrences || '∞'} sent · ${f.amount} ${f.token} ${f.frequency}`}
          </div>
        </div>
      ))}
    </div>
  )
}

const HOME_CSS = `
.vhome{ background:var(--v-bg); font-family:var(--font-body); color:var(--v-ink); }
.vh-wrap{ padding:calc(env(safe-area-inset-top, 0px) + 14px) 18px 24px; }

.vh-head{ display:flex; align-items:center; justify-content:space-between; margin-bottom:18px; }
.vh-brand{ display:flex; align-items:center; gap:9px; color:var(--v-ink); }
.vh-word{ font-family:var(--font-display); font-weight:500; font-size:23px; letter-spacing:0.2px; }
.vh-head-r{ display:flex; align-items:center; gap:10px; }
.vh-iconbtn{ position:relative; width:42px; height:42px; display:flex; align-items:center; justify-content:center; color:var(--v-ink); background:none; border:none; }
.vh-dot{ position:absolute; top:10px; right:11px; width:7px; height:7px; border-radius:50%; background:var(--v-accent); }
.vh-avatar{ width:44px; height:44px; border-radius:50%; overflow:hidden; border:1px solid var(--v-card-bd); background:var(--v-chip); }
.vh-avatar img{ width:100%; height:100%; object-fit:cover; }

.vh-balance{ position:relative; overflow:hidden; border-radius:24px; padding:20px; margin-bottom:18px;
  background:linear-gradient(135deg,#3a2a4d 0%,#2a1a3a 100%);
  border:1px solid rgba(255,255,255,0.07); }

.vh-bal-top{ display:flex; align-items:center; gap:8px; color:#cbbfe0; font-size:13px; }
.vh-bal-top button{ background:none; color:#cbbfe0; display:flex; }
.vh-bal-amt{ margin-top:8px; font-size:clamp(34px,11vw,42px); font-weight:600; letter-spacing:-0.5px; color:#fff; line-height:1.05; }
.vh-bal-fiat{ margin-top:4px; font-size:14px; color:#b4a8d0; }
.vh-bal-row{ display:flex; gap:10px; margin-top:18px; position:relative; }
.vh-tokenchip{ display:flex; flex:1; min-width:0; align-items:center; gap:7px; padding:9px 12px; border-radius:999px;
  background:rgba(255,255,255,0.10); border:1px solid rgba(255,255,255,0.12); color:#fff; backdrop-filter:blur(8px); }
.vh-coin{ width:20px; height:20px; border-radius:50%; overflow:hidden; display:flex; align-items:center; justify-content:center; margin-left:-8px; border:1.5px solid #2a1a3a; }
.vh-coin img{ width:100%; height:100%; object-fit:cover; display:block; }
.vh-coin:first-child{ margin-left:0; }
.vh-coin.sui{ background:#4DA2FF; }
.vh-coin.usdc{ background:#2775CA; }
.vh-tok-txt{ font-size:13px; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0; }
.vh-receive{ display:flex; flex-shrink:0; align-items:center; gap:8px; padding:9px 16px; border-radius:999px;
  background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.12); color:#fff; font-size:14px; font-weight:600; }
.vh-recv-ic{ width:22px; height:22px; border-radius:50%; background:rgba(255,255,255,0.16); display:flex; align-items:center; justify-content:center; }

.vh-cmd{ display:flex; align-items:center; gap:10px; border-radius:22px; padding:9px 9px 9px 18px; margin-bottom:18px; background:var(--v-glass); -webkit-backdrop-filter:blur(20px) saturate(140%); backdrop-filter:blur(20px) saturate(140%); border:1px solid var(--v-glass-bd); box-shadow:0 8px 24px -14px rgba(42,26,58,0.16), inset 0 1px 0 rgba(255,255,255,0.45); }
.vh-cmd input{ flex:1; min-width:0; background:none; border:none; outline:none; font-family:var(--font-body); font-size:15px; color:var(--v-ink); }
.vh-cmd input::placeholder{ color:var(--v-sub); }
.vh-send{ width:46px; height:46px; border-radius:50%; flex-shrink:0; background:var(--v-accent); display:flex; align-items:center; justify-content:center; box-shadow:0 6px 16px -4px rgba(123,79,255,0.5); }

.vh-actions{ display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:22px; }
.vh-action{ display:flex; flex-direction:row; align-items:center; gap:9px; padding:12px 10px; background:var(--v-card-solid); border:1px solid var(--v-card-bd); border-radius:16px; box-shadow:var(--shadow); }
.vh-action-ic{ width:34px; height:34px; border-radius:11px; background:var(--v-chip); color:var(--v-accent); display:flex; align-items:center; justify-content:center; flex-shrink:0; }
.vh-action-l{ font-size:13px; font-weight:500; letter-spacing:-0.1px; color:var(--v-ink); }

.vh-sec{ display:flex; align-items:center; justify-content:space-between; margin:0 2px 10px; }
.vh-sec > span{ font-size:15px; font-weight:600; color:var(--v-ink); }
.vh-sec-more{ background:none; color:var(--v-sub); display:flex; }
.vh-sec-link{ background:none; color:var(--v-accent); font-size:13px; font-weight:600; font-family:var(--font-body); }
.vh-empty{ padding:14px 2px 22px; font-size:13px; color:var(--v-sub); line-height:1.45; background:none; border:none; }

.vh-list{ padding:0 2px; background:none; border:none; }
.vh-act-empty{ text-align:center; padding:22px 0; color:var(--v-sub); font-size:13px; }
.vh-act{ display:flex; align-items:center; justify-content:space-between; padding:14px 0; }
.vh-act-l{ display:flex; align-items:center; gap:12px; }
.vh-act-av{ width:38px; height:38px; border-radius:50%; background:var(--v-chip); color:var(--v-accent); display:flex; align-items:center; justify-content:center; font-weight:700; font-size:15px; }
.vh-act-name{ font-size:14px; font-weight:600; color:var(--v-ink); }
.vh-act-sub{ font-size:12px; color:var(--v-sub); margin-top:1px; }
.vh-act-r{ text-align:right; }
.vh-act-amt{ font-size:14px; font-weight:700; }
.vh-act-time{ font-size:11px; color:var(--v-sub); margin-top:1px; }
[data-theme="light"] .vh-balance{ background:var(--v-card-solid); border:1px solid var(--v-card-bd); box-shadow:0 12px 32px -14px rgba(42,26,58,0.18); }
[data-theme="light"] .vh-bal-top, [data-theme="light"] .vh-bal-top button{ color:var(--v-sub); }
[data-theme="light"] .vh-bal-amt{ color:var(--v-ink); }
[data-theme="light"] .vh-bal-fiat{ color:var(--v-sub); }
[data-theme="light"] .vh-tokenchip{ background:rgba(42,26,58,0.05); border:1px solid rgba(42,26,58,0.07); color:var(--v-ink); }
[data-theme="light"] .vh-coin{ border-color:var(--v-card-solid); }
[data-theme="light"] .vh-receive{ background:rgba(123,79,255,0.08); border:1px solid rgba(123,79,255,0.14); color:var(--v-accent); }
[data-theme="light"] .vh-recv-ic{ background:var(--v-accent); color:#fff; }
.vh-flows{ display:flex; flex-direction:column; gap:10px; padding:0 2px 18px; }
.vh-flow{ background:var(--v-card-solid); border:1px solid var(--v-card-bd); border-radius:16px; padding:13px 14px; }
.vh-flow-top{ display:flex; align-items:center; justify-content:space-between; margin-bottom:9px; }
.vh-flow-kind{ font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.4px; color:var(--v-accent); }
.vh-flow-to{ font-size:13px; font-weight:600; color:var(--v-ink); }
.vh-flow-bar{ height:6px; border-radius:999px; background:var(--v-chip); overflow:hidden; }
.vh-flow-bar span{ display:block; height:100%; border-radius:999px; background:var(--v-accent); transition:width .5s ease; }
.vh-flow-sub{ font-size:12px; color:var(--v-sub); margin-top:7px; }
.vh-bal-amt,.vh-act-amt,.vh-bal-fiat,.vh-tok-txt{ font-variant-numeric:tabular-nums; }
`
